import os
from typing import List, Dict, Any
from pydantic import BaseModel, Field
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate
from app.config import settings
from app.agents.criteria_seed import CRITERIA_SEED

# Ensure API key is set in environment so LangChain can pick it up
if settings.GEMINI_API_KEY:
    os.environ["GOOGLE_API_KEY"] = settings.GEMINI_API_KEY

class CriteriaEvaluation(BaseModel):
    criteria_code: str = Field(description="Kode kriteria, contoh: SNI-8201-M1")
    status: str = Field(description="Status evaluasi: harus salah satu dari 'met', 'not_met', 'unknown', 'na'")
    reasoning: str = Field(description="Alasan evaluasi berdasarkan analisis teks nama/alamat gedung")

class TextAgentResult(BaseModel):
    evaluations: List[CriteriaEvaluation]

def run_text_agent(building_name: str, building_address: str) -> List[Dict[str, Any]]:
    """
    Evaluates accessibility criteria based on building name and address using Gemini.
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
            "Mengingat informasi tekstual sangat terbatas, Anda harus berhati-hati:\n"
            "- Gunakan status 'met' jika nama/alamat gedung mengindikasikan dengan sangat kuat kriteria tersebut dipenuhi (misalnya gedung modern bertingkat tinggi kemungkinan besar memiliki lift/elevator).\n"
            "- Gunakan status 'not_met' jika ada indikasi kuat bahwa kriteria tidak dipenuhi.\n"
            "- Gunakan status 'na' jika kriteria tidak relevan dengan tipe gedung ini (misalnya lift/elevator di gedung satu lantai).\n"
            "- Gunakan status 'unknown' jika tidak ada informasi sama sekali dari nama/alamat gedung yang bisa menentukan kriteria ini. Ini adalah status default yang paling aman jika Anda ragu.\n\n"
            "Daftar kriteria yang harus dievaluasi:\n{criteria_list}"
        )),
        ("user", "Nama Gedung: {building_name}\nAlamat Gedung: {building_address}")
    ])
    
    # Initialize Gemini model
    llm = ChatGoogleGenerativeAI(
        model="gemini-2.5-flash",
        google_api_key=settings.GEMINI_API_KEY,
        temperature=0.0
    )
    
    structured_llm = llm.with_structured_output(TextAgentResult)
    chain = prompt | structured_llm
    
    try:
        result: TextAgentResult = chain.invoke({
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
