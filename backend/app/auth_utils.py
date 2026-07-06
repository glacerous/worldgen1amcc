import jwt
from fastapi import Header, HTTPException, status
from app.config import settings

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
