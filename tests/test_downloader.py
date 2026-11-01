"""What happens when Instagram gives the server an empty answer for a reel."""
import importlib.util
import os

import pytest
import yt_dlp

from backend import downloader
from backend.config import settings

URL = "https://www.instagram.com/reel/DfBX-a1KydO/"
EMPTY_ANSWER = 'ERROR: [Instagram] DfBX-a1KydO: Failed to parse JSON (caused by JSONDecodeError("Expecting value"))'
INFO = {"title": "A reel", "description": "Caption", "channel": "maker", "duration": 12}


def fake_ytdl(calls, works_without_session=True):
    class FakeYoutubeDL:
        def __init__(self, params):
            self.params = params

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def extract_info(self, url, download=True):
            calls.append("cookiefile" in self.params)
            if "cookiefile" in self.params or not works_without_session:
                raise Exception(EMPTY_ANSWER)
            if download:
                path = self.params["outtmpl"].replace("%(ext)s", "mp3")
                with open(path, "wb") as f:
                    f.write(b"sound")
            return INFO

    return FakeYoutubeDL


@pytest.fixture
def server_with_session(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    (tmp_path / "instagram_cookies.txt").write_text("# Netscape HTTP Cookie File\n")
    monkeypatch.setattr(settings, "AUDIO_DIR", str(tmp_path))


def test_retries_without_the_saved_session(server_with_session, monkeypatch):
    calls = []
    monkeypatch.setattr(yt_dlp, "YoutubeDL", fake_ytdl(calls))
    monkeypatch.setattr(downloader, "_audio_from_helper", lambda *a, **k: pytest.fail("helper not needed"))
    result = downloader.download_audio_from_reel(URL)
    assert calls == [True, False]
    assert result["success"] and os.path.exists(result["audio_path"])
    assert result["caption"] == "Caption"


def test_asks_the_helper_when_the_server_cannot_read_the_reel(server_with_session, monkeypatch, tmp_path):
    monkeypatch.setattr(yt_dlp, "YoutubeDL", fake_ytdl([], works_without_session=False))
    audio = tmp_path / "helper.mp3"
    audio.write_bytes(b"sound")

    def helper(shortcode, output_filename, cookie_path, details=None):
        details.update({**INFO, "has_audio": True})
        return str(audio)

    monkeypatch.setattr(downloader, "_audio_from_helper", helper)
    result = downloader.download_audio_from_reel(URL)
    assert result["success"] and result["audio_path"] == str(audio)
    assert result["author"] == "maker" and result["caption"] == "Caption"


def test_helper_finding_no_sound_keeps_the_caption(server_with_session, monkeypatch):
    monkeypatch.setattr(yt_dlp, "YoutubeDL", fake_ytdl([], works_without_session=False))

    def helper(shortcode, output_filename, cookie_path, details=None):
        details.update({**INFO, "has_audio": False})
        return None

    monkeypatch.setattr(downloader, "_audio_from_helper", helper)
    result = downloader.download_audio_from_reel(URL)
    assert result["success"] and result["no_audio"] and result["audio_path"] is None
    assert result["caption"] == "Caption"


def test_failure_reads_like_a_sentence(server_with_session, monkeypatch):
    monkeypatch.setattr(yt_dlp, "YoutubeDL", fake_ytdl([], works_without_session=False))
    monkeypatch.setattr(downloader, "_audio_from_helper", lambda *a, **k: None)
    result = downloader.download_audio_from_reel(URL)
    assert result["success"] is False
    assert "try again" in result["error"] and "JSON" not in result["error"]


def test_other_errors_stay_as_they_are():
    assert downloader._readable_error("This reel is private") == "This reel is private"


def test_helper_retries_without_cookies_and_returns_details(monkeypatch):
    path = os.path.join(os.path.dirname(__file__), "..", "frontend", "api", "reel_audio.py")
    spec = importlib.util.spec_from_file_location("reel_audio", path)
    reel_audio = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(reel_audio)

    calls = []
    formats = [{"format_id": "a", "acodec": "aac", "vcodec": "none", "url": "https://x.cdninstagram.com/a"}]

    class FakeYoutubeDL:
        def __init__(self, params):
            self.params = params

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def extract_info(self, url, download=True):
            calls.append("cookiefile" in self.params)
            if "cookiefile" in self.params:
                raise Exception(EMPTY_ANSWER)
            return {**INFO, "formats": formats}

    monkeypatch.setattr(yt_dlp, "YoutubeDL", FakeYoutubeDL)
    result = reel_audio.lookup("DfBX-a1KydO", "# cookies")
    assert calls == [True, False]
    assert result["has_audio"] and result["description"] == "Caption"
