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
    criteria_code: str = Field(description="Kode kriteria yang dievaluasi")
    status: str = Field(description="Status resolusi baru: harus salah satu dari 'met', 'not_met', 'unknown', 'na'")
    reasoning: str = Field(description="Penalaran logis akhir untuk status kriteria tersebut")

class ResolverAgentResult(BaseModel):
    evaluations: List[CriteriaEvaluation]

def run_resolver_agent(
    building_name: str,
    building_address: str,
    existing_results: List[Dict[str, Any]],
    unknown_codes: List[str]
) -> List[Dict[str, Any]]:
    """
    Tries to resolve criteria that are still 'unknown' using Groq's Llama-3.3-70b-versatile model.
    """
    # If there are no unknown criteria, return empty list immediately
    if not unknown_codes:
        return []
        
    # Get criteria details for the unknown ones
    unknown_criteria_list = [c for c in CRITERIA_SEED if c["code"] in unknown_codes]
    unknown_criteria_str = "\n".join([
        f"- {c['code']} ({c['category']}): {c['description']}" for c in unknown_criteria_list
    ])
    
    # Format existing evaluations to pass as context
    existing_evals_str = "\n".join([
        f"- {r['criteria_code']} (Status: {r['status']}) [Sumber: {r['source_agent']}]: {r['reasoning']}"
        for r in existing_results
    ])
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", (
            "Anda adalah Resolver Agent dalam sistem audit aksesibilitas gedung.\n"
            "Tugas Anda adalah meninjau kriteria yang masih berstatus 'unknown' setelah dievaluasi oleh Text Agent dan Visual Agent.\n\n"
            "Informasi Gedung:\n"
            "Nama Gedung: {building_name}\n"
            "Alamat Gedung: {building_address}\n\n"
            "Evaluasi Sebelumnya (dari Text & Visual Agent):\n{existing_evaluations}\n\n"
            "Kriteria 'unknown' yang Harus Anda Tinjau:\n{unknown_criteria}\n\n"
            "ATURAN KETAT YANG WAJIB DIIKUTI:\n\n"
            "1. LARANGAN MUTLAK — Jangan pernah membuat kesimpulan berdasarkan:\n"
            "   - Reputasi atau nama brand gedung ('MRT pasti...', 'mall modern tentu...', 'rumah sakit sudah pasti...')\n"
            "   - Asumsi umum tipe bangunan tanpa bukti konkret dari foto atau teks evaluasi sebelumnya\n"
            "   - Perkiraan atau tebakan apapun yang tidak berdasar pada bukti yang sudah dievaluasi agen lain\n\n"
            "2. ATURAN FOTO (visual_agent) — Jika visual_agent mengembalikan 'unknown' untuk suatu kriteria:\n"
            "   - Artinya FOTO SUDAH DIPERIKSA tetapi buktinya tidak cukup jelas atau elemen tidak terlihat\n"
            "   - JANGAN mengubah 'unknown' menjadi 'met' hanya karena gedungnya terkenal atau besar\n"
            "   - Jika visual_agent menyebutkan elemen TIDAK TERLIHAT di foto → ubah ke 'not_met'\n"
            "   - Jika visual_agent tidak menemukan bukti → pertahankan 'unknown'\n\n"
            "3. KAPAN BOLEH MEMBUAT KESIMPULAN:\n"
            "   - 'not_met': jika ada bukti eksplisit dari visual_agent atau text_agent bahwa elemen tidak ada\n"
            "     (contoh: visual_agent menyebut 'hanya ada tangga' → M1 = not_met)\n"
            "   - 'na': jika kriteria secara logis tidak mungkin berlaku pada gedung ini\n"
            "     (contoh: gedung berlantai 1 → M4 elevator = na)\n"
            "   - 'met': HANYA jika ada konfirmasi eksplisit dari evaluasi agen sebelumnya, BUKAN asumsi\n\n"
            "4. JIKA RAGU → pertahankan 'unknown'. Lebih baik jujur tidak tahu daripada memberi nilai palsu.\n\n"
            "PENTING UNTUK REASONING:\n"
            "- Tulis reasoning yang mengacu spesifik pada hasil visual_agent atau text_agent di atas\n"
            "- Jelaskan MENGAPA Anda mengambil kesimpulan tersebut berdasarkan bukti yang ada\n"
            "- Jangan salin deskripsi kriteria sebagai reasoning\n"
            "- Jangan gunakan kata spekulatif: 'biasanya', 'mungkin', 'sepertinya', 'kemungkinan besar', 'pasti'"
        )),
        ("user", "Harap tinjau kriteria 'unknown' di atas sesuai aturan ketat yang diberikan.")
    ])
    
    # Initialize Groq model
    llm = ChatGroq(
        model=settings.GROQ_TEXT_MODEL,
        groq_api_key=settings.GROQ_API_KEY,
        temperature=0.0
    )
    
    structured_llm = llm.with_structured_output(ResolverAgentResult)
    chain = prompt | structured_llm
    
    @retry_with_backoff(retries=3, backoff_in_seconds=2)
    def invoke_with_retry(inputs):
        return chain.invoke(inputs)
    
    try:
        result: ResolverAgentResult = invoke_with_retry({
            "building_name": building_name,
            "building_address": building_address or "Tidak ada alamat",
            "existing_evaluations": existing_evals_str,
            "unknown_criteria": unknown_criteria_str
        })
        
        evaluations_map = {item.criteria_code: item for item in result.evaluations}
        
        output_results = []
        for code in unknown_codes:
            if code in evaluations_map:
                eval_item = evaluations_map[code]
                status = eval_item.status if eval_item.status in ["met", "not_met", "unknown", "na"] else "unknown"
                reasoning = eval_item.reasoning
            else:
                status = "unknown"
                reasoning = "Kriteria tidak terselesaikan oleh model resolver."
                
            output_results.append({
                "criteria_code": code,
                "status": status,
                "reasoning": reasoning,
                "source_agent": "resolver_agent"
            })
            
        return output_results
        
    except Exception as e:
        # Fallback if call fails
        return [
            {
                "criteria_code": code,
                "status": "unknown",
                "reasoning": f"Gagal menjalankan resolver_agent karena error: {str(e)}",
                "source_agent": "resolver_agent"
            }
            for code in unknown_codes
        ]
