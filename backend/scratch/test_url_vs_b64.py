import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings
from app.db import supabase
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage
from pydantic import BaseModel
from typing import List

res = supabase.table("scenes").select("file_url").limit(1).execute()
file_url = res.data[0]["file_url"]

llm = ChatGroq(model="qwen/qwen3.6-27b", groq_api_key=settings.GROQ_API_KEY, temperature=0.0)

class DetectedFeature(BaseModel):
    label: str
    x_percent: float
    y_percent: float
    status: str

class PanoramaDetectionResult(BaseModel):
    features: list[DetectedFeature]

s_llm = llm.with_structured_output(PanoramaDetectionResult)

print("--- Test 1: Direct HTTP URL ---")
try:
    msg1 = HumanMessage(content=[
        {"type": "text", "text": "Deteksi fitur aksesibilitas dalam gambar ini."},
        {"type": "image_url", "image_url": {"url": file_url}}
    ])
    res1 = s_llm.invoke([msg1])
    print("SUCCESS Direct URL:", res1)
except Exception as e:
    print("FAILED Direct URL:", e)
