import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings
from app.db import supabase
from langchain_groq import ChatGroq
from pydantic import BaseModel, Field
from langchain_core.messages import HumanMessage
from app.agents.panorama_agent import get_image_base64

class SimpleFeature(BaseModel):
    label: str
    status: str

class SimpleResult(BaseModel):
    features: list[SimpleFeature]

# Fetch real scene URL from Supabase for MRT Bundaran HI
res = supabase.table("scenes").select("file_url").limit(1).execute()
file_url = res.data[0]["file_url"] if res.data else None
print("Testing file_url:", file_url)

if file_url:
    b64_url = get_image_base64(file_url)
    msg = HumanMessage(content=[
        {"type": "text", "text": "Deteksi fitur aksesibilitas dalam gambar ini."},
        {"type": "image_url", "image_url": {"url": b64_url}}
    ])

    print("\n--- Test 1: qwen/qwen3.6-27b with default (function_calling) ---")
    try:
        llm = ChatGroq(model="qwen/qwen3.6-27b", groq_api_key=settings.GROQ_API_KEY, temperature=0.0)
        s_llm = llm.with_structured_output(SimpleResult)
        res1 = s_llm.invoke([msg])
        print("Success res1:", res1)
    except Exception as e:
        print("Error res1:", e)

    print("\n--- Test 2: qwen/qwen3.6-27b with method='json_mode' ---")
    try:
        llm = ChatGroq(model="qwen/qwen3.6-27b", groq_api_key=settings.GROQ_API_KEY, temperature=0.0)
        s_llm = llm.with_structured_output(SimpleResult, method="json_mode")
        res2 = s_llm.invoke([msg])
        print("Success res2:", res2)
    except Exception as e:
        print("Error res2:", e)
