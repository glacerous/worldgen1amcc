import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings
from app.db import supabase
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage
from app.agents.panorama_agent import get_image_base64
from app.agents.visual_agent import VisualAgentResult, CRITERIA_SEED

# Get panorama image from Supabase
res = supabase.table("scenes").select("file_url").limit(1).execute()
file_url = res.data[0]["file_url"]
b64_url = get_image_base64(file_url)

criteria_str = "\n".join([f"- {c['code']}: {c['description']}" for c in CRITERIA_SEED[:3]])

# Test prompt 1 (Original format)
prompt_1 = f"Anda adalah Visual Agent audit aksesibilitas.\nEvaluasi kriteria berikut:\n{criteria_str}"

# Test prompt 2 (Explicit tool call instruction)
prompt_2 = f"Anda adalah Visual Agent audit aksesibilitas.\nEvaluasi kriteria berikut:\n{criteria_str}\n\nKembalikan hasil dalam bentuk fungsi 'VisualAgentResult'."

print("--- Testing Prompt 1 with qwen/qwen3.6-27b ---")
try:
    llm = ChatGroq(model="qwen/qwen3.6-27b", groq_api_key=settings.GROQ_API_KEY, temperature=0.0)
    s_llm = llm.with_structured_output(VisualAgentResult)
    msg1 = HumanMessage(content=[
        {"type": "text", "text": prompt_1},
        {"type": "image_url", "image_url": {"url": b64_url}}
    ])
    res1 = s_llm.invoke([msg1])
    print("Success 1:", res1)
except Exception as e:
    print("Error 1:", e)

print("\n--- Testing Prompt 2 with qwen/qwen3.6-27b ---")
try:
    llm = ChatGroq(model="qwen/qwen3.6-27b", groq_api_key=settings.GROQ_API_KEY, temperature=0.0)
    s_llm = llm.with_structured_output(VisualAgentResult)
    msg2 = HumanMessage(content=[
        {"type": "text", "text": prompt_2},
        {"type": "image_url", "image_url": {"url": b64_url}}
    ])
    res2 = s_llm.invoke([msg2])
    print("Success 2:", res2)
except Exception as e:
    print("Error 2:", e)
