import urllib.parse
from datetime import datetime, timedelta, timezone
import jwt
import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from app.db import supabase
from app.config import settings
from app.auth_utils import get_current_user

router = APIRouter(tags=["auth"])

@router.get("/google")
def google_auth():
    """
    Redirects the user to the Google OAuth consent screen.
    """
    base_url = "https://accounts.google.com/o/oauth2/v2/auth"
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": f"{settings.BACKEND_URL}/auth/google/callback",
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline"
    }
    query_string = urllib.parse.urlencode(params)
    return RedirectResponse(url=f"{base_url}?{query_string}")


@router.get("/google/callback")
async def google_callback(code: str):
    """
    Callback endpoint handling the authorization code exchange and user registration/login.
    """
    # 1. Exchange authorization code for token
    token_url = "https://oauth2.googleapis.com/token"
    data = {
        "code": code,
        "client_id": settings.GOOGLE_CLIENT_ID,
        "client_secret": settings.GOOGLE_CLIENT_SECRET,
        "redirect_uri": f"{settings.BACKEND_URL}/auth/google/callback",
        "grant_type": "authorization_code"
    }
    
    async with httpx.AsyncClient() as client:
        try:
            token_response = await client.post(token_url, data=data)
            token_response.raise_for_status()
            token_data = token_response.json()
        except httpx.HTTPStatusError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Gagal menukar code dengan token: {e.response.text}"
            )
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Terjadi kesalahan saat menukar token: {str(e)}"
            )
            
        access_token = token_data.get("access_token")
        if not access_token:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Token akses tidak ditemukan dalam respon Google."
            )
            
        # 2. Fetch user profile
        userinfo_url = "https://www.googleapis.com/oauth2/v3/userinfo"
        headers = {"Authorization": f"Bearer {access_token}"}
        try:
            userinfo_response = await client.get(userinfo_url, headers=headers)
            userinfo_response.raise_for_status()
            user_info = userinfo_response.json()
        except httpx.HTTPStatusError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Gagal mengambil informasi pengguna Google: {e.response.text}"
            )
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Terjadi kesalahan saat mengambil profil pengguna: {str(e)}"
            )

    google_id = user_info.get("sub")
    email = user_info.get("email")
    name = user_info.get("name")
    picture = user_info.get("picture")
    
    if not google_id or not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Informasi profil Google tidak lengkap (google_id atau email kosong)."
        )
        
    # 3. Check / Insert / Update user in DB
    try:
        user_query = supabase.table("users").select("*").eq("google_id", google_id).execute()
        if user_query.data:
            # User exists, update display_name and avatar_url
            existing_user = user_query.data[0]
            user_id = existing_user["id"]
            
            update_response = supabase.table("users").update({
                "display_name": name,
                "avatar_url": picture
            }).eq("id", user_id).execute()
            
            if not update_response.data:
                raise Exception("Gagal memperbarui user.")
            user = update_response.data[0]
        else:
            # User doesn't exist, insert new
            insert_response = supabase.table("users").insert({
                "google_id": google_id,
                "email": email,
                "display_name": name,
                "avatar_url": picture
            }).execute()
            
            if not insert_response.data:
                raise Exception("Gagal membuat user baru.")
            user = insert_response.data[0]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gagal memproses data pengguna di database: {str(e)}"
        )
        
    # 4. Generate JWT token using PyJWT
    now = datetime.now(timezone.utc)
    expire = now + timedelta(days=7)
    payload = {
        "user_id": str(user["id"]),
        "email": user["email"],
        "display_name": user["display_name"],
        "exp": int(expire.timestamp())
    }
    
    jwt_token = jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")
    
    # 5. Redirect to FRONTEND_URL
    redirect_url = f"{settings.FRONTEND_URL}/auth/callback?token={jwt_token}"
    return RedirectResponse(url=redirect_url)


@router.get("/me")
def get_me(current_user = Depends(get_current_user)):
    """
    Returns profile information of the authenticated user.
    """
    try:
        user_query = supabase.table("users").select("*").eq("id", current_user["user_id"]).execute()
        if not user_query.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User tidak ditemukan."
            )
        user = user_query.data[0]
        return {
            "id": user["id"],
            "email": user["email"],
            "display_name": user["display_name"],
            "avatar_url": user.get("avatar_url")
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gagal mengambil informasi profil: {str(e)}"
        )
