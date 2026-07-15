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
    Downloads image from URL or reads it locally, and converts it to a base64 data URI.
    """
    if image_source.startswith("http://") or image_source.startswith("https://"):
        with httpx.Client(timeout=15.0) as client:
            response = client.get(image_source)
            response.raise_for_status()
            content = response.content
    else:
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
    features: List[DetectedFeature]

def run_panorama_agent(panorama_url: str) -> List[Dict[str, Any]]:
    """
    Analyzes an equirectangular 360 panorama image to detect accessibility features.
    Returns a list of detected features with their relative position percentages.
    """
    prompt = (
        "Anda adalah AI asisten audit aksesibilitas bangunan.\n"
        "Analisis gambar panorama 360 derajat (equirectangular) berikut.\n"
        "Temukan semua fitur aksesibilitas fisik penting (seperti ramp kursi roda, tangga akses, ubin pemandu/tactile paving, toilet khusus disabilitas, pegangan tangan/grab bars, lift, pintu otomatis, dll.).\n\n"
        "Untuk setiap fitur yang dideteksi, tentukan posisinya sebagai koordinat titik tengah fitur tersebut dalam persentase, serta kelayakan aksesibilitasnya:\n"
        "- x_percent: Persentase horizontal (0.0 - 100.0), dihitung dari sisi paling kiri gambar ke kanan.\n"
        "- y_percent: Persentase vertikal (0.0 - 100.0), dihitung dari sisi paling atas gambar ke bawah. Catatan penting: garis cakrawala (horizon) berada tepat di tengah gambar (50.0%). Fitur di lantai/tanah yang berada di latar belakang atau jarak menengah (seperti tangga atau ramp yang agak jauh) biasanya terletak sangat dekat di bawah horizon, yaitu antara 52.0% hingga 58.0%. Hanya fitur di lantai yang letaknya sangat dekat/persis di bawah kamera yang memiliki y_percent 65.0% ke atas. Jangan menempatkan fitur jarak menengah pada y_percent yang terlalu besar (misal 65%+ atau 70%+), karena itu akan memproyeksikan fitur tersebut ke lantai terdekat di bawah kamera.\n"
        "- status: Evaluasi kelayakan fitur tersebut berdasarkan standar aksesibilitas dasar yang terlihat, bernilai 'met' (layak/memenuhi kriteria) atau 'not_met' (tidak layak/tidak memenuhi syarat/rusak/terhalang).\n\n"
        "Lakukan analisis secara cermat dan kembalikan seluruh fitur yang terdeteksi dalam satu respon."
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
        model="meta-llama/llama-4-scout-17b-16e-instruct",
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
