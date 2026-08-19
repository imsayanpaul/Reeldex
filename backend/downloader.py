import os
import re
import uuid
import yt_dlp
from typing import Dict, Any, Optional
from backend.config import settings

def extract_shortcode(url: str) -> Optional[str]:
    """Extract clean Instagram shortcode from reel/post/share URL, ignoring tracking parameters."""
    if not url:
        return None
    # Strip query parameters (?igsh=..., &utm_..., etc.)
    clean = url.split("?")[0].split("#")[0].strip().rstrip("/")
    patterns = [
        r"(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)",
        r"(?:https?:\/\/)?(?:www\.)?instagr\.am\/(?:p|reel)\/([A-Za-z0-9_-]+)",
        r"(?:https?:\/\/)?(?:www\.)?instagram\.com\/share\/reel\/([A-Za-z0-9_-]+)",
        r"(?:https?:\/\/)?(?:www\.)?instagram\.com\/share\/p\/([A-Za-z0-9_-]+)"
    ]
    for pattern in patterns:
        match = re.search(pattern, clean)
        if match:
            return match.group(1)
    return None

def normalize_instagram_url(url: str) -> str:
    """Ensure standard canonical reel URL format without tracking query parameters."""
    shortcode = extract_shortcode(url)
    if shortcode:
        return f"https://www.instagram.com/reel/{shortcode}/"
    return url.split("?")[0].split("#")[0].strip()

def download_audio_from_reel(url: str) -> Dict[str, Any]:
    """
    Downloads ONLY the audio stream from an Instagram Reel/Video using yt-dlp.
    Returns metadata dict with: audio_path, title, author, thumbnail, duration, shortcode.
    """
    clean_url = normalize_instagram_url(url)
    shortcode = extract_shortcode(clean_url) or str(uuid.uuid4())[:8]
    output_filename = f"reel_{shortcode}_{uuid.uuid4().hex[:6]}"
    output_template = os.path.join(settings.AUDIO_DIR, f"{output_filename}.%(ext)s")

    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': output_template,
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }],
        'quiet': True,
        'no_warnings': True,
        'noplaylist': True,
        'extract_flat': False,
        'socket_timeout': 15,
        'retries': 3,
        'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    }

    # Optional: If cookies file exists
    cookies_path = os.path.join(os.getcwd(), "instagram_cookies.txt")
    if os.path.exists(cookies_path):
        ydl_opts['cookiefile'] = cookies_path

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(clean_url, download=True)
            
            # The output file is converted to .mp3 by postprocessor
            audio_path = os.path.join(settings.AUDIO_DIR, f"{output_filename}.mp3")
            if not os.path.exists(audio_path):
                # Check for alternative extensions
                for ext in ["mp3", "m4a", "webm", "wav"]:
                    candidate = os.path.join(settings.AUDIO_DIR, f"{output_filename}.{ext}")
                    if os.path.exists(candidate):
                        audio_path = candidate
                        break

            return {
                "success": True,
                "audio_path": audio_path if os.path.exists(audio_path) else None,
                "title": info.get("title") or info.get("description", "Instagram Reel")[:60],
                "author": info.get("uploader") or info.get("channel") or "Instagram User",
                "thumbnail": info.get("thumbnail"),
                "duration": info.get("duration"),
                "shortcode": shortcode,
                "original_url": clean_url
            }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "shortcode": shortcode,
            "original_url": clean_url
        }
