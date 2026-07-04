import json
import urllib.request
import urllib.parse
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/geocode", tags=["geocode"])

# Schema for geocoding request
class GeocodeRequest(BaseModel):
    address: str

@router.post("")
def geocode_address(request: GeocodeRequest):
    """
    Geocodes an address to latitude, longitude, and display_name using Nominatim API.
    """
    if not request.address.strip():
        raise HTTPException(status_code=400, detail="Address cannot be empty.")
        
    try:
        # Encode search parameters
        params = {
            "q": request.address.strip(),
            "format": "json",
            "addressdetails": "1",
            "limit": "1"
        }
        query_string = urllib.parse.urlencode(params)
        url = f"https://nominatim.openstreetmap.org/search?{query_string}"
        
        # Build URL request with custom User-Agent header (required by Nominatim policy)
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "AksesibelApp/1.0"
            }
        )
        
        # Execute query
        with urllib.request.urlopen(req) as response:
            if response.status != 200:
                raise HTTPException(status_code=502, detail="Error response from Nominatim API.")
                
            data = json.loads(response.read().decode("utf-8"))
            
            if not data:
                raise HTTPException(status_code=404, detail="No geocoding results found for the specified address.")
                
            first_result = data[0]
            
            return {
                "latitude": float(first_result["lat"]),
                "longitude": float(first_result["lon"]),
                "display_name": first_result.get("display_name", "")
            }
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
