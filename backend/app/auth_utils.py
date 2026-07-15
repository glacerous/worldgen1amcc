import jwt
from fastapi import Header, HTTPException, status, Request
from app.config import settings
from app.db import supabase
from datetime import datetime, timedelta, timezone

def get_current_user(authorization: str = Header(None)):
    """
    Dependency helper to validate JWT from Authorization header and return current user payload.
    """
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Header otorisasi tidak ditemukan."
        )
    
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Format token otorisasi tidak valid. Harus dimulai dengan 'Bearer '."
        )
        
    try:
        token = authorization.split(" ")[1]
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
        user_id = payload.get("user_id")
        email = payload.get("email")
        display_name = payload.get("display_name")
        
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token tidak memiliki ID pengguna."
            )
            
        return {
            "user_id": user_id,
            "email": email,
            "display_name": display_name
        }
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token otorisasi telah kedaluwarsa."
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token otorisasi tidak valid."
        )


def get_optional_user(authorization: str = Header(None)):
    """
    Like get_current_user but returns None instead of raising 401 when no token is present.
    Use this for endpoints that work for both authenticated and anonymous users.
    """
    if not authorization or not authorization.startswith("Bearer "):
        return None
    try:
        token = authorization.split(" ")[1]
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
        user_id = payload.get("user_id")
        if not user_id:
            return None
        return {
            "user_id": user_id,
            "email": payload.get("email"),
            "display_name": payload.get("display_name")
        }
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None


async def check_api_key(request: Request, x_api_key: str = Header(..., alias="X-API-Key")):
    """
    Dependency to validate API Key and enforce daily rate limits.
    """
    # 1. Lookup active key
    try:
        res = supabase.table("api_keys").select("*").eq("api_key", x_api_key).eq("is_active", True).execute()
    except Exception as db_err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gagal mengambil data API key dari database: {str(db_err)}"
        )

    if not res.data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API Key tidak valid atau tidak aktif."
        )
    key_data = res.data[0]

    # 2. Count usage log in last 24 hours
    one_day_ago = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    try:
        usage_res = supabase.table("api_key_usage_log") \
            .select("id", count="exact") \
            .eq("api_key_id", key_data["id"]) \
            .gte("called_at", one_day_ago) \
            .execute()
    except Exception as db_err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gagal memverifikasi limit penggunaan API: {str(db_err)}"
        )

    call_count = usage_res.count or 0
    if call_count >= key_data["rate_limit_per_day"]:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Batas pemanggilan API harian (rate limit) terlampaui."
        )

    # 3. Insert usage log
    try:
        supabase.table("api_key_usage_log").insert({
            "api_key_id": key_data["id"],
            "endpoint": request.url.path
        }).execute()
    except Exception as db_err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gagal mencatat log penggunaan API: {str(db_err)}"
        )

    return key_data
