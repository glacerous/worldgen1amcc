from fastapi import APIRouter, HTTPException
from typing import List
from uuid import UUID
from app.db import supabase

router = APIRouter(prefix="/scenes", tags=["scenes"])

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
