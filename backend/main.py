from fastapi import FastAPI

app = FastAPI(title="Aksesibilitas Audit API")

@app.get("/health")
def health_check():
    return {"status": "ok"}
