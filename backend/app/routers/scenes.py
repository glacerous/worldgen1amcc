import os
import json
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from typing import List
from uuid import UUID, uuid4
from pydantic import BaseModel
from app.db import supabase

router = APIRouter(prefix="/scenes", tags=["scenes"])

# Define Path to Local Hotspots file
HOTSPOTS_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "hotspots.json")

class HotspotCreate(BaseModel):
    target_scene_id: UUID
    pitch: float
    yaw: float
    label: str = None

def load_hotspots() -> dict:
    if not os.path.exists(HOTSPOTS_FILE):
        return {}
    try:
        with open(HOTSPOTS_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return {}

def save_hotspots(data: dict):
    os.makedirs(os.path.dirname(HOTSPOTS_FILE), exist_ok=True)
    with open(HOTSPOTS_FILE, "w") as f:
        json.dump(data, f, indent=2)

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
    file: UploadFile = File(...)
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
def delete_scene(scene_id: UUID):
    """
    Delete a specific scene and clean up its hotspots locally.
    """
    scene_id_str = str(scene_id)
    try:
        # 1. Delete from Supabase (Supabase cascades annotations automatically)
        response = supabase.table("scenes").delete().eq("id", scene_id_str).execute()
        
        # 2. Clean up hotspots from local database
        hotspots_data = load_hotspots()
        # Remove hotspots originating from this scene
        if scene_id_str in hotspots_data:
            del hotspots_data[scene_id_str]
            
        # Remove hotspots pointing to this scene
        for src_id, h_list in list(hotspots_data.items()):
            updated_list = [h for h in h_list if h["target_scene_id"] != scene_id_str]
            hotspots_data[src_id] = updated_list
            
        save_hotspots(hotspots_data)
        
        return {"status": "success", "message": f"Scene {scene_id} berhasil dihapus"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal menghapus scene: {str(e)}")

@router.get("/{scene_id}/annotations", response_model=List[dict])
def get_scene_annotations(scene_id: UUID):
    """
    Get all annotations associated with a specific scene, joined with audit results and criteria descriptions.
    """
    try:
        response = supabase.table("annotations") \
            .select("*, audit_results(*, audit_criteria(*))") \
            .eq("scene_id", str(scene_id)) \
            .execute()
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal mengambil data anotasi scene dari database: {str(e)}")

@router.get("/{scene_id}/hotspots", response_model=List[dict])
def get_scene_hotspots(scene_id: UUID):
    """
    Get all hotspots associated with a specific source scene from local storage.
    """
    hotspots_data = load_hotspots()
    scene_id_str = str(scene_id)
    return hotspots_data.get(scene_id_str, [])

@router.post("/{scene_id}/hotspots", response_model=dict)
def create_hotspot(scene_id: UUID, payload: HotspotCreate):
    """
    Create a new hotspot linking source scene_id to target_scene_id.
    """
    hotspots_data = load_hotspots()
    scene_id_str = str(scene_id)
    
    new_hotspot = {
        "id": str(uuid4()),
        "source_scene_id": scene_id_str,
        "target_scene_id": str(payload.target_scene_id),
        "pitch": payload.pitch,
        "yaw": payload.yaw,
        "label": payload.label
    }
    
    if scene_id_str not in hotspots_data:
        hotspots_data[scene_id_str] = []
        
    hotspots_data[scene_id_str].append(new_hotspot)
    save_hotspots(hotspots_data)
    return new_hotspot

@router.delete("/hotspots/{hotspot_id}")
def delete_hotspot(hotspot_id: str):
    """
    Delete a specific hotspot from local storage.
    """
    hotspots_data = load_hotspots()
    deleted = False
    for scene_id, h_list in hotspots_data.items():
        for h in h_list:
            if h["id"] == hotspot_id:
                h_list.remove(h)
                deleted = True
                break
        if deleted:
            break
            
    if not deleted:
        raise HTTPException(status_code=404, detail="Hotspot tidak ditemukan.")
        
    save_hotspots(hotspots_data)
    return {"status": "success", "message": "Hotspot berhasil dihapus"}
