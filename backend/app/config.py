import os
from pathlib import Path
from dotenv import load_dotenv

# Locate the .env file in the backend root directory (parent of app)
env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

class Settings:
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_SERVICE_KEY: str = os.getenv("SUPABASE_SERVICE_KEY", "")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    JWT_SECRET: str = os.getenv("JWT_SECRET", "super-secret-key-aksesibel")
    IP_HASH_SALT: str = os.getenv("IP_HASH_SALT", "default-ip-salt-value-for-security")
    MIN_VOTES_FOR_TRUSTED: int = int(os.getenv("MIN_VOTES_FOR_TRUSTED", "5"))
    UPVOTE_RATIO_TRUSTED: float = float(os.getenv("UPVOTE_RATIO_TRUSTED", "0.7"))
    REPORT_THRESHOLD: int = int(os.getenv("REPORT_THRESHOLD", "3"))

settings = Settings()

