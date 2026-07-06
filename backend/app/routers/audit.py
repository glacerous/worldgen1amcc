import uuid
from fastapi import APIRouter, HTTPException, Depends, File, UploadFile
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from uuid import UUID
from app.db import supabase
from app.agents.graph import run_audit_pipeline
from app.auth_utils import get_current_user

router = APIRouter(prefix="/audit", tags=["audit"])

# Schema for Audit Request body
class AuditRequest(BaseModel):
    building_id: UUID
    contributor_name: Optional[str] = None

@router.post("/run")
def run_audit(request: AuditRequest, current_user = Depends(get_current_user)):
    building_id_str = str(request.building_id)
    
    # Fetch associated photos from annotations if they exist
    try:
        annotations_response = supabase.table("annotations").select("photo_url").eq("building_id", building_id_str).execute()
        photos = [row["photo_url"] for row in annotations_response.data] if annotations_response.data else []
    except Exception:
        photos = []

    # Delegate core logic to run_audit_pipeline helper
    result = run_audit_pipeline(building_id_str, photos, contributor_name=request.contributor_name)
    
    # After audit run is created, update it with user_id from current_user
    try:
        supabase.table("audit_runs").update({
            "user_id": current_user["user_id"]
        }).eq("id", result["audit_run_id"]).execute()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Gagal mengaitkan user ke audit run: {str(e)}"
        )
        
    return result


@router.get("/results/{building_id}", response_model=List[dict])
def get_audit_results(building_id: UUID):
    """
    Returns all audit results for a specific building, joined with audit_criteria.
    """
    try:
        response = supabase.table("audit_results") \
            .select("*, audit_criteria(code, description, category)") \
            .eq("building_id", str(building_id)) \
            .execute()
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/runs/{building_id}")
def get_building_audit_runs(building_id: UUID):
    """
    Returns all audit runs for a specific building, joined with users and buildings details.
    """
    try:
        response = supabase.table("audit_runs") \
            .select("*, users(display_name, avatar_url), buildings(trust_score_cache)") \
            .eq("building_id", str(building_id)) \
            .execute()
        
        runs = response.data
        if not runs:
            return []
            
        formatted_runs = []
        for run in runs:
            user_data = run.get("users") or {}
            building_data = run.get("buildings") or {}
            
            # Trust score resolution (fallback to buildings.trust_score_cache if not directly present in run)
            trust_score = run.get("trust_score")
            if trust_score is None:
                trust_score = building_data.get("trust_score_cache")
                
            formatted_runs.append({
                "audit_run_id": run["id"],
                "created_at": run["created_at"],
                "user_id": run.get("user_id"),
                "display_name": user_data.get("display_name"),
                "avatar_url": user_data.get("avatar_url"),
                "trust_score": trust_score
            })
            
        # Sort logic: User ID not null first, then by created_at DESC
        # Since Python's sort is stable:
        # 1. Sort by created_at DESC
        formatted_runs.sort(key=lambda x: x["created_at"], reverse=True)
        # 2. Sort by user_id is None (not null/False first, null/True last)
        formatted_runs.sort(key=lambda x: x["user_id"] is None)
        
        return formatted_runs
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/runs/{audit_run_id}/detail")
def get_audit_run_detail(audit_run_id: UUID):
    """
    Returns a single audit run by its ID, joined with user info.
    Used by the edit-audit page to verify ownership.
    """
    try:
        response = supabase.table("audit_runs") \
            .select("*, users(display_name, avatar_url)") \
            .eq("id", str(audit_run_id)) \
            .single() \
            .execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if not response.data:
        raise HTTPException(status_code=404, detail="Audit run tidak ditemukan.")

    run = response.data
    user_data = run.get("users") or {}

    return {
        "id": run["id"],
        "building_id": run["building_id"],
        "user_id": run.get("user_id"),
        "contributor_name": run.get("contributor_name"),
        "trust_score": run.get("trust_score"),
        "created_at": run["created_at"],
        "display_name": user_data.get("display_name"),
        "avatar_url": user_data.get("avatar_url"),
    }


@router.patch("/runs/{audit_run_id}/rerun")
async def rerun_audit(
    audit_run_id: UUID,
    photos: List[UploadFile] = File(...),
    current_user = Depends(get_current_user)
):

    """
    Allows a user to re-run an audit run they previously created by uploading new photos.
    """
    # Validate photos list
    if not photos:
        raise HTTPException(
            status_code=400,
            detail="Minimal 1 file foto harus dikirim."
        )
        
    for photo in photos:
        if not photo.content_type.startswith("image/"):
            raise HTTPException(
                status_code=400,
                detail="Semua file harus berupa gambar (image/*)."
            )
            
    # 1. Fetch audit run and check ownership
    try:
        run_response = supabase.table("audit_runs").select("*").eq("id", str(audit_run_id)).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal mengambil data audit run: {str(e)}")
        
    if not run_response.data:
        raise HTTPException(status_code=404, detail="Audit run tidak ditemukan.")
    
    audit_run = run_response.data[0]
    
    run_user_id = audit_run.get("user_id")
    if run_user_id is None or str(run_user_id) != str(current_user["user_id"]):
        raise HTTPException(
            status_code=403,
            detail="Anda tidak memiliki izin untuk memperbarui audit run ini."
        )
        
    # 2. Upload new photos to Supabase Storage bucket "photos"
    try:
        supabase.storage.create_bucket("photos", {"public": True})
    except Exception:
        pass

    photo_urls = []
    for photo in photos:
        try:
            file_extension = photo.filename.split(".")[-1] if "." in photo.filename else "jpg"
            unique_filename = f"{uuid.uuid4()}.{file_extension}"
            file_content = await photo.read()
            
            # Execute upload
            supabase.storage.from_("photos").upload(
                path=unique_filename,
                file=file_content,
                file_options={"content-type": photo.content_type}
            )
            
            # Retrieve public URL
            public_url = supabase.storage.from_("photos").get_public_url(unique_filename)
            photo_urls.append(public_url)
        except Exception as upload_err:
            raise HTTPException(
                status_code=500,
                detail=f"Gagal mengunggah foto bukti ke server: {str(upload_err)}"
            )

    # 3. Delete old audit results linked to this audit run
    try:
        supabase.table("audit_results").delete().eq("audit_run_id", str(audit_run_id)).execute()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Gagal menghapus hasil audit lama: {str(e)}"
        )

    # 4. Re-run audit pipeline using the new photos and same audit run ID
    try:
        run_audit_pipeline(
            building_id=str(audit_run["building_id"]),
            photos=photo_urls,
            contributor_name=audit_run.get("contributor_name"),
            gps_mismatch=audit_run.get("gps_mismatch", False),
            gps_distance_meters=audit_run.get("gps_distance_meters"),
            audit_run_id=str(audit_run_id)
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Gagal menjalankan ulang analisis audit: {str(e)}"
        )
        
    return {
        "message": "Audit berhasil diperbarui",
        "audit_run_id": audit_run_id
    }
