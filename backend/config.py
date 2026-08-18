import os
from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    # App Settings
    APP_NAME: str = "InstaM Transcriber"
    DEBUG: bool = True
    PORT: int = 8000
    HOST: str = "0.0.0.0"
    
    # Meta / Instagram Webhook Configuration
    META_VERIFY_TOKEN: str = "instam_secret_verify_token_2026"
    INSTAGRAM_PAGE_ACCESS_TOKEN: Optional[str] = None
    META_APP_SECRET: Optional[str] = None
    
    # AI Keys (Groq is recommended & free, or OpenAI)
    GROQ_API_KEY: Optional[str] = None
    OPENAI_API_KEY: Optional[str] = None
    
    # Frontend & Deployment
    FRONTEND_URL: str = "https://reeldex-one.vercel.app"
    
    # Storage & Paths
    DATABASE_URL: str = "sqlite:///./instam.db"
    AUDIO_DIR: str = "./downloads/audio"
    
    class Config:
        env_file = ".env"
        extra = "allow"

settings = Settings()

# Ensure download directory exists
os.makedirs(settings.AUDIO_DIR, exist_ok=True)
