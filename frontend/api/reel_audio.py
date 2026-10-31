"""Looks up a reel's audio link from India (Vercel's Mumbai region).

Instagram serves some reels without sound to the API server's US address. When
that happens the API asks this function, which only returns a link: the API still
downloads and processes the audio itself. Protected by REEL_HELPER_SECRET; without
it, or with a wrong one, every request gets a 404.
"""
import hmac
import json
import os
import re
import tempfile
from http.server import BaseHTTPRequestHandler

SHORTCODE = re.compile(r"^[A-Za-z0-9_-]{5,40}$")
MAX_BODY = 256 * 1024


def pick_audio(info):
    """The best format with sound: a separate audio track, else a video that includes audio."""
    formats = info.get("formats") or []
    audio_only = [f for f in formats if f.get("vcodec") == "none" and f.get("acodec") != "none" and f.get("url")]
    if audio_only:
        return audio_only[-1], "audio track"
    with_sound = [f for f in formats if f.get("acodec") != "none" and f.get("url")]
    return (with_sound[0], "video with sound") if with_sound else (None, None)


def lookup(shortcode, cookies=""):
    import yt_dlp  # slow to import, so only when a request is authorised

    cookie_path = None
    try:
        opts = {"quiet": True, "no_warnings": True, "noplaylist": True, "cachedir": False, "socket_timeout": 12}
        if cookies:
            handle, cookie_path = tempfile.mkstemp(suffix=".txt", dir="/tmp" if os.path.isdir("/tmp") else None)
            with os.fdopen(handle, "w") as f:
                f.write(cookies)
            opts["cookiefile"] = cookie_path
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(f"https://www.instagram.com/reel/{shortcode}/", download=False)
    finally:
        if cookie_path and os.path.exists(cookie_path):
            os.remove(cookie_path)

    chosen, kind = pick_audio(info)
    return {
        "has_audio": bool(chosen),
        "audio_url": chosen.get("url") if chosen else None,
        "kind": kind,
        "formats": [(f.get("format_id"), f.get("acodec"), f.get("vcodec")) for f in info.get("formats") or []][:15],
    }


class handler(BaseHTTPRequestHandler):
    def _send(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        secret = os.environ.get("REEL_HELPER_SECRET", "")
        given = self.headers.get("x-reel-helper-secret", "")
        if len(secret) < 16 or not hmac.compare_digest(secret.encode(), given.encode()):
            return self._send(404, {"error": "Not found"})
        length = int(self.headers.get("content-length") or 0)
        if length <= 0 or length > MAX_BODY:
            return self._send(400, {"error": "Bad request"})
        try:
            body = json.loads(self.rfile.read(length))
        except ValueError:
            return self._send(400, {"error": "Bad request"})
        shortcode = str(body.get("shortcode") or "")
        if not SHORTCODE.match(shortcode):
            return self._send(400, {"error": "Bad shortcode"})
        try:
            return self._send(200, lookup(shortcode, str(body.get("cookies") or "")))
        except Exception as err:
            return self._send(502, {"error": str(err)[:300]})

    def do_GET(self):
        self._send(404, {"error": "Not found"})
