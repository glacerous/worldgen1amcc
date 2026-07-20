import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings
from app.db import supabase
from app.agents.visual_agent import run_visual_agent, VisualAgentResult
from langchain_groq import ChatGroq

res = supabase.table("scenes").select("file_url").limit(1).execute()
file_url = res.data[0]["file_url"]

print("Testing file_url:", file_url)
results = run_visual_agent([file_url])
print("Results:", results)
