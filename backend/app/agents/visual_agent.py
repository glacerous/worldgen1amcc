import os
from typing import List, Dict, Any
from pydantic import BaseModel, Field
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage
from app.config import settings
from app.agents.criteria_seed import CRITERIA_SEED

# Ensure API key is set in environment so LangChain can pick it up
if settings.GEMINI_API_KEY:
    os.environ["GOOGLE_API_KEY"] = settings.GEMINI_API_KEY

class CriteriaEvaluation(BaseModel):
    criteria_code: str = Field(description="Kode kriteria, contoh: SNI-8201-M1")
    status: str = Field(description="Status evaluasi: harus salah satu dari 'met', 'not_met', 'unknown', 'na'")
    reasoning: str = Field(description="Alasan evaluasi berdasarkan analisis visual dari foto")

class VisualAgentResult(BaseModel):
    evaluations: List[CriteriaEvaluation]

def run_visual_agent(photos: List[str]) -> List[Dict[str, Any]]:
    """
    Evaluates accessibility criteria based on photo evidence using Gemini-2.0-Flash (multimodal).
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
    
    # Append each photo URL
    for photo_url in photos:
        message_content.append({
            "type": "image_url",
            "image_url": {"url": photo_url}
        })
        
    message = HumanMessage(content=message_content)
    
    # Initialize Gemini model
    llm = ChatGoogleGenerativeAI(
        model="gemini-2.5-flash",
        google_api_key=settings.GEMINI_API_KEY,
        temperature=0.0
    )
    
    structured_llm = llm.with_structured_output(VisualAgentResult)
    
    try:
        result: VisualAgentResult = structured_llm.invoke([message])
        
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
                reasoning = "Kriteria tidak dievaluasi oleh model visual."
            
            output_results.append({
                "criteria_code": code,
                "status": status,
                "reasoning": reasoning,
                "source_agent": "visual_agent"
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
