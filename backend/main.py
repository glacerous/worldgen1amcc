from fastapi import FastAPI
from app.routers import buildings, audit, geocode

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Aksesibilitas Audit API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins for local development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(buildings.router)
app.include_router(audit.router)
app.include_router(geocode.router)

@app.get("/health")
def health_check():
    return {"status": "ok"}


