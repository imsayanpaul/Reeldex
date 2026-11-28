import os
import re
import json
import uuid
import hmac
import datetime
import random
import urllib.request

import httpx
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query, Request, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import desc, or_
from sqlalchemy.exc import IntegrityError

from backend.database import get_db
from backend.models import ReelItem, Transcript, User, PairingCode, Collection, SavedChat, WebhookEvent, Feedback, ActivityDay
from backend.downloader import download_audio_from_reel, normalize_instagram_url, extract_shortcode
from backend.carousel import (
    post_images, extract_slides, slide_insights, shared_album_images, preview_url,
    MEDIA_PREFIX, media_placeholder, public_reel_url, shortcode_from_media_id, caption_matches,
    looks_like_post_id,
)
from backend.transcriber import transcribe_audio_file
from backend.summarizer import (
    extract_reel_insights, clean_caption, caption_is_useful, has_real_speech, readable_title, CATEGORIES,
)
from backend.search import rank_reels_search, ask_reels_ai
from backend.instagram_bot import send_instagram_dm, send_instagram_dm_sync, parse_webhook_payload, fetch_instagram_username, resolve_shared_post, shared_message_links
from backend.auth import (
    read_token, require_user, owned_reels, get_owned_reel, verify_meta_signature, rate_limit, touch_last_seen,
)
from backend.config import settings
from backend import usage

router = APIRouter()

IN_FLIGHT = ("processing", "downloading", "transcribing")
SHORTCODE_RE = re.compile(r"^[A-Za-z0-9_-]{4,40}$")


# --- Helpers ---
def get_or_create_user(db: Session, auth_token: Optional[str] = None, sender_id: Optional[str] = None, sender_username: Optional[str] = None) -> User:
    """Finds a user by token or Instagram sender id, or provisions one.

    Only /auth/session (web guests) and the Instagram webhook (DM senders) may
    create accounts; every other endpoint uses `require_user`.
    """
    user = None
    if auth_token:
        user = db.query(User).filter(User.auth_token == auth_token).first()

    if not user and sender_id:
        user = db.query(User).filter(User.instagram_sender_id == sender_id).first()
        if not user:
            user = User(
                display_name=sender_username or f"Instagram @{sender_id[-4:]}",
                instagram_sender_id=sender_id,
                instagram_username=sender_username,
                auth_token=f"rm_{uuid.uuid4().hex}",
            )
            db.add(user)
            db.commit()
            db.refresh(user)

    if not user:
        user = User(display_name="ReelDex Explorer", auth_token=f"rm_{uuid.uuid4().hex}")
        db.add(user)
        db.commit()
        db.refresh(user)

    return user


def vault_link(user: Optional[User], reel_id: Optional[int] = None) -> str:
    base = (settings.FRONTEND_URL or "https://reeldex-io.vercel.app").rstrip("/")
    if not user:
        return base
    link = f"{base}/?token={user.auth_token}"
    return f"{link}&new_reel={reel_id}" if reel_id else link


def thumb_for(reel: ReelItem) -> Optional[str]:
    return f"/api/thumbnail/{reel.shortcode}" if reel.shortcode else (reel.thumbnail_url or None)


# Marks a transcript whose reel came without a sound track, which almost always means
# Instagram sent a degraded file, not that the reel is silent
NO_AUDIO = "no-audio"


def speech_flags(r: ReelItem) -> Dict[str, bool]:
    """no_speech: processed but nobody talks. from_caption: the summary came from the caption instead.
    audio_missing: Instagram didn't send the sound, so we can't tell whether anyone talks."""
    t = r.transcript
    if r.slides:
        return dict(no_speech=False, audio_missing=False, from_caption=False)
    audio_missing = r.status == "completed" and t is not None and t.language == NO_AUDIO
    no_speech = r.status == "completed" and t is not None and not audio_missing and not has_real_speech(t.full_text)
    from_caption = (no_speech or audio_missing) and caption_is_useful(clean_caption(r.caption))
    return {"no_speech": no_speech, "audio_missing": audio_missing, "from_caption": from_caption}


def reel_card(r: ReelItem) -> Dict[str, Any]:
    """List view of a reel: everything the cards and search need, without full transcripts."""
    t = r.transcript
    return {
        "id": r.id,
        "reel_url": public_reel_url(r.reel_url),
        "shortcode": r.shortcode,
        "title": r.title or (f"Reel {r.shortcode}" if r.shortcode else f"Reel #{r.id}"),
        "author": r.author,
        "thumbnail_url": thumb_for(r),
        "duration": r.duration,
        "collection_id": r.collection_id,
        "collection_name": r.collection.name if r.collection else None,
        "collection_emoji": r.collection.emoji if r.collection else None,
        "source": r.source,
        "sender_username": r.sender_username,
        "category": r.category or "General Knowledge",
        "tags": r.tags or [],
        "action_items": r.action_items or [],
        "status": r.status,
        "error_message": r.error_message,
        "created_at": r.created_at.isoformat() if r.created_at else "",
        "slide_count": len(r.slides or []),
        "has_transcript": bool(t),
        "language": t.language if t else "en",
        "preview_text": t.full_text[:140] if t and t.full_text else "",
        "summary": t.summary if t else "",
        "translated_summary": t.translated_summary if t else None,
        **speech_flags(r),
    }


USERNAME_RETRY_AFTER = datetime.timedelta(days=7)


def fill_instagram_username(user_id: int, sender_id: str) -> None:
    """Background task: look up and store the @username for a linked user who has none yet."""
    from backend.database import SessionLocal
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user or user.instagram_username or user.instagram_sender_id != sender_id:
            return
        failed = user.username_lookup_failed_at
        if failed and datetime.datetime.utcnow() - failed < USERNAME_RETRY_AFTER:
            return  # Instagram had no @username for this account recently; don't ask again yet
        username = fetch_instagram_username(sender_id)
        if username:
            user.instagram_username = username
            user.username_lookup_failed_at = None
            if not user.display_name or user.display_name.startswith(("Instagram @", "ReelDex Explorer", "ReelMind Explorer")):
                user.display_name = username
        else:
            user.username_lookup_failed_at = datetime.datetime.utcnow()
        db.commit()
    except Exception as e:
        print(f"[Username] Lookup failed for user #{user_id}: {e}")
        db.rollback()
    finally:
        db.close()


NO_SPEECH_TIP = (
    "💡 ReelDex works best with reels where someone explains something, like tips, tutorials, "
    "reviews or recipes. Send one of those and I'll pull out the key points."
)


def already_saved_message(user: Optional[User], reel: ReelItem) -> str:
    """Reply for a reel the sender has already saved (or is still being saved)."""
    if reel.status in IN_FLIGHT:
        return "⏳ I'm still saving this reel from your last message. I'll DM you as soon as it's ready."
    title = reel.title or "this reel"
    saved = f" on {reel.created_at.day} {reel.created_at.strftime('%b')}" if reel.created_at else ""
    return f"📌 You've already saved this one{saved}!\n\n🎬 {title}\n\n🔗 Open it in your vault:\n{vault_link(user, reel.id)}"


def reply_in_dm(db: Session, reel: ReelItem, sender_id: Optional[str], source: str, replaced: int = 0):
    """Sends the 'saved to your ReelDex' DM once per reel."""
    if source != "instagram_dm" or not sender_id or not settings.INSTAGRAM_PAGE_ACCESS_TOKEN or reel.dm_replied:
        return
    user = db.query(User).filter(User.id == reel.user_id).first() if reel.user_id else None
    creator = f" by @{reel.author}" if reel.author else ""
    flags = speech_flags(reel)
    head = f"✨ Saved to your ReelDex!\n\n🎬 {reel.title or 'Instagram Reel'}{creator}\n"
    link = vault_link(user, reel.id)
    if reel.slides and any(s.get("cover_only") for s in reel.slides):
        # Instagram doesn't say how many slides a shared post has, so this goes to every
        # shared post: the cover is saved either way, and the link gets the rest
        msg = (
            f"{head}\n📌 I saved the first slide.\n\n"
            "Has this post got more than one slide? When you share a post, Instagram only sends me the first one. "
            "To save every slide, send me the link instead:\n\n"
            "1️⃣ Open the post on Instagram\n"
            "2️⃣ Tap ✈️ (share) or ⋯\n"
            "3️⃣ Tap \"Copy link\"\n"
            "4️⃣ Paste the link here\n\n"
            "I'll read every slide and replace this copy, so you'll still have just one.\n\n"
            f"🔗 View it:\n{link}"
        )
    elif reel.slides:
        count = sum(1 for s in reel.slides if s["text"])
        upgraded = "\nThis replaces the cover-only version you shared earlier.\n" if replaced else ""
        msg = f"{head}\nRead {count} of {len(reel.slides)} slides. Open the slide text and summary:\n{link}{upgraded}"
    elif flags["audio_missing"]:
        summary_note = "so I summarised it from the caption instead" if flags["from_caption"] else "so I couldn't summarise it"
        msg = (
            f"{head}\n🎧 Instagram wouldn't give me this reel's audio, which can happen with licensed music, {summary_note}.\n\n"
            f"🔗 View it:\n{link}"
        )
    elif flags["from_caption"]:
        msg = (
            f"{head}🏷️ [{reel.category or 'General Knowledge'}]\n\n"
            "🔇 No one really talks in this reel, so I summarised it from the caption instead.\n\n"
            f"🔗 View it:\n{link}"
        )
    elif flags["no_speech"]:
        msg = (
            f"{head}\n🔇 No one really talks in this reel. It's just music or visuals, so there's nothing to summarise.\n\n"
            f"{NO_SPEECH_TIP}\n\n🔗 View it:\n{link}"
        )
    else:
        msg = (
            f"{head}🏷️ [{reel.category or 'General Knowledge'}]\n\n🔗 View summary & transcript:\n{link}"
        )
    reel.dm_replied = send_instagram_dm_sync(sender_id, msg)
    db.commit()


def reply_failed_in_dm(db: Session, reel: ReelItem, sender_id: Optional[str], source: str):
    """Tells the sender when a reel couldn't be saved, so a DM never goes unanswered."""
    if source != "instagram_dm" or not sender_id or not settings.INSTAGRAM_PAGE_ACCESS_TOKEN or reel.dm_replied:
        return
    try:
        user = db.query(User).filter(User.id == reel.user_id).first() if reel.user_id else None
        msg = (
            "😕 I couldn't save this reel. It may be private, removed, or Instagram blocked the download.\n\n"
            f"You can retry it from your vault:\n{vault_link(user, reel.id)}"
        )
        reel.dm_replied = send_instagram_dm_sync(sender_id, msg)
        db.commit()
    except Exception as dm_error:
        print(f"[DM] Couldn't send the failure reply for reel #{reel.id}: {dm_error}")


# --- Background Processing Worker ---
def process_reel_pipeline(reel_id: int, reel_url: str, sender_id: Optional[str] = None, source: str = "web_ui", user_id: Optional[int] = None, preview: Optional[str] = None):
    """
    1. Global cache: if anyone already processed this reel, reuse it (0 tokens).
    2. In-flight lock: if another worker is processing it, wait and reuse.
    3. Download the audio stream (yt-dlp), transcribe (Groq Whisper).
    4. Zero-speech bypass, otherwise extract insights with the LLM.
    5. DM the sender with a link to the reel.
    """
    import time
    from backend.database import SessionLocal
    db = SessionLocal()
    reel = None
    audio_path = None
    try:
        reel = db.query(ReelItem).filter(ReelItem.id == reel_id).first()
        if not reel:
            return
        usage.for_user(user_id or reel.user_id)

        video_download = None
        # A DM share Instagram gave no link for: there is no post page to read or download
        no_link = reel_url.startswith(MEDIA_PREFIX)
        cover_only = False
        if "/p/" in reel_url or no_link:
            try:
                if no_link:
                    # The shared media id may be Instagram's own post id, which converts to the
                    # post's shortcode. Only trust the guess if its caption matches the share's.
                    # Graph API ids (what DM shares carry today) never convert, so don't ask Instagram.
                    guess = (shortcode_from_media_id(reel.shared_media_id)
                             if reel.caption and looks_like_post_id(reel.shared_media_id) else None)
                    if not guess:
                        raise ValueError("Instagram did not share this post's link")
                    found = post_images(guess)
                    if found is None or not caption_matches(reel.caption, found[1]):
                        raise ValueError("The media id did not lead to the shared post")
                    print(f"[Carousel] Found the shared post from its media id; reading all {len(found[0])} slides")
                    post, no_link = found, False
                    reel.shortcode, reel_url = guess, f"https://www.instagram.com/p/{guess}/"
                else:
                    post = post_images(reel.shortcode)
            except Exception as metadata_error:
                if no_link:
                    print(f"[Carousel] No post from the media id: {type(metadata_error).__name__}")
                else:
                    # The real reason, so a blocked or broken post reader shows up in the logs
                    print(f"[Carousel] Post read failed for {reel.shortcode}: {type(metadata_error).__name__}: {str(metadata_error)[:200]}")
                post = None
                # 1. A post shared by DM has a media ID: ask the Graph API for the album
                album = shared_album_images(reel.shared_media_id) if reel.shared_media_id else []
                if album:
                    print(f"[Carousel] Post read blocked; {len(album)} slides came from the Graph API")
                    post = (album, reel.caption or "", reel.author)
                else:
                    # 2. Some video posts are available through the existing downloader only.
                    download_error = None
                    video_download = {}
                    if not no_link:
                        try:
                            video_download = download_audio_from_reel(reel_url)
                        except Exception as error:
                            video_download, download_error = {}, error
                    audio_path = video_download.get("audio_path")
                    if not audio_path:
                        # 3. Last resort: the preview image from the DM, which shows the cover slide only
                        cover = preview_url(preview)
                        if not cover:
                            if no_link:
                                raise ValueError("Instagram didn't share this post's link. Send the post link to @reeldex.io instead.") from metadata_error
                            if download_error:
                                raise download_error
                            raise ValueError("Could not retrieve the post pages from Instagram. Retry from the vault.") from metadata_error
                        print("[Carousel] Post read blocked; reading the DM preview (cover slide only)")
                        video_download = None
                        cover_only = True
                        post = ([cover], reel.caption or "", reel.author)
            if post is not None:
                images, caption, author = post
                reel.caption, reel.author, reel.reel_url = caption, author, reel_url
                reel.status = "downloading"
                # A cover read earlier from a DM preview is not reused once the full post is readable
                previous = [s for s in (reel.slides or []) if cover_only or not s.get("cover_only")]
                db.commit()

                def save_progress(done):
                    completed = {s["number"]: s for s in previous + done}
                    reel.slides = [completed[i] for i in sorted(completed)]
                    db.commit()

                slides = extract_slides(images, previous, save_progress)
                if cover_only:
                    # Only the DM preview was readable: tell the reply and the page it's partial
                    slides = [dict(s, cover_only=True) for s in slides]
                    thumb = save_cover_thumbnail(reel.shared_media_id, images[0])
                    if thumb:
                        reel.thumbnail_url = thumb
                reel.slides = slides
                first_text = next((s["text"] for s in slides if s["text"]), "")
                reel.title = (first_text or caption or "Instagram post").splitlines()[0][:300]
                full_text, insights = slide_insights(slides, reel.title, caption=caption)
                transcript = reel.transcript or Transcript(reel_id=reel.id)
                transcript.full_text, transcript.summary = full_text, insights["summary"]
                transcript.key_points = insights.get("key_points", [])
                transcript.language, transcript.segments = "und", []
                transcript.translated_text = transcript.translated_summary = None
                reel.tags, reel.action_items = insights.get("tags", []), insights.get("action_items", [])
                reel.category = insights.get("category", "General Knowledge")
                reel.status, reel.error_message = "completed", None
                db.add(transcript)
                db.commit()
                replaced = replace_cover_only_copies(db, reel)
                reply_in_dm(db, reel, sender_id, source, replaced=replaced)
                return

        # STEP 0: global cache (0 tokens)
        cached_reel = None
        if reel.shortcode or reel_url:
            q = db.query(ReelItem).filter(ReelItem.status == "completed", ReelItem.id != reel.id)
            q = q.filter((ReelItem.shortcode == reel.shortcode) | (ReelItem.reel_url == reel_url)) if reel.shortcode else q.filter(ReelItem.reel_url == reel_url)
            cached_reel = q.order_by(ReelItem.id.desc()).first()

        # STEP 0b: in-flight lock
        if not cached_reel and reel.shortcode:
            in_flight = db.query(ReelItem).filter(
                ReelItem.shortcode == reel.shortcode,
                ReelItem.status.in_(IN_FLIGHT),
                ReelItem.id != reel.id,
            ).first()
            if in_flight:
                print(f"[In-Flight Lock] Waiting for another worker on {reel.shortcode}")
                for _ in range(12):  # up to ~18s
                    time.sleep(1.5)
                    db.expire_all()
                    done = db.query(ReelItem).filter(ReelItem.shortcode == reel.shortcode, ReelItem.status == "completed").first()
                    if done and done.transcript:
                        cached_reel = done
                        break

        # A copy saved without its audio isn't worth reusing: fetch the reel again instead
        if cached_reel and (cached_reel.slides or (cached_reel.transcript and cached_reel.transcript.language == NO_AUDIO)):
            cached_reel = None
        if cached_reel and cached_reel.transcript and (cached_reel.transcript.full_text or cached_reel.transcript.summary):
            print(f"[Global Cache HIT] Reel #{cached_reel.id} -> #{reel.id} (0 tokens)")
            for field in ("title", "author", "thumbnail_url", "duration", "caption", "category", "tags", "action_items"):
                setattr(reel, field, getattr(cached_reel, field))
            reel.status = "completed"
            reel.error_message = None
            src = cached_reel.transcript
            t = db.query(Transcript).filter(Transcript.reel_id == reel.id).first() or Transcript(reel_id=reel.id, full_text="")
            t.full_text, t.summary, t.key_points, t.segments, t.language = src.full_text, src.summary, src.key_points, src.segments, src.language
            t.translated_text, t.translated_summary = src.translated_text, src.translated_summary
            db.add(t)
            db.commit()
            reply_in_dm(db, reel, sender_id, source)
            return

        reel.status = "downloading"
        db.commit()

        # 1. Audio + metadata
        dl = video_download or download_audio_from_reel(reel_url)
        if dl.get("no_audio"):
            # Instagram sometimes serves a file without sound; a second request often gets the full one
            time.sleep(8)
            retry = download_audio_from_reel(reel_url)
            if retry.get("success") and (retry.get("audio_path") or not retry.get("no_audio")):
                print(f"[Downloader] Reel #{reel.id}: the second try got the audio")
                dl = retry
        audio_path = dl.get("audio_path")
        reel.caption = (dl.get("caption") or "")[:5000] or None
        title = dl.get("title") or reel.title or f"Reel {reel.shortcode or ''}"
        reel.title = (readable_title(title, reel.caption) or title)[:300]
        reel.author = dl.get("author") or reel.author
        reel.thumbnail_url = dl.get("thumbnail_url") or dl.get("thumbnail") or (
            f"https://www.instagram.com/p/{reel.shortcode}/media/?size=l" if reel.shortcode else None)
        reel.duration = dl.get("duration")
        db.commit()
        silent = bool(dl.get("no_audio"))
        if not silent and (not audio_path or not os.path.exists(audio_path)):
            raise Exception(dl.get("error") or "Couldn't get the audio from this reel. It may be private or removed.")

        reel.status = "transcribing"
        db.commit()

        # 2. Transcribe. A failed call is an error, not silence. A reel with no sound track skips this.
        tr = {"success": True, "full_text": "", "segments": [], "language": NO_AUDIO} if silent else transcribe_audio_file(audio_path)
        if not tr.get("success"):
            raise Exception(tr.get("error") or "Transcription failed.")
        full_text = (tr.get("full_text") or tr.get("text") or "").strip()
        segments = tr.get("segments") or []
        if isinstance(segments, str):
            try:
                segments = json.loads(segments)
            except Exception:
                segments = []
        language = tr.get("language", "en")
        if not full_text and segments:
            full_text = " ".join(s.get("text", "") for s in segments if isinstance(s, dict)).strip()

        # 3. Insights. With no speech, the caption is often where the content is (music + text reels).
        caption = clean_caption(reel.caption)
        if not has_real_speech(full_text) and not caption_is_useful(caption):
            print(f"[Zero-Speech] Reel #{reel.id} has no spoken audio; skipping the LLM.")
            insights = {
                "summary": "No one really talks in this reel, so there's nothing to summarise.",
                "key_points": [],
                "category": "Music / Visual",
                "tags": ["#visual", "#music"],
                "action_items": [],
            }
        else:
            insights = extract_reel_insights(full_text, reel.title, caption=reel.caption) or {}

        reel.category = insights.get("category") or "General Knowledge"
        reel.tags = insights.get("tags") or ["#reel"]
        reel.action_items = insights.get("action_items") or []
        reel.status = "completed"
        reel.error_message = None

        t = db.query(Transcript).filter(Transcript.reel_id == reel.id).first() or Transcript(reel_id=reel.id, full_text="")
        t.full_text = full_text
        t.summary = insights.get("summary") or full_text[:180]
        t.key_points = insights.get("key_points") or []
        t.segments = segments
        t.language = language
        db.add(t)
        db.commit()

        reply_in_dm(db, reel, sender_id, source)

    except Exception as e:
        print(f"[Pipeline Error for Reel #{reel_id}]: {e}")
        if reel:
            db.rollback()
            reel.status = "failed"
            reel.error_message = str(e)[:500]
            db.commit()
            reply_failed_in_dm(db, reel, sender_id, source)
    finally:
        try:
            if audio_path and os.path.exists(audio_path):
                os.remove(audio_path)
        except Exception:
            pass
        db.close()


# --- Pydantic Schemas ---
class TranscribeRequest(BaseModel):
    url: str = Field(..., max_length=500)

class AskChatRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=1000)
    category: Optional[str] = None
    token: Optional[str] = None  # legacy: older clients sent the token in the body
    history: Optional[List[Dict[str, Any]]] = None

class AuthSessionRequest(BaseModel):
    token: Optional[str] = None

class CreateCollectionRequest(BaseModel):
    name: str = Field(..., max_length=100)
    emoji: Optional[str] = Field("📁", max_length=20)

class UpdateCollectionRequest(BaseModel):
    name: str = Field(..., max_length=100)

class AssignCollectionRequest(BaseModel):
    collection_id: Optional[int] = None

class BatchAssignRequest(BaseModel):
    reel_ids: List[int] = Field(default_factory=list, max_length=1000)
    collection_id: Optional[int] = None

class BatchDeleteRequest(BaseModel):
    reel_ids: List[int] = Field(default_factory=list, max_length=1000)


# --- Authentication & Pairing ---

@router.post("/auth/session", dependencies=[Depends(rate_limit("session", 30, 60))])
def get_auth_session(req: AuthSessionRequest, header_token: Optional[str] = Depends(read_token), db: Session = Depends(get_db)):
    """Restores a session from a token, or starts a new guest session."""
    user = get_or_create_user(db, auth_token=req.token or header_token)
    touch_last_seen(db, user)
    return {
        "user_id": user.id,
        "auth_token": user.auth_token,
        "display_name": user.display_name,
        "is_instagram_linked": bool(user.instagram_sender_id),
        "instagram_username": user.instagram_username or (f"User #{user.instagram_sender_id[-4:]}" if user.instagram_sender_id else None),
    }


def _user_from_body_or_header(db: Session, header_token: Optional[str], body_token: Optional[str]) -> User:
    token = header_token or body_token
    user = db.query(User).filter(User.auth_token == token).first() if token else None
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return user


@router.post("/auth/generate-code", dependencies=[Depends(rate_limit("pair", 10, 60))])
def generate_pairing_code(req: AuthSessionRequest, header_token: Optional[str] = Depends(read_token), db: Session = Depends(get_db)):
    """Generates a 6-digit code (MIND-123456) to link Instagram by DM."""
    user = _user_from_body_or_header(db, header_token, req.token)
    db.query(PairingCode).filter(PairingCode.user_id == user.id, PairingCode.is_used == False).delete()  # noqa: E712

    code_str = f"MIND-{uuid.uuid4().int % 900000 + 100000}"
    db.add(PairingCode(code=code_str, user_id=user.id, expires_at=datetime.datetime.utcnow() + datetime.timedelta(minutes=20)))
    db.commit()
    return {
        "code": code_str,
        "expires_in_minutes": 20,
        "instructions": f"Send '{code_str}' in Instagram Direct to link your account.",
    }


# --- Collections ---

@router.get("/collections")
def list_collections(user: User = Depends(require_user), db: Session = Depends(get_db)):
    """Collections with counts and up to 4 cover thumbnails (one query for all reels)."""
    colls = db.query(Collection).filter(Collection.user_id == user.id).order_by(Collection.id.desc()).all()
    if not colls:
        return []
    ids = [c.id for c in colls]
    rows = (
        db.query(ReelItem.collection_id, ReelItem.shortcode, ReelItem.thumbnail_url)
        .filter(ReelItem.collection_id.in_(ids))
        .order_by(desc(ReelItem.id))
        .all()
    )
    counts: Dict[int, int] = {}
    thumbs: Dict[int, List[str]] = {}
    for coll_id, shortcode, thumb_url in rows:
        counts[coll_id] = counts.get(coll_id, 0) + 1
        bucket = thumbs.setdefault(coll_id, [])
        thumb = f"/api/thumbnail/{shortcode}" if shortcode else thumb_url
        if thumb and thumb not in bucket and len(bucket) < 4:
            bucket.append(thumb)
    return [{
        "id": c.id,
        "name": c.name,
        "emoji": c.emoji or "📁",
        "count": counts.get(c.id, 0),
        "cover_thumbnail": (thumbs.get(c.id) or [None])[0],
        "thumbnails": thumbs.get(c.id, []),
        "created_at": c.created_at.isoformat() if c.created_at else "",
    } for c in colls]


@router.post("/collections")
def create_collection(req: CreateCollectionRequest, user: User = Depends(require_user), db: Session = Depends(get_db)):
    """Creates a collection (returns the existing one for a duplicate name)."""
    name = req.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Collection name cannot be empty")
    existing = db.query(Collection).filter(Collection.user_id == user.id, Collection.name == name).first()
    if existing:
        count = db.query(ReelItem).filter(ReelItem.collection_id == existing.id).count()
        return {"success": True, "id": existing.id, "name": existing.name, "emoji": existing.emoji or "📁", "count": count}
    c = Collection(user_id=user.id, name=name, emoji=req.emoji or "📁")
    db.add(c)
    db.commit()
    db.refresh(c)
    return {"success": True, "id": c.id, "name": c.name, "emoji": c.emoji or "📁", "count": 0}


def _owned_collection(db: Session, user: User, collection_id: int) -> Collection:
    c = db.query(Collection).filter(Collection.id == collection_id, Collection.user_id == user.id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Collection not found")
    return c


@router.patch("/collections/{collection_id}")
def update_collection(collection_id: int, req: UpdateCollectionRequest, user: User = Depends(require_user), db: Session = Depends(get_db)):
    c = _owned_collection(db, user, collection_id)
    name = req.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Collection name cannot be empty")
    c.name = name
    db.commit()
    return {"success": True, "id": c.id, "name": c.name}


@router.delete("/collections/{collection_id}")
def delete_collection(collection_id: int, user: User = Depends(require_user), db: Session = Depends(get_db)):
    """Deletes a collection; its reels stay in the library."""
    c = _owned_collection(db, user, collection_id)
    db.query(ReelItem).filter(ReelItem.collection_id == c.id).update({"collection_id": None})
    db.delete(c)
    db.commit()
    return {"success": True}


@router.patch("/reels/{reel_id}/collection")
def assign_reel_collection(reel_id: int, req: AssignCollectionRequest, user: User = Depends(require_user), db: Session = Depends(get_db)):
    reel = get_owned_reel(db, user, reel_id)
    c = _owned_collection(db, user, req.collection_id) if req.collection_id is not None else None
    reel.collection_id = c.id if c else None
    db.commit()
    return {
        "success": True,
        "collection_id": reel.collection_id,
        "collection_name": c.name if c else None,
        "collection_emoji": c.emoji if c else None,
    }


@router.post("/reels/batch/assign")
def batch_assign_reels(req: BatchAssignRequest, user: User = Depends(require_user), db: Session = Depends(get_db)):
    """Sets a collection's members to exactly `reel_ids` (only the caller's own reels)."""
    own_ids = [rid for (rid,) in owned_reels(db, user).with_entities(ReelItem.id).filter(ReelItem.id.in_(req.reel_ids)).all()] if req.reel_ids else []
    if req.collection_id is not None:
        c = _owned_collection(db, user, req.collection_id)
        if own_ids:
            db.query(ReelItem).filter(ReelItem.id.in_(own_ids)).update({"collection_id": c.id}, synchronize_session=False)
            db.query(ReelItem).filter(ReelItem.collection_id == c.id, ~ReelItem.id.in_(own_ids)).update({"collection_id": None}, synchronize_session=False)
        else:
            db.query(ReelItem).filter(ReelItem.collection_id == c.id).update({"collection_id": None}, synchronize_session=False)
    elif own_ids:
        db.query(ReelItem).filter(ReelItem.id.in_(own_ids)).update({"collection_id": None}, synchronize_session=False)
    db.commit()
    return {"success": True, "count": len(own_ids)}


def _delete_reels(db: Session, ids: List[int]):
    if not ids:
        return
    db.query(Transcript).filter(Transcript.reel_id.in_(ids)).delete(synchronize_session=False)
    db.query(ReelItem).filter(ReelItem.id.in_(ids)).delete(synchronize_session=False)
    db.commit()


def replace_cover_only_copies(db: Session, reel: ReelItem) -> int:
    """After a post is read in full, remove the owner's cover-only copies of the same post.

    A carousel shared by DM only gives its cover; when the owner then sends its link, the
    full read takes that copy's place (and its collection) instead of leaving two items.
    """
    if not reel.caption or not reel.slides or any(s.get("cover_only") for s in reel.slides):
        return 0
    owners = []
    if reel.user_id:
        owners.append(ReelItem.user_id == reel.user_id)
    if reel.sender_id:
        owners.append(ReelItem.sender_id == reel.sender_id)
    if not owners:
        return 0
    candidates = db.query(ReelItem).filter(
        ReelItem.id != reel.id, ReelItem.reel_url.like(f"{MEDIA_PREFIX}%"), or_(*owners),
    ).all()
    copies = [c for c in candidates if caption_matches(c.caption, reel.caption)]
    if not copies:
        return 0
    if not reel.collection_id:
        reel.collection_id = next((c.collection_id for c in copies if c.collection_id), None)
        db.commit()
    _delete_reels(db, [c.id for c in copies])
    print(f"[Carousel] The full post replaced {len(copies)} cover-only copy")
    return len(copies)


@router.post("/reels/batch/delete")
def batch_delete_reels(req: BatchDeleteRequest, user: User = Depends(require_user), db: Session = Depends(get_db)):
    own_ids = [rid for (rid,) in owned_reels(db, user).with_entities(ReelItem.id).filter(ReelItem.id.in_(req.reel_ids)).all()] if req.reel_ids else []
    _delete_reels(db, own_ids)
    return {"success": True, "count": len(own_ids)}


# --- Translation (sync: FastAPI runs it in a worker thread, so it can't block the server) ---

@router.post("/reels/{reel_id}/translate", dependencies=[Depends(rate_limit("translate", 10, 60))])
def translate_reel(reel_id: int, user: User = Depends(require_user), db: Session = Depends(get_db)):
    """Translates transcript and summary into English, cached on the transcript."""
    usage.for_user(user.id)
    reel = get_owned_reel(db, user, reel_id)
    t = reel.transcript
    if not t:
        raise HTTPException(status_code=404, detail="Reel transcript not found")
    if t.translated_text and t.translated_summary:
        return {"success": True, "translated_text": t.translated_text, "translated_summary": t.translated_summary, "cached": True}
    if not settings.GROQ_API_KEY:
        raise HTTPException(status_code=503, detail="Translation is not configured on the server")

    prompt = (
        "You are a professional audio translator. Translate the following transcript and summary into natural, fluent English. "
        "Respond ONLY with a valid JSON object matching this exact schema:\n"
        '{"translated_summary": "English summary text", "translated_text": "Full word-for-word English transcript"}\n\n'
        f"Original Summary:\n{t.summary or ''}\n\nOriginal Transcript:\n{(t.full_text or '')[:4000]}"
    )
    parsed = None
    try:
        from groq import Groq
        client = Groq(api_key=settings.GROQ_API_KEY)
        for model_id in ("openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.6-27b"):
            try:
                resp = client.chat.completions.create(
                    model=model_id,
                    messages=[
                        {"role": "system", "content": "You are an expert audio translator. Return only valid JSON."},
                        {"role": "user", "content": prompt},
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.2,
                    max_tokens=2000,
                )
                usage.record("translate", model_id, resp)
                parsed = json.loads(resp.choices[0].message.content)
                if parsed:
                    break
            except Exception as err:
                print(f"[Translate {model_id}]: {err}")
    except Exception as err:
        print(f"[Translate init]: {err}")

    if not parsed:
        raise HTTPException(status_code=502, detail="Translation failed. Please try again.")
    t.translated_text = parsed.get("translated_text") or t.full_text
    t.translated_summary = parsed.get("translated_summary") or t.summary
    db.commit()
    return {"success": True, "translated_text": t.translated_text, "translated_summary": t.translated_summary, "cached": False}


# --- Thumbnails (public: <img> tags can't send auth headers; shortcodes are public) ---

THUMBNAIL_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "downloads", "thumbnails")
os.makedirs(THUMBNAIL_DIR, exist_ok=True)

# Covers saved from DM previews, for posts that have no shortcode ("m" + media id)
COVER_KEY_RE = re.compile(r"^m[0-9]{1,20}$")


def save_cover_thumbnail(media_id: Optional[str], url: str) -> Optional[str]:
    """Keep the DM preview as the post's thumbnail; its signed link expires, so store the image."""
    key = f"m{media_id}" if media_id else ""
    if not COVER_KEY_RE.match(key) or not preview_url(url):
        return None
    try:
        image = bytearray()
        with httpx.stream("GET", url, timeout=15) as response:
            response.raise_for_status()
            for chunk in response.iter_bytes():
                image.extend(chunk)
                if len(image) > 5_000_000:
                    return None
        if len(image) < 1000:
            return None
        with open(os.path.join(THUMBNAIL_DIR, f"{key}.jpg"), "wb") as f:
            f.write(image)
        return f"/api/thumbnail/{key}"
    except (httpx.HTTPError, OSError) as error:
        print(f"[Carousel] Could not keep the cover as a thumbnail: {type(error).__name__}")
        return None


@router.get("/thumbnail/{shortcode}")
def get_thumbnail_proxy(shortcode: str):
    """Caches Instagram reel thumbnails on disk so they don't expire or get blocked."""
    clean_code = shortcode.strip()
    if not SHORTCODE_RE.match(clean_code):
        raise HTTPException(status_code=400, detail="Invalid shortcode")
    cache_path = os.path.join(THUMBNAIL_DIR, f"{clean_code}.jpg")
    if COVER_KEY_RE.match(clean_code) and not os.path.exists(cache_path):
        # A saved DM cover that is gone (the disk was reset): there is no post page to refetch
        raise HTTPException(status_code=404, detail="Thumbnail not found")
    cache_headers = {"Cache-Control": "public, max-age=604800, immutable"}

    if os.path.exists(cache_path) and os.path.getsize(cache_path) > 1000:
        return FileResponse(cache_path, media_type="image/jpeg", headers=cache_headers)

    try:
        req = urllib.request.Request(
            f"https://www.instagram.com/p/{clean_code}/",
            headers={"User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"},
        )
        with urllib.request.urlopen(req, timeout=8) as resp:
            html = resp.read().decode("utf-8", errors="ignore")
        m = re.search(r'property="og:image"\s+content="([^"]+)"', html) or re.search(r'content="([^"]+)"\s+property="og:image"', html)
        if m:
            img_url = m.group(1).replace("&amp;", "&")
            if img_url.startswith("https://"):
                img_req = urllib.request.Request(img_url, headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(img_req, timeout=10) as img_resp:
                    img_data = img_resp.read(5_000_000)
                if len(img_data) > 1000:
                    with open(cache_path, "wb") as f:
                        f.write(img_data)
                    return FileResponse(cache_path, media_type="image/jpeg", headers=cache_headers)
    except Exception as err:
        print(f"[Thumbnail Proxy Error for {clean_code}]: {err}")

    return Response(status_code=302, headers={"Location": f"https://www.instagram.com/p/{clean_code}/media/?size=l"})


# --- Reels & Search ---

@router.get("/categories")
def get_categories():
    return {"categories": ["All"] + CATEGORIES}


@router.get("/reels")
def list_reels(
    q: Optional[str] = Query(None, max_length=200),
    category: Optional[str] = Query("All"),
    collection_id: Optional[int] = Query(None),
    tag: Optional[str] = Query(None, max_length=100),
    source: Optional[str] = Query(None),
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    """The user's reels, ranked by search query and filtered by category/tag/collection."""
    query_builder = owned_reels(db, user)
    if source:
        query_builder = query_builder.filter(ReelItem.source == source)
    if collection_id is not None:
        query_builder = query_builder.filter(ReelItem.collection_id == collection_id)
        category = "All"

    reels_db = query_builder.options(
        joinedload(ReelItem.transcript),
        joinedload(ReelItem.collection),
    ).order_by(desc(ReelItem.created_at)).all()

    # Reels stuck in processing for over 3 minutes are marked failed (one commit)
    now_utc = datetime.datetime.utcnow()
    stale = False
    for r in reels_db:
        is_post = "/p/" in r.reel_url
        last_progress = r.updated_at if is_post else r.created_at
        if r.status in IN_FLIGHT and last_progress:
            c_at = last_progress.replace(tzinfo=None)
            if (now_utc - c_at).total_seconds() > (900 if is_post else 180):
                r.status = "failed"
                r.error_message = "Transcription timed out. Tap retry."
                stale = True
    if stale:
        db.commit()

    # Rank with the full transcript, then send the lighter card shape
    by_id = {r.id: r for r in reels_db}
    search_docs = []
    for r in reels_db:
        card = reel_card(r)
        card["full_text"] = r.transcript.full_text if r.transcript else ""
        search_docs.append(card)
    ranked = rank_reels_search(search_docs, query=q or "", category_filter=category, tag_filter=tag)
    for item in ranked:
        item.pop("full_text", None)
    return ranked


@router.post("/reels/{reel_id}/retry", dependencies=[Depends(rate_limit("retry", 20, 60))])
def retry_reel(reel_id: int, background_tasks: BackgroundTasks, user: User = Depends(require_user), db: Session = Depends(get_db)):
    """Re-runs download and transcription for a failed or stuck reel."""
    reel = get_owned_reel(db, user, reel_id)
    if reel.status in IN_FLIGHT:
        return {"success": True, "status": reel.status}
    reel.status = "processing"
    reel.error_message = None
    reel.created_at = datetime.datetime.utcnow()
    db.commit()
    url = reel.reel_url or (f"https://www.instagram.com/reel/{reel.shortcode}/" if reel.shortcode else "")
    background_tasks.add_task(process_reel_pipeline, reel.id, url, reel.sender_id, reel.source or "web_ui", reel.user_id)
    return {"success": True, "message": f"Reel #{reel_id} queued for reprocessing", "status": "processing"}


@router.get("/reels/{reel_id}")
def get_reel_detail(reel_id: int, user: User = Depends(require_user), db: Session = Depends(get_db)):
    """Full transcript, timestamps and metadata for one of the user's reels."""
    reel = get_owned_reel(db, user, reel_id)
    t = reel.transcript
    segments_data: List[Any] = []
    full_text_val = ""
    if t:
        if isinstance(t.segments, str):
            try:
                segments_data = json.loads(t.segments)
            except Exception:
                segments_data = []
        elif isinstance(t.segments, list):
            segments_data = t.segments
        full_text_val = t.full_text or " ".join(s.get("text", "").strip() for s in segments_data if isinstance(s, dict))

    data = reel_card(reel)
    data["slides"] = reel.slides or []
    data["caption"] = reel.caption
    data["transcript"] = {
        "full_text": full_text_val,
        "language": t.language if t else "en",
        "summary": t.summary if t else "",
        "key_points": (t.key_points or []) if t else [],
        "segments": segments_data,
        "translated_text": t.translated_text if t else None,
        "translated_summary": t.translated_summary if t else None,
    } if t else None
    return data


@router.delete("/reels/{reel_id}")
def delete_reel(reel_id: int, user: User = Depends(require_user), db: Session = Depends(get_db)):
    reel = get_owned_reel(db, user, reel_id)
    _delete_reels(db, [reel.id])
    return {"success": True, "message": f"Reel #{reel_id} deleted"}


# --- Ask Dex AI (sync: runs in a worker thread so the LLM call can't block the server) ---

# --- Time spent ---

HEARTBEAT_SECONDS = 60


@router.post("/heartbeat", dependencies=[Depends(rate_limit("heartbeat", 6, 60))])
def heartbeat(user: User = Depends(require_user), db: Session = Depends(get_db)):
    """Adds a minute of active time. The page sends this once a minute while it's visible.

    Beats closer than 50 seconds apart (a second tab, a retry) don't add time, so
    the total can't run faster than the clock.
    """
    now = datetime.datetime.utcnow()
    day = now.strftime("%Y-%m-%d")
    row = db.query(ActivityDay).filter(ActivityDay.user_id == user.id, ActivityDay.day == day).first()
    if row and row.last_beat_at and (now - row.last_beat_at).total_seconds() < HEARTBEAT_SECONDS - 10:
        return {"counted": False}
    if not row:
        row = ActivityDay(user_id=user.id, day=day, seconds=0)
        db.add(row)
    row.seconds = (row.seconds or 0) + HEARTBEAT_SECONDS
    row.last_beat_at = now
    try:
        db.commit()
    except Exception:
        db.rollback()  # a simultaneous first beat created the row; skip this one
        return {"counted": False}
    return {"counted": True}


# --- Feedback ---

FEEDBACK_CATEGORIES = ("Idea", "Bug", "Praise", "Other")


class FeedbackRequest(BaseModel):
    category: str = Field("Other", max_length=30)
    rating: Optional[int] = Field(None, ge=1, le=5)
    message: str = Field(..., min_length=2, max_length=2000)
    contact: Optional[str] = Field(None, max_length=200)
    page: Optional[str] = Field(None, max_length=40)


@router.post("/feedback", dependencies=[Depends(rate_limit("feedback", 5, 60))])
def send_feedback(req: FeedbackRequest, user: User = Depends(require_user), db: Session = Depends(get_db)):
    """Saves a message from the in-app feedback form."""
    message = req.message.strip()
    if len(message) < 2:
        raise HTTPException(status_code=400, detail="Please write a short message.")
    db.add(Feedback(
        user_id=user.id,
        category=req.category if req.category in FEEDBACK_CATEGORIES else "Other",
        rating=req.rating,
        message=message,
        contact=(req.contact or "").strip() or None,
        page=(req.page or "").strip() or None,
    ))
    db.commit()
    return {"success": True}


# --- Saved Ask Dex chats ---

class ChatMessage(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str = Field(..., max_length=20000)
    citations: Optional[List[Dict[str, Any]]] = Field(default=None, max_length=30)

class SaveChatRequest(BaseModel):
    title: Optional[str] = Field(None, max_length=200)
    messages: List[ChatMessage] = Field(..., min_length=1, max_length=200)


def _chat_summary(c: SavedChat) -> Dict[str, Any]:
    msgs = c.messages or []
    return {
        "id": c.id,
        "title": c.title,
        "message_count": len(msgs),
        "created_at": c.created_at.isoformat() if c.created_at else "",
        "updated_at": c.updated_at.isoformat() if c.updated_at else "",
    }


def _owned_chat(db: Session, user: User, chat_id: int) -> SavedChat:
    c = db.query(SavedChat).filter(SavedChat.id == chat_id, SavedChat.user_id == user.id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Chat not found")
    return c


def _chat_title(req: SaveChatRequest) -> str:
    if req.title and req.title.strip():
        return req.title.strip()[:200]
    first = next((m.content for m in req.messages if m.role == "user"), "Saved chat")
    first = " ".join(first.split())
    return first[:80] + ("…" if len(first) > 80 else "")


@router.get("/chats")
def list_saved_chats(user: User = Depends(require_user), db: Session = Depends(get_db)):
    chats = db.query(SavedChat).filter(SavedChat.user_id == user.id).order_by(desc(SavedChat.updated_at)).limit(200).all()
    return [_chat_summary(c) for c in chats]


@router.post("/chats", dependencies=[Depends(rate_limit("chats", 60, 60))])
def create_saved_chat(req: SaveChatRequest, user: User = Depends(require_user), db: Session = Depends(get_db)):
    c = SavedChat(user_id=user.id, title=_chat_title(req), messages=[m.model_dump(exclude_none=True) for m in req.messages])
    db.add(c)
    db.commit()
    db.refresh(c)
    return _chat_summary(c)


@router.get("/chats/{chat_id}")
def get_saved_chat(chat_id: int, user: User = Depends(require_user), db: Session = Depends(get_db)):
    c = _owned_chat(db, user, chat_id)
    return {**_chat_summary(c), "messages": c.messages or []}


@router.put("/chats/{chat_id}", dependencies=[Depends(rate_limit("chats", 60, 60))])
def update_saved_chat(chat_id: int, req: SaveChatRequest, user: User = Depends(require_user), db: Session = Depends(get_db)):
    c = _owned_chat(db, user, chat_id)
    if req.title and req.title.strip():
        c.title = req.title.strip()[:200]
    c.messages = [m.model_dump(exclude_none=True) for m in req.messages]
    c.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(c)
    return _chat_summary(c)


@router.delete("/chats/{chat_id}")
def delete_saved_chat(chat_id: int, user: User = Depends(require_user), db: Session = Depends(get_db)):
    c = _owned_chat(db, user, chat_id)
    db.delete(c)
    db.commit()
    return {"success": True}


@router.post("/chat", dependencies=[Depends(rate_limit("ai", 20, 60))])
@router.post("/chat/ask", include_in_schema=False, dependencies=[Depends(rate_limit("ai", 20, 60))])
@router.post("/ask", include_in_schema=False, dependencies=[Depends(rate_limit("ai", 20, 60))])
def ask_chat_endpoint(req: AskChatRequest, header_token: Optional[str] = Depends(read_token), db: Session = Depends(get_db)):
    """Answers a question across the user's own completed reels."""
    user = _user_from_body_or_header(db, header_token, req.token)
    usage.for_user(user.id)
    reels_db = (
        owned_reels(db, user)
        .options(joinedload(ReelItem.transcript))
        .filter(ReelItem.status == "completed")
        .all()
    )
    reels_context = []
    for r in reels_db:
        t = r.transcript
        reels_context.append({
            "id": r.id,
            "title": r.title or f"Reel #{r.id}",
            "author": r.author or r.sender_username,
            "shortcode": r.shortcode,
            "reel_url": public_reel_url(r.reel_url) or (f"https://www.instagram.com/reel/{r.shortcode}/" if r.shortcode else ""),
            "category": r.category,
            "tags": r.tags or [],
            "action_items": r.action_items or [],
            "summary": (t.summary if t else "") or "",
            "slides": r.slides or [],
            # The caption is searchable too: music + text reels often only have content there
            "full_text": "\n".join(x for x in ((t.full_text if t else ""), clean_caption(r.caption)) if x),
        })
    history = (req.history or [])[-6:]
    return ask_reels_ai(req.question, reels_context, history=history)


# --- Web submission ---

@router.post("/transcribe", dependencies=[Depends(rate_limit("transcribe", 10, 60))])
def transcribe_reel_endpoint(req: TranscribeRequest, background_tasks: BackgroundTasks, user: User = Depends(require_user), db: Session = Depends(get_db)):
    """Saves a reel link from the web app and processes it in the background."""
    clean_url = normalize_instagram_url(req.url.strip())
    shortcode = extract_shortcode(clean_url)
    if not shortcode:
        raise HTTPException(status_code=400, detail="That doesn't look like an Instagram reel link. Paste a link like instagram.com/reel/…")

    # Already in this user's library: return it instead of a duplicate
    existing = owned_reels(db, user).filter(ReelItem.shortcode == shortcode).order_by(ReelItem.id.desc()).first()
    if existing and existing.status != "failed":
        return {"success": True, "reel_id": existing.id, "duplicate": True, "message": "This reel is already in your library."}

    if existing:
        reel = existing
        reel.reel_url = clean_url
        reel.status = "processing"
        reel.error_message = None
        reel.created_at = datetime.datetime.utcnow()
    else:
        reel = ReelItem(user_id=user.id, reel_url=clean_url, shortcode=shortcode, source="web_ui", status="processing")
        db.add(reel)
    db.commit()
    db.refresh(reel)

    background_tasks.add_task(process_reel_pipeline, reel.id, clean_url, None, "web_ui", user.id)
    return {"success": True, "reel_id": reel.id, "message": "Reel saved. Transcribing in the background."}


# --- Instagram webhook ---

@router.get("/webhook/instagram")
def verify_instagram_webhook(
    hub_mode: Optional[str] = Query(None, alias="hub.mode"),
    hub_verify_token: Optional[str] = Query(None, alias="hub.verify_token"),
    hub_challenge: Optional[str] = Query(None, alias="hub.challenge"),
):
    """Meta webhook verification handshake."""
    expected = settings.META_VERIFY_TOKEN or ""
    if hub_mode == "subscribe" and hub_verify_token and hmac.compare_digest(hub_verify_token, expected):
        return Response(content=str(hub_challenge), media_type="text/plain", status_code=200)
    raise HTTPException(status_code=403, detail="Verification token mismatch.")


PAIR_RE = re.compile(r"(?:MIND|DEX|PAIR|LINK)?\s*-?\s*([0-9]{6})\b")


def claim_message(db: Session, key: Optional[str], window: Optional[datetime.timedelta] = None) -> bool:
    """Records a key (a Meta message id, or a user+reel pair). False if it was already claimed.

    Meta sometimes delivers the same message twice at once. With several workers an
    in-memory set can't see the other copy, so the database's primary key decides.
    With `window`, an older claim doesn't count and is renewed (a reel re-sent later is fine).
    """
    if not key:
        return True
    key = key[:255]
    try:
        db.add(WebhookEvent(mid=key))
        db.commit()
    except IntegrityError:
        db.rollback()
        if window is None:
            return False
        now = datetime.datetime.utcnow()
        renewed = db.query(WebhookEvent).filter(
            WebhookEvent.mid == key, WebhookEvent.created_at < now - window,
        ).update({"created_at": now}, synchronize_session=False)
        db.commit()
        if not renewed:
            return False
    # Occasionally forget ids older than a week so the table stays small
    if random.random() < 0.02:
        cutoff = datetime.datetime.utcnow() - datetime.timedelta(days=7)
        db.query(WebhookEvent).filter(WebhookEvent.created_at < cutoff).delete(synchronize_session=False)
        db.commit()
    return True


@router.post("/webhook/instagram")
async def receive_instagram_webhook(request: Request, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Inbound Instagram DMs: pairing codes and shared reels. Requests must be signed by Meta."""
    raw = await request.body()
    if not verify_meta_signature(raw, request.headers.get("x-hub-signature-256")):
        print("[Webhook] Rejected: bad or missing X-Hub-Signature-256")
        raise HTTPException(status_code=403, detail="Invalid signature")

    try:
        body = json.loads(raw or b"{}")
        events = parse_webhook_payload(body)
        print(f"[Webhook] {len(events)} message event(s)")
        for item in events:
            if not claim_message(db, item.get("message_id")):
                print("[Webhook] Duplicate delivery skipped")
                continue

            sender_id = item["sender_id"]
            reel_urls = item.get("reel_urls", [])
            post_ids = item.get("post_ids", [])
            # Which shared media ID a post link came from, so the pipeline can ask
            # the Graph API for the album if Instagram blocks the normal read
            media_for_url = {}
            for post_id in post_ids:
                permalink = await resolve_shared_post(post_id)
                if permalink and permalink not in reel_urls:
                    reel_urls.append(permalink)
                if permalink:
                    media_for_url[permalink] = post_id
            if item.get("shared_post") and not reel_urls:
                print(f"[Carousel] Looking up DM share; media IDs supplied: {len(post_ids)}")
                reel_urls.extend(await shared_message_links(item.get("message_id")))
                if len(post_ids) == 1 and len(reel_urls) == 1:
                    media_for_url[reel_urls[0]] = post_ids[0]
            previews = item.get("post_previews") or {}
            if item.get("shared_post") and not reel_urls and len(post_ids) == 1:
                # Instagram gave no link (usually another creator's post), but the DM has a
                # preview image: save the post from that instead of asking for the link
                only_id = post_ids[0]
                if preview_url((previews.get(only_id) or {}).get("url")):
                    placeholder = media_placeholder(only_id)
                    print("[Carousel] No post link from Instagram; saving the share from its DM preview")
                    reel_urls.append(placeholder)
                    media_for_url[placeholder] = only_id
            message_text = (item.get("message_text") or "").strip()

            # 1. Pairing code (exact match on the generated MIND-XXXXXX code)
            code_match = PAIR_RE.search(message_text.upper())
            if code_match and not reel_urls:
                p_code = db.query(PairingCode).filter(
                    PairingCode.code == f"MIND-{code_match.group(1)}",
                    PairingCode.is_used == False,  # noqa: E712
                    PairingCode.expires_at > datetime.datetime.utcnow(),
                ).first()
                if p_code:
                    target_user = p_code.user
                    for old_u in db.query(User).filter(User.instagram_sender_id == sender_id, User.id != target_user.id).all():
                        db.query(ReelItem).filter(ReelItem.user_id == old_u.id).update({"user_id": target_user.id})
                        old_u.instagram_sender_id = None
                    db.commit()
                    db.query(ReelItem).filter(ReelItem.sender_id == sender_id).update({"user_id": target_user.id})
                    target_user.instagram_sender_id = sender_id
                    p_code.is_used = True
                    db.commit()
                    if not target_user.instagram_username:
                        background_tasks.add_task(fill_instagram_username, target_user.id, sender_id)
                    await send_instagram_dm(sender_id, (
                        "🎉 Your Instagram is now CONNECTED to ReelDex!\n\n"
                        "Any Reel you send here will be automatically transcribed, categorized, and searchable in your personal library.\n\n"
                        f"👉 Open your Vault: {vault_link(target_user)}"
                    ))
                else:
                    await send_instagram_dm(sender_id, "⚠️ Pairing code not found or expired. Please generate a new code on ReelDex.")
                continue

            # 2. User for this sender
            user = get_or_create_user(db, sender_id=sender_id)
            if not user.instagram_username:
                background_tasks.add_task(fill_instagram_username, user.id, sender_id)

            # 3. Shared reels
            if reel_urls:
                for r_url in reel_urls:
                    clean_url = normalize_instagram_url(r_url)
                    shortcode = extract_shortcode(clean_url)
                    media_id = media_for_url.get(r_url)
                    # The DM's own preview image: a last resort if neither read works
                    preview = preview_url((previews.get(media_id) or {}).get("url")) if media_id else None
                    match = (ReelItem.shortcode == shortcode) | (ReelItem.reel_url == clean_url) if shortcode else (ReelItem.reel_url == clean_url)
                    # The same reel arriving twice within 2 minutes (two copies, two message ids) is one save
                    if not claim_message(db, f"reel:{user.id}:{shortcode or clean_url}", window=datetime.timedelta(minutes=2)):
                        print(f"[Webhook] Same reel again within 2 minutes, skipped: {shortcode}")
                        continue
                    existing = owned_reels(db, user).filter(match).order_by(ReelItem.id.desc()).first()
                    audio_was_missing = bool(existing and existing.status == "completed" and speech_flags(existing)["audio_missing"])
                    if existing and existing.status != "failed" and not audio_was_missing:
                        # Already in their vault: say so instead of staying silent
                        background_tasks.add_task(send_instagram_dm_sync, sender_id, already_saved_message(user, existing))
                        continue
                    if existing:
                        existing.reel_url = clean_url
                        existing.status = "processing"
                        existing.error_message = None
                        existing.created_at = datetime.datetime.utcnow()
                        existing.dm_replied = False  # they sent it again, so they get a fresh reply
                        if media_id:
                            existing.shared_media_id = media_id
                        db.commit()
                        background_tasks.add_task(process_reel_pipeline, existing.id, clean_url, sender_id, "instagram_dm", user.id, preview=preview)
                        continue
                    title = (previews.get(media_id) or {}).get("title") if media_id else None
                    reel = ReelItem(
                        user_id=user.id, reel_url=clean_url, shortcode=shortcode, source="instagram_dm",
                        sender_id=sender_id, sender_username=f"User #{sender_id[-4:]}", status="processing",
                        shared_media_id=media_id,
                        # The share's own text (often the caption) helps when only the cover is readable
                        caption=title[:2000] if isinstance(title, str) and title.strip() else None,
                    )
                    db.add(reel)
                    db.commit()
                    db.refresh(reel)
                    background_tasks.add_task(process_reel_pipeline, reel.id, clean_url, sender_id, "instagram_dm", user.id, preview=preview)

            elif item.get("shared_post"):
                background_tasks.add_task(send_instagram_dm_sync, sender_id, "Please copy the Instagram post link and send it here so I can read the slides.")
            elif message_text:
                lower = message_text.lower()
                if "http" in lower or "reeldex" in lower or "saved to your" in lower:
                    continue
                await send_instagram_dm(sender_id, (
                    "👋 Hi! Share or send any Instagram Reel here.\n\n"
                    "✨ ReelDex will automatically:\n"
                    "• Transcribe spoken audio & summarize key takeaways\n"
                    "• Categorize & save it to your searchable Vault\n"
                    "• Let you Ask AI questions across all your saved Reels\n\n"
                    f"👉 Open your Vault:\n{vault_link(user)}"
                ))

        return Response(content="EVENT_RECEIVED", media_type="text/plain", status_code=200)
    except Exception as e:
        print(f"[Webhook Event Error]: {repr(e)}")
        return Response(content="EVENT_RECEIVED", media_type="text/plain", status_code=200)


# --- Status (no secrets; the old POST /config that let anyone replace keys is removed) ---

@router.get("/config")
def get_config():
    return {
        "groq_configured": bool(settings.GROQ_API_KEY),
        "openai_configured": bool(settings.OPENAI_API_KEY),
        "instagram_configured": bool(settings.INSTAGRAM_PAGE_ACCESS_TOKEN),
    }
