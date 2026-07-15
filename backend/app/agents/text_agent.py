import os
import time
import random
import logging
from typing import List, Dict, Any
from pydantic import BaseModel, Field
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
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

class CriteriaEvaluation(BaseModel):
    criteria_code: str = Field(description="Kode kriteria, contoh: SNI-8201-M1")
    status: str = Field(description="Status evaluasi: harus salah satu dari 'met', 'not_met', 'unknown', 'na'")
    reasoning: str = Field(description="Alasan evaluasi berdasarkan analisis teks nama/alamat gedung")

class TextAgentResult(BaseModel):
    evaluations: List[CriteriaEvaluation]

def run_text_agent(building_name: str, building_address: str) -> List[Dict[str, Any]]:
    """
    Evaluates accessibility criteria based on building name and address using Groq.
    """
    # Format the criteria list for prompt context
    criteria_str = "\n".join([
        f"- {c['code']} ({c['category']}): {c['description']}" for c in CRITERIA_SEED
    ])
    
    # Define prompt template
    prompt = ChatPromptTemplate.from_messages([
        ("system", (
            "Anda adalah Text Agent dalam sistem audit aksesibilitas gedung.\n"
            "Tugas Anda adalah mengevaluasi apakah ada indikasi pemenuhan kriteria aksesibilitas berdasarkan NAMA dan ALAMAT gedung saja.\n\n"
            "Karena informasi tekstual sangat terbatas dan tidak ada bukti foto, Anda harus SANGAT konservatif:\n"
            "- Gunakan 'unknown' sebagai status DEFAULT untuk hampir semua kriteria fisik yang membutuhkan bukti visual.\n"
            "- Gunakan 'met' HANYA jika nama/alamat secara eksplisit mengindikasikan fasilitas tersebut ada dan tidak mungkin tidak ada secara fisik "
            "(contoh: 'Rumah Sakit X' → kemungkinan besar ada lift jika diketahui bertingkat; BUKAN berdasarkan asumsi merek atau reputasi).\n"
            "- Gunakan 'not_met' HANYA jika ada indikasi kuat dari nama/alamat bahwa fasilitas tidak ada.\n"
            "- Gunakan 'na' jika kriteria secara logis tidak relevan dengan tipe gedung ini.\n"
            "- JANGAN PERNAH membuat asumsi berdasarkan reputasi, brand, atau modernitas gedung "
            "('MRT pasti ada ramp', 'mall modern tentu ada lift'). Nama gedung bukan bukti.\n\n"
            "Daftar kriteria yang harus dievaluasi:\n{criteria_list}\n\n"
            "PENTING UNTUK REASONING (ANALISIS PENALARAN):\n"
            "- Tuliskan alasan secara ringkas dan jujur tentang apa yang bisa atau TIDAK BISA disimpulkan dari nama/alamat.\n"
            "- JANGAN menyalin teks deskripsi kriteria sebagai reasoning.\n"
            "- Hindari kata spekulatif: 'biasanya', 'kemungkinan besar', 'sepertinya', 'mungkin', 'pasti'.\n"
            "- Jika status 'unknown', tuliskan alasan seperti: 'Nama/alamat gedung tidak memberikan informasi yang cukup untuk menentukan ketersediaan [elemen].'"
        )),
        ("user", "Nama Gedung: {building_name}\nAlamat Gedung: {building_address}")
    ])
    
    # Initialize Groq model
    llm = ChatGroq(
        model="llama-3.3-70b-versatile",
        groq_api_key=settings.GROQ_API_KEY,
        temperature=0.0
    )
    
    structured_llm = llm.with_structured_output(TextAgentResult)
    chain = prompt | structured_llm
    
    @retry_with_backoff(retries=3, backoff_in_seconds=2)
    def invoke_with_retry(inputs):
        return chain.invoke(inputs)
    
    try:
        result: TextAgentResult = invoke_with_retry({
            "criteria_list": criteria_str,
            "building_name": building_name,
            "building_address": building_address
        })
        
        # Parse output and map to the required output format
        evaluations_map = {item.criteria_code: item for item in result.evaluations}
        
        output_results = []
        for c in CRITERIA_SEED:
            code = c["code"]
            if code in evaluations_map:
                eval_item = evaluations_map[code]
                status = eval_item.status if eval_item.status in ["met", "not_met", "unknown", "na"] else "unknown"
                reasoning = eval_item.reasoning
            else:
                status = "unknown"
                reasoning = "Kriteria tidak dievaluasi oleh model."
            
            output_results.append({
                "criteria_code": code,
                "status": status,
                "reasoning": reasoning,
                "source_agent": "text_agent"
            })
            
        return output_results
        
    except Exception as e:
        # Fallback if call fails
        return [
            {
                "criteria_code": c["code"],
                "status": "unknown",
                "reasoning": f"Gagal menjalankan text_agent karena error: {str(e)}",
                "source_agent": "text_agent"
            }
            for c in CRITERIA_SEED
        ]
