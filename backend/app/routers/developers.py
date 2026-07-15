import secrets
from datetime import datetime, timezone
from uuid import UUID
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.db import supabase
from app.auth_utils import get_current_user, check_api_key
from app.routers.admin import require_admin

router = APIRouter(tags=["developers"])
admin_dev_router = APIRouter(prefix="/admin/developers", tags=["admin"])

# Pydantic Schemas
class APIKeyResponse(BaseModel):
    api_key: str
    tier: str
    rate_limit_per_day: int
    is_active: bool
    pro_requested_at: Optional[datetime] = None
    pro_approved_at: Optional[datetime] = None

class MessageResponse(BaseModel):
    message: str

class UserDetail(BaseModel):
    email: Optional[str] = None
    display_name: Optional[str] = None

class PendingRequestResponse(BaseModel):
    id: UUID
    user_id: UUID
    api_key: str
    tier: str
    rate_limit_per_day: int
    pro_requested_at: Optional[datetime] = None
    users: Optional[UserDetail] = None

# Endpoints
@router.get(
    "/developers/key",
    response_model=Optional[APIKeyResponse],
    summary="Get Current User's API Key",
    description="Returns the developer API key data for the logged-in OAuth user, or null if they don't have one."
)
def get_user_api_key(current_user: dict = Depends(get_current_user)):
    user_id = current_user["user_id"]
    try:
        res = supabase.table("api_keys").select("*").eq("user_id", user_id).execute()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gagal memeriksa data API key: {str(e)}"
        )
    if res.data:
        key_data = res.data[0]
        return {
            "api_key": key_data["api_key"],
            "tier": key_data["tier"],
            "rate_limit_per_day": key_data["rate_limit_per_day"],
            "is_active": key_data["is_active"],
            "pro_requested_at": key_data.get("pro_requested_at"),
            "pro_approved_at": key_data.get("pro_approved_at")
        }
    return None


@router.post(
    "/developers/register",
    response_model=APIKeyResponse,
    summary="Register / Retrieve Developer API Key",
    description="Registers a new Developer API Key for the logged-in OAuth user. If the user already has a key, returns the existing key."
)
def register_developer_key(current_user: dict = Depends(get_current_user)):
    user_id = current_user["user_id"]
    
    # 1. Check if user already has a key
    try:
        res = supabase.table("api_keys").select("*").eq("user_id", user_id).execute()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gagal memeriksa data API key: {str(e)}"
        )
        
    if res.data:
        key_data = res.data[0]
        return {
            "api_key": key_data["api_key"],
            "tier": key_data["tier"],
            "rate_limit_per_day": key_data["rate_limit_per_day"],
            "is_active": key_data["is_active"],
            "pro_requested_at": key_data.get("pro_requested_at"),
            "pro_approved_at": key_data.get("pro_approved_at")
        }
        
    # 2. Generate new key
    new_key = secrets.token_urlsafe(32)
    try:
        insert_res = supabase.table("api_keys").insert({
            "user_id": user_id,
            "api_key": new_key,
            "tier": "free",
            "rate_limit_per_day": 100,
            "is_active": True
        }).execute()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gagal membuat API key baru: {str(e)}"
        )
        
    if not insert_res.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Gagal menyimpan API key baru."
        )
        
    key_data = insert_res.data[0]
    return {
        "api_key": key_data["api_key"],
        "tier": key_data["tier"],
        "rate_limit_per_day": key_data["rate_limit_per_day"],
        "is_active": key_data["is_active"],
        "pro_requested_at": key_data.get("pro_requested_at"),
        "pro_approved_at": key_data.get("pro_approved_at")
    }


@router.post(
    "/developers/request-pro",
    response_model=MessageResponse,
    summary="Request PRO Tier API Key",
    description="Submits a request to upgrade the OAuth user's API key to the PRO tier (requires an existing key)."
)
def request_pro_tier(current_user: dict = Depends(get_current_user)):
    user_id = current_user["user_id"]
    
    # 1. Find user's key
    try:
        res = supabase.table("api_keys").select("*").eq("user_id", user_id).execute()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gagal mengambil data API key: {str(e)}"
        )
        
    if not res.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API Key tidak ditemukan. Silakan register terlebih dahulu."
        )
        
    key_data = res.data[0]
    
    # 2. Check if already PRO or pending
    if key_data.get("pro_approved_at") or key_data.get("tier") == "pro":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Akun Anda sudah berada pada tier PRO."
        )
        
    if key_data.get("pro_requested_at"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="sudah pernah request, menunggu approval"
        )
        
    # 3. Update pro_requested_at to now()
    now_str = datetime.now(timezone.utc).isoformat()
    try:
        update_res = supabase.table("api_keys").update({
            "pro_requested_at": now_str
        }).eq("id", key_data["id"]).execute()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gagal memperbarui data request PRO: {str(e)}"
        )
        
    if not update_res.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Gagal memperbarui status request PRO."
        )
        
    return {"message": "Request PRO berhasil dikirim, menunggu approval admin."}


@admin_dev_router.get(
    "/pending",
    response_model=List[PendingRequestResponse],
    summary="Get Pending PRO Requests",
    description="Admin endpoint to list all API keys that have requested a PRO upgrade and are pending approval."
)
def get_pending_pro_requests(admin: dict = Depends(require_admin)):
    try:
        # Join to users table to get display_name and email
        res = supabase.table("api_keys") \
            .select("*, users(email, display_name)") \
            .not_.is_("pro_requested_at", "null") \
            .is_("pro_approved_at", "null") \
            .execute()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gagal mengambil data request pending dari database: {str(e)}"
        )
        
    return res.data or []


@admin_dev_router.post(
    "/{id}/approve-pro",
    response_model=MessageResponse,
    summary="Approve PRO Tier Request",
    description="Admin endpoint to approve a developer's PRO request, updating their rate limit and tier."
)
def approve_pro_request(id: UUID, admin: dict = Depends(require_admin)):
    admin_email = admin.get("email") or "system"
    
    # 1. Check if key exists
    try:
        res = supabase.table("api_keys").select("*").eq("id", str(id)).execute()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gagal memeriksa API key: {str(e)}"
        )
        
    if not res.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"API Key dengan ID {id} tidak ditemukan."
        )
        
    key_data = res.data[0]
    if key_data.get("pro_approved_at") or key_data.get("tier") == "pro":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="API Key ini sudah disetujui sebagai PRO."
        )
        
    # 2. Update to PRO
    now_str = datetime.now(timezone.utc).isoformat()
    try:
        update_res = supabase.table("api_keys").update({
            "tier": "pro",
            "rate_limit_per_day": 2000,
            "pro_approved_at": now_str,
            "pro_approved_by": admin_email
        }).eq("id", str(id)).execute()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gagal menyetujui request PRO: {str(e)}"
        )
        
    if not update_res.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Gagal memperbarui status ke PRO di database."
        )
        
    return {"message": "Upgrade PRO berhasil disetujui."}


@router.get(
    "/public/test-auth",
    response_model=dict,
    summary="Test Public API Authentication",
    description="A public test endpoint that requires a valid and active API key passed in the X-API-Key header."
)
def test_public_api_auth(api_key_data: dict = Depends(check_api_key)):
    return {
        "status": "authenticated",
        "message": "API Key Anda valid!",
        "api_key_id": api_key_data["id"],
        "tier": api_key_data["tier"],
        "rate_limit_per_day": api_key_data["rate_limit_per_day"]
    }


def require_pro_tier(api_key_data: dict = Depends(check_api_key)):
    if api_key_data.get("tier") != "pro":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Fitur tur 360° khusus tier Pro. Upgrade via POST /developers/request-pro"
        )
    return api_key_data


class PublicBuildingResponse(BaseModel):
    id: UUID
    name: str
    address: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None

class PublicAuditResult(BaseModel):
    code: str
    description: str
    category: str
    status: str
    is_disputed: bool

class PublicAuditResponse(BaseModel):
    building_id: UUID
    building_name: str
    audit_run_id: UUID
    created_at: datetime
    results: List[PublicAuditResult]


@router.get(
    "/v1/public/buildings",
    response_model=List[PublicBuildingResponse],
    summary="List Verified / Approved Buildings",
    description="Returns a list of all verified and approved buildings. Excludes internal audit metrics or draft statuses.\n\n"
                "**Example Response:**\n"
                "```json\n"
                "[\n"
                "  {\n"
                "    \"id\": \"d3b07384-d113-4956-b7e0-9118c634af5a\",\n"
                "    \"name\": \"Margo City\",\n"
                "    \"address\": \"Jl. Margonda Raya No.358\",\n"
                "    \"lat\": -6.3725,\n"
                "    \"lng\": 106.8331\n"
                "  }\n"
                "]\n"
                "```"
)
def get_public_buildings(
    limit: int = 20,
    offset: int = 0,
    api_key_data: dict = Depends(check_api_key)
):
    try:
        res = supabase.table("buildings") \
            .select("id, name, address, latitude, longitude") \
            .eq("status", "approved") \
            .range(offset, offset + limit - 1) \
            .execute()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gagal mengambil data gedung dari database: {str(e)}"
        )
        
    output = []
    for b in (res.data or []):
        output.append({
            "id": b["id"],
            "name": b["name"],
            "address": b.get("address"),
            "lat": b.get("latitude"),
            "lng": b.get("longitude")
        })
    return output


@router.get(
    "/v1/public/buildings/{id}/audit",
    response_model=PublicAuditResponse,
    summary="Get Primary Audit Details of a Building",
    description="Returns the primary (oldest) audit run details and consensus criteria status evaluations for a verified building. "
                "Excludes auditor identity, photos, and voting logs.\n\n"
                "**Access Tiers:**\n"
                "- **Free Tier**: Allowed. Rates limited to 100 requests/day.\n"
                "- **Pro Tier**: Allowed. Rates limited to 2000 requests/day.\n\n"
                "**Example Response:**\n"
                "```json\n"
                "{\n"
                "  \"building_id\": \"d3b07384-d113-4956-b7e0-9118c634af5a\",\n"
                "  \"building_name\": \"Margo City\",\n"
                "  \"audit_run_id\": \"12345678-1234-1234-1234-123456789012\",\n"
                "  \"created_at\": \"2026-07-15T00:00:00Z\",\n"
                "  \"results\": [\n"
                "    {\n"
                "      \"code\": \"SNI-8201-M1\",\n"
                "      \"description\": \"Tersedia ramp landai\",\n"
                "      \"category\": \"mobilitas\",\n"
                "      \"status\": \"met\",\n"
                "      \"is_disputed\": false\n"
                "    }\n"
                "  ]\n"
                "}"
                "```"
)
def get_public_building_audit(
    id: UUID,
    api_key_data: dict = Depends(check_api_key)
):
    # 1. Fetch building and check approval status
    try:
        b_res = supabase.table("buildings").select("id, name").eq("id", str(id)).eq("status", "approved").execute()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gagal memeriksa data gedung: {str(e)}"
        )
        
    if not b_res.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Gedung dengan ID {id} tidak ditemukan atau belum disetujui."
        )
    building = b_res.data[0]

    # 2. Get the primary (oldest) audit run for this building
    try:
        runs_res = supabase.table("audit_runs") \
            .select("id, created_at") \
            .eq("building_id", str(id)) \
            .order("created_at", desc=False) \
            .limit(1) \
            .execute()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gagal mengambil data audit run: {str(e)}"
        )
        
    if not runs_res.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Gedung dengan ID {id} tidak memiliki data audit utama (primary audit run)."
        )
    primary_run = runs_res.data[0]

    # 3. Fetch all audit results for this building to calculate is_disputed (consensus)
    try:
        all_results_res = supabase.table("audit_results") \
            .select("status, audit_criteria(code)") \
            .eq("building_id", str(id)) \
            .execute()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gagal mengambil seluruh data audit hasil untuk konsensus: {str(e)}"
        )
        
    statuses_by_criteria = {}
    for r in (all_results_res.data or []):
        criteria = r.get("audit_criteria")
        if not criteria:
            continue
        code = criteria.get("code")
        if code:
            statuses_by_criteria.setdefault(code, []).append(r.get("status"))

    # 4. Fetch audit results for the primary run, joined with criteria
    try:
        results_res = supabase.table("audit_results") \
            .select("status, audit_criteria(code, description, category)") \
            .eq("audit_run_id", primary_run["id"]) \
            .execute()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gagal mengambil hasil audit: {str(e)}"
        )
        
    output_results = []
    for r in (results_res.data or []):
        criteria = r.get("audit_criteria") or {}
        code = criteria.get("code") or ""
        is_disputed = len(set(statuses_by_criteria.get(code, []))) > 1 if code else False
        output_results.append({
            "code": code,
            "description": criteria.get("description") or "",
            "category": criteria.get("category") or "",
            "status": r.get("status") or "",
            "is_disputed": is_disputed
        })
        
    return {
        "building_id": building["id"],
        "building_name": building["name"],
        "audit_run_id": primary_run["id"],
        "created_at": primary_run["created_at"],
        "results": output_results
    }


class PublicCriteriaDetail(BaseModel):
    code: str
    description: str
    category: str
    status: str

class PublicAnnotationResponse(BaseModel):
    id: UUID
    label: str
    pitch: float
    yaw: float
    criteria: PublicCriteriaDetail

class PublicSceneResponse(BaseModel):
    id: UUID
    label: Optional[str] = None
    file_url: str
    type: str
    created_at: datetime
    annotations: List[PublicAnnotationResponse]

class PublicTourResponse(BaseModel):
    building_id: UUID
    building_name: str
    audit_run_id: UUID
    scenes: List[PublicSceneResponse]


@router.get(
    "/v1/public/buildings/{id}/tour",
    response_model=PublicTourResponse,
    summary="Get 360° Virtual Tour of a Building (Pro Tier Only)",
    description="Returns all 360° panorama scenes and their related audit annotations for the building's primary audit run.\n\n"
                "**Access Tiers:**\n"
                "- **Free Tier**: Returns 403 Forbidden.\n"
                "- **Pro Tier**: Allowed. Rates limited to 2000 requests/day.\n\n"
                "**Example Response:**\n"
                "```json\n"
                "{\n"
                "  \"building_id\": \"d3b07384-d113-4956-b7e0-9118c634af5a\",\n"
                "  \"building_name\": \"Margo City\",\n"
                "  \"audit_run_id\": \"12345678-1234-1234-1234-123456789012\",\n"
                "  \"scenes\": [\n"
                "    {\n"
                "      \"id\": \"abcd-efgh-...\",\n"
                "      \"label\": \"Main Entrance\",\n"
                "      \"file_url\": \"https://.../panorama.jpg\",\n"
                "      \"type\": \"panorama_360\",\n"
                "      \"created_at\": \"2026-07-15T00:00:00Z\",\n"
                "      \"annotations\": [\n"
                "        {\n"
                "          \"id\": \"xyz-123-...\",\n"
                "          \"label\": \"Tersedia Ramp\",\n"
                "          \"pitch\": -12.5,\n"
                "          \"yaw\": 45.2,\n"
                "          \"criteria\": {\n"
                "            \"code\": \"SNI-8201-M1\",\n"
                "            \"description\": \"Tersedia ramp landai\",\n"
                "            \"category\": \"mobilitas\",\n"
                "            \"status\": \"met\"\n"
                "          }\n"
                "        }\n"
                "      ]\n"
                "    }\n"
                "  ]\n"
                "}"
                "```"
)
def get_public_building_tour(
    id: UUID,
    api_key_data: dict = Depends(require_pro_tier)
):
    # 1. Fetch building and check approval status
    try:
        b_res = supabase.table("buildings").select("id, name").eq("id", str(id)).eq("status", "approved").execute()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gagal memeriksa data gedung: {str(e)}"
        )
        
    if not b_res.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Gedung dengan ID {id} tidak ditemukan atau belum disetujui."
        )
    building = b_res.data[0]

    # 2. Get the primary (oldest) audit run for this building
    try:
        runs_res = supabase.table("audit_runs") \
            .select("id, created_at") \
            .eq("building_id", str(id)) \
            .order("created_at", desc=False) \
            .limit(1) \
            .execute()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gagal mengambil data audit run: {str(e)}"
        )
        
    if not runs_res.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Gedung dengan ID {id} tidak memiliki data audit utama (primary audit run)."
        )
    primary_run = runs_res.data[0]

    # 3. Fetch all scenes associated with this building
    try:
        scenes_res = supabase.table("scenes") \
            .select("*") \
            .eq("building_id", str(id)) \
            .execute()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gagal mengambil data scenes: {str(e)}"
        )

    # 4. Filter scenes by primary run timestamp (within 60 seconds threshold)
    import datetime
    run_dt = datetime.datetime.fromisoformat(primary_run["created_at"].replace("Z", "+00:00"))
    run_time_sec = run_dt.timestamp()

    matched_scenes = []
    for s in (scenes_res.data or []):
        if s.get("created_at"):
            s_dt = datetime.datetime.fromisoformat(s["created_at"].replace("Z", "+00:00"))
            scene_time_sec = s_dt.timestamp()
            if abs(scene_time_sec - run_time_sec) < 60:
                matched_scenes.append(s)

    if not matched_scenes:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Gedung ini tidak memiliki data tur 360°."
        )

    # 5. Fetch annotations per scene and map them
    output_scenes = []
    for scene in matched_scenes:
        try:
            annotations_res = supabase.table("annotations") \
                .select("*, audit_results(*, audit_criteria(*))") \
                .eq("scene_id", str(scene["id"])) \
                .execute()
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Gagal mengambil data anotasi scene: {str(e)}"
            )

        formatted_annotations = []
        for ann in (annotations_res.data or []):
            audit_result = ann.get("audit_results")
            if not audit_result:
                continue
            # Only include annotations associated with this primary run
            if str(audit_result.get("audit_run_id")) != str(primary_run["id"]):
                continue

            criteria = audit_result.get("audit_criteria") or {}
            formatted_annotations.append({
                "id": ann["id"],
                "label": ann["label"],
                "pitch": ann["pitch"],
                "yaw": ann["yaw"],
                "criteria": {
                    "code": criteria.get("code") or "",
                    "description": criteria.get("description") or "",
                    "category": criteria.get("category") or "",
                    "status": audit_result.get("status") or ""
                }
            })

        output_scenes.append({
            "id": scene["id"],
            "label": scene.get("label"),
            "file_url": scene["file_url"],
            "type": scene["type"],
            "created_at": scene["created_at"],
            "annotations": formatted_annotations
        })

    return {
        "building_id": building["id"],
        "building_name": building["name"],
        "audit_run_id": primary_run["id"],
        "scenes": output_scenes
    }
