import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings
from app.db import supabase
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage
from pydantic import BaseModel
from typing import List
from app.agents.panorama_agent import get_image_base64

res = supabase.table("scenes").select("file_url").limit(1).execute()
file_url = res.data[0]["file_url"]
b64_url = get_image_base64(file_url)

msg = HumanMessage(content=[
    {"type": "text", "text": "Deteksi fitur aksesibilitas dalam gambar ini."},
    {"type": "image_url", "image_url": {"url": b64_url}}
])

llm = ChatGroq(model="qwen/qwen3.6-27b", groq_api_key=settings.GROQ_API_KEY, temperature=0.0)

# Test 1: float vs int
class FeatureFloat(BaseModel):
    label: str
    x_percent: float
    y_percent: float
    status: str

class ResultFloat(BaseModel):
    features: List[FeatureFloat]

print("--- Test Float ---")
try:
    s = llm.with_structured_output(ResultFloat)
    print(s.invoke([msg]))
except Exception as e:
    print("Float failed:", e)

# Test 2: int instead of float
class FeatureInt(BaseModel):
    label: str
    x_percent: int
    y_percent: int
    status: str

class ResultInt(BaseModel):
    features: List[FeatureInt]

print("\n--- Test Int ---")
try:
    s = llm.with_structured_output(ResultInt)
    print(s.invoke([msg]))
except Exception as e:
    print("Int failed:", e)
