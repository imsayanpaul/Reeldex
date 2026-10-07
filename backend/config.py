import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="allow")

    # App Settings
    APP_NAME: str = "ReelDex Engine"
    DEBUG: bool = False
    PORT: int = 8000
    HOST: str = "0.0.0.0"
    
    # Meta / Instagram Webhook Configuration
    # No default: without it set, the webhook verify handshake always fails
    META_VERIFY_TOKEN: str = ""
    INSTAGRAM_PAGE_ACCESS_TOKEN: Optional[str] = None
    META_APP_SECRET: Optional[str] = None
    
    # AI Keys (Groq is recommended & free, or OpenAI)
    GROQ_API_KEY: Optional[str] = None
    OPENAI_API_KEY: Optional[str] = None
    
    # Frontend & Deployment
    FRONTEND_URL: str = "https://reeldex-io.vercel.app"
    # Comma-separated origins allowed to call the API ("*" = any; auth uses a
    # bearer token, not cookies, so credentials are never shared cross-site)
    CORS_ORIGINS: str = "*"
    
    # Storage & Paths
    DATABASE_URL: str = "sqlite:///./reeldex.db"
    AUDIO_DIR: str = "./downloads/audio"

settings = Settings()

# Ensure download directory exists
os.makedirs(settings.AUDIO_DIR, exist_ok=True)
