"""Read ordered Instagram post images and retain their text individually."""
import subprocess
from urllib.parse import urlsplit

import httpx

from backend.downloader import _instagram_media_host
from backend.summarizer import extract_reel_insights
from backend.config import settings
from backend.instagram_bot import LOOKUP_HOSTS

# A post shared by DM whose link Instagram won't give us is saved under this
# placeholder instead of a post URL, and read from the DM's preview image.
MEDIA_PREFIX = "instagram-media:"


def media_placeholder(media_id):
    return f"{MEDIA_PREFIX}{media_id}"


def public_reel_url(url):
    """The link shown to users: never the internal placeholder."""
    return "" if isinstance(url, str) and url.startswith(MEDIA_PREFIX) else url


_SHORTCODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"


def shortcode_from_media_id(media_id):
    """Instagram's post shortcode is its numeric media id written in base 64.

    This only holds when the id is Instagram's own media id, which a DM share may or
    may not carry, so a guessed post must still be confirmed (see caption_matches).
    """
    if not isinstance(media_id, str) or not media_id.isascii() or not media_id.isdigit():
        return None
    number = int(media_id)
    code = ""
    while number:
        number, digit = divmod(number, 64)
        code = _SHORTCODE_ALPHABET[digit] + code
    return code or None


def looks_like_post_id(media_id):
    """Instagram's own post ids are 18-19 digits. DM shares carry Graph API ids instead
    (17 digits, like 18106657262648081), which don't convert to a shortcode."""
    return isinstance(media_id, str) and media_id.isascii() and media_id.isdigit() and len(media_id) >= 18


def _words(text):
    return " ".join(str(text or "").lower().replace("…", " ").replace("...", " ").split())


def caption_matches(share_text, caption):
    """True when the guessed post's caption starts like the text the DM share carried."""
    shared, full = _words(share_text), _words(caption)
    if len(shared) < 15 or not full:
        return False
    head = shared[:60].rsplit(" ", 1)[0] if len(shared) > 60 else shared
    return full.startswith(head)


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
        for host in LOOKUP_HOSTS:
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


def _best_image(item):
    candidates = (item.get("image_versions2") or {}).get("candidates") or []
    urls = [c for c in candidates if isinstance(c, dict) and _instagram_media_host(c.get("url"))]
    if not urls:
        return None
    return max(urls, key=lambda c: (c.get("width") or 0) * (c.get("height") or 0))["url"]


def _post_from_ytdlp(shortcode):
    """The post's slides via yt-dlp's logged-out Instagram query.

    instaloader's logged-out reads now fail for every post (BadResponseException), but the
    query yt-dlp uses still returns the post, including every carousel slide. yt-dlp itself
    only handles videos, so its extractor is asked for the post data and nothing else.
    """
    import yt_dlp
    from yt_dlp.extractor.instagram import InstagramIE

    class PostData(InstagramIE):
        product = None

        def _extract_product(self, product_info, *args, **kwargs):
            if self.product is None and isinstance(product_info, dict):
                self.product = product_info
            return super()._extract_product(product_info, *args, **kwargs)

    with yt_dlp.YoutubeDL({"quiet": True, "no_warnings": True, "skip_download": True, "socket_timeout": 20}) as ydl:
        reader = PostData(ydl)
        reader.extract(f"https://www.instagram.com/p/{shortcode}/")
    return slides_from_post_data(reader.product)


def slides_from_post_data(post):
    """(images, caption, owner) from Instagram's post data, or None for a single video."""
    if not post:
        raise ValueError("Instagram returned no post data")
    caption = (post.get("caption") or {}).get("text") or ""
    owner = (post.get("user") or {}).get("username")
    items = post.get("carousel_media")
    if not items:
        if post.get("media_type") == 2:
            return None  # a single video: the audio pipeline handles it
        items = [post]
    images = [None if item.get("media_type") == 2 else _best_image(item) for item in items]
    if not any(images):
        raise ValueError("Instagram did not provide the slides.")
    return images, caption, owner


def post_images(shortcode):
    """(slide image urls in order, caption, owner) for a post, or None for a video post."""
    try:
        return _post_from_ytdlp(shortcode)
    except Exception as error:
        print(f"[Carousel] yt-dlp post read failed: {type(error).__name__}: {str(error)[:200]}")
    return _post_from_instaloader(shortcode)


def _post_from_instaloader(shortcode):
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
    image = as_png_if_webp(bytes(image))
    result = subprocess.run(
        ["tesseract", "stdin", "stdout"], input=image, capture_output=True,
        timeout=35, check=True,
    )
    return result.stdout.decode("utf-8").strip()


def as_png_if_webp(image):
    """Instagram serves slides as WEBP, which Tesseract may not read: convert with ffmpeg."""
    if image[:4] != b"RIFF" or image[8:12] != b"WEBP":
        return image
    result = subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-i", "pipe:0", "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "pipe:1"],
        input=image, capture_output=True, timeout=30, check=True,
    )
    return result.stdout


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


def slide_insights(slides, title, caption=None):
    source = "\n\n".join(f"Slide {s['number']}\n{s['text']}" for s in slides if s["text"])
    if any(s.get("cover_only") for s in slides):
        # Only the cover was readable: summarise the cover and the caption, and nothing more
        if not source and not (caption or "").strip():
            return "", {"summary": "No readable slide text was available."}
        return source, extract_reel_insights(source, title, caption, slides=True, partial=True)
    if not source:
        return "", {"summary": "No readable slide text was available."}
    notes = source
    while len(notes) > 18000:
        notes = "\n".join(extract_reel_insights(notes[i:i+12000], title, slides=True)["summary"][:3000]
                          for i in range(0, len(notes), 12000))
    return source, extract_reel_insights(notes, title, slides=True)
