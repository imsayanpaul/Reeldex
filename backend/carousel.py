"""Read ordered Instagram post images and retain their text individually."""
import subprocess

import httpx

from backend.downloader import _instagram_media_host
from backend.summarizer import extract_reel_insights


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
    if not _instagram_media_host(url):
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
