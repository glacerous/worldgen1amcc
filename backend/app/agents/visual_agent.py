import os
import re
import json
import base64
import time
import random
import logging
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
import httpx
from langchain_groq import ChatGroq
from langchain_core.messages import SystemMessage, HumanMessage
from app.config import settings
from app.agents.criteria_seed import CRITERIA_SEED

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

class CriteriaEvaluation(BaseModel):
    criteria_code: str = Field(description="Kode kriteria, contoh: SNI-8201-M1")
    status: str = Field(description="Status evaluasi: harus salah satu dari 'met', 'not_met', 'unknown', 'na'")
    reasoning: str = Field(description="Alasan evaluasi berdasarkan analisis visual dari foto")
    evidence_photo_index: int = Field(0, description="Indeks foto (1-based, yaitu 1 untuk foto pertama, 2 untuk foto kedua, dst.) yang menjadi bukti utama kriteria ini. Gunakan 0 jika tidak ada.")

class VisualAgentResult(BaseModel):
    evaluations: list[CriteriaEvaluation]

def run_visual_agent(photos: List[str]) -> List[Dict[str, Any]]:
    """
    Evaluates accessibility criteria based on photo evidence using Groq's multimodal model.
    If no photos are provided, immediately bypasses LLM call and returns 'unknown'.
    Evaluations are processed in batches to prevent TPM (Tokens Per Minute) limit issues.
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
        
    # Prepare image message parts
    image_contents = []
    for photo_url in photos:
        try:
            b64_url = get_image_base64(photo_url)
            image_contents.append({
                "type": "image_url",
                "image_url": {"url": b64_url}
            })
        except Exception as img_err:
            print(f"[warn] Gagal memproses gambar {photo_url}: {img_err}")

    # Initialize Groq model
    llm = ChatGroq(
        model=settings.GROQ_VISION_MODEL,
        groq_api_key=settings.GROQ_API_KEY,
        temperature=0.0
    )

    # Process criteria in batches of 6 to fit under Groq TPM limits
    batch_size = 6
    evaluations_map = {}

    for i in range(0, len(CRITERIA_SEED), batch_size):
        batch_criteria = CRITERIA_SEED[i:i + batch_size]
        criteria_str = "\n".join([
            f"- {c['code']} ({c['category']}): {c['description']}" for c in batch_criteria
        ])

        system_instruction = (
            "Anda adalah Visual Agent audit aksesibilitas gedung.\n"
            "Evaluasi kriteria aksesibilitas berikut berdasarkan foto bukti yang diberikan:\n\n"
            f"{criteria_str}\n\n"
            "Aturan evaluasi:\n"
            "- 'met': Terdapat bukti visual yang jelas bahwa kriteria terpenuhi.\n"
            "- 'not_met': Terdapat bukti visual bahwa kriteria tidak terpenuhi.\n"
            "- 'unknown': Bukti visual tidak terlihat jelas atau tidak mencakup kriteria ini.\n"
            "- 'na': Kriteria tidak relevan dengan tipe lokasi.\n"
            "Berikan reasoning faktual berdasarkan pengamatan foto tanpa menyalin deskripsi kriteria.\n\n"
            "Kembalikan HANYA format JSON murni berikut tanpa penjelasan ekstra:\n"
            '{\n  "evaluations": [\n    {"criteria_code": "KODE", "status": "met|not_met|unknown|na", "reasoning": "...", "evidence_photo_index": 1}\n  ]\n}'
        )

        sys_msg = SystemMessage(content="You are a strict JSON generator. Be extremely concise in thinking (maximum 1 short sentence inside <think>). Respond immediately with valid JSON.")
        message_content = [{"type": "text", "text": system_instruction}] + image_contents
        message = HumanMessage(content=message_content)

        @retry_with_backoff(retries=3, backoff_in_seconds=5)
        def invoke_batch():
            return llm.invoke([sys_msg, message])

        try:
            res = invoke_batch()
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
            for item in data.get("evaluations", []):
                eval_obj = CriteriaEvaluation(
                    criteria_code=item.get("criteria_code", ""),
                    status=item.get("status", "unknown"),
                    reasoning=item.get("reasoning", ""),
                    evidence_photo_index=item.get("evidence_photo_index", 0) or 0
                )
                evaluations_map[eval_obj.criteria_code] = eval_obj
        except Exception as batch_err:
            print(f"[warn] Batch {i // batch_size + 1} failed: {batch_err}")
            for c in batch_criteria:
                evaluations_map[c["code"]] = CriteriaEvaluation(
                    criteria_code=c["code"],
                    status="unknown",
                    reasoning=f"Gagal mengevaluasi kriteria secara visual: {str(batch_err)}",
                    evidence_photo_index=0
                )
        
        # Short sleep between batches to stay under TPM limits
        time.sleep(2.0)

    # Build final output results
    output_results = []
    for c in CRITERIA_SEED:
        code = c["code"]
        if code in evaluations_map:
            eval_item = evaluations_map[code]
            status = eval_item.status if eval_item.status in ["met", "not_met", "unknown", "na"] else "unknown"
            reasoning = eval_item.reasoning
            
            evidence_url = None
            if status not in ["unknown", "na"]:
                if eval_item.evidence_photo_index and 1 <= eval_item.evidence_photo_index <= len(photos):
                    evidence_url = photos[eval_item.evidence_photo_index - 1]
                elif photos:
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
