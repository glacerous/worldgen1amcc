from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from langgraph.graph import StateGraph, END
from app.agents.criteria_seed import CRITERIA_SEED
from app.agents.text_agent import run_text_agent
from app.agents.visual_agent import run_visual_agent
from app.agents.resolver_agent import run_resolver_agent

# 1. Define CriteriaResult Schema
class CriteriaResult(BaseModel):
    criteria_code: str
    status: str          # 'met', 'not_met', 'unknown', 'na'
    reasoning: str
    source_agent: str
    evidence_url: Optional[str] = None

# 2. Define BuildingAuditState Schema
class BuildingAuditState(BaseModel):
    building_id: str
    building_name: str
    building_address: Optional[str] = None
    photos: List[str] = Field(default_factory=list)
    criteria_results: List[CriteriaResult] = Field(default_factory=list)

# 3. Priority Helper Functions
def get_status_priority(status: str) -> int:
    """
    Returns priority order: met (4) > not_met (3) > unknown (2) > na (1).
    Other values get 0.
    """
    priority_map = {
        "met": 4,
        "not_met": 3,
        "unknown": 2,
        "na": 1
    }
    return priority_map.get(status.lower(), 0)

def get_agent_tier(agent: str) -> int:
    """
    Returns the evidence tier of the agent:
    - Direct Evidence (2): visual_agent, panorama_agent
    - Inference/Speculation (1): resolver_agent, text_agent
    - System/Fallback (0): system, etc.
    """
    agent_lower = agent.lower()
    if agent_lower in ["visual_agent", "panorama_agent"]:
        return 2
    elif agent_lower in ["resolver_agent", "text_agent"]:
        return 1
    return 0

def get_agent_priority(agent: str) -> int:
    """
    Returns priority order of source agents within the same tier for info richness:
    resolver_agent (3) > visual_agent (2) > text_agent (1) > system/other (0).
    """
    priority_map = {
        "resolver_agent": 3,
        "visual_agent": 2,
        "text_agent": 1,
        "system": 0
    }
    return priority_map.get(agent.lower(), 0)

def is_better_evaluation(new_eval: CriteriaResult, current_eval: CriteriaResult) -> bool:
    """
    Returns True if new_eval is preferred over current_eval.

    Priority order (highest to lowest):
      1. Evidence tier — visual/panorama (tier 2) always beats text/resolver (tier 1),
         regardless of status. A photo-based 'unknown' is more trustworthy than a
         text-based 'met' because it reflects actual observed (or unobserved) evidence.
      2. Within the same tier, definitive status (met/not_met) beats non-definitive (unknown/na).
      3. Within same tier + same definitiveness, higher status priority wins
         (met > not_met > unknown > na).
      4. Within all of the above equal, higher agent priority wins
         (resolver_agent > visual_agent > text_agent).
    """
    # Rule 1: Evidence tier — higher tier ALWAYS wins first
    new_tier = get_agent_tier(new_eval.source_agent)
    current_tier = get_agent_tier(current_eval.source_agent)
    if new_tier > current_tier:
        return True
    elif new_tier < current_tier:
        return False

    # Rule 2: Within same tier — definitive (met/not_met) beats non-definitive (unknown/na)
    new_is_def = new_eval.status.lower() in ["met", "not_met"]
    current_is_def = current_eval.status.lower() in ["met", "not_met"]
    if new_is_def and not current_is_def:
        return True
    if current_is_def and not new_is_def:
        return False

    # Rule 3: Within same tier and definitiveness — compare status priority
    new_status_p = get_status_priority(new_eval.status)
    current_status_p = get_status_priority(current_eval.status)
    if new_status_p > current_status_p:
        return True
    elif new_status_p < current_status_p:
        return False

    # Rule 4: All equal — compare agent priority for info richness
    return get_agent_priority(new_eval.source_agent) > get_agent_priority(current_eval.source_agent)

def merge_evaluations(results: List[CriteriaResult]) -> List[CriteriaResult]:
    """
    Consolidates multiple evaluations for each criteria based on evidence tier
    and status priority.
    """
    merged: Dict[str, CriteriaResult] = {}
    for r in results:
        code = r.criteria_code
        if code not in merged:
            merged[code] = r
        else:
            if is_better_evaluation(r, merged[code]):
                merged[code] = r
    
    # Ensure all seed criteria are represented
    final_list = []
    for c in CRITERIA_SEED:
        code = c["code"]
        if code in merged:
            final_list.append(merged[code])
        else:
            final_list.append(CriteriaResult(
                criteria_code=code,
                status="unknown",
                reasoning="Tidak dievaluasi oleh agen mana pun.",
                source_agent="system"
            ))
            
    return final_list

# 4. Graph Nodes
def text_node(state: BuildingAuditState) -> dict:
    """
    Node 1: Evaluates accessibility based on textual name & address.
    """
    results = run_text_agent(state.building_name, state.building_address or "")
    new_results = [CriteriaResult(**r) for r in results]
    return {"criteria_results": state.criteria_results + new_results}

def visual_node(state: BuildingAuditState) -> dict:
    """
    Node 2: Evaluates accessibility based on photo evidence.
    """
    results = run_visual_agent(state.photos)
    new_results = [CriteriaResult(**r) for r in results]
    return {"criteria_results": state.criteria_results + new_results}

def resolver_node(state: BuildingAuditState) -> dict:
    """
    Node 3: Resolves remaining 'unknown' criteria using Groq (Llama-3.3-70b-versatile).
    """
    # 1. Merge text and visual results to see current status
    merged_results = merge_evaluations(state.criteria_results)
    
    # 2. Extract which criteria are still 'unknown'
    unknown_codes = [
        r.criteria_code for r in merged_results if r.status == "unknown"
    ]
    
    # 3. Run resolver agent if there are unknown criteria
    if unknown_codes:
        existing_results_list = [
            {
                "criteria_code": r.criteria_code,
                "status": r.status,
                "reasoning": r.reasoning,
                "source_agent": r.source_agent
            }
            for r in merged_results
        ]
        
        resolved = run_resolver_agent(
            building_name=state.building_name,
            building_address=state.building_address or "",
            existing_results=existing_results_list,
            unknown_codes=unknown_codes
        )
        
        new_results = [CriteriaResult(**r) for r in resolved]
        return {"criteria_results": state.criteria_results + new_results}
        
    return {}

# 5. Build and Compile the Graph
workflow = StateGraph(BuildingAuditState)

# Add Nodes
workflow.add_node("text_agent", text_node)
workflow.add_node("visual_agent", visual_node)
workflow.add_node("resolver_agent", resolver_node)

# Set Entry and Sequential Edges
workflow.set_entry_point("text_agent")
workflow.add_edge("text_agent", "visual_agent")
workflow.add_edge("visual_agent", "resolver_agent")
workflow.add_edge("resolver_agent", END)

# Compile
# Compile
audit_graph = workflow.compile()

from app.db import supabase
from fastapi import HTTPException
from uuid import UUID

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

def run_audit_pipeline(
    building_id: str,
    photos: List[str],
    contributor_name: Optional[str] = None,
    gps_mismatch: bool = False,
    gps_distance_meters: Optional[float] = None,
    audit_run_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Runs the full LangGraph multi-agent audit pipeline for a building and stores results.
    """
    # 1. Fetch building details from Supabase
    try:
        building_response = supabase.table("buildings").select("*").eq("id", building_id).execute()
        if not building_response.data:
            raise HTTPException(status_code=404, detail=f"Gedung dengan ID {building_id} tidak ditemukan.")
        building = building_response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal mengambil data gedung dari database: {str(e)}")

    # 2. Ensure criteria are seeded in DB and fetch code -> id mapping
    criteria_map = ensure_criteria_seeded()

    # 3. Invoke the LangGraph workflow
    try:
        initial_state = BuildingAuditState(
            building_id=building_id,
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

    # 4. Insert or update the record in audit_runs
    try:
        # Check if we can save to 'photos' column directly
        try:
            if audit_run_id:
                audit_run_response = supabase.table("audit_runs").update({
                    "contributor_name": contributor_name,
                    "photos": photos,
                    "gps_mismatch": gps_mismatch,
                    "gps_distance_meters": gps_distance_meters
                }).eq("id", audit_run_id).execute()
            else:
                audit_run_response = supabase.table("audit_runs").insert({
                    "building_id": building_id,
                    "contributor_name": contributor_name,
                    "photos": photos,
                    "gps_mismatch": gps_mismatch,
                    "gps_distance_meters": gps_distance_meters
                }).execute()
                
            if not audit_run_response.data:
                raise Exception("Failed to insert/update audit run with photos column")
            audit_run_id = audit_run_response.data[0]["id"]
        except Exception as db_err:
            # Fallback: if 'photos' column does not exist or fails, serialize it in contributor_name
            print(f"[info] Fallback: storing photos array inside contributor_name: {db_err}")
            
            clean_contributor = contributor_name
            if contributor_name and "|||" in contributor_name:
                clean_contributor = contributor_name.split("|||", 1)[0]
                
            serialized_contributor = clean_contributor
            if photos:
                name_part = clean_contributor or "Anonim"
                serialized_contributor = f"{name_part}|||{','.join(photos)}"
                
            if audit_run_id:
                audit_run_response = supabase.table("audit_runs").update({
                    "contributor_name": serialized_contributor,
                    "gps_mismatch": gps_mismatch,
                    "gps_distance_meters": gps_distance_meters
                }).eq("id", audit_run_id).execute()
            else:
                audit_run_response = supabase.table("audit_runs").insert({
                    "building_id": building_id,
                    "contributor_name": serialized_contributor,
                    "gps_mismatch": gps_mismatch,
                    "gps_distance_meters": gps_distance_meters
                }).execute()
                
            if not audit_run_response.data:
                raise Exception("Failed to insert/update audit run with contributor_name serialization")
            audit_run_id = audit_run_response.data[0]["id"]
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Gagal mencatat atau memperbarui audit run di database: {str(e)}"
        )



    # 5. Insert new audit results to database linked to the audit_run_id
    rows_to_insert = []
    for r in final_results:
        crit_id = criteria_map.get(r.criteria_code)
        if not crit_id:
            continue
        
        # Retrieve the dynamic evidence_url determined by the visual agent
        evidence_url = r.evidence_url
        
        rows_to_insert.append({
            "building_id": building_id,
            "audit_run_id": audit_run_id,
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

    # 6. Return summary response
    return {
        "building_id": building_id,
        "building_name": building["name"],
        "audit_run_id": audit_run_id,
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


