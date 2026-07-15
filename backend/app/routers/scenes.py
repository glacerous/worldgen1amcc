from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends
from typing import List
from uuid import UUID, uuid4
from pydantic import BaseModel
from app.db import supabase
from app.auth_utils import get_current_user


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


class AnnotationCreate(BaseModel):
    audit_result_id: UUID
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
    current_user: dict = Depends(get_current_user)
):
    """
    Upload a new 360 panorama scene for a building (without running AI detection).
    """
    try:
        # Check audit ownership: User must own at least one audit run for this building
        run_check = supabase.table("audit_runs") \
            .select("id") \
            .eq("building_id", str(building_id)) \
            .eq("user_id", str(current_user["user_id"])) \
            .execute()
        if not run_check.data:
            raise HTTPException(
                status_code=403,
                detail="Akses ditolak. Hanya pemilik audit yang dapat menambahkan foto 360°."
            )

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

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal mengunggah scene: {str(e)}")

@router.delete("/{scene_id}")
def delete_scene(scene_id: UUID, current_user: dict = Depends(get_current_user)):
    """
    Delete a specific scene.
    All scene_links (Penanda Navigasi) and annotations (Penanda Info) referencing
    this scene are automatically removed by ON DELETE CASCADE constraints.
    """
    try:
        # 1. Fetch scene to get building_id
        scene_res = supabase.table("scenes").select("building_id").eq("id", str(scene_id)).execute()
        if not scene_res.data:
            raise HTTPException(status_code=404, detail="Scene tidak ditemukan.")
            
        building_id = scene_res.data[0]["building_id"]
        
        # 2. Check if current user is the owner of an audit run for this building
        run_check = supabase.table("audit_runs") \
            .select("id") \
            .eq("building_id", str(building_id)) \
            .eq("user_id", str(current_user["user_id"])) \
            .execute()
        if not run_check.data:
            raise HTTPException(
                status_code=403,
                detail="Akses ditolak. Hanya pemilik audit yang dapat menghapus foto 360°."
            )

        supabase.table("scenes").delete().eq("id", str(scene_id)).execute()
        return {"status": "success", "message": f"Scene {scene_id} berhasil dihapus"}
    except HTTPException:
        raise
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

def check_audit_ownership(building_id: str, user_id: str):
    run_check = supabase.table("audit_runs") \
        .select("id") \
        .eq("building_id", building_id) \
        .eq("user_id", user_id) \
        .execute()
    if not run_check.data:
        raise HTTPException(
            status_code=403,
            detail="Akses ditolak. Hanya pemilik audit yang dapat mengubah data tur 360°."
        )

def get_building_id_from_scene(scene_id: str) -> str:
    scene_res = supabase.table("scenes").select("building_id").eq("id", scene_id).execute()
    if not scene_res.data:
        raise HTTPException(status_code=404, detail="Scene tidak ditemukan.")
    return scene_res.data[0]["building_id"]

def get_building_id_from_annotation(annotation_id: str) -> str:
    res = supabase.table("annotations") \
        .select("scene_id, scenes(building_id)") \
        .eq("id", annotation_id) \
        .execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Anotasi tidak ditemukan.")
    scene = res.data[0].get("scenes")
    if not scene:
        raise HTTPException(status_code=404, detail="Scene terkait tidak ditemukan.")
    return scene["building_id"]

def get_building_id_from_scene_link(link_id: str) -> str:
    res = supabase.table("scene_links").select("source_scene_id").eq("id", link_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Scene link tidak ditemukan.")
    return get_building_id_from_scene(res.data[0]["source_scene_id"])


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

@router.post("/{scene_id}/annotations", response_model=dict)
def create_annotation(scene_id: UUID, payload: AnnotationCreate, current_user: dict = Depends(get_current_user)):
    """
    Create a new annotation (Penanda Info) in a scene.
    """
    try:
        building_id = get_building_id_from_scene(str(scene_id))
        check_audit_ownership(building_id, str(current_user["user_id"]))

        # Determine the label if not provided
        label = payload.label
        if not label:
            res = supabase.table("audit_results") \
                .select("*, audit_criteria(code, short_label)") \
                .eq("id", str(payload.audit_result_id)) \
                .execute()
            if res.data:
                audit_res = res.data[0]
                criteria = audit_res.get("audit_criteria")
                if criteria:
                    label = criteria.get("short_label") or criteria.get("code")
            if not label:
                label = "Kriteria"

        new_ann = {
            "scene_id": str(scene_id),
            "audit_result_id": str(payload.audit_result_id),
            "pitch": payload.pitch,
            "yaw": payload.yaw,
            "label": label,
        }
        response = supabase.table("annotations").insert(new_ann).execute()

        if not response.data:
            raise HTTPException(status_code=500, detail="Gagal menyimpan anotasi ke database.")

        return response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal membuat anotasi: {str(e)}")

@router.delete("/annotations/{annotation_id}", response_model=dict)
def delete_annotation(annotation_id: UUID, current_user: dict = Depends(get_current_user)):
    """
    Delete a specific annotation (Penanda Info) by its ID.
    """
    try:
        building_id = get_building_id_from_annotation(str(annotation_id))
        check_audit_ownership(building_id, str(current_user["user_id"]))

        response = supabase.table("annotations") \
            .delete() \
            .eq("id", str(annotation_id)) \
            .execute()

        if not response.data:
            raise HTTPException(status_code=404, detail="Anotasi tidak ditemukan.")

        return {"status": "success", "message": "Anotasi berhasil dihapus"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal menghapus anotasi: {str(e)}")



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
def create_scene_link(scene_id: UUID, payload: SceneLinkCreate, current_user: dict = Depends(get_current_user)):
    """
    Create a new scene_link (Penanda Navigasi) from source scene to target scene.
    Used to build multi-room virtual tour navigation (like Matterport).
    """
    try:
        building_id = get_building_id_from_scene(str(scene_id))
        check_audit_ownership(building_id, str(current_user["user_id"]))

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
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal membuat scene link: {str(e)}")

@router.delete("/scene-links/{link_id}")
def delete_scene_link(link_id: str, current_user: dict = Depends(get_current_user)):
    """
    Delete a specific scene_link (Penanda Navigasi) from Supabase by its ID.
    """
    try:
        building_id = get_building_id_from_scene_link(link_id)
        check_audit_ownership(building_id, str(current_user["user_id"]))

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
