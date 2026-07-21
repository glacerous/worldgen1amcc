import os
import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.append(str(backend_dir))

from app.db import supabase

def run_update():
    print("Fetching criteria from Supabase...")
    response = supabase.table("audit_criteria").select("id", "code").execute()
    if not response.data:
        print("No criteria found in database.")
        return
        
    print(f"Found {len(response.data)} criteria.")
    updated_count = 0
    for row in response.data:
        old_code = row["code"]
        if old_code.startswith("SNI-8201-"):
            new_code = old_code.replace("SNI-8201-", "PUPR-14-")
            print(f"Updating code: {old_code} -> {new_code}")
            try:
                update_resp = supabase.table("audit_criteria").update({"code": new_code}).eq("id", row["id"]).execute()
                if update_resp.data:
                    print(f"Successfully updated to {new_code}")
                    updated_count += 1
                else:
                    print(f"Failed to update {old_code}")
            except Exception as e:
                print(f"Error updating {old_code}: {e}")
                
    print(f"Done. Updated {updated_count} criteria codes.")

if __name__ == "__main__":
    run_update()
