from fastapi import APIRouter, HTTPException
from typing import List
from uuid import UUID
from app.db import supabase

router = APIRouter(prefix="/annotations", tags=["annotations"])

@router.get("/{building_id}", response_model=List[dict])
def get_building_annotations(building_id: UUID):
    """
    Returns all annotations for a specific building, joined with audit results and criteria description.
    """
    try:
        response = supabase.table("annotations") \
            .select("*, audit_results(*, audit_criteria(*))") \
            .eq("building_id", str(building_id)) \
            .execute()
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal mengambil data anotasi dari database: {str(e)}")
