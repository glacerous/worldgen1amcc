import os
import base64
import time
import random
import logging
from typing import List, Dict, Any
from pydantic import BaseModel, Field
import httpx
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage
from app.config import settings

logger = logging.getLogger(__name__)

# Ensure API key is set in environment so LangChain can pick it up
if settings.GROQ_API_KEY:
    os.environ["GROQ_API_KEY"] = settings.GROQ_API_KEY

def retry_with_backoff(retries=3, backoff_in_seconds=2):
    def decorator(func):
        def wrapper(*args, **kwargs):
            x = 0
            while True:
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    err_str = str(e)
                    is_rate_limit = "429" in err_str or "rate_limit" in err_str.lower() or "rate limit" in err_str.lower()
                    if is_rate_limit and x < retries:
                        sleep_time = (backoff_in_seconds * (2 ** x)) + random.uniform(0, 1)
                        logger.warning(f"Rate limit hit (429). Retrying in {sleep_time:.2f} seconds... Error: {err_str}")
                        time.sleep(sleep_time)
                        x += 1
                    else:
                        raise e
        return wrapper
    return decorator

def get_image_base64(image_source: str) -> str:
    """
    Returns direct URL for HTTP/HTTPS images, or converts local files to base64 data URI.
    """
    if image_source.startswith("http://") or image_source.startswith("https://"):
        return image_source

    with open(image_source, "rb") as f:
        content = f.read()
        
    encoded = base64.b64encode(content).decode("utf-8")
    
    lower_source = image_source.lower()
    if lower_source.endswith(".png"):
        mime = "image/png"
    elif lower_source.endswith(".webp"):
        mime = "image/webp"
    elif lower_source.endswith(".gif"):
        mime = "image/gif"
    else:
        mime = "image/jpeg"
        
    return f"data:{mime};base64,{encoded}"

class DetectedFeature(BaseModel):
    label: str = Field(description="Nama/label fitur aksesibilitas yang dideteksi, contoh: 'Ramp', 'Toilet Difabel', 'Tangga Akses', 'Ubin Pemandu (Tactile)', 'Pintu Otomatis'")
    x_percent: float = Field(description="Posisi horizontal fitur dalam persentase dari lebar gambar (0.0 sampai 100.0), dihitung dari kiri")
    y_percent: float = Field(description="Posisi vertikal fitur dalam persentase dari tinggi gambar (0.0 sampai 100.0), dihitung dari atas")
    status: str = Field(description="Status kelayakan fitur aksesibilitas tersebut berdasarkan analisis gambar 360°, harus bernilai 'met' (layak/memenuhi kriteria) atau 'not_met' (tidak layak/tidak memenuhi syarat/rusak/terhalang)")

class PanoramaDetectionResult(BaseModel):
    features: list[DetectedFeature]

def run_panorama_agent(panorama_url: str) -> List[Dict[str, Any]]:
    """
    Analyzes an equirectangular 360 panorama image to detect accessibility features.
    Returns a list of detected features with their relative position percentages.
    """
    prompt = (
        "Analisis gambar panorama 360 derajat (equirectangular) berikut.\n"
        "Temukan semua fitur aksesibilitas fisik penting (seperti ramp kursi roda, tangga akses, ubin pemandu/tactile paving, toilet khusus disabilitas, pegangan tangan/grab bars, lift, pintu otomatis).\n"
        "Untuk setiap fitur yang dideteksi, tentukan:\n"
        "- label: Nama fitur aksesibilitas\n"
        "- x_percent: Persentase posisi horizontal dari kiri (0.0 - 100.0)\n"
        "- y_percent: Persentase posisi vertikal dari atas (0.0 - 100.0)\n"
        "- status: Evaluasi kelayakan ('met' atau 'not_met')"
    )

    try:
        b64_url = get_image_base64(panorama_url)
    except Exception as img_err:
        print(f"[warn] Gagal memproses gambar panorama {panorama_url}: {img_err}")
        return []

    message_content = [
        {"type": "text", "text": prompt},
        {
            "type": "image_url",
            "image_url": {"url": b64_url}
        }
    ]

    message = HumanMessage(content=message_content)

    llm = ChatGroq(
        model=settings.GROQ_VISION_MODEL,
        groq_api_key=settings.GROQ_API_KEY,
        temperature=0.0
    )

    structured_llm = llm.with_structured_output(PanoramaDetectionResult)

    @retry_with_backoff(retries=3, backoff_in_seconds=2)
    def invoke_with_retry():
        return structured_llm.invoke([message])

    try:
        result: PanoramaDetectionResult = invoke_with_retry()
        return [
            {
                "label": item.label,
                "x_percent": item.x_percent,
                "y_percent": item.y_percent,
                "status": item.status
            }
            for item in result.features
        ]
    except Exception as e:
        print(f"Error running panorama_agent: {str(e)}")
        # Return empty list in case of errors
        return []
