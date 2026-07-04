import os
from typing import List, Dict, Any
from pydantic import BaseModel, Field
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from app.config import settings
from app.agents.criteria_seed import CRITERIA_SEED

# Ensure API key is set in environment so LangChain can pick it up
if settings.GROQ_API_KEY:
    os.environ["GROQ_API_KEY"] = settings.GROQ_API_KEY

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
            "Tugas Anda adalah meninjau kriteria aksesibilitas yang masih berstatus 'unknown' setelah dievaluasi oleh Text Agent dan Visual Agent.\n\n"
            "Informasi Gedung:\n"
            "Nama Gedung: {building_name}\n"
            "Alamat Gedung: {building_address}\n\n"
            "Evaluasi Sebelumnya (dari Text & Visual Agent):\n{existing_evaluations}\n\n"
            "Kriteria 'unknown' yang Harus Anda Selesaikan:\n{unknown_criteria}\n\n"
            "Panduan Penyelesaian:\n"
            "- Analisis kombinasi informasi teks nama/alamat gedung dan alasan dari evaluasi agen sebelumnya.\n"
            "- Jika Anda bisa menarik kesimpulan logis apakah kriteria tersebut kemungkinan besar dipenuhi ('met'), tidak dipenuhi ('not_met'), atau tidak relevan ('na'), ubah statusnya dan jelaskan penalaran Anda.\n"
            "- Jika tidak ada cukup informasi logis untuk mengambil kesimpulan yang pasti dan valid (terutama untuk aspek netra/rungu yang sangat membutuhkan bukti fisik spesifik), tetap pertahankan statusnya sebagai 'unknown'. JANGAN memaksa membuat tebakan jika tidak logis.\n"
            "- Batasi penilaian Anda hanya pada daftar kriteria 'unknown' yang diberikan di atas."
        )),
        ("user", "Harap selesaikan kriteria 'unknown' di atas.")
    ])
    
    # Initialize Groq model
    llm = ChatGroq(
        model="llama-3.3-70b-versatile",
        groq_api_key=settings.GROQ_API_KEY,
        temperature=0.0
    )
    
    structured_llm = llm.with_structured_output(ResolverAgentResult)
    chain = prompt | structured_llm
    
    try:
        result: ResolverAgentResult = chain.invoke({
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
