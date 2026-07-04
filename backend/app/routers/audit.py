from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any
from uuid import UUID
from app.db import supabase
from app.agents.criteria_seed import CRITERIA_SEED
from app.agents.graph import audit_graph, merge_evaluations, BuildingAuditState

router = APIRouter(prefix="/audit", tags=["audit"])

# Schema for Audit Request body
class AuditRequest(BaseModel):
    building_id: UUID

def ensure_criteria_seeded() -> Dict[str, str]:
    """
    Ensures that the audit_criteria table is populated with seeds
    and returns a mapping of criteria_code to criteria_id.
    """
    try:
        # Fetch existing criteria from DB
        response = supabase.table("audit_criteria").select("id", "code").execute()
        existing_map = {row["code"]: row["id"] for row in response.data} if response.data else {}
        
        # Check for missing seed criteria
        missing_criteria = [
            c for c in CRITERIA_SEED if c["code"] not in existing_map
        ]
        
        if missing_criteria:
            insert_response = supabase.table("audit_criteria").insert(missing_criteria).execute()
            if insert_response.data:
                for row in insert_response.data:
                    existing_map[row["code"]] = row["id"]
                    
        return existing_map
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Gagal memverifikasi / menyemai kriteria audit di database: {str(e)}"
        )

@router.post("/run")
def run_audit(request: AuditRequest):
    building_id_str = str(request.building_id)
    
    # 1. Fetch building details from Supabase
    try:
        building_response = supabase.table("buildings").select("*").eq("id", building_id_str).execute()
        if not building_response.data:
            raise HTTPException(status_code=404, detail=f"Gedung dengan ID {building_id_str} tidak ditemukan.")
        building = building_response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal mengambil data gedung dari database: {str(e)}")

    # 2. Fetch associated photos (annotations photo_urls)
    try:
        annotations_response = supabase.table("annotations").select("photo_url").eq("building_id", building_id_str).execute()
        photos = [row["photo_url"] for row in annotations_response.data] if annotations_response.data else []
    except Exception as e:
        # Log error or default to empty list, let's treat it as no photos found
        photos = []

    # 3. Ensure criteria are seeded in DB and fetch code -> id mapping
    criteria_map = ensure_criteria_seeded()

    # 4. Invoke the LangGraph workflow
    try:
        initial_state = BuildingAuditState(
            building_id=building_id_str,
            building_name=building["name"],
            building_address=building.get("address", ""),
            photos=photos,
            criteria_results=[]
        )
        
        # LangGraph StateGraph invoke returns the final state dict
        final_state_dict = audit_graph.invoke(initial_state)
        
        # Merge all agent evaluations based on priority: met > not_met > unknown > na
        final_results = merge_evaluations(final_state_dict["criteria_results"])
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Terjadi kesalahan saat menjalankan analisis multi-agent: {str(e)}"
        )

    # 5. Clear previous audit results for this building to prevent duplicates
    try:
        supabase.table("audit_results").delete().eq("building_id", building_id_str).execute()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Gagal membersihkan data audit lama untuk gedung ini: {str(e)}"
        )

    # 6. Insert new audit results to database
    rows_to_insert = []
    for r in final_results:
        crit_id = criteria_map.get(r.criteria_code)
        if not crit_id:
            continue
        
        # Basic mapping for optional evidence_url if it came from visual agent and status is met
        evidence_url = photos[0] if (photos and r.source_agent == "visual_agent" and r.status == "met") else None
        
        rows_to_insert.append({
            "building_id": building_id_str,
            "criteria_id": crit_id,
            "status": r.status,
            "source_agent": r.source_agent,
            "reasoning": r.reasoning,
            "evidence_url": evidence_url
        })

    if rows_to_insert:
        try:
            supabase.table("audit_results").insert(rows_to_insert).execute()
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Gagal menyimpan hasil analisis audit ke database: {str(e)}"
            )

    # 7. Return summary response
    return {
        "building_id": request.building_id,
        "building_name": building["name"],
        "photos_analyzed": len(photos),
        "results": [
            {
                "criteria_code": r.criteria_code,
                "status": r.status,
                "reasoning": r.reasoning,
                "source_agent": r.source_agent
            }
            for r in final_results
        ]
    }

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

