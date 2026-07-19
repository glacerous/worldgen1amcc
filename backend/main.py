from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi
import os
from app.routers import buildings, audit, geocode, annotations, scenes, trust, auth_users, developers
from app.routers.admin import admin_router, public_router

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Aksesibilitas Audit API")

# Configure CORS (allow_origins must not be '*' when allow_credentials is True)
allowed_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
if os.getenv("ALLOWED_ORIGINS"):
    allowed_origins.extend([origin.strip() for origin in os.getenv("ALLOWED_ORIGINS").split(",")])

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth_users.router, prefix="/auth")
app.include_router(buildings.router)
app.include_router(audit.router)
app.include_router(audit.audit_runs_router)
app.include_router(geocode.router)
app.include_router(annotations.router)
app.include_router(scenes.router)
app.include_router(trust.router)
app.include_router(trust.admin_trust_router)
app.include_router(admin_router)
app.include_router(public_router)
app.include_router(developers.dev_reg_router)
app.include_router(developers.admin_dev_router)
app.include_router(developers.public_v1_router)
app.include_router(developers.internal_router)

def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    openapi_schema = get_openapi(
        title="Aksesibilitas Audit API",
        version="1.0.0",
        routes=app.routes,
    )
    # Fix Swagger UI List[UploadFile] rendering bug (converts contentMediaType to binary format)
    for component in openapi_schema.get("components", {}).get("schemas", {}).values():
        for prop in component.get("properties", {}).values():
            if prop.get("contentMediaType") == "application/octet-stream":
                prop["format"] = "binary"
                if "contentMediaType" in prop:
                    del prop["contentMediaType"]
            # Handle array of files
            if prop.get("type") == "array" and prop.get("items", {}).get("contentMediaType") == "application/octet-stream":
                prop["items"]["format"] = "binary"
                if "contentMediaType" in prop["items"]:
                    del prop["items"]["contentMediaType"]
    app.openapi_schema = openapi_schema
    return app.openapi_schema

app.openapi = custom_openapi

@app.get("/health")
def health_check():
    return {"status": "ok"}



