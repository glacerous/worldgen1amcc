from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends
from typing import List
from uuid import UUID, uuid4
from pydantic import BaseModel
from app.db import supabase
from app.routers.admin import require_admin


router = APIRouter(prefix="/scenes", tags=["scenes"])

# ---------------------------------------------------------------------------
# NAMING CONVENTION (for clarity across the codebase):
#   annotations = "Penanda Info"      -> accessibility feature markers on a panorama
#                                        (ramp, toilet, etc.), linked to audit_result_id
#   scene_links = "Penanda Navigasi"  -> navigation links between panoramas for virtual tour
#                                        (like Matterport: click arrow -> jump to next scene)
# These are two DIFFERENT concepts. Do NOT confuse them.
# ---------------------------------------------------------------------------

class SceneLinkCreate(BaseModel):
    target_scene_id: UUID
    pitch: float
    yaw: float
    label: str = None


# ── Scenes ─────────────────────────────────────────────────────────────────

@router.get("", response_model=List[dict])
def get_scenes(building_id: UUID):
    """
    Get all scenes associated with a specific building.
    """
    try:
        response = supabase.table("scenes") \
            .select("*") \
            .eq("building_id", str(building_id)) \
            .execute()
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal mengambil data scenes dari database: {str(e)}")

@router.post("", response_model=dict)
async def create_scene(
    building_id: UUID = Form(...),
    label: str = Form(...),
    file: UploadFile = File(...),
    token: dict = Depends(require_admin)
):
    """
    Upload a new 360 panorama scene for a building (without running AI detection).
    """
    try:
        # 1. Ensure panoramas bucket exists in Supabase storage
        try:
            supabase.storage.create_bucket("panoramas", {"public": True})
        except Exception:
            pass
 
        # 2. Upload file to Supabase storage
        file_extension = file.filename.split(".")[-1] if "." in file.filename else "jpg"
        unique_filename = f"{uuid4()}.{file_extension}"
        file_content = await file.read()
 
        supabase.storage.from_("panoramas").upload(
            path=unique_filename,
            file=file_content,
            file_options={"content-type": file.content_type}
        )
 
        # 3. Get public URL
        panorama_url = supabase.storage.from_("panoramas").get_public_url(unique_filename)
 
        # 4. Save scene metadata to Supabase 'scenes' table
        scene_response = supabase.table("scenes").insert({
            "building_id": str(building_id),
            "type": "panorama_360",
            "file_url": panorama_url,
            "label": label
        }).execute()
 
        if not scene_response.data:
            raise HTTPException(status_code=500, detail="Gagal menyimpan metadata scene ke database.")
 
        return scene_response.data[0]
 
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal mengunggah scene: {str(e)}")
 
@router.delete("/{scene_id}")
def delete_scene(scene_id: UUID, token: dict = Depends(require_admin)):
    """
    Delete a specific scene.
    All scene_links (Penanda Navigasi) and annotations (Penanda Info) referencing
    this scene are automatically removed by ON DELETE CASCADE constraints.
    """
    try:
        supabase.table("scenes").delete().eq("id", str(scene_id)).execute()
        return {"status": "success", "message": f"Scene {scene_id} berhasil dihapus"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal menghapus scene: {str(e)}")


# ── Annotations (Penanda Info) ──────────────────────────────────────────────

@router.get("/{scene_id}/annotations", response_model=List[dict])
def get_scene_annotations(scene_id: UUID):
    """
    Get all annotations (Penanda Info) for a scene — accessibility feature markers
    joined with audit results and criteria descriptions.
    """
    try:
        response = supabase.table("annotations") \
            .select("*, audit_results(*, audit_criteria(*))") \
            .eq("scene_id", str(scene_id)) \
            .execute()
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal mengambil data anotasi scene dari database: {str(e)}")


# ── Scene Links (Penanda Navigasi) ─────────────────────────────────────────

@router.get("/{scene_id}/scene-links", response_model=List[dict])
def get_scene_links(scene_id: UUID):
    """
    Get all scene_links (Penanda Navigasi) originating from a source scene.
    These are navigation arrows that let users jump to another panorama in the virtual tour.
    """
    try:
        response = supabase.table("scene_links") \
            .select("*") \
            .eq("source_scene_id", str(scene_id)) \
            .execute()
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal mengambil data scene links dari database: {str(e)}")

@router.post("/{scene_id}/scene-links", response_model=dict)
def create_scene_link(scene_id: UUID, payload: SceneLinkCreate, token: dict = Depends(require_admin)):
    """
    Create a new scene_link (Penanda Navigasi) from source scene to target scene.
    Used to build multi-room virtual tour navigation (like Matterport).
    """
    try:
        new_link = {
            "source_scene_id": str(scene_id),
            "target_scene_id": str(payload.target_scene_id),
            "pitch": payload.pitch,
            "yaw": payload.yaw,
            "label": payload.label,
        }
        response = supabase.table("scene_links").insert(new_link).execute()

        if not response.data:
            raise HTTPException(status_code=500, detail="Gagal menyimpan scene link ke database.")

        return response.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal membuat scene link: {str(e)}")

@router.delete("/scene-links/{link_id}")
def delete_scene_link(link_id: str, token: dict = Depends(require_admin)):
    """
    Delete a specific scene_link (Penanda Navigasi) from Supabase by its ID.
    """
    try:
        response = supabase.table("scene_links") \
            .delete() \
            .eq("id", link_id) \
            .execute()

        if not response.data:
            raise HTTPException(status_code=404, detail="Scene link tidak ditemukan.")

        return {"status": "success", "message": "Scene link berhasil dihapus"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal menghapus scene link: {str(e)}")
