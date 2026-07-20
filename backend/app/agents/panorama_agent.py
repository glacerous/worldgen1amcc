import os
import re
import json
import base64
import time
import random
import logging
from typing import List, Dict, Any
from pydantic import BaseModel, Field
import httpx
from langchain_groq import ChatGroq
from langchain_core.messages import SystemMessage, HumanMessage
from app.config import settings

logger = logging.getLogger(__name__)

# Ensure API key is set in environment so LangChain can pick it up
if settings.GROQ_API_KEY:
    os.environ["GROQ_API_KEY"] = settings.GROQ_API_KEY

def retry_with_backoff(retries=3, backoff_in_seconds=5):
    def decorator(func):
        def wrapper(*args, **kwargs):
            x = 0
            while True:
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    err_str = str(e)
                    is_rate_limit = any(k in err_str.lower() for k in ["429", "413", "rate_limit", "rate limit", "tpm", "tokens per minute", "request too large"])
                    if is_rate_limit and x < retries:
                        sleep_time = max((backoff_in_seconds * (2 ** x)) + random.uniform(1, 2), 7.0)
                        logger.warning(f"Rate limit / TPM hit ({err_str[:100]}). Retrying in {sleep_time:.2f} seconds...")
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
        "- status: Evaluasi kelayakan ('met' atau 'not_met')\n\n"
        "Kembalikan HANYA format JSON murni berikut tanpa penjelasan ekstra:\n"
        '{\n  "features": [\n    {"label": "Nama Fitur", "x_percent": 50.0, "y_percent": 50.0, "status": "met"}\n  ]\n}'
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

    sys_msg = SystemMessage(content="You are a strict JSON generator. Be extremely concise in thinking (maximum 1 short sentence inside <think>). Respond immediately with valid JSON.")
    message = HumanMessage(content=message_content)

    llm = ChatGroq(
        model=settings.GROQ_VISION_MODEL,
        groq_api_key=settings.GROQ_API_KEY,
        temperature=0.0
    )

    @retry_with_backoff(retries=3, backoff_in_seconds=5)
    def invoke_with_retry():
        return llm.invoke([sys_msg, message])

    try:
        res = invoke_with_retry()
        raw_text = res.content if isinstance(res.content, str) else str(res.content)
        
        # Clean think tags and markdown code blocks
        if "</think>" in raw_text:
            json_part = raw_text.split("</think>")[-1].strip()
        else:
            json_part = raw_text.strip()

        cleaned = re.sub(r"^```json\s*", "", json_part, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned).strip()

        match = re.search(r"(\{.*\})", cleaned, re.DOTALL)
        if match:
            cleaned = match.group(1)
        
        data = json.loads(cleaned)
        return [
            {
                "label": item.get("label", ""),
                "x_percent": float(item.get("x_percent", 0.0)),
                "y_percent": float(item.get("y_percent", 0.0)),
                "status": item.get("status", "met")
            }
            for item in data.get("features", [])
        ]
    except Exception as e:
        print(f"Error running panorama_agent: {str(e)}")
        # Return empty list in case of errors
        return []
