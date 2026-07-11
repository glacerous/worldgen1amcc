import os
import base64
import time
import random
import logging
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
import httpx
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage
from app.config import settings
from app.agents.criteria_seed import CRITERIA_SEED

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

class CriteriaEvaluation(BaseModel):
    criteria_code: str = Field(description="Kode kriteria, contoh: SNI-8201-M1")
    status: str = Field(description="Status evaluasi: harus salah satu dari 'met', 'not_met', 'unknown', 'na'")
    reasoning: str = Field(description="Alasan evaluasi berdasarkan analisis visual dari foto")
    evidence_photo_index: Optional[int] = Field(None, description="Indeks foto (1-based, yaitu 1 untuk foto pertama, 2 untuk foto kedua, dst.) yang menjadi bukti utama kriteria ini. Gunakan null jika tidak ada.")

class VisualAgentResult(BaseModel):
    evaluations: List[CriteriaEvaluation]

def run_visual_agent(photos: List[str]) -> List[Dict[str, Any]]:
    """
    Evaluates accessibility criteria based on photo evidence using Groq's multimodal model.
    If no photos are provided, immediately bypasses LLM call and returns 'unknown'.
    """
    # Short-circuit if no photos are provided
    if not photos:
        return [
            {
                "criteria_code": c["code"],
                "status": "unknown",
                "reasoning": "Tidak ada foto bukti yang disediakan untuk analisis visual.",
                "source_agent": "visual_agent"
            }
            for c in CRITERIA_SEED
        ]
        
    # Format criteria list for instructions
    criteria_str = "\n".join([
        f"- {c['code']} ({c['category']}): {c['description']}" for c in CRITERIA_SEED
    ])
    
    # Prompt instruction
    system_instruction = (
        "Anda adalah Visual Agent dalam sistem audit aksesibilitas gedung.\n"
        "Tugas Anda adalah mendeteksi elemen aksesibilitas dalam rangkaian FOTO bukti yang dilampirkan.\n\n"
        f"Daftar kriteria yang harus dievaluasi:\n{criteria_str}\n\n"
        "Panduan Evaluasi:\n"
        "- Gunakan status 'met' jika Anda melihat bukti visual yang sangat jelas bahwa kriteria tersebut dipenuhi (misalnya: tampak ramp dengan kemiringan landai, pintu masuk lebar tanpa tangga, toilet difabel dengan grab bar, ubin pemandu di lantai, alarm strobo, dll).\n"
        "- Gunakan status 'not_met' jika Anda melihat bukti visual yang bertentangan (misalnya: pintu masuk utama hanya berupa tangga curam tanpa ramp sama sekali, toilet sempit, dll).\n"
        "- Gunakan status 'na' jika kriteria tidak relevan atau tidak berlaku pada tipe area/elemen yang difoto.\n"
        "- Gunakan status 'unknown' jika bukti visual pada foto tidak cukup jelas, terpotong, atau tidak menunjukkan elemen tersebut sama sekali. JANGAN menebak jika bukti tidak terlihat di foto.\n\n"
        "Sangat wajar jika kriteria tertentu (terutama kategori netra/rungu) menghasilkan status 'unknown' karena keterbatasan bukti visual dari foto statis. Jangan menebak-nebak."
    )
    
    # Formulate message content
    message_content = [
        {"type": "text", "text": system_instruction}
    ]
    
    # Append each photo as base64 image URL
    for photo_url in photos:
        try:
            b64_url = get_image_base64(photo_url)
            message_content.append({
                "type": "image_url",
                "image_url": {"url": b64_url}
            })
        except Exception as img_err:
            print(f"[warn] Gagal memproses gambar {photo_url}: {img_err}")
        
    message = HumanMessage(content=message_content)
    
    # Initialize Groq model
    llm = ChatGroq(
        model="meta-llama/llama-4-scout-17b-16e-instruct",
        groq_api_key=settings.GROQ_API_KEY,
        temperature=0.0
    )
    
    structured_llm = llm.with_structured_output(VisualAgentResult)
    
    @retry_with_backoff(retries=3, backoff_in_seconds=2)
    def invoke_with_retry():
        return structured_llm.invoke([message])
    
    try:
        result: VisualAgentResult = invoke_with_retry()
        
        # Parse output and map to the required output format
        evaluations_map = {item.criteria_code: item for item in result.evaluations}
        
        output_results = []
        for c in CRITERIA_SEED:
            code = c["code"]
            if code in evaluations_map:
                eval_item = evaluations_map[code]
                status = eval_item.status if eval_item.status in ["met", "not_met", "unknown", "na"] else "unknown"
                reasoning = eval_item.reasoning
                
                # Determine evidence_url dynamically based on index provided by AI
                evidence_url = None
                if eval_item.evidence_photo_index and 1 <= eval_item.evidence_photo_index <= len(photos):
                    evidence_url = photos[eval_item.evidence_photo_index - 1]
                elif photos:
                    # Fallback to the first photo if AI didn't specify an index
                    evidence_url = photos[0]
            else:
                status = "unknown"
                reasoning = "Kriteria tidak dievaluasi oleh model visual."
                evidence_url = None
            
            output_results.append({
                "criteria_code": code,
                "status": status,
                "reasoning": reasoning,
                "source_agent": "visual_agent",
                "evidence_url": evidence_url
            })
            
        return output_results
        
    except Exception as e:
        # Fallback if call fails
        return [
            {
                "criteria_code": c["code"],
                "status": "unknown",
                "reasoning": f"Gagal menjalankan visual_agent karena error: {str(e)}",
                "source_agent": "visual_agent"
            }
            for c in CRITERIA_SEED
        ]
