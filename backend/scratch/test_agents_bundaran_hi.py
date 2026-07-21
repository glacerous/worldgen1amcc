import os
import sys
import json
from pathlib import Path

# Fix Windows console UTF-8 output encoding
if sys.stdout.encoding.lower() != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

# Add backend directory to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings
from app.db import supabase
from app.agents.text_agent import run_text_agent
from app.agents.visual_agent import run_visual_agent
from app.agents.resolver_agent import run_resolver_agent
from app.agents.panorama_agent import run_panorama_agent

def main():
    print(f"=== Testing Audit Agents with New Models ===")
    print(f"GROQ_TEXT_MODEL: {settings.GROQ_TEXT_MODEL}")
    print(f"GROQ_VISION_MODEL: {settings.GROQ_VISION_MODEL}")
    print("=" * 45)

    # 1. Fetch MRT Bundaran HI from Supabase
    res = supabase.table("buildings").select("*").ilike("name", "%Bundaran HI%").execute()
    buildings = res.data
    if not buildings:
        print("ERROR: Building 'MRT Bundaran HI' not found in database! Trying general query...")
        res = supabase.table("buildings").select("*").limit(1).execute()
        buildings = res.data

    if not buildings:
        print("ERROR: No buildings found in database!")
        return

    building = buildings[0]
    building_id = building.get("id")
    building_name = building.get("name")
    building_address = building.get("address", "")
    photos = building.get("photos", []) or []

    print(f"Target Building: {building_name} (ID: {building_id})")
    print(f"Address: {building_address}")
    print(f"Photos count: {len(photos)}")

    # Fetch scenes (panoramas) for this building
    scenes_res = supabase.table("scenes").select("*").eq("building_id", building_id).execute()
    scenes = scenes_res.data or []
    print(f"Panoramas count: {len(scenes)}")

    # Get a valid image URL for visual testing
    valid_image_url = photos[0] if photos else (scenes[0].get("file_url") if scenes else None)
    print(f"Using image URL for visual tests: {valid_image_url}")
    print("=" * 45)

    report_results = {}

    # --- AGENT 1: TEXT AGENT ---
    print("\n--- 1. Running TEXT AGENT (openai/gpt-oss-120b) ---")
    try:
        text_results = run_text_agent(building_name, building_address)
        report_results["text_agent"] = {
            "status": "SUCCESS",
            "count": len(text_results),
            "sample": text_results[:3]
        }
        print(f"Text agent completed successfully. Generated {len(text_results)} evaluations.")
        for item in text_results[:3]:
            print(f"  [{item.get('criteria_code')}] {item.get('status')}: {item.get('reasoning')}")
    except Exception as e:
        print(f"Text agent FAILED: {e}")
        report_results["text_agent"] = {"status": "FAILED", "error": str(e)}

    # --- AGENT 2: VISUAL AGENT ---
    print("\n--- 2. Running VISUAL AGENT (qwen/qwen3.6-27b) ---")
    try:
        test_photos = [valid_image_url] if valid_image_url else []
        visual_results = run_visual_agent(test_photos)
        report_results["visual_agent"] = {
            "status": "SUCCESS",
            "count": len(visual_results),
            "sample": visual_results[:3]
        }
        print(f"Visual agent completed successfully. Generated {len(visual_results)} evaluations.")
        for item in visual_results[:3]:
            print(f"  [{item.get('criteria_code')}] {item.get('status')}: {item.get('reasoning')}")
    except Exception as e:
        print(f"Visual agent FAILED: {e}")
        report_results["visual_agent"] = {"status": "FAILED", "error": str(e)}

    # --- AGENT 3: RESOLVER AGENT ---
    print("\n--- 3. Running RESOLVER AGENT (openai/gpt-oss-120b) ---")
    try:
        existing_res = text_results if "text_agent" in report_results and report_results["text_agent"]["status"] == "SUCCESS" else []
        unknown_codes = [r["criteria_code"] for r in existing_res if r.get("status") == "unknown"]
        if not unknown_codes:
            unknown_codes = ["PUPR-14-M1", "PUPR-14-N2", "PUPR-14-R3"]
        
        resolver_results = run_resolver_agent(
            building_name=building_name,
            building_address=building_address,
            existing_results=existing_res,
            unknown_codes=unknown_codes
        )
        report_results["resolver_agent"] = {
            "status": "SUCCESS",
            "count": len(resolver_results),
            "sample": resolver_results[:3]
        }
        print(f"Resolver agent completed successfully. Evaluated {len(resolver_results)} unknown items.")
        for item in resolver_results[:3]:
            print(f"  [{item.get('criteria_code')}] {item.get('status')}: {item.get('reasoning')}")
    except Exception as e:
        print(f"Resolver agent FAILED: {e}")
        report_results["resolver_agent"] = {"status": "FAILED", "error": str(e)}

    # --- AGENT 4: PANORAMA AGENT ---
    print("\n--- 4. Running PANORAMA AGENT (qwen/qwen3.6-27b) ---")
    try:
        pano_url = valid_image_url if valid_image_url else ""
        pano_results = run_panorama_agent(pano_url)
        report_results["panorama_agent"] = {
            "status": "SUCCESS",
            "count": len(pano_results),
            "sample": pano_results[:3]
        }
        print(f"Panorama agent completed successfully. Found {len(pano_results)} detections.")
        for item in pano_results[:3]:
            print(f"  Detected: {item.get('label')} at x={item.get('x_percent')}%, y={item.get('y_percent')}% (Status: {item.get('status')})")
    except Exception as e:
        print(f"Panorama agent FAILED: {e}")
        report_results["panorama_agent"] = {"status": "FAILED", "error": str(e)}

    print("\n" + "=" * 45)
    print("ALL TEST RUNS COMPLETED. SUMMARY:")
    print(json.dumps(report_results, indent=2, default=str, ensure_ascii=False))

if __name__ == "__main__":
    main()
