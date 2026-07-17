import secrets
from datetime import datetime, timezone, timedelta
from uuid import UUID, uuid4
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Security, status, Header
from fastapi.security import APIKeyHeader
from pydantic import BaseModel, Field
import httpx
import base64

from app.config import settings
from app.db import supabase
from app.auth_utils import get_current_user, check_api_key
from app.routers.admin import require_admin

# ---------------------------------------------------------------------------
# Routers — with separated Swagger tags for clarity
# ---------------------------------------------------------------------------
dev_reg_router = APIRouter(tags=["🔑 Developer Registration"])
admin_dev_router = APIRouter(prefix="/admin/developers", tags=["🔒 Admin"])
public_v1_router = APIRouter(tags=["📡 Public API v1"])

# Internal-only router (endpoints NOT shown in docs)
internal_router = APIRouter(tags=["_internal"])

# Keep `router` as an alias so main.py include_router calls still work
router = dev_reg_router

# ---------------------------------------------------------------------------
# Security scheme — lets FastAPI render 🔒 lock icon in Swagger UI
# ---------------------------------------------------------------------------
api_key_header_scheme = APIKeyHeader(
    name="X-API-Key",
    description="API key issued via POST /developers/register. Pass in the `X-API-Key` request header.",
    auto_error=False,
)

# ---------------------------------------------------------------------------
# Pydantic Schemas
# ---------------------------------------------------------------------------

class APIKeyResponse(BaseModel):
    api_key: str = Field(description="The raw API key string. Store this securely.")
    tier: str = Field(description="Current tier: 'free' (100 req/day) or 'pro' (2000 req/day).")
    rate_limit_per_day: int = Field(description="Maximum number of public API requests allowed per calendar day (UTC).")
    is_active: bool = Field(description="Whether the API key is currently active and usable.")
    pro_requested_at: Optional[datetime] = Field(
        default=None,
        description="Timestamp when a PRO upgrade was requested. Null if no request has been made."
    )
    pro_approved_at: Optional[datetime] = Field(
        default=None,
        description="Timestamp when the PRO upgrade was approved by an admin. Null if not yet approved."
    )

class MessageResponse(BaseModel):
    message: str = Field(description="Human-readable status message describing the result of the operation.")

class UserDetail(BaseModel):
    email: Optional[str] = Field(default=None, description="Email address of the developer account owner.")
    display_name: Optional[str] = Field(default=None, description="Display name synced from Google OAuth.")

class PendingRequestResponse(BaseModel):
    id: UUID = Field(description="Unique ID of the api_keys table row (used for approval actions).")
    user_id: UUID = Field(description="Internal user UUID of the developer who owns this key.")
    api_key: str = Field(description="The developer's API key string.")
    tier: str = Field(description="Current tier: 'free' or 'pro'.")
    rate_limit_per_day: int = Field(description="Current rate limit per day.")
    pro_requested_at: Optional[datetime] = Field(
        default=None,
        description="Timestamp when the developer requested a PRO upgrade."
    )
    users: Optional[UserDetail] = Field(
        default=None,
        description="Linked user profile data (email and display name)."
    )


# ---------------------------------------------------------------------------
# Developer Registration Endpoints
# ---------------------------------------------------------------------------

@dev_reg_router.get(
    "/developers/key",
    response_model=Optional[APIKeyResponse],
    summary="Get Current User's API Key",
    description=(
        "Returns the developer API key data for the currently logged-in OAuth user.\n\n"
        "Returns `null` (HTTP 200 with empty body) if the user has not yet registered a key.\n\n"
        "**Authentication:** Requires a valid Google OAuth session (Bearer token in `Authorization` header).\n\n"
        "**Use this endpoint** to check if a user already has a key before calling `/developers/register`."
    ),
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


@dev_reg_router.post(
    "/developers/register",
    response_model=APIKeyResponse,
    summary="Register / Retrieve Developer API Key",
    description=(
        "Registers a new Developer API Key for the currently logged-in OAuth user.\n\n"
        "- If the user **already has a key**, returns the **existing key** (idempotent).\n"
        "- If the user **does not yet have a key**, generates a new one with **Free tier** (100 req/day).\n\n"
        "**Authentication:** Requires a valid Google OAuth session (Bearer token in `Authorization` header).\n\n"
        "**Starting tier:** `free` — 100 requests/day. To upgrade, use `POST /developers/request-pro`."
    ),
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


@dev_reg_router.post(
    "/developers/request-pro",
    response_model=MessageResponse,
    summary="Request PRO Tier Upgrade",
    description=(
        "Submits a request to upgrade the current user's API key from **Free** to **PRO** tier.\n\n"
        "- Requires an existing API key (register first via `POST /developers/register`).\n"
        "- Cannot be called if already on PRO tier or if a request is already pending.\n"
        "- After submitting, an admin reviews and approves via `POST /admin/developers/{id}/approve-pro`.\n\n"
        "**PRO tier benefits:** 2,000 requests/day + access to `GET /v1/public/buildings/{id}/tour`.\n\n"
        "**Authentication:** Requires a valid Google OAuth session (Bearer token in `Authorization` header)."
    ),
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


# ---------------------------------------------------------------------------
# Admin Endpoints
# ---------------------------------------------------------------------------

@admin_dev_router.get(
    "/pending",
    response_model=List[PendingRequestResponse],
    summary="List Pending PRO Upgrade Requests",
    description=(
        "**Admin only.** Lists all API keys that have submitted a PRO tier upgrade request and are awaiting approval.\n\n"
        "Only returns entries where `pro_requested_at` is set and `pro_approved_at` is null.\n\n"
        "**Authentication:** Requires admin-level Google OAuth session. "
        "Non-admin requests will receive `403 Forbidden`.\n\n"
        "Use `POST /admin/developers/{id}/approve-pro` to approve an entry from this list."
    ),
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
    summary="Approve PRO Tier Upgrade Request",
    description=(
        "**Admin only.** Approves a pending PRO tier request for a specific API key.\n\n"
        "- Sets the `tier` field to `'pro'`.\n"
        "- Raises `rate_limit_per_day` from 100 to 2,000.\n"
        "- Records the `pro_approved_at` timestamp and the approving admin's email.\n\n"
        "**Path parameter `id`:** The UUID of the `api_keys` table row (obtained from `GET /admin/developers/pending`).\n\n"
        "**Authentication:** Requires admin-level Google OAuth session. "
        "Non-admin requests will receive `403 Forbidden`."
    ),
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


# ---------------------------------------------------------------------------
# Internal / debug endpoint — hidden from Swagger docs
# ---------------------------------------------------------------------------

@internal_router.get(
    "/public/test-auth",
    response_model=dict,
    include_in_schema=False,  # Hidden from Swagger UI — internal debug only
)
def test_public_api_auth(api_key_data: dict = Depends(check_api_key)):
    return {
        "status": "authenticated",
        "message": "API Key Anda valid!",
        "api_key_id": api_key_data["id"],
        "tier": api_key_data["tier"],
        "rate_limit_per_day": api_key_data["rate_limit_per_day"]
    }


# ---------------------------------------------------------------------------
# PRO tier dependency
# ---------------------------------------------------------------------------

def require_pro_tier(api_key_data: dict = Depends(check_api_key)):
    if api_key_data.get("tier") != "pro":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Fitur tur 360° khusus tier Pro. Upgrade via POST /developers/request-pro"
        )
    return api_key_data


# ---------------------------------------------------------------------------
# Pydantic Schemas — Public API v1
# ---------------------------------------------------------------------------

class PublicBuildingResponse(BaseModel):
    id: UUID = Field(description="Unique UUID of the building.")
    name: str = Field(description="Official name of the building.")
    address: Optional[str] = Field(default=None, description="Street address of the building, if available.")
    lat: Optional[float] = Field(default=None, description="Latitude coordinate (WGS84).")
    lng: Optional[float] = Field(default=None, description="Longitude coordinate (WGS84).")

class PublicAuditResult(BaseModel):
    code: str = Field(description="SNI accessibility criteria code, e.g. 'SNI-8201-M1'.")
    description: str = Field(description="Human-readable description of the criteria requirement.")
    category: str = Field(description="Accessibility category, e.g. 'mobilitas', 'komunikasi', 'orientasi'.")
    status: str = Field(description="Consensus status: 'met', 'not_met', or 'not_applicable'.")
    is_disputed: bool = Field(
        description="True if different auditors submitted conflicting statuses for this criteria across all audit runs."
    )

class PublicAuditResponse(BaseModel):
    building_id: UUID = Field(description="UUID of the audited building.")
    building_name: str = Field(description="Name of the audited building.")
    audit_run_id: UUID = Field(description="UUID of the primary (oldest) audit run used as the consensus source.")
    created_at: datetime = Field(description="Timestamp when the primary audit run was created.")
    results: List[PublicAuditResult] = Field(description="List of criteria evaluations from the primary audit run.")

class PublicCriteriaDetail(BaseModel):
    code: str = Field(description="SNI accessibility criteria code.")
    description: str = Field(description="Human-readable description of the criteria requirement.")
    category: str = Field(description="Accessibility category of the criteria.")
    status: str = Field(description="Evaluated status for this criteria: 'met', 'not_met', or 'not_applicable'.")

class PublicAnnotationResponse(BaseModel):
    id: UUID = Field(description="Unique ID of the annotation (hotspot).")
    label: str = Field(description="Short label text for this hotspot, e.g. 'Tersedia Ramp'.")
    pitch: float = Field(description="Vertical angle of the hotspot in the 360° panorama (degrees, -90 to 90).")
    yaw: float = Field(description="Horizontal angle of the hotspot in the 360° panorama (degrees, 0 to 360).")
    criteria: PublicCriteriaDetail = Field(description="Accessibility criteria linked to this annotation.")

class PublicSceneResponse(BaseModel):
    id: UUID = Field(description="Unique ID of the scene (panorama image).")
    label: Optional[str] = Field(default=None, description="Descriptive label for this scene, e.g. 'Main Entrance'.")
    file_url: str = Field(description="Public URL to the 360° panorama image file.")
    type: str = Field(description="Scene type, typically 'panorama_360'.")
    created_at: datetime = Field(description="Timestamp when the scene was uploaded.")
    annotations: List[PublicAnnotationResponse] = Field(
        description="List of hotspot annotations in this scene, each linked to an accessibility criteria."
    )

class PublicTourResponse(BaseModel):
    building_id: UUID = Field(description="UUID of the building for this tour.")
    building_name: str = Field(description="Name of the building.")
    audit_run_id: UUID = Field(description="UUID of the primary audit run these scenes belong to.")
    scenes: List[PublicSceneResponse] = Field(description="Ordered list of 360° panorama scenes with annotations.")


# ---------------------------------------------------------------------------
# Public API v1 Endpoints
# ---------------------------------------------------------------------------

@public_v1_router.get(
    "/v1/public/buildings",
    response_model=List[PublicBuildingResponse],
    summary="List Verified & Approved Buildings",
    description=(
        "Returns a paginated list of all buildings that have been verified and approved in the system.\n\n"
        "Excludes buildings in draft or under-review status. Internal audit metrics, auditor identities, "
        "and voting logs are **not** included.\n\n"
        "**Authentication:** Pass your API key in the `X-API-Key` request header.\n\n"
        "**Access Tiers:**\n"
        "- **Free Tier**: ✅ Allowed — up to 100 requests/day.\n"
        "- **Pro Tier**: ✅ Allowed — up to 2,000 requests/day.\n\n"
        "**Query Parameters:**\n"
        "- `limit` (default: 20) — number of results to return.\n"
        "- `offset` (default: 0) — number of results to skip (for pagination).\n\n"
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
    ),
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


@public_v1_router.get(
    "/v1/public/buildings/{id}/audit",
    response_model=PublicAuditResponse,
    summary="Get Primary Audit Details of a Building",
    description=(
        "Returns the **primary audit run** details and consensus criteria status evaluations for a verified building.\n\n"
        "The primary audit run is defined as the **oldest approved audit run** for the building. "
        "Each criteria result includes an `is_disputed` flag — `true` if different auditors "
        "submitted conflicting statuses across all audit runs for this building.\n\n"
        "Excludes: auditor identities, uploaded photos, and raw voting logs.\n\n"
        "**Authentication:** Pass your API key in the `X-API-Key` request header.\n\n"
        "**Access Tiers:**\n"
        "- **Free Tier**: ✅ Allowed — up to 100 requests/day.\n"
        "- **Pro Tier**: ✅ Allowed — up to 2,000 requests/day.\n\n"
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
    ),
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


@public_v1_router.get(
    "/v1/public/buildings/{id}/tour",
    response_model=PublicTourResponse,
    summary="Get 360° Virtual Tour of a Building (Pro Tier Only)",
    description=(
        "Returns all **360° panorama scenes** and their associated **accessibility annotation hotspots** "
        "for a building's primary audit run.\n\n"
        "Each scene includes a `file_url` pointing to the panorama image, and an `annotations` list. "
        "Each annotation specifies a hotspot position (`pitch`, `yaw`) and the linked accessibility criteria.\n\n"
        "Auditor identities and internal metadata are **not** exposed.\n\n"
        "**Authentication:** Pass your PRO-tier API key in the `X-API-Key` request header.\n\n"
        "**Access Tiers:**\n"
        "- **Free Tier**: ❌ Returns `403 Forbidden`. Upgrade via `POST /developers/request-pro`.\n"
        "- **Pro Tier**: ✅ Allowed — up to 2,000 requests/day.\n\n"
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
    ),
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


# ---------------------------------------------------------------------------
# Xendit Invoice Payment / Pro Upgrade Endpoints
# ---------------------------------------------------------------------------

class CreatePaymentResponse(BaseModel):
    invoice_url: str = Field(description="URL to redirect user for Xendit invoice payment.")
    external_id: str = Field(description="The unique external ID for this transaction.")

class XenditWebhookPayload(BaseModel):
    external_id: str
    status: str


@dev_reg_router.post(
    "/developers/create-payment",
    response_model=CreatePaymentResponse,
    summary="Create Xendit Invoice for Pro Tier Upgrade",
    description=(
        "Generates a unique payment transaction and creates a Xendit Invoice for Pro Tier upgrade.\n\n"
        "**Authentication:** Requires a valid Google OAuth session (Bearer token in `Authorization` header)."
    )
)
def create_payment(current_user: dict = Depends(get_current_user)):
    user_id = current_user["user_id"]

    # 1. Verify that user has an API Key
    try:
        res = supabase.table("api_keys").select("*").eq("user_id", user_id).execute()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gagal memeriksa data API key: {str(e)}"
        )

    if not res.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API Key tidak ditemukan. Silakan register terlebih dahulu."
        )

    key_data = res.data[0]

    # 2. Generate a unique external_id
    external_id = f"aksesibel-{uuid4()}"

    # 3. Create a pending payment transaction record in the database
    try:
        insert_res = supabase.table("payment_transactions").insert({
            "api_key_id": key_data["id"],
            "external_id": external_id,
            "amount": 49000,
            "status": "pending"
        }).execute()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gagal membuat transaksi pembayaran: {str(e)}"
        )

    if not insert_res.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Gagal menyimpan transaksi pembayaran."
        )

    # 4. Call Xendit Invoice API
    xendit_url = "https://api.xendit.co/v2/invoices"
    body = {
        "external_id": external_id,
        "amount": 49000,
        "description": "Aksesibel Pro Tier - 30 hari",
        "invoice_duration": 86400,
        "currency": "IDR",
        "success_redirect_url": f"{settings.FRONTEND_URL}/developers?payment=success&external_id={external_id}",
        "failure_redirect_url": f"{settings.FRONTEND_URL}/developers?payment=failed&external_id={external_id}"
    }

    # Encode credentials for Basic Auth
    encoded_auth = base64.b64encode(f"{settings.XENDIT_SECRET_KEY}:".encode("utf-8")).decode("utf-8")
    headers = {
        "Authorization": f"Basic {encoded_auth}",
        "Content-Type": "application/json"
    }

    try:
        response = httpx.post(xendit_url, json=body, headers=headers, timeout=10.0)
        response.raise_for_status()
        xendit_data = response.json()
    except Exception as http_err:
        # Update transaction status to failed on failure
        try:
            supabase.table("payment_transactions").update({
                "status": "failed"
            }).eq("external_id", external_id).execute()
        except Exception:
            pass
        
        detail_msg = "Gagal memproses transaksi dengan penyedia pembayaran."
        if isinstance(http_err, httpx.HTTPStatusError):
            try:
                err_detail = http_err.response.json()
                detail_msg += f" Detail: {err_detail.get('message', '')}"
            except Exception:
                detail_msg += f" (HTTP {http_err.response.status_code})"
        else:
            detail_msg += f" ({str(http_err)})"

        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=detail_msg
        )

    xendit_invoice_id = xendit_data.get("id")
    invoice_url = xendit_data.get("invoice_url")

    # 5. Update transaction with xendit_invoice_id
    try:
        supabase.table("payment_transactions").update({
            "xendit_invoice_id": xendit_invoice_id
        }).eq("external_id", external_id).execute()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gagal memperbarui data transaksi dengan invoice ID: {str(e)}"
        )

    return CreatePaymentResponse(invoice_url=invoice_url, external_id=external_id)


@dev_reg_router.post(
    "/webhooks/xendit/callback",
    summary="Xendit Invoice Webhook Callback",
    description="Handles invoice status updates from Xendit webhook callback."
)
def xendit_webhook_callback(
    payload: XenditWebhookPayload,
    x_callback_token: Optional[str] = Header(None, alias="x-callback-token")
):
    # 1. Verify callback token
    if not x_callback_token or x_callback_token != settings.XENDIT_WEBHOOK_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token callback tidak valid atau tidak cocok."
        )

    external_id = payload.external_id
    status_lower = payload.status.lower()

    # 2. Find payment transaction in DB
    try:
        tx_res = supabase.table("payment_transactions").select("*").eq("external_id", external_id).execute()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gagal mengambil data transaksi: {str(e)}"
        )

    if not tx_res.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaksi pembayaran tidak ditemukan."
        )

    tx_data = tx_res.data[0]
    api_key_id = tx_data["api_key_id"]

    # 3. Update payment transaction status
    now_str = datetime.now(timezone.utc).isoformat()
    valid_db_statuses = {"pending", "paid", "expired", "failed"}
    db_status = status_lower
    
    if status_lower == "settled":
        db_status = "paid"
    
    if db_status in valid_db_statuses:
        update_tx_payload = {"status": db_status}
        if db_status == "paid":
            update_tx_payload["paid_at"] = now_str
        
        try:
            supabase.table("payment_transactions").update(update_tx_payload).eq("external_id", external_id).execute()
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Gagal memperbarui status transaksi: {str(e)}"
            )

    # 4. If status is paid/settled, upgrade the user's API key
    if status_lower in ("paid", "settled"):
        pro_expires_at = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
        try:
            supabase.table("api_keys").update({
                "tier": "pro",
                "rate_limit_per_day": 2000,
                "pro_expires_at": pro_expires_at
            }).eq("id", api_key_id).execute()
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Gagal mengupgrade API key: {str(e)}"
            )

    return {"status": "success"}


class PaymentStatusResponse(BaseModel):
    external_id: str = Field(description="Unique order ID generated by the backend.")
    status: str = Field(description="Payment status: pending, paid, expired, failed.")
    xendit_status: Optional[str] = Field(default=None, description="Raw payment status from Xendit.")


@dev_reg_router.get(
    "/developers/payment-status/{external_id}",
    response_model=PaymentStatusResponse,
    summary="Check and sync status of a payment transaction",
    description=(
        "Retrieves the status of a payment transaction from database and queries Xendit Invoice API to verify/sync.\n\n"
        "**Authentication:** Requires a valid Google OAuth session (Bearer token in `Authorization` header)."
    )
)
def get_payment_status(external_id: str, current_user: dict = Depends(get_current_user)):
    user_id = current_user["user_id"]

    # 1. Verify that user has an API Key
    try:
        api_res = supabase.table("api_keys").select("*").eq("user_id", user_id).execute()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gagal memeriksa data API key: {str(e)}"
        )

    if not api_res.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API Key tidak ditemukan."
        )

    key_data = api_res.data[0]

    # 2. Get payment transaction from database
    try:
        tx_res = supabase.table("payment_transactions").select("*").eq("external_id", external_id).execute()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gagal mengambil data transaksi: {str(e)}"
        )

    if not tx_res.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaksi tidak ditemukan."
        )

    tx = tx_res.data[0]

    # 3. Security check: verify this transaction belongs to the logged-in user
    if tx["api_key_id"] != key_data["id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Anda tidak memiliki akses ke transaksi ini."
        )

    xendit_status = None

    # 4. Call Xendit API to check status
    if tx["xendit_invoice_id"]:
        xendit_url = f"https://api.xendit.co/v2/invoices/{tx['xendit_invoice_id']}"
        encoded_auth = base64.b64encode(f"{settings.XENDIT_SECRET_KEY}:".encode("utf-8")).decode("utf-8")
        headers = {
            "Authorization": f"Basic {encoded_auth}"
        }

        try:
            response = httpx.get(xendit_url, headers=headers, timeout=10.0)
            response.raise_for_status()
            xendit_data = response.json()
            xendit_status = xendit_data.get("status")
        except Exception as http_err:
            # Log error or keep going with DB status
            xendit_status = None

        if xendit_status:
            status_lower = xendit_status.lower()
            
            # If status matches PAID / SETTLED in Xendit, and our DB is still pending, upgrade
            if status_lower in ("paid", "settled") and tx["status"] == "pending":
                now_str = datetime.now(timezone.utc).isoformat()
                pro_expires_at = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
                
                # Update payment_transactions
                try:
                    supabase.table("payment_transactions").update({
                        "status": "paid",
                        "paid_at": now_str
                    }).eq("external_id", external_id).execute()
                    tx["status"] = "paid"
                except Exception:
                    pass

                # Update api_keys
                try:
                    supabase.table("api_keys").update({
                        "tier": "pro",
                        "rate_limit_per_day": 2000,
                        "pro_expires_at": pro_expires_at
                    }).eq("id", key_data["id"]).execute()
                except Exception:
                    pass
            
            # Else check if Xendit is expired/failed and sync it
            elif status_lower in ("expired", "failed") and tx["status"] == "pending":
                try:
                    supabase.table("payment_transactions").update({
                        "status": status_lower
                    }).eq("external_id", external_id).execute()
                    tx["status"] = status_lower
                except Exception:
                    pass

    return PaymentStatusResponse(
        external_id=external_id,
        status=tx["status"],
        xendit_status=xendit_status
    )
