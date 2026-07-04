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
    try:
        response = supabase.table("buildings").insert({
            "name": building.name,
            "address": building.address,
            "latitude": building.latitude,
            "longitude": building.longitude
        }).execute()
        
        if not response.data:
            raise HTTPException(status_code=400, detail="Failed to create building")
        
        return response.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("", response_model=List[dict])
def get_buildings():
    try:
        response = supabase.table("buildings").select("*").execute()
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
