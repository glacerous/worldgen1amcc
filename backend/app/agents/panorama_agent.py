import os
from typing import List, Dict, Any
from pydantic import BaseModel, Field
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage
from app.config import settings

# Ensure API key is set in environment so LangChain can pick it up
if settings.GEMINI_API_KEY:
    os.environ["GOOGLE_API_KEY"] = settings.GEMINI_API_KEY

class DetectedFeature(BaseModel):
    label: str = Field(description="Nama/label fitur aksesibilitas yang dideteksi, contoh: 'Ramp', 'Toilet Difabel', 'Tangga Akses', 'Ubin Pemandu (Tactile)', 'Pintu Otomatis'")
    x_percent: float = Field(description="Posisi horizontal fitur dalam persentase dari lebar gambar (0.0 sampai 100.0), dihitung dari kiri")
    y_percent: float = Field(description="Posisi vertikal fitur dalam persentase dari tinggi gambar (0.0 sampai 100.0), dihitung dari atas")

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
        "Untuk setiap fitur yang dideteksi, tentukan posisinya sebagai koordinat titik tengah fitur tersebut dalam persentase:\n"
        "- x_percent: Persentase horizontal (0.0 - 100.0), dihitung dari sisi paling kiri gambar ke kanan.\n"
        "- y_percent: Persentase vertikal (0.0 - 100.0), dihitung dari sisi paling atas gambar ke bawah.\n\n"
        "Lakukan analisis secara cermat dan kembalikan seluruh fitur yang terdeteksi dalam satu respon."
    )

    message_content = [
        {"type": "text", "text": prompt},
        {
            "type": "image_url",
            "image_url": {"url": panorama_url}
        }
    ]

    message = HumanMessage(content=message_content)

    llm = ChatGoogleGenerativeAI(
        model="gemini-2.5-flash",
        google_api_key=settings.GEMINI_API_KEY,
        temperature=0.0
    )

    structured_llm = llm.with_structured_output(PanoramaDetectionResult)

    try:
        result: PanoramaDetectionResult = structured_llm.invoke([message])
        return [
            {
                "label": item.label,
                "x_percent": item.x_percent,
                "y_percent": item.y_percent
            }
            for item in result.features
        ]
    except Exception as e:
        print(f"Error running panorama_agent: {str(e)}")
        # Return empty list in case of errors
        return []
