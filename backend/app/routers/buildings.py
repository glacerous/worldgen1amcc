import uuid
import math
import io
from PIL import Image
from PIL.ExifTags import TAGS, GPSTAGS
from fastapi import APIRouter, HTTPException, Form, File, UploadFile, Depends
from app.auth_utils import get_optional_user
from typing import Optional, List, Dict, Any
from uuid import UUID
from pydantic import BaseModel
from app.db import supabase
from app.agents.graph import run_audit_pipeline
from app.agents.panorama_agent import run_panorama_agent

def get_exif_gps(image_bytes: bytes) -> Optional[tuple]:
    try:
        img = Image.open(io.BytesIO(image_bytes))
        exif = img._getexif()
        if not exif:
            return None
            
        gps_info = {}
        for key, val in exif.items():
            tag = TAGS.get(key, key)
            if tag == "GPSInfo":
                for g_key, g_val in val.items():
                    g_tag = GPSTAGS.get(g_key, g_key)
                    gps_info[g_tag] = g_val
                break
                
        if not gps_info:
            return None
            
        def convert_to_degrees(value):
            d = float(value[0])
            m = float(value[1])
            s = float(value[2])
            return d + (m / 60.0) + (s / 3600.0)
            
        gps_latitude = gps_info.get("GPSLatitude")
        gps_latitude_ref = gps_info.get("GPSLatitudeRef")
        gps_longitude = gps_info.get("GPSLongitude")
        gps_longitude_ref = gps_info.get("GPSLongitudeRef")
        
        if gps_latitude and gps_latitude_ref and gps_longitude and gps_longitude_ref:
            if hasattr(gps_latitude_ref, "decode"):
                gps_latitude_ref = gps_latitude_ref.decode("utf-8", errors="ignore")
            if hasattr(gps_longitude_ref, "decode"):
                gps_longitude_ref = gps_longitude_ref.decode("utf-8", errors="ignore")
            
            lat_ref = str(gps_latitude_ref).strip().upper()
            lon_ref = str(gps_longitude_ref).strip().upper()

            lat = convert_to_degrees(gps_latitude)
            if lat_ref != "N":
                lat = -lat
            lon = convert_to_degrees(gps_longitude)
            if lon_ref != "E":
                lon = -lon
            return lat, lon
    except Exception as e:
        print(f"Error parsing GPS EXIF: {e}")
    return None

def calculate_haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    # Radius of the Earth in meters
    R = 6371000.0
    
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    
    a = math.sin(delta_phi / 2.0) ** 2 + \
        math.cos(phi1) * math.cos(phi2) * \
        math.sin(delta_lambda / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    
    distance = R * c
    return distance

router = APIRouter(prefix="/buildings", tags=["buildings"])

# Schema for creating a building (internal route)
class BuildingCreate(BaseModel):
    name: str
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


@router.post("", response_model=dict)
def create_building(building: BuildingCreate):
    """
    Internal endpoint to insert an approved building directly.
    """
    try:
        response = supabase.table("buildings").insert({
            "name": building.name,
            "address": building.address,
            "latitude": building.latitude,
            "longitude": building.longitude,
            "status": "approved",
            "source": "team",
            "verified": True
        }).execute()
        
        if not response.data:
            raise HTTPException(status_code=400, detail="Failed to create building")
        
        return response.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{building_id}/audit-submit", response_model=dict)
async def submit_building_audit(
    building_id: UUID,
    photos: List[UploadFile] = File(...),
    panoramas: List[UploadFile] = File([]),
    contributor_name: Optional[str] = Form(None),
    current_user = Depends(get_optional_user)
):
    """
    Submits photo evidence for an existing building to create a new audit run.
    """
    # 1. Check if building exists
    building_id_str = str(building_id)
    building_res = supabase.table("buildings").select("*").eq("id", building_id_str).execute()
    if not building_res.data:
        raise HTTPException(status_code=404, detail="Gedung tidak ditemukan.")
    existing_building = building_res.data[0]

    # 2. Validation: at least one photo is required
    if not photos or len(photos) == 0:
        raise HTTPException(status_code=400, detail="Minimal 1 foto bukti wajib diunggah.")
        
    for photo in photos:
        if not photo.content_type or not photo.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="Semua berkas yang diunggah harus berupa file gambar.")

    if panoramas:
        for p in panoramas:
            if not p.content_type or not p.content_type.startswith("image/"):
                raise HTTPException(status_code=400, detail="Semua berkas panorama yang diunggah harus berupa file gambar.")

    if not contributor_name or not contributor_name.strip():
        if current_user:
            contributor_name = current_user.get("display_name") or current_user.get("email") or "Anonim"
        else:
            contributor_name = "Anonim"
    else:
        contributor_name = contributor_name.strip()

    # 3. Upload photo files to Supabase Storage bucket "photos"
    photo_urls = []
    for photo in photos:
        try:
            file_extension = photo.filename.split(".")[-1] if "." in photo.filename else "jpg"
            unique_filename = f"{uuid.uuid4()}.{file_extension}"
            file_content = await photo.read()
            
            supabase.storage.from_("photos").upload(
                path=unique_filename,
                file=file_content,
                file_options={"content-type": photo.content_type}
            )
            
            public_url = supabase.storage.from_("photos").get_public_url(unique_filename)
            photo_urls.append(public_url)
        except Exception as upload_err:
            raise HTTPException(status_code=500, detail=f"Gagal mengunggah foto bukti ke server: {str(upload_err)}")

    # 4. Run the multi-agent audit pipeline using the uploaded photo URLs
    try:
        audit_summary = run_audit_pipeline(
            building_id_str,
            photo_urls,
            contributor_name=contributor_name,
            gps_mismatch=False,
            gps_distance_meters=None
        )
    except Exception as audit_err:
        raise HTTPException(
            status_code=500,
            detail=f"Gedung ditemukan namun terjadi kegagalan audit: {str(audit_err)}"
        )

    # 5. Link current_user if logged in
    if current_user and audit_summary.get("audit_run_id"):
        try:
            supabase.table("audit_runs").update({
                "user_id": current_user["user_id"]
            }).eq("id", audit_summary["audit_run_id"]).execute()
        except Exception as e:
            print(f"[warn] Gagal mengaitkan user_id ke audit_run: {e}")

    # 6. Process optional panoramas
    last_scene_id = None
    if panoramas:
        for p in panoramas:
            try:
                # Ensure bucket exists
                try:
                    supabase.storage.create_bucket("panoramas", {"public": True})
                except Exception:
                    pass

                file_extension = p.filename.split(".")[-1] if "." in p.filename else "jpg"
                unique_filename = f"{uuid.uuid4()}.{file_extension}"
                file_content = await p.read()
                
                supabase.storage.from_("panoramas").upload(
                    path=unique_filename,
                    file=file_content,
                    file_options={"content-type": p.content_type}
                )
                
                panorama_url = supabase.storage.from_("panoramas").get_public_url(unique_filename)
                
                scene_response = supabase.table("scenes").insert({
                    "building_id": building_id_str,
                    "type": "panorama_360",
                    "file_url": panorama_url,
                    "label": p.filename
                }).execute()
                
                if scene_response.data:
                    scene_id = scene_response.data[0]["id"]
                    last_scene_id = scene_id
                    features = run_panorama_agent(panorama_url)
                    if features:
                        audit_run_id = audit_summary.get("audit_run_id")
                        audit_results_response = supabase.table("audit_results") \
                            .select("*, audit_criteria(*)") \
                            .eq("building_id", building_id_str) \
                            .eq("audit_run_id", audit_run_id) \
                            .execute()
                        results = audit_results_response.data or []
                        
                        # 1. Update audit results if their status is 'unknown'
                        for item in features:
                            new_status = item.get("status")
                            if not new_status or new_status not in ["met", "not_met"]:
                                continue
                            
                            # Find matching audit result object
                            matched_result = None
                            lbl_lower = item["label"].lower()
                            for r in results:
                                criteria = r.get("audit_criteria")
                                if not criteria:
                                    continue
                                desc = criteria.get("description", "").lower()
                                code = criteria.get("code", "").lower()
                                if (
                                    ("toilet" in lbl_lower and "toilet" in desc) or
                                    ("ramp" in lbl_lower and "ramp" in desc) or
                                    ("tangga" in lbl_lower and "tangga" in desc) or
                                    (("ubin" in lbl_lower or "tactile" in lbl_lower) and "ubin" in desc) or
                                    ("pintu" in lbl_lower and "pintu" in desc) or
                                    (lbl_lower in desc or lbl_lower in code)
                                ):
                                    matched_result = r
                                    break
                            
                            if matched_result and (matched_result.get("status") == "unknown" or matched_result.get("source_agent") not in ["visual_agent", "panorama_agent"]):
                                supabase.table("audit_results").update({
                                    "status": new_status,
                                    "source_agent": "panorama_agent",
                                    "reasoning": "Terdeteksi dari analisis foto 360°, belum ada foto close-up sebagai bukti langsung.",
                                    "evidence_url": None
                                }).eq("id", matched_result["id"]).execute()
                                
                                matched_result["status"] = new_status
                                matched_result["source_agent"] = "panorama_agent"
                                matched_result["reasoning"] = "Terdeteksi dari analisis foto 360°, belum ada foto close-up sebagai bukti langsung."
                                matched_result["evidence_url"] = None
                                
                                for r_summary in audit_summary.get("results", []):
                                    if r_summary.get("criteria_code") == matched_result["audit_criteria"]["code"]:
                                        r_summary["status"] = new_status
                                        r_summary["source_agent"] = "panorama_agent"
                                        r_summary["reasoning"] = "Terdeteksi dari analisis foto 360°, belum ada foto close-up sebagai bukti langsung."

                        # 2. Build annotations mapping
                        annotations_to_insert = []
                        for item in features:
                            yaw = (item["x_percent"] / 100) * 360 - 180
                            pitch = 90 - (item["y_percent"] / 100) * 180
                            
                            match_id = None
                            lbl_lower = item["label"].lower()
                            for r in results:
                                criteria = r.get("audit_criteria")
                                if not criteria:
                                    continue
                                desc = criteria.get("description", "").lower()
                                code = criteria.get("code", "").lower()
                                if (
                                    ("toilet" in lbl_lower and "toilet" in desc) or
                                    ("ramp" in lbl_lower and "ramp" in desc) or
                                    ("tangga" in lbl_lower and "tangga" in desc) or
                                    (("ubin" in lbl_lower or "tactile" in lbl_lower) and "ubin" in desc) or
                                    ("pintu" in lbl_lower and "pintu" in desc) or
                                    (lbl_lower in desc or lbl_lower in code)
                                ):
                                    match_id = r["id"]
                                    break
                            
                            annotations_to_insert.append({
                                "scene_id": scene_id,
                                "label": item["label"],
                                "pitch": pitch,
                                "yaw": yaw,
                                "audit_result_id": match_id
                            })
                        
                        if annotations_to_insert:
                            supabase.table("annotations").insert(annotations_to_insert).execute()
            except Exception as p_err:
                print(f"Gagal memproses panorama {p.filename}: {str(p_err)}")

    return {
        "building": existing_building,
        "audit_summary": audit_summary,
        "scene_id": last_scene_id
    }


@router.post("/submit", response_model=dict)
async def submit_building(
    name: str = Form(...),
    address: Optional[str] = Form(None),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    photos: List[UploadFile] = File(...),
    panoramas: List[UploadFile] = File([]),
    contributor_name: Optional[str] = Form(None),
    confirm_location: bool = Form(False),
    current_user = Depends(get_optional_user)
):
    """
    Public endpoint to submit a building with photo evidence and optional panorama.
    Runs the multi-agent audit pipeline immediately.
    """
    # 1. Validation: at least one photo is required
    if not photos or len(photos) == 0:
        raise HTTPException(status_code=400, detail="Minimal 1 foto bukti wajib diunggah.")
        
    # 2. Validation: check file mime types are images
    for photo in photos:
        if not photo.content_type or not photo.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="Semua berkas yang diunggah harus berupa file gambar.")

    if panoramas:
        for p in panoramas:
            if not p.content_type or not p.content_type.startswith("image/"):
                raise HTTPException(status_code=400, detail="Semua berkas panorama yang diunggah harus berupa file gambar.")

    if not contributor_name or not contributor_name.strip():
        if current_user:
            contributor_name = current_user.get("display_name") or current_user.get("email") or "Anonim"
        else:
            contributor_name = "Anonim"
    else:
        contributor_name = contributor_name.strip()

    # 3. GPS EXIF check from the first photo (AWAL)
    gps_mismatch = False
    gps_distance_meters = None
    if photos:
        first_photo = photos[0]
        try:
            first_photo_content = await first_photo.read()
            # Seek back to 0 so the file content can be read again for upload
            await first_photo.seek(0)
            
            gps_coords = get_exif_gps(first_photo_content)
            if gps_coords and latitude is not None and longitude is not None:
                photo_lat, photo_lon = gps_coords
                distance = calculate_haversine_distance(latitude, longitude, photo_lat, photo_lon)
                gps_distance_meters = distance
                if distance > 500.0:
                    gps_mismatch = True
        except Exception as e:
            print(f"Error checking EXIF GPS in initial phase: {e}")

    # Return warning response if mismatch and not confirmed yet
    if gps_mismatch and not confirm_location:
        return {
            "warning": "gps_mismatch",
            "distance_meters": gps_distance_meters,
            "message": "Jarak antara lokasi foto (GPS) dan lokasi alamat gedung terpaut lebih dari 500 meter."
        }

    # 4. Create the building record (community, unverified, status='pending')
    try:
        building_payload = {
            "name": name,
            "address": address,
            "latitude": latitude,
            "longitude": longitude,
            "source": "community",
            "verified": True,
            "status": "approved"
        }
        # Link the building to the submitting user if logged in
        if current_user:
            building_payload["owner_user_id"] = current_user["user_id"]

        building_response = supabase.table("buildings").insert(building_payload).execute()

        
        if not building_response.data:
            raise HTTPException(status_code=400, detail="Failed to record building suggestion.")
        new_building = building_response.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal mencatat data gedung: {str(e)}")

    building_id = new_building["id"]

    # 4. Upload photo files to Supabase Storage bucket "photos"
    photo_urls = []
    for photo in photos:
        try:
            file_extension = photo.filename.split(".")[-1] if "." in photo.filename else "jpg"
            unique_filename = f"{uuid.uuid4()}.{file_extension}"
            file_content = await photo.read()
            
            # Execute upload
            supabase.storage.from_("photos").upload(
                path=unique_filename,
                file=file_content,
                file_options={"content-type": photo.content_type}
            )
            
            # Retrieve public URL
            public_url = supabase.storage.from_("photos").get_public_url(unique_filename)
            photo_urls.append(public_url)
            
        except Exception as upload_err:
            # Clean up created building if upload fails to keep DB clean
            try:
                supabase.table("buildings").delete().eq("id", building_id).execute()
            except Exception:
                pass
            raise HTTPException(status_code=500, detail=f"Gagal mengunggah foto bukti ke server: {str(upload_err)}")

    # 5. Run the multi-agent audit pipeline using the uploaded photo URLs
    try:
        audit_summary = run_audit_pipeline(
            building_id,
            photo_urls,
            contributor_name=contributor_name,
            gps_mismatch=gps_mismatch,
            gps_distance_meters=gps_distance_meters
        )
    except Exception as audit_err:
        raise HTTPException(
            status_code=500,
            detail=f"Gedung berhasil disimpan namun terjadi kegagalan audit: {str(audit_err)}"
        )

    # 5b. If user is logged in, link their user_id to the audit run that was just created
    if current_user and audit_summary.get("audit_run_id"):
        try:
            supabase.table("audit_runs").update({
                "user_id": current_user["user_id"]
            }).eq("id", audit_summary["audit_run_id"]).execute()
        except Exception as e:
            # Non-fatal: log but don't fail the request
            print(f"[warn] Gagal mengaitkan user_id ke audit_run: {e}")

    # 6. Process optional 360 panoramas upload and run panorama agent detection
    last_scene_id = None
    if panoramas:
        for p in panoramas:
            try:
                # Ensure bucket exists
                try:
                    supabase.storage.create_bucket("panoramas", {"public": True})
                except Exception:
                    pass

                # Upload panorama file to Supabase storage
                file_extension = p.filename.split(".")[-1] if "." in p.filename else "jpg"
                unique_filename = f"{uuid.uuid4()}.{file_extension}"
                file_content = await p.read()
                
                supabase.storage.from_("panoramas").upload(
                    path=unique_filename,
                    file=file_content,
                    file_options={"content-type": p.content_type}
                )
                
                # Get public url of panorama
                panorama_url = supabase.storage.from_("panoramas").get_public_url(unique_filename)
                
                # Insert into scenes
                scene_response = supabase.table("scenes").insert({
                    "building_id": building_id,
                    "type": "panorama_360",
                    "file_url": panorama_url,
                    "label": p.filename
                }).execute()
                
                if scene_response.data:
                    scene_id = scene_response.data[0]["id"]
                    last_scene_id = scene_id
                    
                    # Run panorama detection agent
                    features = run_panorama_agent(panorama_url)
                    
                    if features:
                        audit_run_id = audit_summary.get("audit_run_id")
                        # Query newly created audit results for keyword mapping
                        audit_results_response = supabase.table("audit_results") \
                            .select("*, audit_criteria(*)") \
                            .eq("building_id", building_id) \
                            .eq("audit_run_id", audit_run_id) \
                            .execute()
                        results = audit_results_response.data or []
                        
                        # 1. Update audit results if their status is 'unknown'
                        for item in features:
                            new_status = item.get("status")
                            if not new_status or new_status not in ["met", "not_met"]:
                                continue
                            
                            # Find matching audit result object
                            matched_result = None
                            lbl_lower = item["label"].lower()
                            for r in results:
                                criteria = r.get("audit_criteria")
                                if not criteria:
                                    continue
                                desc = criteria.get("description", "").lower()
                                code = criteria.get("code", "").lower()
                                if (
                                    ("toilet" in lbl_lower and "toilet" in desc) or
                                    ("ramp" in lbl_lower and "ramp" in desc) or
                                    ("tangga" in lbl_lower and "tangga" in desc) or
                                    (("ubin" in lbl_lower or "tactile" in lbl_lower) and "ubin" in desc) or
                                    ("pintu" in lbl_lower and "pintu" in desc) or
                                    (lbl_lower in desc or lbl_lower in code)
                                ):
                                    matched_result = r
                                    break
                            
                            if matched_result and (matched_result.get("status") == "unknown" or matched_result.get("source_agent") not in ["visual_agent", "panorama_agent"]):
                                # Perform database update
                                supabase.table("audit_results").update({
                                    "status": new_status,
                                    "source_agent": "panorama_agent",
                                    "reasoning": "Terdeteksi dari analisis foto 360°, belum ada foto close-up sebagai bukti langsung.",
                                    "evidence_url": None
                                }).eq("id", matched_result["id"]).execute()
                                
                                # Update local results and audit_summary
                                matched_result["status"] = new_status
                                matched_result["source_agent"] = "panorama_agent"
                                matched_result["reasoning"] = "Terdeteksi dari analisis foto 360°, belum ada foto close-up sebagai bukti langsung."
                                matched_result["evidence_url"] = None
                                
                                for r_summary in audit_summary.get("results", []):
                                    if r_summary.get("criteria_code") == matched_result["audit_criteria"]["code"]:
                                        r_summary["status"] = new_status
                                        r_summary["source_agent"] = "panorama_agent"
                                        r_summary["reasoning"] = "Terdeteksi dari analisis foto 360°, belum ada foto close-up sebagai bukti langsung."

                        # 2. Build annotations mapping
                        annotations_to_insert = []
                        for item in features:
                            yaw = (item["x_percent"] / 100) * 360 - 180
                            pitch = 90 - (item["y_percent"] / 100) * 180
                            
                            # Match label to find audit_result_id
                            match_id = None
                            lbl_lower = item["label"].lower()
                            for r in results:
                                criteria = r.get("audit_criteria")
                                if not criteria:
                                    continue
                                desc = criteria.get("description", "").lower()
                                code = criteria.get("code", "").lower()
                                if (
                                    ("toilet" in lbl_lower and "toilet" in desc) or
                                    ("ramp" in lbl_lower and "ramp" in desc) or
                                    ("tangga" in lbl_lower and "tangga" in desc) or
                                    (("ubin" in lbl_lower or "tactile" in lbl_lower) and "ubin" in desc) or
                                    ("pintu" in lbl_lower and "pintu" in desc) or
                                    (lbl_lower in desc or lbl_lower in code)
                                ):
                                    match_id = r["id"]
                                    break
                            
                            annotations_to_insert.append({
                                "scene_id": scene_id,
                                "label": item["label"],
                                "pitch": pitch,
                                "yaw": yaw,
                                "audit_result_id": match_id
                            })
                        
                        if annotations_to_insert:
                            supabase.table("annotations").insert(annotations_to_insert).execute()
                            
            except Exception as panorama_err:
                print(f"Gagal memproses panorama {p.filename}: {str(panorama_err)}")

    return {
        "building": new_building,
        "audit_summary": audit_summary,
        "scene_id": last_scene_id
    }

def compute_building_compliance(results: List[Dict[str, Any]], criteria_list: List[Dict[str, Any]]):
    results_by_criteria = {}
    for r in results:
        crit = r.get("audit_criteria")
        if crit and crit.get("code"):
            results_by_criteria.setdefault(crit["code"], []).append(r["status"])
            
    priority_map = {"met": 4, "not_met": 3, "unknown": 2, "na": 1}
    
    met_count = 0
    evaluable_count = 0
    
    for c in criteria_list:
        code = c["code"]
        statuses = results_by_criteria.get(code, [])
        if not statuses:
            evaluable_count += 1
            continue
            
        status_counts = {}
        for st in statuses:
            status_counts[st] = status_counts.get(st, 0) + 1
            
        max_count = max(status_counts.values())
        candidates = [st for st, count in status_counts.items() if count == max_count]
        
        if len(candidates) == 1:
            final_status = candidates[0]
        else:
            final_status = max(candidates, key=lambda st: priority_map.get((st or "").lower(), 0))
            
        if final_status == "na":
            continue
        elif final_status == "met":
            met_count += 1
            evaluable_count += 1
        else:
            evaluable_count += 1
            
    if evaluable_count <= 0:
        return "N/A"
    return round((met_count / evaluable_count) * 100)

@router.get("", response_model=List[dict])
def get_buildings():
    """
    Get all buildings. No pending status filtering.
    Computes a single clean status_summary, primary audit run compliance score, and audit run counts.
    """
    try:
        # 1. Fetch buildings, audit results, audit runs, open reports, and criteria in parallel
        buildings_res = supabase.table("buildings").select("*").execute()
        buildings = buildings_res.data or []
        
        results_res = supabase.table("audit_results") \
            .select("building_id, status, evidence_url, audit_run_id, audit_criteria(code, category)") \
            .execute()
        results = results_res.data or []
        
        runs_res = supabase.table("audit_runs").select("id, building_id, created_at").execute()
        runs = runs_res.data or []
        
        open_reports_res = supabase.table("reports") \
            .select("audit_result_id, status, audit_results(building_id)") \
            .eq("status", "open") \
            .execute()
        open_reports = open_reports_res.data or []
        
        criteria_res = supabase.table("audit_criteria").select("code").execute()
        criteria_list = criteria_res.data or []
        
        # 2. Group audit results by building_id
        results_by_building = {}
        for r in results:
            b_id = r["building_id"]
            results_by_building.setdefault(b_id, []).append(r)
            
        # 3. Group runs by building_id and find primary run
        runs_by_building = {}
        for run in runs:
            b_id = run["building_id"]
            runs_by_building.setdefault(b_id, []).append(run)
            
        primary_run_id_by_building = {}
        runs_count_by_building = {}
        for b_id, b_runs in runs_by_building.items():
            runs_count_by_building[b_id] = len(b_runs)
            # Sort by created_at ASC to get the oldest run as primary
            sorted_runs = sorted(b_runs, key=lambda x: x["created_at"])
            if sorted_runs:
                primary_run_id_by_building[b_id] = sorted_runs[0]["id"]
            
        # 4. Find building IDs that have open reports
        open_report_building_ids = set()
        for rep in open_reports:
            res_obj = rep.get("audit_results")
            if res_obj and res_obj.get("building_id"):
                open_report_building_ids.add(res_obj["building_id"])
                
        # 5. Populate and decorate each building
        for b in buildings:
            b_id = b["id"]
            b_results = results_by_building.get(b_id, [])
            run_count = runs_count_by_building.get(b_id, 0)
            
            # Check disputes (any criteria has conflicting statuses)
            results_by_code = {}
            for r in b_results:
                crit = r.get("audit_criteria")
                if crit and crit.get("code"):
                    results_by_code.setdefault(crit["code"], []).append(r["status"])
                    
            has_dispute = False
            for code, statuses in results_by_code.items():
                if len(set(statuses)) > 1:
                    has_dispute = True
                    break
                    
            # Get primary results
            primary_run_id = primary_run_id_by_building.get(b_id)
            if primary_run_id:
                primary_results = [r for r in b_results if r.get("audit_run_id") == primary_run_id]
            else:
                primary_results = []

            # Determine status summary
            if run_count == 0:
                status_summary = "no_audit"
            else:
                status_summary = "active"
                
            # Compute compliance score from primary audit results if runs exist
            if run_count > 0:
                compliance_score = compute_building_compliance(primary_results, criteria_list)
            else:
                compliance_score = None
                
            b["status_summary"] = status_summary
            b["compliance_score"] = compliance_score
            b["audit_run_count"] = run_count
            b["audit_results"] = b_results
            
            # Maintain safe defaults for other endpoints/components compatibility
            b.setdefault("trust_status", "neutral")
            b.setdefault("manually_set_by_admin", False)
            b.setdefault("trust_score_cache", None)
            b.setdefault("vote_count_cache", 0)
            
        return buildings
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/nearby", response_model=List[dict])
def get_nearby_buildings(lat: float, lng: float, radius_meters: float = 100.0):
    """
    Search for all buildings within radius_meters from the given coordinates.
    """
    try:
        # Fetch all buildings from DB that have lat and lng set
        response = supabase.table("buildings") \
            .select("id, name, address, latitude, longitude") \
            .execute()
        
        buildings = response.data or []
        nearby = []
        
        for b in buildings:
            b_lat = b.get("latitude")
            b_lng = b.get("longitude")
            if b_lat is None or b_lng is None:
                continue
                
            distance = calculate_haversine_distance(lat, lng, b_lat, b_lng)
            if distance <= radius_meters:
                nearby.append({
                    "id": b["id"],
                    "name": b["name"],
                    "address": b["address"],
                    "distance_meters": distance
                })
                
        # Sort nearby by distance ascending
        nearby.sort(key=lambda x: x["distance_meters"])
        return nearby
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{id}", response_model=dict)
def get_building(id: UUID):
    """
    Get a single building by ID.
    Computes status_summary, primary compliance_score, and audit_run_count for consistency.
    """
    try:
        building_id = str(id)
        response = supabase.table("buildings").select("*").eq("id", building_id).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail=f"Building with ID {id} not found")
        b = response.data[0]

        # 1. Fetch audit results, runs, open reports, and criteria in parallel
        results_res = supabase.table("audit_results") \
            .select("id, building_id, status, evidence_url, audit_run_id, audit_criteria(code, category)") \
            .eq("building_id", building_id) \
            .execute()
        b_results = results_res.data or []

        runs_res = supabase.table("audit_runs").select("id, created_at").eq("building_id", building_id).execute()
        runs = runs_res.data or []
        run_count = len(runs)

        open_reports_res = supabase.table("reports") \
            .select("audit_result_id, status, audit_results(building_id)") \
            .eq("status", "open") \
            .execute()
        open_reports = open_reports_res.data or []

        criteria_res = supabase.table("audit_criteria").select("code").execute()
        criteria_list = criteria_res.data or []

        # 2. Check if this building has any open reports
        has_open_reports = False
        for rep in open_reports:
            res_obj = rep.get("audit_results")
            if res_obj and res_obj.get("building_id") == building_id:
                has_open_reports = True
                break

        # 3. Check disputes
        results_by_code = {}
        for r in b_results:
            crit = r.get("audit_criteria")
            if crit and crit.get("code"):
                results_by_code.setdefault(crit["code"], []).append(r["status"])

        has_dispute = False
        for code, statuses in results_by_code.items():
            if len(set(statuses)) > 1:
                has_dispute = True
                break

        # 4. Determine status summary and score
        if run_count == 0:
            status_summary = "no_audit"
        else:
            status_summary = "active"

        # Compute compliance score from primary audit results if runs exist
        if run_count > 0 and runs:
            # Sort runs by created_at ASC to get the oldest as primary
            sorted_runs = sorted(runs, key=lambda x: x["created_at"])
            primary_run_id = sorted_runs[0]["id"]
            primary_results = [r for r in b_results if r.get("audit_run_id") == primary_run_id]
            compliance_score = compute_building_compliance(primary_results, criteria_list)
        else:
            compliance_score = None

        b["status_summary"] = status_summary
        b["compliance_score"] = compliance_score
        b["audit_run_count"] = run_count
        b["audit_results"] = b_results

        # Safe defaults
        b.setdefault("trust_status", "neutral")
        b.setdefault("manually_set_by_admin", False)
        b.setdefault("trust_score_cache", None)
        b.setdefault("vote_count_cache", 0)
        return b
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def parse_contributor_and_photos(run_dict: dict, default_photos: List[str] = []) -> tuple[str, List[str]]:
    # 1. Check if DB has photos column and it has data
    db_photos = run_dict.get("photos")
    raw_contrib = run_dict.get("contributor_name")
    
    if db_photos is not None:
        if isinstance(db_photos, list):
            return raw_contrib or "Anonim", db_photos
            
    # 2. Fallback to parsing contributor_name
    if not raw_contrib:
        return "Anonim", default_photos
    if "|||" in raw_contrib:
        parts = raw_contrib.split("|||", 1)
        name = parts[0] if parts[0] else "Anonim"
        photos_str = parts[1]
        photos = [p.strip() for p in photos_str.split(",") if p.strip()]
        return name, photos
    return raw_contrib, default_photos


@router.get("/{id}/audit-runs", response_model=List[dict])
def get_building_audit_runs_new(id: UUID):
    """
    Returns list of ALL audit_runs for that building, ordered from oldest to newest (created_at ASC).
    For each item, includes: id, audit_run_id, contributor_name, created_at, summary (count of met/not_met/unknown),
    and flag is_primary: true ONLY for the first item.
    """
    try:
        # Fetch audit runs for the building, ordered by created_at ASC
        runs_res = supabase.table("audit_runs") \
            .select("*, users(display_name)") \
            .eq("building_id", str(id)) \
            .order("created_at", desc=False) \
            .execute()
        
        runs = runs_res.data or []
        if not runs:
            return []
            
        # Fetch all audit results for the building to compute summaries and collect fallback evidence URLs
        results_res = supabase.table("audit_results") \
            .select("status, audit_run_id, evidence_url") \
            .eq("building_id", str(id)) \
            .execute()
        results = results_res.data or []
        
        # Group counts and fallback photos by audit_run_id
        results_by_run = {}
        fallback_photos_by_run = {}
        for r in results:
            run_id = r.get("audit_run_id")
            if not run_id:
                continue
            run_id_str = str(run_id)
            if run_id_str not in results_by_run:
                results_by_run[run_id_str] = {"met": 0, "not_met": 0, "unknown": 0}
            status = r.get("status")
            if status in results_by_run[run_id_str]:
                results_by_run[run_id_str][status] += 1
                
            # Collect fallback evidence URLs
            ev_url = r.get("evidence_url")
            if ev_url:
                fallback_photos_by_run.setdefault(run_id_str, []).append(ev_url)
                
        formatted_runs = []
        for idx, run in enumerate(runs):
            run_id_str = str(run["id"])
            user_data = run.get("users") or {}
            display_name = user_data.get("display_name")
            
            fallback_photos = list(set(fallback_photos_by_run.get(run_id_str, [])))
            clean_name, run_photos = parse_contributor_and_photos(run, fallback_photos)
            
            # contributor name resolution
            if run.get("user_id") and display_name:
                c_name = display_name
            else:
                c_name = clean_name
                
            run_summary = results_by_run.get(run_id_str, {"met": 0, "not_met": 0, "unknown": 0})
            
            formatted_runs.append({
                "id": run["id"],
                "audit_run_id": run["id"],
                "contributor_name": c_name,
                "created_at": run["created_at"],
                "summary": run_summary,
                "is_primary": idx == 0,
                "user_id": run.get("user_id"),
                "photos": run_photos
            })
            
        return formatted_runs
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



@router.get("/{id}/consensus", response_model=List[dict])
def get_building_consensus(id: UUID):
    """
    Returns the majority vote consensus status of audit criteria for a specific building,
    indicating if there are conflicting evaluations (disputes) and how many runs contributed.
    """
    try:
        # 1. Fetch all audit criteria from database
        criteria_response = supabase.table("audit_criteria").select("*").execute()
        criteria_list = criteria_response.data or []

        # 2. Fetch all audit results for the building
        results_response = supabase.table("audit_results") \
            .select("*, audit_criteria(code, category, description, short_label)") \
            .eq("building_id", str(id)) \
            .execute()
        results = results_response.data or []

        # 3. Group results by criteria code
        results_by_criteria = {}
        for r in results:
            crit = r.get("audit_criteria")
            if not crit:
                continue
            code = crit.get("code")
            if not code:
                continue
            if code not in results_by_criteria:
                results_by_criteria[code] = []
            results_by_criteria[code].append(r)

        # 4. Compute consensus for each criteria
        consensus_list = []
        priority_map = {
            "met": 4,
            "not_met": 3,
            "unknown": 2,
            "na": 1
        }

        for c in criteria_list:
            code = c["code"]
            crit_results = results_by_criteria.get(code, [])
            total_runs = len(crit_results)

            if total_runs == 0:
                final_status = "unknown"
                is_disputed = False
                agree_count = 0
                audit_result_id = None
            else:
                status_counts = {}
                statuses = []
                for r in crit_results:
                    st = r["status"]
                    statuses.append(st)
                    status_counts[st] = status_counts.get(st, 0) + 1
                
                unique_statuses = set(statuses)
                is_disputed = len(unique_statuses) > 1

                # Find the status with maximum count
                max_count = max(status_counts.values())
                candidates = [st for st, count in status_counts.items() if count == max_count]

                if len(candidates) == 1:
                    final_status = candidates[0]
                else:
                    # Tie-breaker based on priority map
                    final_status = max(candidates, key=lambda st: priority_map.get((st or "").lower(), 0))

                agree_count = max_count
                # Get the ID of one of the audit results that matches the consensus status
                matching_res = [r for r in crit_results if r["status"] == final_status]
                audit_result_id = matching_res[0]["id"] if matching_res else None

            consensus_list.append({
                "criteria_code": code,
                "category": c["category"],
                "description": c["description"],
                "short_label": c.get("short_label"),
                "status": final_status,
                "is_disputed": is_disputed,
                "total_runs": total_runs,
                "agree_count": agree_count,
                "audit_result_id": str(audit_result_id) if audit_result_id else None,
                "reasoning": matching_res[0].get("reasoning") if matching_res else None,
                "evidence_url": matching_res[0].get("evidence_url") if matching_res else None,
                "source_agent": matching_res[0].get("source_agent") if matching_res else None,
            })

        return consensus_list

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal memproses konsensus: {str(e)}")

