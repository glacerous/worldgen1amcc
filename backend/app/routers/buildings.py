from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from uuid import UUID
from app.db import supabase

router = APIRouter(prefix="/buildings", tags=["buildings"])

# Schema for creating a building
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
            "status": "approved"
        }).execute()
        
        if not response.data:
            raise HTTPException(status_code=400, detail="Failed to create building")
        
        return response.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/suggest", response_model=dict)
def suggest_building(building: BuildingCreate):
    """
    Public endpoint to suggest a building. Inserts with 'pending' status.
    """
    try:
        response = supabase.table("buildings").insert({
            "name": building.name,
            "address": building.address,
            "latitude": building.latitude,
            "longitude": building.longitude,
            "status": "pending"
        }).execute()
        
        if not response.data:
            raise HTTPException(status_code=400, detail="Failed to suggest building")
        
        return response.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("", response_model=List[dict])
def get_buildings(status: Optional[str] = "approved"):
    """
    Get all buildings filtered by status. Defaults to 'approved' if not specified.
    """
    try:
        response = supabase.table("buildings") \
            .select("*, audit_results(status, audit_criteria(category))") \
            .eq("status", status) \
            .execute()
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{id}", response_model=dict)
def get_building(id: UUID):
    try:
        response = supabase.table("buildings").select("*").eq("id", str(id)).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail=f"Building with ID {id} not found")
        return response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
