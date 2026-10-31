import os
import re
import uuid
import glob
import subprocess
import httpx
import yt_dlp
from typing import Dict, Any, Optional
from urllib.parse import urlparse
from backend.config import settings

MAX_HELPER_BYTES = 80 * 1024 * 1024

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

# yt-dlp's wording when the reel's video has no sound track at all
NO_AUDIO_ERRORS = ("unable to obtain file audio codec", "does not contain any stream", "output file is empty")


def _is_no_audio_error(message: str) -> bool:
    text = (message or "").lower()
    return any(needle in text for needle in NO_AUDIO_ERRORS)


def _remove_partials(output_filename: str) -> None:
    for leftover in glob.glob(os.path.join(settings.AUDIO_DIR, f"{output_filename}.*")):
        try:
            os.remove(leftover)
        except OSError:
            pass


def _extract_audio_directly(output_filename: str, shortcode: str) -> Optional[str]:
    """Pulls the sound out of a downloaded file with ffmpeg, without yt-dlp's codec check.
    Logs what the file really contains, so a failure explains itself. Returns the mp3 path or None."""
    target = os.path.join(settings.AUDIO_DIR, f"{output_filename}.mp3")
    files = [p for p in glob.glob(os.path.join(settings.AUDIO_DIR, f"{output_filename}.*"))
             if p != target and not p.endswith((".part", ".ytdl"))]
    if not files:
        print(f"[Downloader] {shortcode}: no downloaded file to read")
        return None
    source = max(files, key=os.path.getsize)
    try:
        probe = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,codec_name", "-of", "csv=p=0", source],
            capture_output=True, text=True, timeout=30,
        )
        print(f"[Downloader] {shortcode}: {os.path.getsize(source)} byte file, streams: "
              f"{probe.stdout.split()} {probe.stderr.strip()[:200]}")
        done = subprocess.run(
            ["ffmpeg", "-y", "-v", "error", "-i", source, "-vn", "-acodec", "libmp3lame", "-q:a", "4", target],
            capture_output=True, text=True, timeout=180,
        )
        if done.returncode == 0 and os.path.exists(target) and os.path.getsize(target) > 1024:
            print(f"[Downloader] {shortcode}: extracted the audio directly with ffmpeg")
            os.remove(source)
            return target
        print(f"[Downloader] {shortcode}: ffmpeg found no audio ({done.stderr.strip()[:200]})")
    except (OSError, subprocess.SubprocessError) as err:
        print(f"[Downloader] {shortcode}: couldn't read the file ({err})")
    if os.path.exists(target):
        os.remove(target)
    return None


def _instagram_media_host(url: str) -> bool:
    """Only Instagram's own media servers: the link comes over the network, so it's checked before use."""
    parts = urlparse(str(url or ""))
    host = (parts.hostname or "").lower()
    return parts.scheme == "https" and (
        host.endswith(".cdninstagram.com") or host.endswith(".fbcdn.net") or host == "cdninstagram.com")


def _audio_from_helper(shortcode: str, output_filename: str, cookie_path: Optional[str]) -> Optional[str]:
    """Asks the helper in Vercel's Mumbai region for the reel's audio link, then downloads it here.
    Off unless REEL_HELPER_SECRET is set. Returns the mp3 path or None."""
    secret = settings.REEL_HELPER_SECRET
    if not secret:
        return None
    url = settings.REEL_HELPER_URL or f"{settings.FRONTEND_URL.rstrip('/')}/api/reel_audio"
    cookies = ""
    if cookie_path and os.path.exists(cookie_path):
        with open(cookie_path) as f:
            cookies = f.read()
    source = os.path.join(settings.AUDIO_DIR, f"{output_filename}.helper")
    try:
        res = httpx.post(url, json={"shortcode": shortcode, "cookies": cookies},
                         headers={"x-reel-helper-secret": secret}, timeout=45.0)
        if res.status_code != 200:
            print(f"[Downloader] {shortcode}: helper answered {res.status_code}: {res.text[:200]}")
            return None
        data = res.json()
        print(f"[Downloader] {shortcode}: helper in India has_audio={data.get('has_audio')} "
              f"({data.get('kind')}). Formats: {data.get('formats')}")
        audio_url = data.get("audio_url")
        if not audio_url:
            return None
        if not _instagram_media_host(audio_url):
            print(f"[Downloader] {shortcode}: helper returned an unexpected host, ignored")
            return None
        size = 0
        with httpx.stream("GET", audio_url, timeout=60.0, follow_redirects=True) as media:
            if media.status_code != 200:
                print(f"[Downloader] {shortcode}: audio link answered {media.status_code}")
                return None
            with open(source, "wb") as out:
                for chunk in media.iter_bytes():
                    size += len(chunk)
                    if size > MAX_HELPER_BYTES:
                        raise ValueError("audio file too large")
                    out.write(chunk)
        extracted = _extract_audio_directly(output_filename, shortcode)
        if extracted:
            print(f"[Downloader] {shortcode}: recovered the audio through the helper in India")
        return extracted
    except (httpx.HTTPError, ValueError, OSError) as err:
        print(f"[Downloader] {shortcode}: helper failed ({str(err)[:200]})")
        return None
    finally:
        if os.path.exists(source):
            os.remove(source)


def _metadata(info: Dict[str, Any], shortcode: str, clean_url: str, audio_path: Optional[str]) -> Dict[str, Any]:
    return {
        "success": True,
        "audio_path": audio_path,
        "title": info.get("title") or (info.get("description") or "Instagram Reel")[:60],
        "caption": info.get("description") or "",
        # "channel" is the @handle on Instagram; "uploader" is the display name
        "author": info.get("channel") or info.get("uploader") or "Instagram User",
        "thumbnail": info.get("thumbnail"),
        "duration": info.get("duration"),
        "shortcode": shortcode,
        "original_url": clean_url,
    }


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
        'format': 'ba/b',
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

    # --- Cookie Authentication (handles age-restricted / login-gated reels) ---
    # Priority: 1) instagram_cookies.txt file  2) INSTAGRAM_COOKIES env var  3) INSTAGRAM_SESSION_ID env var
    cookies_path = os.path.join(os.getcwd(), "instagram_cookies.txt")
    
    # If no cookies file exists, try to generate one from environment variables (for Render/Docker)
    if not os.path.exists(cookies_path):
        env_cookies = os.environ.get("INSTAGRAM_COOKIES", "")
        env_session = os.environ.get("INSTAGRAM_SESSION_ID", "")
        
        if env_cookies:
            # Full Netscape cookie file content stored in env var
            try:
                with open(cookies_path, "w") as f:
                    f.write(env_cookies)
                print(f"[Cookie Auth] Written cookies file from INSTAGRAM_COOKIES env var")
            except Exception as e:
                print(f"[Cookie Auth] Failed to write cookies from env: {e}")
        elif env_session:
            # Just a sessionid — generate a minimal Netscape cookies file
            try:
                with open(cookies_path, "w") as f:
                    f.write("# Netscape HTTP Cookie File\n")
                    f.write(f".instagram.com\tTRUE\t/\tTRUE\t0\tsessionid\t{env_session}\n")
                print(f"[Cookie Auth] Generated cookies file from INSTAGRAM_SESSION_ID env var")
            except Exception as e:
                print(f"[Cookie Auth] Failed to write session cookie: {e}")
    
    if os.path.exists(cookies_path):
        ydl_opts['cookiefile'] = cookies_path
        print(f"[Cookie Auth] Using cookies from {cookies_path}")

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

            return _metadata(info, shortcode, clean_url, audio_path if os.path.exists(audio_path) else None)
    except Exception as e:
        if _is_no_audio_error(str(e)):
            # The check failed, but the file may still have sound: read it directly before giving up
            direct = _extract_audio_directly(output_filename, shortcode)
            if direct:
                try:
                    meta_opts = {k: v for k, v in ydl_opts.items() if k not in ("postprocessors", "format")}
                    with yt_dlp.YoutubeDL(meta_opts) as ydl:
                        info = ydl.extract_info(clean_url, download=False)
                    return _metadata(info, shortcode, clean_url, direct)
                except Exception as meta_error:
                    print(f"[Downloader] {shortcode}: got the audio but not the details ({str(meta_error)[:120]})")
                    return {"success": True, "audio_path": direct, "title": None, "caption": "", "author": None,
                            "thumbnail": None, "duration": None, "shortcode": shortcode, "original_url": clean_url}
            _remove_partials(output_filename)
            # Instagram sometimes serves a video-only file as "best". Ask for the sound track separately
            # and merge it before giving up on the audio.
            try:
                merged_opts = {**ydl_opts, 'format': 'bv*+ba/ba*'}
                with yt_dlp.YoutubeDL(merged_opts) as ydl:
                    info = ydl.extract_info(clean_url, download=True)
                audio_path = os.path.join(settings.AUDIO_DIR, f"{output_filename}.mp3")
                if os.path.exists(audio_path):
                    print(f"[Downloader] {shortcode}: recovered the audio from the separate sound track")
                    return _metadata(info, shortcode, clean_url, audio_path)
            except Exception as retry_error:
                print(f"[Downloader] {shortcode}: separate sound track failed too ({str(retry_error)[:120]})")
            _remove_partials(output_filename)
            # Instagram withholds some reels' sound from the server's region: ask from India
            helper_audio = _audio_from_helper(shortcode, output_filename, ydl_opts.get('cookiefile'))
            # Truly silent reel. Keep the metadata so the caption can still be summarised.
            try:
                meta_opts = {k: v for k, v in ydl_opts.items() if k not in ("postprocessors", "format")}
                with yt_dlp.YoutubeDL(meta_opts) as ydl:
                    info = ydl.extract_info(clean_url, download=False)
                if helper_audio:
                    return _metadata(info, shortcode, clean_url, helper_audio)
                result = _metadata(info, shortcode, clean_url, None)
                result["no_audio"] = True
                formats = [(f.get("format_id"), f.get("acodec"), f.get("vcodec")) for f in info.get("formats") or []]
                print(f"[Downloader] {shortcode} has no sound track; continuing with the caption only. Formats: {formats[:15]}")
                return result
            except Exception as meta_error:
                if helper_audio:
                    return {"success": True, "audio_path": helper_audio, "title": None, "caption": "", "author": None,
                            "thumbnail": None, "duration": None, "shortcode": shortcode, "original_url": clean_url}
                e = meta_error
        return {
            "success": False,
            "error": str(e),
            "shortcode": shortcode,
            "original_url": clean_url
        }
