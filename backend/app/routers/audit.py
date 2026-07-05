from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from uuid import UUID
from app.db import supabase
from app.agents.graph import run_audit_pipeline

router = APIRouter(prefix="/audit", tags=["audit"])

# Schema for Audit Request body
class AuditRequest(BaseModel):
    building_id: UUID
    contributor_name: Optional[str] = None

@router.post("/run")
def run_audit(request: AuditRequest):
    building_id_str = str(request.building_id)
    
    # Fetch associated photos from annotations if they exist
    try:
        annotations_response = supabase.table("annotations").select("photo_url").eq("building_id", building_id_str).execute()
        photos = [row["photo_url"] for row in annotations_response.data] if annotations_response.data else []
    except Exception:
        photos = []

    # Delegate core logic to run_audit_pipeline helper
    return run_audit_pipeline(building_id_str, photos, contributor_name=request.contributor_name)


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

