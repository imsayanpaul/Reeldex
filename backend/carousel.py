"""Read ordered Instagram post images and retain their text individually."""
import subprocess
from urllib.parse import urlsplit

import httpx

from backend.downloader import _instagram_media_host
from backend.summarizer import extract_reel_insights
from backend.config import settings


def preview_url(url):
    if not isinstance(url, str) or len(url) > 1000:
        return None
    parts = urlsplit(url)
    if _instagram_media_host(url) or (
        parts.scheme == "https" and parts.netloc == "lookaside.fbsbx.com"
        and parts.path.rstrip("/") == "/ig_messaging_cdn"
    ):
        return url
    return None


def shared_album_images(media_id):
    """Read album children in order. A partial page set is not a complete album."""
    token = settings.INSTAGRAM_PAGE_ACCESS_TOKEN
    if not token or not media_id.isascii() or not media_id.isdigit():
        return []
    with httpx.Client(timeout=5) as client:
        for host in ("graph.instagram.com", "graph.facebook.com"):
            params = {"fields": "media_type,media_url", "limit": 50}
            images, cursors = [], set()
            try:
                while True:
                    response = client.get(f"https://{host}/v21.0/{media_id}/children",
                                          headers={"Authorization": f"Bearer {token}"}, params=params)
                    if not response.is_success:
                        print(f"[Carousel] Album children via {host}: HTTP {response.status_code}")
                        break
                    page = response.json()
                    for child in page.get("data", []):
                        if child.get("media_type") == "VIDEO":
                            images.append(None)
                        elif child.get("media_type") == "IMAGE" and _instagram_media_host(child.get("media_url")):
                            images.append(child["media_url"])
                        else:
                            raise ValueError("Missing album image")
                    paging = page.get("paging", {})
                    if not paging.get("next"):
                        if images:
                            return images
                        break
                    cursor = paging.get("cursors", {}).get("after")
                    if not cursor or cursor in cursors or len(cursors) >= 20:
                        break
                    cursors.add(cursor)
                    params["after"] = cursor
            except (httpx.HTTPError, ValueError):
                continue
    return []


def post_images(shortcode):
    import instaloader

    loader = instaloader.Instaloader(max_connection_attempts=1, request_timeout=15)
    try:
        post = instaloader.Post.from_shortcode(loader.context, shortcode)
        if post.typename == "GraphVideo":
            return None
        if post.typename == "GraphImage":
            images = [post.url]
        elif post.typename == "GraphSidecar":
            images = [None if node.is_video else node.display_url for node in post.get_sidecar_nodes()]
        else:
            raise ValueError("Unknown Instagram post format.")
        if not images:
            raise ValueError("Instagram did not provide the slides.")
        return images, post.caption or "", post.owner_username
    finally:
        loader.close()


def read_slide(url):
    if not _instagram_media_host(url) and not preview_url(url):
        raise ValueError("Unexpected image host")
    image = bytearray()
    with httpx.stream("GET", url, timeout=20) as response:
        response.raise_for_status()
        for chunk in response.iter_bytes():
            if len(image) + len(chunk) > 12 * 1024 * 1024:
                raise ValueError("Slide exceeds image size limit")
            image.extend(chunk)
    result = subprocess.run(
        ["tesseract", "stdin", "stdout"], input=image, capture_output=True,
        timeout=35, check=True,
    )
    return result.stdout.decode("utf-8").strip()


def extract_slides(images, previous, save_progress):
    slides = []
    for number, url in enumerate(images, 1):
        old = next((s for s in previous if s["number"] == number and s["status"] == "read"), None)
        if old:
            slides.append(old)
            continue
        text = ""
        status = "video"
        if url:
            try:
                text = read_slide(url)
                status = "read" if text else "no_text"
            except (httpx.HTTPError, ValueError, subprocess.SubprocessError):
                status = "unreadable"
        slides.append({"number": number, "text": text, "status": status})
        save_progress(slides)
    return slides


def slide_insights(slides, title):
    source = "\n\n".join(f"Slide {s['number']}\n{s['text']}" for s in slides if s["text"])
    if not source:
        return "", {"summary": "No readable slide text was available."}
    notes = source
    while len(notes) > 18000:
        notes = "\n".join(extract_reel_insights(notes[i:i+12000], title, slides=True)["summary"][:3000]
                          for i in range(0, len(notes), 12000))
    return source, extract_reel_insights(notes, title, slides=True)
