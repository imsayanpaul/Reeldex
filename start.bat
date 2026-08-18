@echo off
title ReelMind - Second Brain for Instagram Reels
echo ========================================================
echo   ReelMind - AI Knowledge Vault & Transcriber
echo ========================================================
echo.
echo [1] Groq Whisper & LLaMA 3.3 70B Active
echo [2] Instagram Direct Message Auto-Ingestion Active
echo [3] Hybrid Semantic Search & RAG AI Chat Ready
echo.
echo Launching ReelMind Dashboard on http://localhost:8000 ...
echo.
.\venv\Scripts\python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
pause
