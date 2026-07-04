import uuid
from fastapi import APIRouter, HTTPException, Form, File, UploadFile
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel
from app.db import supabase
from app.agents.graph import run_audit_pipeline
from app.agents.panorama_agent import run_panorama_agent

router = APIRouter(prefix="/buildings", tags=["buildings"])

# Schema for creating a building (internal route)
class BuildingCreate(BaseModel):
    name: str
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


@router.post("", response_model=dict)
def create_building(building: BuildingCreate):
    """
    Internal endpoint to insert an approved building directly.
    """
    try:
        response = supabase.table("buildings").insert({
            "name": building.name,
            "address": building.address,
            "latitude": building.latitude,
            "longitude": building.longitude,
            "status": "approved",
            "source": "team",
            "verified": True
        }).execute()
        
        if not response.data:
            raise HTTPException(status_code=400, detail="Failed to create building")
        
        return response.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/submit", response_model=dict)
async def submit_building(
    name: str = Form(...),
    address: Optional[str] = Form(None),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    photos: List[UploadFile] = File(...),
    panorama: Optional[UploadFile] = File(None)
):
    """
    Public endpoint to submit a building with photo evidence and optional panorama.
    Runs the multi-agent audit pipeline immediately.
    """
    # 1. Validation: at least one photo is required
    if not photos or len(photos) == 0:
        raise HTTPException(status_code=400, detail="Minimal 1 foto bukti wajib diunggah.")
        
    # 2. Validation: check file mime types are images
    for photo in photos:
        if not photo.content_type or not photo.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="Semua berkas yang diunggah harus berupa file gambar.")

    if panorama:
        if not panorama.content_type or not panorama.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="Berkas panorama yang diunggah harus berupa file gambar.")

    # 3. Create the building record (community, unverified, status='pending')
    try:
        building_response = supabase.table("buildings").insert({
            "name": name,
            "address": address,
            "latitude": latitude,
            "longitude": longitude,
            "source": "community",
            "verified": False,
            "status": "pending"
        }).execute()
        
        if not building_response.data:
            raise HTTPException(status_code=400, detail="Failed to record building suggestion.")
        new_building = building_response.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal mencatat data gedung: {str(e)}")

    building_id = new_building["id"]

    # 4. Upload photo files to Supabase Storage bucket "photos"
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
            # Clean up created building if upload fails to keep DB clean
            try:
                supabase.table("buildings").delete().eq("id", building_id).execute()
            except Exception:
                pass
            raise HTTPException(status_code=500, detail=f"Gagal mengunggah foto bukti ke server: {str(upload_err)}")

    # 5. Run the multi-agent audit pipeline using the uploaded photo URLs
    try:
        audit_summary = run_audit_pipeline(building_id, photo_urls)
    except Exception as audit_err:
        raise HTTPException(
            status_code=500,
            detail=f"Gedung berhasil disimpan namun terjadi kegagalan audit: {str(audit_err)}"
        )

    # 6. Process optional 360 panorama upload and run panorama agent detection
    scene_id = None
    if panorama:
        try:
            # Ensure bucket exists
            try:
                supabase.storage.create_bucket("panoramas", {"public": True})
            except Exception:
                pass

            # Upload panorama file to Supabase storage
            file_extension = panorama.filename.split(".")[-1] if "." in panorama.filename else "jpg"
            unique_filename = f"{uuid.uuid4()}.{file_extension}"
            file_content = await panorama.read()
            
            supabase.storage.from_("panoramas").upload(
                path=unique_filename,
                file=file_content,
                file_options={"content-type": panorama.content_type}
            )
            
            # Get public url of panorama
            panorama_url = supabase.storage.from_("panoramas").get_public_url(unique_filename)
            
            # Insert into scenes
            scene_response = supabase.table("scenes").insert({
                "building_id": building_id,
                "type": "panorama_360",
                "file_url": panorama_url,
                "label": panorama.filename
            }).execute()
            
            if scene_response.data:
                scene_id = scene_response.data[0]["id"]
                
                # Run panorama detection agent
                features = run_panorama_agent(panorama_url)
                
                if features:
                    # Query newly created audit results for keyword mapping
                    audit_results_response = supabase.table("audit_results") \
                        .select("*, audit_criteria(*)") \
                        .eq("building_id", building_id) \
                        .execute()
                    results = audit_results_response.data or []
                    
                    # Helper matching function
                    def find_matching_audit_result(lbl: str, audit_results: list) -> Optional[str]:
                        lbl_lower = lbl.lower()
                        for r in audit_results:
                            criteria = r.get("audit_criteria")
                            if not criteria:
                                continue
                            desc = criteria.get("description", "").lower()
                            code = criteria.get("code", "").lower()
                            # Check keywords
                            if "toilet" in lbl_lower and "toilet" in desc:
                                return r["id"]
                            if "ramp" in lbl_lower and "ramp" in desc:
                                return r["id"]
                            if "tangga" in lbl_lower and "tangga" in desc:
                                return r["id"]
                            if ("ubin" in lbl_lower or "tactile" in lbl_lower) and "ubin" in desc:
                                return r["id"]
                            if "pintu" in lbl_lower and "pintu" in desc:
                                return r["id"]
                            if lbl_lower in desc or lbl_lower in code:
                                return r["id"]
                        return None

                    # Format annotations
                    annotations_to_insert = []
                    for item in features:
                        yaw = (item["x_percent"] / 100) * 360 - 180
                        pitch = 90 - (item["y_percent"] / 100) * 180
                        match_id = find_matching_audit_result(item["label"], results)
                        
                        annotations_to_insert.append({
                            "scene_id": scene_id,
                            "label": item["label"],
                            "pitch": pitch,
                            "yaw": yaw,
                            "audit_result_id": match_id
                        })
                    
                    if annotations_to_insert:
                        supabase.table("annotations").insert(annotations_to_insert).execute()
                        
        except Exception as panorama_err:
            # We don't fail the entire building creation if only panorama fails, but we print/raise
            print(f"Gagal memproses panorama: {str(panorama_err)}")

    return {
        "building": new_building,
        "audit_summary": audit_summary,
        "scene_id": scene_id
    }

@router.get("", response_model=List[dict])
def get_buildings():
    """
    Get all buildings. No pending status filtering.
    """
    try:
        response = supabase.table("buildings") \
            .select("*, audit_results(status, audit_criteria(category))") \
            .execute()
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{id}", response_model=dict)
def get_building(id: UUID):
    """
    Get a single building by ID.
    """
    try:
        response = supabase.table("buildings").select("*").eq("id", str(id)).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail=f"Building with ID {id} not found")
        return response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
