from fastapi import FastAPI
from app.routers import buildings, audit

app = FastAPI(title="Aksesibilitas Audit API")

# Register routers
app.include_router(buildings.router)
app.include_router(audit.router)

@app.get("/health")
def health_check():
    return {"status": "ok"}


