import uuid
import json
from fastapi import APIRouter, HTTPException, Depends, File, UploadFile, Form
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
    
    # Fetch associated photos dari tabel scenes & existing audit results
    photos = []
    
    # 1. Ambil foto panorama dari tabel 'scenes' (yang diunggah melalui virtual tour/scene baru)
    try:
        scenes_response = supabase.table("scenes").select("file_url").eq("building_id", building_id_str).execute()
        if scenes_response.data:
            photos.extend([row["file_url"] for row in scenes_response.data if row.get("file_url")])
    except Exception as e:
        print(f"[warn] Gagal mengambil foto dari tabel scenes: {e}")
        
    # 2. Ambil foto bukti dari audit regular terdahulu yang disimpan di tabel 'audit_results'
    try:
        results_response = supabase.table("audit_results").select("evidence_url").eq("building_id", building_id_str).not_.is_("evidence_url", "null").execute()
        if results_response.data:
            photos.extend([row["evidence_url"] for row in results_response.data if row.get("evidence_url")])
    except Exception as e:
        print(f"[warn] Gagal mengambil foto dari tabel audit_results: {e}")
        
    # De-duplikasi list foto agar tidak mengirimkan foto duplikat ke AI Agent
    photos = list(set(photos))


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
            .select("*, audit_criteria(code, description, category, short_label)") \
            .eq("building_id", str(building_id)) \
            .execute()
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def parse_contributor_and_photos(run_dict: dict, default_photos: List[str] = []) -> tuple[str, List[str]]:
    # 1. Check if DB has photos column and it has data
    db_photos = run_dict.get("photos")
    raw_contrib = run_dict.get("contributor_name")
    
    if db_photos is not None:
        if isinstance(db_photos, list):
            return raw_contrib or "Anonim", db_photos
            
    # 2. Fallback to parsing contributor_name
    if not raw_contrib:
        return "Anonim", default_photos
    if "|||" in raw_contrib:
        parts = raw_contrib.split("|||", 1)
        name = parts[0] if parts[0] else "Anonim"
        photos_str = parts[1]
        photos = [p.strip() for p in photos_str.split(",") if p.strip()]
        return name, photos
    return raw_contrib, default_photos


@router.get("/runs/{building_id}")
def get_building_audit_runs(building_id: UUID):
    """
    Returns all audit runs for a specific building, joined with users and buildings details.
    """
    try:
        response = supabase.table("audit_runs") \
            .select("*, users(display_name, avatar_url), buildings(trust_score_cache, vote_count_cache)") \
            .eq("building_id", str(building_id)) \
            .execute()
        
        runs = response.data
        if not runs:
            return []
            
        # Fetch votes for this building to calculate per-run trust scores
        votes_res = supabase.table("votes") \
            .select("vote_type, audit_run_id") \
            .eq("building_id", str(building_id)) \
            .execute()
        votes_by_run = {}
        for v in (votes_res.data or []):
            r_id = v.get("audit_run_id")
            if r_id:
                votes_by_run.setdefault(str(r_id), []).append(v.get("vote_type"))
                
        # Fetch fallback photos for all runs of this building to parse
        results_res = supabase.table("audit_results") \
            .select("evidence_url, audit_run_id") \
            .eq("building_id", str(building_id)) \
            .execute()
        fallback_photos_by_run = {}
        for r in (results_res.data or []):
            run_id = r.get("audit_run_id")
            ev_url = r.get("evidence_url")
            if run_id and ev_url:
                fallback_photos_by_run.setdefault(str(run_id), []).append(ev_url)
                
        formatted_runs = []
        for run in runs:
            user_data = run.get("users") or {}
            building_data = run.get("buildings") or {}
            run_id_str = str(run["id"])
            
            # Trust score resolution: check votes for this specific run first
            run_votes = votes_by_run.get(run_id_str)
            if run_votes:
                up_count = sum(1 for vt in run_votes if vt == "up")
                trust_score = up_count / len(run_votes)
            else:
                trust_score = None
                
            raw_contrib = run.get("contributor_name")
            fallback_photos = list(set(fallback_photos_by_run.get(run_id_str, [])))
            clean_name, run_photos = parse_contributor_and_photos(run, fallback_photos)
            
            # contributor name resolution
            if run.get("user_id") and user_data.get("display_name"):
                c_name = user_data["display_name"]
            else:
                c_name = clean_name
                
            formatted_runs.append({
                "audit_run_id": run["id"],
                "created_at": run["created_at"],
                "user_id": run.get("user_id"),
                "display_name": c_name,
                "avatar_url": user_data.get("avatar_url"),
                "trust_score": trust_score,
                "photos": run_photos
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
            .select("*, users(display_name, avatar_url), buildings(trust_score_cache, vote_count_cache)") \
            .eq("id", str(audit_run_id)) \
            .single() \
            .execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if not response.data:
        raise HTTPException(status_code=404, detail="Audit run tidak ditemukan.")

    run = response.data
    user_data = run.get("users") or {}
    building_data = run.get("buildings") or {}

    # Calculate trust score for this audit run from votes table
    try:
        votes_res = supabase.table("votes") \
            .select("vote_type") \
            .eq("audit_run_id", str(audit_run_id)) \
            .execute()
        run_votes = votes_res.data or []
    except Exception as e:
        print(f"[warn] Failed to fetch votes for audit run detail: {e}")
        run_votes = []

    if run_votes:
        up_count = sum(1 for v in run_votes if v.get("vote_type") == "up")
        trust_score = up_count / len(run_votes)
    else:
        trust_score = None

    # Fetch fallback photos for this run
    fallback_photos = []
    try:
        res_photos = supabase.table("audit_results") \
            .select("evidence_url") \
            .eq("audit_run_id", str(audit_run_id)) \
            .execute()
        fallback_photos = [r["evidence_url"] for r in (res_photos.data or []) if r.get("evidence_url")]
    except Exception as e:
        print(f"[warn] Failed to fetch fallback photos for detail: {e}")

    raw_contrib = run.get("contributor_name")
    clean_name, run_photos = parse_contributor_and_photos(run, fallback_photos)

    # contributor name resolution
    if run.get("user_id") and user_data.get("display_name"):
        c_name = user_data["display_name"]
    else:
        c_name = clean_name

    return {
        "id": run["id"],
        "building_id": run["building_id"],
        "user_id": run.get("user_id"),
        "contributor_name": c_name,
        "trust_score": trust_score,
        "created_at": run["created_at"],
        "display_name": user_data.get("display_name"),
        "avatar_url": user_data.get("avatar_url"),
        "photos": run_photos
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


@router.get("/runs/{audit_run_id}/results", response_model=List[dict])
def get_run_results(audit_run_id: UUID):
    """
    Returns the audit results for a specific audit run, structured as AuditResult list.
    """
    try:
        # 1. Fetch all audit criteria from database
        criteria_response = supabase.table("audit_criteria").select("*").execute()
        criteria_list = criteria_response.data or []

        # 2. Fetch audit results for the specific run
        results_response = supabase.table("audit_results") \
            .select("*, audit_criteria(code, category, description, short_label)") \
            .eq("audit_run_id", str(audit_run_id)) \
            .execute()
        results = results_response.data or []

        # 3. Group results by criteria code
        results_by_criteria = {}
        for r in results:
            crit = r.get("audit_criteria")
            if not crit:
                continue
            code = crit.get("code")
            if not code:
                continue
            # Just take the first result per criteria in the run (should be unique per run anyway)
            if code not in results_by_criteria:
                results_by_criteria[code] = r

        # 4. Map criteria to AuditResult schema
        run_results_list = []
        for c in criteria_list:
            code = c["code"]
            r = results_by_criteria.get(code)

            if r:
                run_results_list.append({
                    "criteria_code": code,
                    "category": c["category"],
                    "description": c["description"],
                    "short_label": c.get("short_label"),
                    "status": r["status"],
                    "is_disputed": False,
                    "total_runs": 1,
                    "agree_count": 1,
                    "audit_result_id": str(r["id"]),
                    "reasoning": r.get("reasoning"),
                    "evidence_url": r.get("evidence_url"),
                    "source_agent": r.get("source_agent"),
                })
            else:
                run_results_list.append({
                    "criteria_code": code,
                    "category": c["category"],
                    "description": c["description"],
                    "short_label": c.get("short_label"),
                    "status": "unknown",
                    "is_disputed": False,
                    "total_runs": 0,
                    "agree_count": 0,
                    "audit_result_id": None,
                    "reasoning": None,
                    "evidence_url": None,
                    "source_agent": None,
                })

        return run_results_list
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal mengambil hasil audit run: {str(e)}")


audit_runs_router = APIRouter(prefix="/audit-runs", tags=["audit-runs"])

@audit_runs_router.get("/{run_id}/results", response_model=List[dict])
def get_audit_run_results_new_path(run_id: UUID):
    return get_run_results(run_id)


@audit_runs_router.patch("/{run_id}")
async def patch_audit_run(
    run_id: UUID,
    photo_ids_to_delete: Optional[str] = Form(None), # JSON-encoded list of urls to delete
    new_photos: Optional[List[UploadFile]] = File(None),
    current_user = Depends(get_current_user)
):
    run_id_str = str(run_id)
    
    # 1. Fetch audit run and check ownership
    try:
        run_res = supabase.table("audit_runs").select("*").eq("id", run_id_str).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal mengambil data audit run: {str(e)}")
        
    if not run_res.data:
        raise HTTPException(status_code=404, detail="Audit run tidak ditemukan.")
    
    audit_run = run_res.data[0]
    run_user_id = audit_run.get("user_id")
    
    if not run_user_id or str(run_user_id) != str(current_user["user_id"]):
        raise HTTPException(
            status_code=401,
            detail="Anda tidak memiliki izin untuk mengedit audit run ini."
        )
        
    building_id = audit_run["building_id"]
    
    # 2. Fetch current audit results for snapshot
    try:
        results_res = supabase.table("audit_results") \
            .select("*") \
            .eq("audit_run_id", run_id_str) \
            .execute()
        old_results = results_res.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal mengambil hasil audit lama: {str(e)}")
    
    # 3. Save snapshot to history table
    try:
        history_payload = {
            "audit_run_id": run_id_str,
            "previous_results_snapshot": old_results
        }
        supabase.table("audit_run_edit_history").insert(history_payload).execute()
    except Exception as e:
        # Log error but don't fail, as it could be that the migration hasn't been run yet
        print(f"[warn] Gagal menyimpan histori perubahan: {e}")
        
    # 4. Parse photo URLs to delete and delete them from Supabase Storage and scenes
    urls_to_delete = []
    if photo_ids_to_delete:
        try:
            urls_to_delete = json.loads(photo_ids_to_delete)
        except Exception:
            raise HTTPException(status_code=400, detail="Format photo_ids_to_delete tidak valid.")
            
    for url in urls_to_delete:
        try:
            filename = url.split("/")[-1]
            if "/panoramas/" in url:
                supabase.storage.from_("panoramas").remove([filename])
                # Delete from scenes table
                supabase.table("scenes").delete().eq("file_url", url).execute()
            else:
                supabase.storage.from_("photos").remove([filename])
        except Exception as err:
            print(f"[warn] Gagal menghapus file dari storage: {url}. Error: {err}")
            
    # 5. Determine the list of remaining old photos
    old_photos = []
    
    # Try parsing existing photos list from the run
    _, run_photos = parse_contributor_and_photos(audit_run, [])
    
    if run_photos:
        # If we have the serialized or column-stored photos list, filter out deleted ones
        for url in run_photos:
            if url not in urls_to_delete:
                old_photos.append(url)
    else:
        # Fallback for legacy runs: extract from old results' evidence URLs
        for r in old_results:
            ev_url = r.get("evidence_url")
            if ev_url and ev_url not in urls_to_delete:
                old_photos.append(ev_url)
            
    # Also check matched panoramas
    try:
        scenes_res = supabase.table("scenes").select("file_url, created_at").eq("building_id", str(building_id)).execute()
        
        # In Python, we calculate timestamps in seconds
        import datetime
        if audit_run.get("created_at"):
            # parse iso date
            dt = datetime.datetime.fromisoformat(audit_run["created_at"].replace("Z", "+00:00"))
            run_time_sec = dt.timestamp()
        else:
            run_time_sec = 0
            
        for s in (scenes_res.data or []):
            f_url = s.get("file_url")
            c_at = s.get("created_at")
            if f_url and f_url not in urls_to_delete and c_at:
                s_dt = datetime.datetime.fromisoformat(c_at.replace("Z", "+00:00"))
                s_time_sec = s_dt.timestamp()
                if abs(s_time_sec - run_time_sec) < 60: # 60 seconds
                    old_photos.append(f_url)
    except Exception as e:
        print(f"[warn] Gagal menyeleksi scene panorama lama: {e}")
    
    old_photos = list(set(old_photos))
    
    # 6. Process and upload new photos
    uploaded_photo_urls = []
    if new_photos:
        for photo in new_photos:
            if not photo.content_type.startswith("image/"):
                raise HTTPException(status_code=400, detail="Semua file baru harus berupa gambar.")
            try:
                file_extension = photo.filename.split(".")[-1] if "." in photo.filename else "jpg"
                unique_filename = f"{uuid.uuid4()}.{file_extension}"
                file_content = await photo.read()
                
                supabase.storage.from_("photos").upload(
                    path=unique_filename,
                    file=file_content,
                    file_options={"content-type": photo.content_type}
                )
                
                public_url = supabase.storage.from_("photos").get_public_url(unique_filename)
                uploaded_photo_urls.append(public_url)
            except Exception as upload_err:
                raise HTTPException(status_code=500, detail=f"Gagal mengunggah foto baru: {str(upload_err)}")
                
    # 7. Merge remaining photos and new photos
    final_photos = list(set(old_photos + uploaded_photo_urls))
    
    if not final_photos:
        raise HTTPException(
            status_code=400,
            detail="Minimal harus ada 1 foto bukti tersisa setelah pengeditan."
        )
        
    # 8. Delete old audit results for this run
    try:
        supabase.table("audit_results").delete().eq("audit_run_id", run_id_str).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal menghapus hasil audit lama: {str(e)}")
        
    # 9. Run audit pipeline to overwrite results
    try:
        run_audit_pipeline(
            building_id=str(building_id),
            photos=final_photos,
            contributor_name=audit_run.get("contributor_name"),
            gps_mismatch=audit_run.get("gps_mismatch", False),
            gps_distance_meters=audit_run.get("gps_distance_meters"),
            audit_run_id=run_id_str
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal menjalankan ulang analisis audit: {str(e)}")
        
    return {
        "message": "Audit run berhasil diperbarui.",
        "audit_run_id": run_id_str,
        "photos": final_photos
    }


@audit_runs_router.delete("/{run_id}")
def delete_audit_run(
    run_id: UUID,
    current_user = Depends(get_current_user)
):
    """
    Allows a user to delete an audit run that they created.
    """
    run_id_str = str(run_id)

    # 1. Fetch audit run and check ownership
    try:
        run_res = supabase.table("audit_runs").select("*").eq("id", run_id_str).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal mengambil data audit run: {str(e)}")

    if not run_res.data:
        raise HTTPException(status_code=404, detail="Audit run tidak ditemukan.")

    audit_run = run_res.data[0]
    run_user_id = audit_run.get("user_id")

    if not run_user_id or str(run_user_id) != str(current_user["user_id"]):
        raise HTTPException(
            status_code=403,
            detail="Anda tidak memiliki izin untuk menghapus audit run ini."
        )

    # 2. Storage cleanup for uploaded photos in photos bucket
    photos = audit_run.get("photos") or []
    for photo_url in photos:
        if isinstance(photo_url, str) and "/photos/" in photo_url:
            try:
                filename = photo_url.split("/")[-1]
                supabase.storage.from_("photos").remove([filename])
            except Exception as err:
                print(f"[warn] Gagal menghapus foto dari storage: {photo_url}. Error: {err}")

    # 3. Delete related audit_results explicitly
    try:
        supabase.table("audit_results").delete().eq("audit_run_id", run_id_str).execute()
    except Exception as e:
        print(f"[warn] Gagal menghapus audit_results: {e}")

    # 4. Delete audit_run record
    try:
        supabase.table("audit_runs").delete().eq("id", run_id_str).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal menghapus audit run: {str(e)}")

    return {"status": "success", "message": "Audit run berhasil dihapus."}


@router.delete("/runs/{audit_run_id}")
def delete_audit_run_legacy_path(
    audit_run_id: UUID,
    current_user = Depends(get_current_user)
):
    return delete_audit_run(audit_run_id, current_user)


