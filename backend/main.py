import os
import sys

# Ensure UTF-8 output encoding on Windows consoles
try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='backslashreplace')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8', errors='backslashreplace')
except Exception:
    pass

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from backend.config import settings
from backend.database import engine, Base
from backend.routes import router as api_router

# Create Database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="ReelDex - Instagram Reel Transcription & DM Automation Engine",
    description="Extracts audio, transcribes Instagram Reels with Whisper, and handles Meta DM Webhooks.",
    version="1.0.0"
)

from fastapi.middleware.gzip import GZipMiddleware

# GZip compression (compresses JSON payloads 5x faster)
app.add_middleware(GZipMiddleware, minimum_size=500)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

# Include API Router
app.include_router(api_router, prefix="/api")

@app.get("/privacy")
def privacy_policy():
    return {
        "title": "Privacy Policy for ReelDex",
        "description": "ReelDex processes Instagram reels and messages solely to provide audio transcriptions. We do not store personal data or sell information to third parties.",
        "contact": "support@reeldex.io"
    }

@app.get("/terms")
def terms_of_service():
    return {
        "title": "Terms of Service for ReelDex",
        "description": "By using ReelDex, you agree to transcribe public media for personal use.",
        "contact": "support@reeldex.io"
    }

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "ReelDex.io Engine"}

# Serve Frontend static build if present
frontend_dist = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist")
if os.path.exists(frontend_dist):
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dist, "assets")), name="assets")
    
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        index_path = os.path.join(frontend_dist, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
        return {"message": "ReelDex API is running."}
else:
    @app.get("/")
    def root():
        return {
            "status": "online",
            "service": "ReelDex.io API Engine",
            "webhook_endpoint": "/api/webhook/instagram"
        }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host=settings.HOST, port=settings.PORT, reload=settings.DEBUG)
