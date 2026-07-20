import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings
from app.db import supabase
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage
from pydantic import BaseModel, Field
from typing import List
from app.agents.panorama_agent import get_image_base64

res = supabase.table("scenes").select("file_url").limit(1).execute()
file_url = res.data[0]["file_url"]
b64_url = get_image_base64(file_url)

class DetectedFeature(BaseModel):
    label: str
    x_percent: float
    y_percent: float
    status: str

class PanoramaDetectionResult(BaseModel):
    features: List[DetectedFeature]

prompt_simple = (
    "Analisis gambar panorama 360 derajat berikut.\n"
    "Temukan semua fitur aksesibilitas fisik penting (seperti ramp, tangga akses, ubin pemandu/tactile paving, pegangan tangan/grab bars, lift, pintu otomatis).\n"
    "Untuk setiap fitur, tentukan x_percent (0-100), y_percent (0-100), dan status ('met' atau 'not_met')."
)

llm = ChatGroq(model="qwen/qwen3.6-27b", groq_api_key=settings.GROQ_API_KEY, temperature=0.0)
s_llm = llm.with_structured_output(PanoramaDetectionResult)

msg = HumanMessage(content=[
    {"type": "text", "text": prompt_simple},
    {"type": "image_url", "image_url": {"url": b64_url}}
])

try:
    res = s_llm.invoke([msg])
    print("SUCCESS SIMPLE PROMPT:", res)
except Exception as e:
    print("FAILED SIMPLE PROMPT:", e)
