import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings
from app.db import supabase
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage
from pydantic import BaseModel, Field
from typing import List, Optional
from app.agents.panorama_agent import get_image_base64

# Get image
res = supabase.table("scenes").select("file_url").limit(1).execute()
file_url = res.data[0]["file_url"]
b64_url = get_image_base64(file_url)

msg = HumanMessage(content=[
    {"type": "text", "text": "Evaluasi kriteria aksesibilitas gedung dari foto ini."},
    {"type": "image_url", "image_url": {"url": b64_url}}
])

# Variant A: Simple without Optional
class EvalA(BaseModel):
    criteria_code: str
    status: str
    reasoning: str

class ResultA(BaseModel):
    evaluations: List[EvalA]

# Variant B: With Field descriptions but no Optional
class EvalB(BaseModel):
    criteria_code: str = Field(description="Kode kriteria")
    status: str = Field(description="Status")
    reasoning: str = Field(description="Alasan")

class ResultB(BaseModel):
    evaluations: List[EvalB]

# Variant C: With int instead of Optional[int]
class EvalC(BaseModel):
    criteria_code: str
    status: str
    reasoning: str
    evidence_photo_index: int = 0

class ResultC(BaseModel):
    evaluations: List[EvalC]

llm = ChatGroq(model="qwen/qwen3.6-27b", groq_api_key=settings.GROQ_API_KEY, temperature=0.0)

for name, cls in [("Variant A (No Field/No Optional)", ResultA), ("Variant B (With Field descriptions)", ResultB), ("Variant C (int = 0 default)", ResultC)]:
    print(f"\n--- Testing {name} ---")
    try:
        s_llm = llm.with_structured_output(cls)
        res = s_llm.invoke([msg])
        print("SUCCESS:", res)
    except Exception as e:
        print("FAILED:", e)
