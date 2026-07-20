import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import supabase
from app.agents.panorama_agent import run_panorama_agent

res = supabase.table("scenes").select("file_url").limit(1).execute()
pano_url = res.data[0]["file_url"]
print("Testing pano_url:", pano_url)

results = run_panorama_agent(pano_url)
print("Results count:", len(results))
print("Results:", results)
