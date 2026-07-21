import uuid
import datetime
import time
import hashlib
from enum import Enum
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, Request, Response, Cookie, Body
from pydantic import BaseModel
from uuid import UUID

from app.db import supabase
from app.config import settings
from app.routers.admin import require_admin

# 1. Enums and Schemas
class TrustStatus(str, Enum):
    NEUTRAL = "neutral"
    TRUSTED = "trusted"
    DOUBTFUL = "doubtful"
    REPORTED = "reported"

class VoteType(str, Enum):
    UP = "up"
    DOWN = "down"

class VoteRequest(BaseModel):
    vote_type: Optional[VoteType] = None
    audit_run_id: Optional[UUID] = None

class ReportRequest(BaseModel):
    reason: str

class AdminTrustOverrideRequest(BaseModel):
    status: TrustStatus

# Empty mock definitions to prevent breaking any legacy or temporary imports
MOCK_BUILDING_TRUST: Dict[str, Dict[str, Any]] = {}

# Rate limiter state
# anonymous_id -> list of timestamps of reports in the last 24 hours
REPORT_RATE_LIMITS: Dict[str, List[float]] = {}

# Helper to check report rate limit
def check_report_rate_limit(anonymous_id: str):
    now = time.time()
    one_day_ago = now - 86400
    
    timestamps = REPORT_RATE_LIMITS.get(anonymous_id, [])
    # Clean up old timestamps
    timestamps = [t for t in timestamps if t > one_day_ago]
    
    if len(timestamps) >= 10:
        raise HTTPException(
            status_code=429,
            detail="Batas laporan terlampaui. Anda hanya dapat mengirim maksimal 10 laporan per hari."
        )
    
    timestamps.append(now)
    REPORT_RATE_LIMITS[anonymous_id] = timestamps

# Helper to hash IP
def hash_ip(ip_address: str) -> str:
    salt = settings.IP_HASH_SALT
    salted_ip = f"{ip_address}{salt}"
    return hashlib.sha256(salted_ip.encode("utf-8")).hexdigest()

# Helper to parse client IP
def get_client_ip(request: Request) -> str:
    x_forwarded_for = request.headers.get("x-forwarded_for")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"

# 2. Anonymous Session Dependency
def get_anonymous_id(request: Request, response: Response, anonymous_id: Optional[str] = Cookie(None)):
    header_anon_id = request.headers.get("x-anonymous-id")
    if header_anon_id:
        return header_anon_id

    if not anonymous_id:
        anonymous_id = str(uuid.uuid4())
        # Set cookie with 1 year expiry (31536000 seconds)
        response.set_cookie(
            key="anonymous_id",
            value=anonymous_id,
            max_age=31536000,
            path="/",
            httponly=True,
            samesite="lax",
            secure=False  # Allow http in local development
        )
    return anonymous_id

# Router definition
router = APIRouter(prefix="/buildings", tags=["trust"])
audit_runs_trust_router = APIRouter(prefix="/audit-runs", tags=["audit-runs-trust"])

# 3. Helper function: recalculate_trust_status
def recalculate_trust_status(building_id: str, db_building: Optional[Dict[str, Any]] = None):
    """
    Recalculates the trust status of a building based on its cached votes.
    Only updates automatically if manually_set_by_admin is False.
    """
    # 1. Load building data
    if db_building:
        building = db_building
    else:
        res = supabase.table("buildings").select("*").eq("id", building_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Gedung tidak ditemukan.")
        building = res.data[0]

    # Check manual override
    if building.get("manually_set_by_admin", False):
        return building

    # Calculate vote stats from database
    res_votes = supabase.table("votes").select("vote_type").eq("building_id", building_id).execute()
    votes = res_votes.data or []

    vote_count = len(votes)
    if vote_count == 0:
        trust_score = None
        new_status = TrustStatus.NEUTRAL
    else:
        upvotes = sum(1 for v in votes if v["vote_type"] == VoteType.UP.value)
        trust_score = upvotes / vote_count
        
        # Apply logic thresholds
        min_votes = settings.MIN_VOTES_FOR_TRUSTED
        ratio_trusted = settings.UPVOTE_RATIO_TRUSTED
        
        if vote_count < min_votes:
            new_status = TrustStatus.NEUTRAL
        elif trust_score >= ratio_trusted:
            new_status = TrustStatus.TRUSTED
        else:
            new_status = TrustStatus.DOUBTFUL

    # If building is currently REPORTED, retain the REPORTED status badge, but still update vote cache
    if building.get("trust_status") == TrustStatus.REPORTED.value:
        new_status = TrustStatus.REPORTED

    # Save cache updates
    update_res = supabase.table("buildings").update({
        "trust_status": new_status.value,
        "trust_score_cache": trust_score,
        "vote_count_cache": vote_count
    }).eq("id", building_id).execute()
    
    if update_res.data:
        return update_res.data[0]
        
    building["trust_status"] = new_status.value
    building["trust_score_cache"] = trust_score
    building["vote_count_cache"] = vote_count
    return building


# Helpers for vote status & processing per target
def fetch_vote_status_for_target(building_id: str, audit_run_id: Optional[str], anonymous_id: str):
    if audit_run_id:
        try:
            res = supabase.table("votes") \
                .select("vote_type") \
                .eq("audit_run_id", audit_run_id) \
                .eq("anonymous_id", anonymous_id) \
                .execute()
            has_voted = False
            vote_type = None
            if res.data:
                has_voted = True
                vote_type = res.data[0]["vote_type"]

            res_votes = supabase.table("votes").select("vote_type").eq("audit_run_id", audit_run_id).execute()
            votes = res_votes.data or []
            up_count = sum(1 for v in votes if v.get("vote_type") == "up")
            down_count = sum(1 for v in votes if v.get("vote_type") == "down")
            vote_count = len(votes)
            trust_score = (up_count / vote_count) if vote_count > 0 else None

            return {
                "has_voted": has_voted,
                "vote_type": vote_type,
                "trust_score": trust_score,
                "vote_count": vote_count,
                "up_count": up_count,
                "down_count": down_count
            }
        except Exception:
            pass

    # Fallback/default to building_id
    res = supabase.table("votes") \
        .select("vote_type") \
        .eq("building_id", building_id) \
        .eq("anonymous_id", anonymous_id) \
        .execute()
    has_voted = False
    vote_type = None
    if res.data:
        has_voted = True
        vote_type = res.data[0]["vote_type"]

    build_res = supabase.table("buildings") \
        .select("trust_score_cache, vote_count_cache") \
        .eq("id", building_id) \
        .execute()
    
    trust_score = None
    vote_count = 0
    if build_res.data:
        trust_score = build_res.data[0].get("trust_score_cache")
        vote_count = build_res.data[0].get("vote_count_cache") or 0

    res_votes = supabase.table("votes").select("vote_type").eq("building_id", building_id).execute()
    votes = res_votes.data or []
    up_count = sum(1 for v in votes if v.get("vote_type") == "up")
    down_count = sum(1 for v in votes if v.get("vote_type") == "down")

    return {
        "has_voted": has_voted,
        "vote_type": vote_type,
        "trust_score": trust_score,
        "vote_count": vote_count,
        "up_count": up_count,
        "down_count": down_count
    }


def process_vote(building_id: str, audit_run_id: Optional[str], vote_type: Optional[str], anonymous_id: str):
    processed_run = False
    if audit_run_id:
        try:
            existing_vote = supabase.table("votes") \
                .select("id") \
                .eq("audit_run_id", audit_run_id) \
                .eq("anonymous_id", anonymous_id) \
                .execute()
                
            if vote_type is None:
                if existing_vote.data:
                    supabase.table("votes") \
                        .delete() \
                        .eq("id", existing_vote.data[0]["id"]) \
                        .execute()
            else:
                if existing_vote.data:
                    supabase.table("votes") \
                        .update({"vote_type": vote_type}) \
                        .eq("id", existing_vote.data[0]["id"]) \
                        .execute()
                else:
                    supabase.table("votes").insert({
                        "building_id": building_id,
                        "audit_run_id": audit_run_id,
                        "anonymous_id": anonymous_id,
                        "vote_type": vote_type
                    }).execute()
            processed_run = True
        except Exception:
            processed_run = False

    if not processed_run:
        existing_vote = supabase.table("votes") \
            .select("id") \
            .eq("building_id", building_id) \
            .eq("anonymous_id", anonymous_id) \
            .execute()
            
        if vote_type is None:
            if existing_vote.data:
                supabase.table("votes") \
                    .delete() \
                    .eq("id", existing_vote.data[0]["id"]) \
                    .execute()
        else:
            if existing_vote.data:
                supabase.table("votes") \
                    .update({"vote_type": vote_type}) \
                    .eq("id", existing_vote.data[0]["id"]) \
                    .execute()
            else:
                supabase.table("votes").insert({
                    "building_id": building_id,
                    "anonymous_id": anonymous_id,
                    "vote_type": vote_type
                }).execute()

    updated_building = recalculate_trust_status(building_id)
    
    stats = fetch_vote_status_for_target(building_id, audit_run_id if processed_run else None, anonymous_id)
    return {
        "status": "success",
        "message": "Vote berhasil disimpan.",
        "building": updated_building,
        "up_count": stats["up_count"],
        "down_count": stats["down_count"],
        "vote_count": stats["vote_count"],
        "trust_score": stats["trust_score"]
    }


# 4. Core Endpoints

@router.get("/{id}/vote-status", response_model=dict)
def get_user_vote_status(
    id: UUID, 
    audit_run_id: Optional[UUID] = None, 
    anonymous_id: str = Depends(get_anonymous_id)
):
    """
    Returns if the current anonymous user has voted on the building/audit run and what vote type.
    """
    building_id = str(id)
    run_id_str = str(audit_run_id) if audit_run_id else None
    return fetch_vote_status_for_target(building_id, run_id_str, anonymous_id)


@router.post("/{id}/vote", response_model=dict)
def vote_building(
    id: UUID, 
    body: VoteRequest,
    anonymous_id: str = Depends(get_anonymous_id)
):
    """
    Submit or update a vote for a building or audit run. Recalculates trust status.
    """
    building_id = str(id)
    run_id_str = str(body.audit_run_id) if body.audit_run_id else None
    vote_type_str = body.vote_type.value if body.vote_type else None
    return process_vote(building_id, run_id_str, vote_type_str, anonymous_id)


@audit_runs_trust_router.get("/{audit_run_id}/vote-status", response_model=dict)
def get_audit_run_vote_status(
    audit_run_id: UUID,
    anonymous_id: str = Depends(get_anonymous_id)
):
    """
    Returns vote status for a specific audit run.
    """
    run_id_str = str(audit_run_id)
    res = supabase.table("audit_runs").select("building_id").eq("id", run_id_str).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Audit run tidak ditemukan.")
    building_id = res.data[0]["building_id"]
    return fetch_vote_status_for_target(building_id, run_id_str, anonymous_id)


@audit_runs_trust_router.post("/{audit_run_id}/vote", response_model=dict)
def vote_audit_run(
    audit_run_id: UUID,
    body: VoteRequest,
    anonymous_id: str = Depends(get_anonymous_id)
):
    """
    Submit or update a vote for a specific audit run.
    """
    run_id_str = str(audit_run_id)
    res = supabase.table("audit_runs").select("building_id").eq("id", run_id_str).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Audit run tidak ditemukan.")
    building_id = res.data[0]["building_id"]
    vote_type_str = body.vote_type.value if body.vote_type else None
    return process_vote(building_id, run_id_str, vote_type_str, anonymous_id)



@router.post("/{id}/report", response_model=dict)
def report_building(
    id: UUID,
    body: ReportRequest,
    request: Request,
    anonymous_id: str = Depends(get_anonymous_id)
):
    """
    Report a building. Requires a non-empty reason.
    Limits to 10 reports per day per anonymous_id.
    """
    building_id = str(id)
    if not body.reason.strip():
        raise HTTPException(status_code=400, detail="Alasan pelaporan wajib diisi.")

    # Rate limiting
    check_report_rate_limit(anonymous_id)

    # Hash IP
    client_ip = get_client_ip(request)
    ip_hash = hash_ip(client_ip)

    try:
        # Check if building exists
        build_res = supabase.table("buildings").select("id, manually_set_by_admin").eq("id", building_id).execute()
        if not build_res.data:
            raise HTTPException(status_code=404, detail="Gedung tidak ditemukan.")
            
        # Check for duplicate reports by same anonymous_id OR reporter_ip_hash
        duplicates = supabase.table("building_reports") \
            .select("id") \
            .eq("building_id", building_id) \
            .or_(f"anonymous_id.eq.{anonymous_id},reporter_ip_hash.eq.{ip_hash}") \
            .execute()
            
        if duplicates.data:
            raise HTTPException(
                status_code=409, 
                detail="Anda sudah mengirimkan laporan untuk gedung ini sebelumnya."
            )
            
        # Insert report
        supabase.table("building_reports").insert({
            "building_id": building_id,
            "anonymous_id": anonymous_id,
            "reporter_ip_hash": ip_hash,
            "reason": body.reason
        }).execute()
        
        # Check distinct reports count
        total_reports_res = supabase.table("building_reports") \
            .select("anonymous_id", count="exact") \
            .eq("building_id", building_id) \
            .execute()
            
        distinct_count = total_reports_res.count if total_reports_res.count is not None else len(total_reports_res.data or [])
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal mengirimkan laporan: {str(e)}")

    # Check threshold to trigger reported state
    threshold = settings.REPORT_THRESHOLD
    if distinct_count >= threshold:
        building = build_res.data[0]
        if not building.get("manually_set_by_admin", False):
            supabase.table("buildings").update({
                "trust_status": TrustStatus.REPORTED.value
            }).eq("id", building_id).execute()

    return {
        "status": "success",
        "message": "Laporan berhasil dikirim dan akan segera ditinjau oleh admin."
    }

# 5. Protected Admin Endpoints

admin_trust_router = APIRouter(prefix="/admin", tags=["admin-trust"])

@admin_trust_router.patch("/buildings/{id}/trust-status", response_model=dict)
def admin_override_trust_status(
    id: UUID,
    body: AdminTrustOverrideRequest,
    admin_payload: dict = Depends(require_admin)
):
    """
    Protected admin endpoint to override trust status.
    Sets manually_set_by_admin to True.
    """
    building_id = str(id)
    try:
        res = supabase.table("buildings").update({
            "trust_status": body.status.value,
            "manually_set_by_admin": True
        }).eq("id", building_id).execute()
        
        if not res.data:
            raise HTTPException(status_code=404, detail="Gedung tidak ditemukan.")
            
        return {
            "status": "success",
            "message": f"Status kepercayaan diubah secara manual menjadi: {body.status.value}.",
            "building": res.data[0]
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal merubah status: {str(e)}")


@admin_trust_router.patch("/buildings/{id}/reset-to-auto", response_model=dict)
def admin_reset_to_auto(
    id: UUID,
    admin_payload: dict = Depends(require_admin)
):
    """
    Protected admin endpoint to reset manually_set_by_admin to False,
    and trigger automatic voting trust status recalculation.
    """
    building_id = str(id)
    try:
        # Reset manually_set_by_admin and clear reported status so it can be recalculated
        supabase.table("buildings").update({
            "manually_set_by_admin": False,
            "trust_status": TrustStatus.NEUTRAL.value
        }).eq("id", building_id).execute()
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal reset status: {str(e)}")

    updated_building = recalculate_trust_status(building_id)
    
    return {
        "status": "success",
        "message": "Status kepercayaan dikembalikan ke perhitungan otomatis.",
        "building": updated_building
    }


@admin_trust_router.get("/moderation-queue", response_model=List[dict])
def admin_get_moderation_queue(
    admin_payload: dict = Depends(require_admin)
):
    """
    Protected admin endpoint to list all reported buildings with their reports.
    """
    try:
        res = supabase.table("buildings") \
            .select("*, building_reports(*)") \
            .eq("trust_status", TrustStatus.REPORTED.value) \
            .execute()
        return res.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal mengambil antrian moderasi: {str(e)}")


@admin_trust_router.get("/buildings/{id}/reports", response_model=List[dict])
def admin_get_building_reports(
    id: UUID,
    admin_payload: dict = Depends(require_admin)
):
    """
    Protected admin endpoint to list all reports for a specific building.
    """
    building_id = str(id)
    try:
        res = supabase.table("building_reports") \
            .select("*") \
            .eq("building_id", building_id) \
            .order("created_at", desc=True) \
            .execute()
        return res.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal mengambil laporan gedung: {str(e)}")


@admin_trust_router.delete("/buildings/{id}", response_model=dict)
def delete_building(
    id: UUID,
    admin_payload: dict = Depends(require_admin)
):
    """
    Protected admin endpoint to delete a building and its associated records.
    """
    building_id = str(id)
    try:
        res = supabase.table("buildings").delete().eq("id", building_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Gedung tidak ditemukan.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal menghapus gedung: {str(e)}")
        
    return {
        "status": "success",
        "message": "Gedung berhasil dihapus."
    }
