import jwt
import bcrypt
import datetime
from fastapi import APIRouter, HTTPException, Header, Depends, Body
from typing import List, Optional
from uuid import UUID
from pydantic import BaseModel
from app.db import supabase
from app.config import settings

# 1. Router definitions
# admin_router for protected /admin routes
admin_router = APIRouter(prefix="/admin", tags=["admin"])

# public_router for public endpoints (/login, /audit-results)
public_router = APIRouter(tags=["reports"])

# 2. Schemas
class ReportRequest(BaseModel):
    reason: Optional[str] = None

class LoginRequest(BaseModel):
    email: str
    password: str

# 3. Token Verification Dependency
def require_admin(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Akses ditolak. Token otentikasi tidak disediakan atau tidak valid."
        )
    token = authorization.split(" ")[1]
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token telah kedaluwarsa.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token tidak valid.")

# ── Public Endpoints ────────────────────────────────────────────────────────

@public_router.post("/login", response_model=dict)
def login(body: LoginRequest = Body(...)):
    """
    Public endpoint for admin login.
    Checks the admins table, verifies password, and returns a JWT token.
    """
    try:
        response = supabase.table("admins").select("*").eq("email", body.email).execute()
        if not response.data:
            raise HTTPException(status_code=401, detail="Email atau password salah.")
            
        admin = response.data[0]
        hashed_pwd = admin["password_hash"].encode('utf-8')
        input_pwd = body.password.encode('utf-8')
        
        if not bcrypt.checkpw(input_pwd, hashed_pwd):
            raise HTTPException(status_code=401, detail="Email atau password salah.")
            
        # Generate JWT
        payload = {
            "sub": str(admin["id"]),
            "email": admin["email"],
            "exp": datetime.datetime.utcnow() + datetime.timedelta(days=7)
        }
        token = jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")
        
        return {"access_token": token, "token_type": "bearer"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal melakukan login: {str(e)}")

@public_router.post("/audit-results/{audit_result_id}/report", response_model=dict)
def report_audit_result(audit_result_id: UUID, body: ReportRequest = Body(...)):
    """
    Public endpoint to submit a report for a specific audit result.
    Inserts a row into the 'reports' table with default status 'open'.
    """
    try:
        # Check if audit result exists first
        audit_res = supabase.table("audit_results") \
            .select("id") \
            .eq("id", str(audit_result_id)) \
            .execute()
            
        if not audit_res.data:
            raise HTTPException(
                status_code=404,
                detail=f"Audit result dengan ID {audit_result_id} tidak ditemukan."
            )

        report_data = {
            "audit_result_id": str(audit_result_id),
            "reason": body.reason,
            "status": "open"
        }
        
        response = supabase.table("reports").insert(report_data).execute()
        if not response.data:
            raise HTTPException(status_code=500, detail="Gagal menyimpan laporan ke database.")
            
        return response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Terjadi kesalahan saat membuat laporan: {str(e)}")

# ── Protected Admin Endpoints ───────────────────────────────────────────────

@admin_router.get("/reports", response_model=List[dict])
def get_admin_reports(token: str = Depends(require_admin)):
    """
    Protected endpoint to retrieve all reports.
    """
    try:
        response = supabase.table("reports") \
            .select("*, audit_results(*, buildings(*), audit_criteria(*))") \
            .order("created_at", desc=True) \
            .execute()
        return response.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal mengambil daftar laporan: {str(e)}")

@admin_router.get("/disputed", response_model=List[dict])
def get_admin_disputed(token: str = Depends(require_admin)):
    """
    Protected endpoint to retrieve all buildings that have at least one criteria
    with disputed consensus status (is_disputed = True).
    """
    try:
        # 1. Fetch all buildings
        buildings_response = supabase.table("buildings").select("*").execute()
        buildings = buildings_response.data or []
        
        # 2. Fetch all audit results with criteria details
        results_response = supabase.table("audit_results") \
            .select("*, audit_criteria(code)") \
            .execute()
        results = results_response.data or []
        
        # 3. Group status values by building and criteria code
        results_by_building = {}
        for r in results:
            b_id = r["building_id"]
            crit = r.get("audit_criteria")
            if not crit:
                continue
            code = crit.get("code")
            if not code:
                continue
                
            if b_id not in results_by_building:
                results_by_building[b_id] = {}
            if code not in results_by_building[b_id]:
                results_by_building[b_id][code] = []
            results_by_building[b_id][code].append(r["status"])
            
        # 4. Filter buildings containing any criteria with conflicting statuses (more than 1 unique status)
        disputed_buildings = []
        for b in buildings:
            b_id = b["id"]
            has_dispute = False
            building_criteria = results_by_building.get(b_id, {})
            
            for code, statuses in building_criteria.items():
                if len(set(statuses)) > 1:
                    has_dispute = True
                    break
                    
        return disputed_buildings
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal memproses daftar gedung bersengketa: {str(e)}")

@admin_router.post("/reports/{report_id}/resolve", response_model=dict)
def resolve_report(report_id: UUID, token: str = Depends(require_admin)):
    """
    Protected endpoint to mark a report as resolved.
    """
    try:
        response = supabase.table("reports") \
            .update({"status": "resolved"}) \
            .eq("id", str(report_id)) \
            .execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Laporan tidak ditemukan.")
        return response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal menyelesaikan laporan: {str(e)}")
