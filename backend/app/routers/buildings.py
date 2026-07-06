import uuid
import math
import io
from PIL import Image
from PIL.ExifTags import TAGS, GPSTAGS
from fastapi import APIRouter, HTTPException, Form, File, UploadFile
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

@router.post("/submit", response_model=dict)
async def submit_building(
    name: str = Form(...),
    address: Optional[str] = Form(None),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    photos: List[UploadFile] = File(...),
    panorama: Optional[UploadFile] = File(None),
    contributor_name: Optional[str] = Form(None),
    confirm_location: bool = Form(False)
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

    if panorama:
        if not panorama.content_type or not panorama.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="Berkas panorama yang diunggah harus berupa file gambar.")

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
        building_response = supabase.table("buildings").insert({
            "name": name,
            "address": address,
            "latitude": latitude,
            "longitude": longitude,
            "source": "community",
            "verified": False,
            "status": "pending"
        }).execute()
        
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

    # 6. Process optional 360 panorama upload and run panorama agent detection
    scene_id = None
    if panorama:
        try:
            # Ensure bucket exists
            try:
                supabase.storage.create_bucket("panoramas", {"public": True})
            except Exception:
                pass

            # Upload panorama file to Supabase storage
            file_extension = panorama.filename.split(".")[-1] if "." in panorama.filename else "jpg"
            unique_filename = f"{uuid.uuid4()}.{file_extension}"
            file_content = await panorama.read()
            
            supabase.storage.from_("panoramas").upload(
                path=unique_filename,
                file=file_content,
                file_options={"content-type": panorama.content_type}
            )
            
            # Get public url of panorama
            panorama_url = supabase.storage.from_("panoramas").get_public_url(unique_filename)
            
            # Insert into scenes
            scene_response = supabase.table("scenes").insert({
                "building_id": building_id,
                "type": "panorama_360",
                "file_url": panorama_url,
                "label": panorama.filename
            }).execute()
            
            if scene_response.data:
                scene_id = scene_response.data[0]["id"]
                
                # Run panorama detection agent
                features = run_panorama_agent(panorama_url)
                
                if features:
                    # Query newly created audit results for keyword mapping
                    audit_results_response = supabase.table("audit_results") \
                        .select("*, audit_criteria(*)") \
                        .eq("building_id", building_id) \
                        .execute()
                    results = audit_results_response.data or []
                    
                    # Helper matching function
                    def find_matching_audit_result(lbl: str, audit_results: list) -> Optional[str]:
                        lbl_lower = lbl.lower()
                        for r in audit_results:
                            criteria = r.get("audit_criteria")
                            if not criteria:
                                continue
                            desc = criteria.get("description", "").lower()
                            code = criteria.get("code", "").lower()
                            # Check keywords
                            if "toilet" in lbl_lower and "toilet" in desc:
                                return r["id"]
                            if "ramp" in lbl_lower and "ramp" in desc:
                                return r["id"]
                            if "tangga" in lbl_lower and "tangga" in desc:
                                return r["id"]
                            if ("ubin" in lbl_lower or "tactile" in lbl_lower) and "ubin" in desc:
                                return r["id"]
                            if "pintu" in lbl_lower and "pintu" in desc:
                                return r["id"]
                            if lbl_lower in desc or lbl_lower in code:
                                return r["id"]
                        return None

                    # Format annotations
                    annotations_to_insert = []
                    for item in features:
                        yaw = (item["x_percent"] / 100) * 360 - 180
                        pitch = 90 - (item["y_percent"] / 100) * 180
                        match_id = find_matching_audit_result(item["label"], results)
                        
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
            # We don't fail the entire building creation if only panorama fails, but we print/raise
            print(f"Gagal memproses panorama: {str(panorama_err)}")

    return {
        "building": new_building,
        "audit_summary": audit_summary,
        "scene_id": scene_id
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
            final_status = max(candidates, key=lambda st: priority_map.get(st.lower(), 0))
            
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
    Computes a single clean status_summary, consensus compliance score, and audit run counts.
    """
    try:
        # 1. Fetch buildings, audit results, audit runs, open reports, and criteria in parallel
        buildings_res = supabase.table("buildings").select("*").execute()
        buildings = buildings_res.data or []
        
        results_res = supabase.table("audit_results") \
            .select("building_id, status, audit_criteria(code, category)") \
            .execute()
        results = results_res.data or []
        
        runs_res = supabase.table("audit_runs").select("building_id").execute()
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
            
        # 3. Group run counts by building_id
        runs_count_by_building = {}
        for run in runs:
            b_id = run["building_id"]
            runs_count_by_building[b_id] = runs_count_by_building.get(b_id, 0) + 1
            
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
                    
            # Determine status summary
            if has_dispute or b_id in open_report_building_ids:
                status_summary = "review"
                compliance_score = None
            elif run_count == 0:
                status_summary = "no_audit"
                compliance_score = None
            else:
                status_summary = "active"
                compliance_score = compute_building_compliance(b_results, criteria_list)
                
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

@router.get("/{id}", response_model=dict)
def get_building(id: UUID):
    """
    Get a single building by ID.
    """
    try:
        response = supabase.table("buildings").select("*").eq("id", str(id)).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail=f"Building with ID {id} not found")
        b = response.data[0]
        b.setdefault("trust_status", "neutral")
        b.setdefault("manually_set_by_admin", False)
        b.setdefault("trust_score_cache", None)
        b.setdefault("vote_count_cache", 0)
        return b
    except HTTPException:
        raise
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
            .select("*, audit_criteria(code, category, description)") \
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
                    final_status = max(candidates, key=lambda st: priority_map.get(st.lower(), 0))

                agree_count = max_count
                # Get the ID of one of the audit results that matches the consensus status
                matching_res = [r for r in crit_results if r["status"] == final_status]
                audit_result_id = matching_res[0]["id"] if matching_res else None

            consensus_list.append({
                "criteria_code": code,
                "category": c["category"],
                "description": c["description"],
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

