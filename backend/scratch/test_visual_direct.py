import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings
from app.db import supabase
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage
from pydantic import BaseModel, Field
from app.agents.criteria_seed import CRITERIA_SEED

res = supabase.table("scenes").select("file_url").limit(1).execute()
file_url = res.data[0]["file_url"]

class CriteriaEvaluation(BaseModel):
    criteria_code: str
    status: str
    reasoning: str
    evidence_photo_index: int = 0

class VisualAgentResult(BaseModel):
    evaluations: list[CriteriaEvaluation]

criteria_str = "\n".join([f"- {c['code']}: {c['description']}" for c in CRITERIA_SEED])

prompt = f"Evaluasi 12 kriteria aksesibilitas gedung ini dari foto:\n{criteria_str}"

llm = ChatGroq(model="qwen/qwen3.6-27b", groq_api_key=settings.GROQ_API_KEY, temperature=0.0)
s_llm = llm.with_structured_output(VisualAgentResult)

msg = HumanMessage(content=[
    {"type": "text", "text": prompt},
    {"type": "image_url", "image_url": {"url": file_url}}
])

try:
    res = s_llm.invoke([msg])
    print("SUCCESS FULL 12 CRITERIA:", res)
except Exception as e:
    print("FAILED FULL 12 CRITERIA:", e)
