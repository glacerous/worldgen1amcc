import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings
from app.db import supabase
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage
from pydantic import BaseModel, Field

res = supabase.table("scenes").select("file_url").limit(1).execute()
file_url = res.data[0]["file_url"]
from app.agents.panorama_agent import get_image_base64
b64_url = get_image_base64(file_url)

msg = HumanMessage(content=[
    {"type": "text", "text": "Deteksi fitur aksesibilitas dalam gambar ini."},
    {"type": "image_url", "image_url": {"url": b64_url}}
])

llm = ChatGroq(model="qwen/qwen3.6-27b", groq_api_key=settings.GROQ_API_KEY, temperature=0.0)

class DetectedFeature(BaseModel):
    label: str = Field(description="Nama fitur aksesibilitas")
    x_percent: float = Field(description="Posisi x 0-100")
    y_percent: float = Field(description="Posisi y 0-100")
    status: str = Field(description="Status 'met' atau 'not_met'")

class PanoramaDetectionResult(BaseModel):
    features: list[DetectedFeature]

print("--- Testing list[DetectedFeature] ---")
try:
    s = llm.with_structured_output(PanoramaDetectionResult)
    res = s.invoke([msg])
    print("SUCCESS:", res)
except Exception as e:
    print("FAILED:", e)
