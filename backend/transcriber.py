import os
import json
from typing import Dict, Any, Optional
from backend.config import settings

def transcribe_audio(audio_path: str, provider: Optional[str] = None) -> Dict[str, Any]:
    """
    Transcribes audio file using Groq Whisper (free/ultra-fast) or OpenAI Whisper.
    Returns: full_text, language, duration, segments (with start/end timestamps), provider.
    """
    if not os.path.exists(audio_path):
        return {
            "success": False,
            "error": f"Audio file not found: {audio_path}"
        }

    # Determine Provider
    selected_provider = provider
    if not selected_provider:
        if settings.GROQ_API_KEY:
            selected_provider = "groq"
        elif settings.OPENAI_API_KEY:
            selected_provider = "openai"
        else:
            selected_provider = "none"

    # 1. Groq Whisper (Recommended: 0.5s response, free tier)
    if selected_provider == "groq" and settings.GROQ_API_KEY:
        try:
            from groq import Groq
            client = Groq(api_key=settings.GROQ_API_KEY)
            
            with open(audio_path, "rb") as file:
                transcription = client.audio.transcriptions.create(
                    file=(os.path.basename(audio_path), file.read()),
                    model="whisper-large-v3-turbo",
                    response_format="verbose_json",
                    temperature=0.0
                )
            
            # Parse segments
            segments = []
            if hasattr(transcription, "segments") and transcription.segments:
                for seg in transcription.segments:
                    # seg can be dict or object
                    start = getattr(seg, 'start', None) if not isinstance(seg, dict) else seg.get('start')
                    end = getattr(seg, 'end', None) if not isinstance(seg, dict) else seg.get('end')
                    text = getattr(seg, 'text', '') if not isinstance(seg, dict) else seg.get('text', '')
                    segments.append({
                        "start": round(start, 2) if start is not None else 0.0,
                        "end": round(end, 2) if end is not None else 0.0,
                        "text": text.strip()
                    })

            full_text = getattr(transcription, "text", "") or ""
            if not full_text and isinstance(transcription, dict):
                full_text = transcription.get("text", "")
            if not full_text and segments:
                full_text = " ".join([s["text"] for s in segments if s.get("text")]).strip()
            
            language = getattr(transcription, "language", "en") if not isinstance(transcription, dict) else transcription.get("language", "en")

            return {
                "success": True,
                "full_text": full_text.strip(),
                "language": language,
                "duration": round(transcription.duration, 2) if hasattr(transcription, "duration") and transcription.duration else None,
                "segments": segments,
                "provider": "groq"
            }
        except Exception as e:
            return {"success": False, "error": f"Groq Whisper error: {str(e)}"}

    # 2. OpenAI Whisper
    elif selected_provider == "openai" and settings.OPENAI_API_KEY:
        try:
            from openai import OpenAI
            client = OpenAI(api_key=settings.OPENAI_API_KEY)
            
            with open(audio_path, "rb") as file:
                transcription = client.audio.transcriptions.create(
                    model="whisper-1",
                    file=file,
                    response_format="verbose_json"
                )
            
            segments = []
            if hasattr(transcription, "segments") and transcription.segments:
                for seg in transcription.segments:
                    start = getattr(seg, 'start', 0.0) if not isinstance(seg, dict) else seg.get('start', 0.0)
                    end = getattr(seg, 'end', 0.0) if not isinstance(seg, dict) else seg.get('end', 0.0)
                    text = getattr(seg, 'text', '') if not isinstance(seg, dict) else seg.get('text', '')
                    segments.append({
                        "start": round(start, 2),
                        "end": round(end, 2),
                        "text": text.strip()
                    })

            return {
                "success": True,
                "full_text": transcription.text.strip(),
                "language": getattr(transcription, "language", "en"),
                "duration": getattr(transcription, "duration", None),
                "segments": json.dumps(segments),
                "provider": "openai"
            }
        except Exception as e:
            return {"success": False, "error": f"OpenAI Whisper error: {str(e)}"}

    # 3. No API Key configured
    return {
        "success": False,
        "error": "No valid Whisper provider configured. Please provide a GROQ_API_KEY."
    }

# Alias for backward compatibility
transcribe_audio_file = transcribe_audio
