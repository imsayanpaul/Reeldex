import os
import re
import json
import uuid
import datetime
import urllib.request
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query, Header, Request, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, desc

from backend.database import get_db, engine, Base
from backend.models import ReelItem, Transcript, User, PairingCode, Collection
from backend.downloader import download_audio_from_reel, normalize_instagram_url, extract_shortcode
from backend.transcriber import transcribe_audio_file
from backend.summarizer import extract_reel_insights, CATEGORIES
from backend.search import rank_reels_search, ask_reels_ai
from backend.instagram_bot import send_instagram_dm, send_instagram_dm_sync, parse_webhook_payload
from backend.config import settings
from sqlalchemy import text

# Create all tables on startup
Base.metadata.create_all(bind=engine)

# Auto-migration safety patches for existing PostgreSQL / SQLite databases
try:
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE reels ADD COLUMN IF NOT EXISTS collection_id INTEGER REFERENCES collections(id);"))
except Exception:
    pass

try:
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS translated_text TEXT;"))
except Exception:
    pass

try:
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS translated_summary TEXT;"))
except Exception:
    pass

router = APIRouter()

# --- Helpers ---
def get_or_create_user(db: Session, auth_token: Optional[str] = None, sender_id: Optional[str] = None, sender_username: Optional[str] = None) -> User:
    """Finds or provisions a user account by token or Instagram sender_id."""
    user = None
    if auth_token:
        user = db.query(User).filter(User.auth_token == auth_token).first()
    
    if not user and sender_id:
        user = db.query(User).filter(User.instagram_sender_id == sender_id).first()
        if not user:
            # Auto-provision user from Instagram DM
            new_token = f"rm_{uuid.uuid4().hex}"
            user = User(
                display_name=sender_username or f"Instagram @{sender_id[-4:]}",
                instagram_sender_id=sender_id,
                instagram_username=sender_username,
                auth_token=new_token
            )
            db.add(user)
            db.commit()
            db.refresh(user)

    if not user:
        # Create default guest user for web session
        new_token = f"rm_{uuid.uuid4().hex}"
        user = User(
            display_name="ReelMind Explorer",
            auth_token=new_token
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    return user


# --- Background Processing Worker ---
def process_reel_pipeline(reel_id: int, reel_url: str, sender_id: Optional[str] = None, source: str = "web_ui", user_id: Optional[int] = None):
    """
    1. Checks Global Cache: If ANY user has already processed this exact Reel, reuse transcript & insights instantly (0 tokens consumed).
    2. In-Flight Lock: If another worker is currently processing this exact Reel, wait for completion to reuse with 0 tokens.
    3. Zero-Speech Bypass: If audio has no spoken words, skips LLaMA 3.3 summarization (0 LLM tokens).
    4. Downloads pure audio stream (yt-dlp) in ~1s.
    5. Transcribes with Groq Whisper.
    6. Categorizes, tags & extracts action items with Groq LLaMA 3.3 70B.
    7. Auto-replies to user on Instagram with summary, tags & magic link.
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

        # ========================================================
        # STEP 0: GLOBAL REEL CACHE CHECK (0 Token Consumption)
        # ========================================================
        cached_reel = None
        if reel.shortcode or reel_url:
            cached_query = db.query(ReelItem).filter(
                ReelItem.status == "completed",
                ReelItem.id != reel.id
            )
            if reel.shortcode:
                cached_query = cached_query.filter(
                    or_(ReelItem.shortcode == reel.shortcode, ReelItem.reel_url == reel_url)
                )
            else:
                cached_query = cached_query.filter(ReelItem.reel_url == reel_url)

            cached_reel = cached_query.order_by(ReelItem.id.desc()).first()

        # STEP 0b: IN-FLIGHT CONCURRENCY LOCK
        # If another worker is actively downloading/transcribing this exact reel, wait for it
        if not cached_reel and reel.shortcode:
            in_flight = db.query(ReelItem).filter(
                ReelItem.shortcode == reel.shortcode,
                ReelItem.status.in_(["processing", "downloading", "transcribing"]),
                ReelItem.id != reel.id
            ).first()

            if in_flight:
                print(f"[In-Flight Lock] Another worker is processing Reel {reel.shortcode}. Waiting for completion...")
                for _ in range(12):  # Wait up to 18 seconds
                    time.sleep(1.5)
                    db.expire_all()
                    completed_other = db.query(ReelItem).filter(
                        ReelItem.shortcode == reel.shortcode,
                        ReelItem.status == "completed"
                    ).first()
                    if completed_other and completed_other.transcript:
                        cached_reel = completed_other
                        break

        if cached_reel and cached_reel.transcript and cached_reel.transcript.full_text:
            print(f"[Global Cache HIT] Reusing completed Reel #{cached_reel.id} for Reel #{reel.id}. 0 tokens consumed!")
            reel.title = cached_reel.title
            reel.author = cached_reel.author
            reel.thumbnail_url = cached_reel.thumbnail_url
            reel.duration = cached_reel.duration
            reel.category = cached_reel.category
            reel.tags = cached_reel.tags
            reel.action_items = cached_reel.action_items
            reel.status = "completed"
            reel.error_message = None
            db.commit()

            # Copy existing Transcript record
            cached_t = cached_reel.transcript
            existing_t = db.query(Transcript).filter(Transcript.reel_id == reel.id).first()
            if existing_t:
                existing_t.full_text = cached_t.full_text
                existing_t.summary = cached_t.summary
                existing_t.key_points = cached_t.key_points
                existing_t.segments = cached_t.segments
                existing_t.language = cached_t.language
            else:
                t = Transcript(
                    reel_id=reel.id,
                    full_text=cached_t.full_text,
                    summary=cached_t.summary,
                    key_points=cached_t.key_points,
                    segments=cached_t.segments,
                    language=cached_t.language
                )
                db.add(t)
            db.commit()

            # Instant DM Reply for this user
            if source == "instagram_dm" and sender_id and settings.INSTAGRAM_PAGE_ACCESS_TOKEN and not reel.dm_replied:
                user = db.query(User).filter(User.id == reel.user_id).first() if reel.user_id else None
                frontend_base = (settings.FRONTEND_URL or "https://reeldex-io.vercel.app").rstrip("/")
                vault_url = f"{frontend_base}/?token={user.auth_token}&new_reel={reel.id}" if user else frontend_base

                video_title = reel.title or "Instagram Reel"
                creator_tag = f" by @{reel.author}" if reel.author else ""
                category = reel.category or "General Knowledge"

                summary_msg = f"✨ Saved to your ReelDex!\n\n🎬 {video_title}{creator_tag}\n🏷️ [{category}]\n\n🔗 View summary & transcript:\n{vault_url}"
                sent = send_instagram_dm_sync(sender_id, summary_msg)
                reel.dm_replied = sent
                db.commit()

            return

        reel.status = "downloading"
        db.commit()

        # 1. Download pure audio stream & extract metadata
        dl_result = download_audio_from_reel(reel_url)
        audio_path = dl_result.get("audio_path")
        
        reel.title = dl_result.get("title") or reel.title or f"Reel {reel.shortcode or ''}"
        reel.author = dl_result.get("author") or reel.author
        reel.thumbnail_url = dl_result.get("thumbnail_url") or dl_result.get("thumbnail") or (f"https://www.instagram.com/p/{reel.shortcode}/media/?size=l" if reel.shortcode else None)
        reel.duration = dl_result.get("duration")
        db.commit()

        if not audio_path or not os.path.exists(audio_path):
            raise Exception("Failed to extract audio stream from reel.")

        reel.status = "transcribing"
        db.commit()

        # 2. Transcribe audio with Groq Whisper
        transcript_data = transcribe_audio_file(audio_path)
        full_text = (transcript_data.get("full_text") or transcript_data.get("text") or "").strip()
        segments = transcript_data.get("segments", [])
        language = transcript_data.get("language", "en")

        if not full_text and segments:
            if isinstance(segments, list):
                full_text = " ".join([s.get("text", "") for s in segments if isinstance(s, dict)]).strip()

        # 3. Extract AI Insights or Zero-Speech Short Circuit
        if len(full_text) < 10:
            # Zero-Speech Music/Silent clip short circuit (0 LLM tokens)
            print(f"[Zero-Speech Short-Circuit] Reel #{reel.id} has no spoken audio. Skipping LLM call.")
            summary_text = "Visual reel with background music (no spoken dialogue)."
            key_points = ["Visual / background audio only"]
            category = "Music / Visual"
            tags = ["#visual", "#music"]
            action_items = []
        else:
            # Full LLaMA 3.3 summarization
            insights = extract_reel_insights(full_text, reel.title)
            summary_text = insights.get("summary", "")
            key_points = insights.get("key_points", [])
            category = insights.get("category", "General Knowledge")
            tags = insights.get("tags", ["#reel"])
            action_items = insights.get("action_items", [])

        # Update ReelItem
        reel.category = category
        reel.tags = tags
        reel.action_items = action_items
        reel.status = "completed"
        reel.error_message = None
        db.commit()

        # Save Transcript
        existing_t = db.query(Transcript).filter(Transcript.reel_id == reel.id).first()
        if existing_t:
            existing_t.full_text = full_text
            existing_t.summary = summary_text
            existing_t.key_points = key_points
            existing_t.segments = segments
            existing_t.language = language
        else:
            t = Transcript(
                reel_id=reel.id,
                full_text=full_text,
                summary=summary_text,
                key_points=key_points,
                segments=segments,
                language=language
            )
            db.add(t)
        db.commit()

        # 4. Auto DM Reply on Instagram (Mentions title, creator, category, and magic link)
        if source == "instagram_dm" and sender_id and settings.INSTAGRAM_PAGE_ACCESS_TOKEN and not reel.dm_replied:
            user = db.query(User).filter(User.id == reel.user_id).first() if reel.user_id else None
            frontend_base = (settings.FRONTEND_URL or "https://reeldex-io.vercel.app").rstrip("/")
            vault_url = f"{frontend_base}/?token={user.auth_token}&new_reel={reel.id}" if user else frontend_base

            video_title = reel.title or "Instagram Reel"
            creator_tag = f" by @{reel.author}" if reel.author else ""

            summary_msg = f"✨ Saved to your ReelDex!\n\n🎬 {video_title}{creator_tag}\n🏷️ [{category}]\n\n🔗 View summary & transcript:\n{vault_url}"
            sent = send_instagram_dm_sync(sender_id, summary_msg)
            reel.dm_replied = sent
            db.commit()
        elif reel.dm_replied:
            print(f"[Pipeline] DM already sent for Reel #{reel_id}. Skipping duplicate DM.")

    except Exception as e:
        print(f"[Pipeline Error for Reel #{reel_id}]: {e}")
        if reel:
            reel.status = "failed"
            reel.error_message = f"Pipeline error: {str(e)}"
            db.commit()
    finally:
        # Guaranteed audio file cleanup
        try:
            if audio_path and os.path.exists(audio_path):
                os.remove(audio_path)
        except Exception:
            pass
        db.close()


# --- Pydantic Schemas ---
class TranscribeRequest(BaseModel):
    url: str
    groq_api_key: Optional[str] = None
    openai_api_key: Optional[str] = None

class ConfigUpdateRequest(BaseModel):
    groq_api_key: Optional[str] = None
    openai_api_key: Optional[str] = None
    instagram_page_access_token: Optional[str] = None
    meta_verify_token: Optional[str] = None

class AskChatRequest(BaseModel):
    question: str
    category: Optional[str] = None
    token: Optional[str] = None
    history: Optional[List[Dict[str, Any]]] = None

class AuthSessionRequest(BaseModel):
    token: Optional[str] = None

class CreateCollectionRequest(BaseModel):
    name: str
    emoji: Optional[str] = "📁"

class AssignCollectionRequest(BaseModel):
    collection_id: Optional[int] = None


# --- Authentication & Pairing Endpoints ---

@router.post("/auth/session")
def get_auth_session(req: AuthSessionRequest, db: Session = Depends(get_db)):
    """Initializes or restores a user session and returns pairing status."""
    user = get_or_create_user(db, auth_token=req.token)
    return {
        "user_id": user.id,
        "auth_token": user.auth_token,
        "display_name": user.display_name,
        "is_instagram_linked": bool(user.instagram_sender_id),
        "instagram_username": user.instagram_username or (f"User #{user.instagram_sender_id[-4:]}" if user.instagram_sender_id else None)
    }

@router.post("/auth/generate-code")
def generate_pairing_code(req: AuthSessionRequest, db: Session = Depends(get_db)):
    """Generates a short 6-digit linking code (e.g. MIND-8392) for Instagram DM pairing."""
    user = get_or_create_user(db, auth_token=req.token)
    
    # Invalidate previous unused codes
    db.query(PairingCode).filter(PairingCode.user_id == user.id, PairingCode.is_used == False).delete()
    
    code_digits = f"{uuid.uuid4().int % 900000 + 100000}"
    code_str = f"MIND-{code_digits}"
    expires = datetime.datetime.utcnow() + datetime.timedelta(minutes=20)
    
    p = PairingCode(
        code=code_str,
        user_id=user.id,
        expires_at=expires
    )
    db.add(p)
    db.commit()

    return {
        "code": code_str,
        "expires_in_minutes": 20,
        "instructions": f"Send '{code_str}' in Instagram Direct to link your account."
    }


# --- Custom Collections & Folders Endpoints ---

@router.get("/collections")
def list_collections(token: Optional[str] = None, db: Session = Depends(get_db)):
    """Lists all user-created collections with reel counts and thumbnails."""
    user = get_or_create_user(db, auth_token=token)
    colls = db.query(Collection).filter(Collection.user_id == user.id).order_by(Collection.id.desc()).all()
    results = []
    for c in colls:
        reels_in_col = db.query(ReelItem).filter(ReelItem.collection_id == c.id).order_by(desc(ReelItem.id)).all()
        count = len(reels_in_col)
        
        thumbnails = []
        for r in reels_in_col:
            thumb = f"/api/thumbnail/{r.shortcode}" if r.shortcode else r.thumbnail_url
            if thumb and thumb not in thumbnails:
                thumbnails.append(thumb)
            if len(thumbnails) >= 4:
                break

        cover_thumbnail = thumbnails[0] if thumbnails else None

        results.append({
            "id": c.id,
            "name": c.name,
            "emoji": c.emoji or "📁",
            "count": count,
            "cover_thumbnail": cover_thumbnail,
            "thumbnails": thumbnails,
            "created_at": c.created_at.isoformat() if c.created_at else ""
        })
    return results

@router.post("/collections")
def create_collection(req: CreateCollectionRequest, token: Optional[str] = None, db: Session = Depends(get_db)):
    """Creates a new custom collection / folder (idempotent for same user and name)."""
    user = get_or_create_user(db, auth_token=token)
    name = req.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Collection name cannot be empty")

    existing = db.query(Collection).filter(Collection.user_id == user.id, Collection.name == name).first()
    if existing:
        count = db.query(ReelItem).filter(ReelItem.collection_id == existing.id).count()
        return {
            "success": True,
            "id": existing.id,
            "name": existing.name,
            "emoji": existing.emoji or "📁",
            "count": count
        }

    c = Collection(user_id=user.id, name=name, emoji=req.emoji or "📁")
    db.add(c)
    db.commit()
    db.refresh(c)
    return {
        "success": True,
        "id": c.id,
        "name": c.name,
        "emoji": c.emoji or "📁",
        "count": 0
    }

class UpdateCollectionRequest(BaseModel):
    name: str

@router.patch("/collections/{collection_id}")
def update_collection(collection_id: int, req: UpdateCollectionRequest, token: Optional[str] = None, db: Session = Depends(get_db)):
    """Renames an existing collection."""
    user = get_or_create_user(db, auth_token=token)
    c = db.query(Collection).filter(Collection.id == collection_id, Collection.user_id == user.id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Collection not found")
    name = req.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Collection name cannot be empty")
    c.name = name
    db.commit()
    return {"success": True, "id": c.id, "name": c.name}

@router.delete("/collections/{collection_id}")
def delete_collection(collection_id: int, token: Optional[str] = None, db: Session = Depends(get_db)):
    """Deletes a collection and unassigns its reels."""
    user = get_or_create_user(db, auth_token=token)
    c = db.query(Collection).filter(Collection.id == collection_id, Collection.user_id == user.id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Collection not found")
    
    # Unassign reels
    db.query(ReelItem).filter(ReelItem.collection_id == c.id).update({"collection_id": None})
    db.delete(c)
    db.commit()
    return {"success": True}

@router.patch("/reels/{reel_id}/collection")
def assign_reel_collection(reel_id: int, req: AssignCollectionRequest, token: Optional[str] = None, db: Session = Depends(get_db)):
    """Assigns or moves a reel to a specific collection (or None to unassign)."""
    user = get_or_create_user(db, auth_token=token)
    reel = db.query(ReelItem).filter(ReelItem.id == reel_id).first()
    if not reel:
        raise HTTPException(status_code=404, detail="Reel not found")

    if req.collection_id is not None:
        c = db.query(Collection).filter(Collection.id == req.collection_id, Collection.user_id == user.id).first()
        if not c:
            raise HTTPException(status_code=400, detail="Collection not found")
        reel.collection_id = c.id
        collection_name = c.name
        collection_emoji = c.emoji
    else:
        reel.collection_id = None
        collection_name = None
        collection_emoji = None

    db.commit()
    return {
        "success": True, 
        "collection_id": reel.collection_id,
        "collection_name": collection_name,
        "collection_emoji": collection_emoji
    }


class BatchAssignRequest(BaseModel):
    reel_ids: List[int]
    collection_id: Optional[int] = None

class BatchDeleteRequest(BaseModel):
    reel_ids: List[int]

@router.post("/reels/batch/assign")
def batch_assign_reels(req: BatchAssignRequest, token: Optional[str] = None, db: Session = Depends(get_db)):
    """Assigns multiple reels to a collection in a single batch operation."""
    user = get_or_create_user(db, auth_token=token)
    if req.collection_id is not None:
        c = db.query(Collection).filter(Collection.id == req.collection_id).first()
        if not c:
            raise HTTPException(status_code=400, detail="Collection not found")
        if c.user_id != user.id:
            c.user_id = user.id
            db.commit()
            
        if req.reel_ids:
            # Add selected reels to this collection
            db.query(ReelItem).filter(ReelItem.id.in_(req.reel_ids)).update({"collection_id": c.id}, synchronize_session=False)
            # Remove reels from this collection that were unselected
            db.query(ReelItem).filter(ReelItem.collection_id == c.id, ~ReelItem.id.in_(req.reel_ids)).update({"collection_id": None}, synchronize_session=False)
        else:
            # Unselected all
            db.query(ReelItem).filter(ReelItem.collection_id == c.id).update({"collection_id": None}, synchronize_session=False)
    else:
        if req.reel_ids:
            db.query(ReelItem).filter(ReelItem.id.in_(req.reel_ids)).update({"collection_id": None}, synchronize_session=False)
    db.commit()
    return {"success": True, "count": len(req.reel_ids)}

@router.post("/reels/batch/delete")
def batch_delete_reels(req: BatchDeleteRequest, token: Optional[str] = None, db: Session = Depends(get_db)):
    """Deletes multiple reels in a single batch operation."""
    user = get_or_create_user(db, auth_token=token)
    db.query(ReelItem).filter(ReelItem.id.in_(req.reel_ids)).delete(synchronize_session=False)
    db.commit()
    return {"success": True, "count": len(req.reel_ids)}


# --- On-Demand Audio Translation Endpoint ---

@router.post("/reels/{reel_id}/translate")
async def translate_reel(reel_id: int, db: Session = Depends(get_db)):
    """Translates reel transcript and summary into English on-demand with 0-token caching."""
    reel = db.query(ReelItem).filter(ReelItem.id == reel_id).first()
    if not reel or not reel.transcript:
        raise HTTPException(status_code=404, detail="Reel transcript not found")

    t = reel.transcript

    # 1. Zero-Token Cache Hit
    if t.translated_text and t.translated_summary:
        print(f"[Translation Cache HIT] Reusing cached English translation for Reel #{reel_id} (0 tokens)")
        return {
            "success": True,
            "translated_text": t.translated_text,
            "translated_summary": t.translated_summary,
            "cached": True
        }

    # 2. Perform translation via Groq
    if not settings.GROQ_API_KEY:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY not configured")

    prompt = (
        "You are a professional audio translator. Translate the following transcript and summary into natural, fluent English. "
        "Respond ONLY with a valid JSON object matching this exact schema:\n"
        '{"translated_summary": "English summary text", "translated_text": "Full word-for-word English transcript"}\n\n'
        f"Original Summary:\n{t.summary or ''}\n\n"
        f"Original Transcript:\n{t.full_text[:4000]}"
    )
    models_to_try = [
        "openai/gpt-oss-120b",
        "openai/gpt-oss-20b",
        "qwen/qwen3.6-27b",
        "groq/compound"
    ]
    parsed = None
    last_err = None
    if settings.GROQ_API_KEY:
        try:
            from groq import Groq
            client = Groq(api_key=settings.GROQ_API_KEY)
            for model_id in models_to_try:
                try:
                    resp = client.chat.completions.create(
                        model=model_id,
                        messages=[
                            {"role": "system", "content": "You are an expert audio translator. Return only valid JSON."},
                            {"role": "user", "content": prompt}
                        ],
                        response_format={"type": "json_object"},
                        temperature=0.2,
                        max_tokens=2000
                    )
                    parsed = json.loads(resp.choices[0].message.content)
                    if parsed:
                        break
                except Exception as err:
                    last_err = err
                    continue
        except Exception as groq_init_err:
            last_err = groq_init_err

    if parsed:
        t.translated_text = parsed.get("translated_text") or t.full_text
        t.translated_summary = parsed.get("translated_summary") or t.summary
        db.commit()
        return {
            "success": True,
            "translated_text": t.translated_text,
            "translated_summary": t.translated_summary,
            "cached": False
        }
    else:
        raise HTTPException(status_code=500, detail=f"Translation failed: {str(last_err)}")


THUMBNAIL_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "downloads", "thumbnails")
os.makedirs(THUMBNAIL_DIR, exist_ok=True)

@router.get("/thumbnail/{shortcode}")
def get_thumbnail_proxy(shortcode: str):
    """Proxy and cache Instagram reel thumbnails locally so they never expire or get blocked by CORS/Referrer policies."""
    clean_code = shortcode.strip()
    if not clean_code:
        raise HTTPException(status_code=400, detail="Invalid shortcode")

    cache_path = os.path.join(THUMBNAIL_DIR, f"{clean_code}.jpg")

    # 1. Return cached thumbnail file if already downloaded on disk
    if os.path.exists(cache_path) and os.path.getsize(cache_path) > 1000:
        return FileResponse(cache_path, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=604800"})

    # 2. Fetch fresh og:image URL from Instagram using Crawler User-Agent
    try:
        url = f"https://www.instagram.com/p/{clean_code}/"
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"}
        )
        with urllib.request.urlopen(req, timeout=8) as resp:
            html = resp.read().decode('utf-8', errors='ignore')
            m = re.search(r'property="og:image"\s+content="([^"]+)"', html)
            if not m:
                m = re.search(r'content="([^"]+)"\s+property="og:image"', html)

            if m:
                img_url = m.group(1).replace('&amp;', '&')
                img_req = urllib.request.Request(img_url, headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(img_req, timeout=10) as img_resp:
                    img_data = img_resp.read()
                    if len(img_data) > 1000:
                        with open(cache_path, "wb") as f:
                            f.write(img_data)
                        return FileResponse(cache_path, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=604800"})
    except Exception as err:
        print(f"[Thumbnail Proxy Error for {clean_code}]: {err}")

    # Fallback to direct Instagram CDN media URL if proxy fetch fails
    return Response(status_code=302, headers={"Location": f"https://www.instagram.com/p/{clean_code}/media/?size=l"})


# --- Core Reels & Search Endpoints ---

@router.get("/categories")
def get_categories():
    """Returns available knowledge base categories."""
    return {"categories": ["All"] + CATEGORIES}

@router.get("/reels")
def list_reels(
    token: Optional[str] = None,
    q: Optional[str] = Query(None),
    category: Optional[str] = Query("All"),
    collection_id: Optional[int] = Query(None),
    tag: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """Fetches and ranks reels for the active user's vault."""
    user = get_or_create_user(db, auth_token=token)
    
    # Strict per-user isolation: Only show reels owned by this user
    if user.instagram_sender_id:
        query_builder = db.query(ReelItem).filter(
            or_(ReelItem.user_id == user.id, ReelItem.sender_id == user.instagram_sender_id)
        )
    else:
        query_builder = db.query(ReelItem).filter(ReelItem.user_id == user.id)
    
    if source:
        query_builder = query_builder.filter(ReelItem.source == source)

    if collection_id is not None:
        query_builder = query_builder.filter(ReelItem.collection_id == collection_id)
        category = "All"

    reels_db = query_builder.options(
        joinedload(ReelItem.transcript),
        joinedload(ReelItem.collection)
    ).order_by(desc(ReelItem.created_at)).all()
    
    # Auto-recover stale reels stuck in processing for > 3 minutes
    try:
        now_utc = datetime.datetime.utcnow()
        for r in reels_db:
            if r.status in ["processing", "downloading", "transcribing"] and r.created_at:
                try:
                    c_at = r.created_at
                    if isinstance(c_at, str):
                        c_at = datetime.datetime.fromisoformat(c_at.replace("Z", "+00:00"))
                    if hasattr(c_at, "tzinfo") and c_at.tzinfo is not None:
                        age_sec = (datetime.datetime.now(datetime.timezone.utc) - c_at).total_seconds()
                    else:
                        age_sec = (now_utc - c_at).total_seconds()
                    if age_sec > 180:
                        r.status = "failed"
                        r.error_message = "Transcription timed out. Tap retry."
                        db.commit()
                except Exception:
                    pass
    except Exception as stale_err:
        print(f"[Stale Recovery Safe Handler]: {stale_err}")

    # Format objects for search and frontend
    items = []
    for r in reels_db:
        t = r.transcript
        items.append({
            "id": r.id,
            "reel_url": r.reel_url,
            "shortcode": r.shortcode,
            "title": r.title or (f"Reel {r.shortcode}" if r.shortcode else f"Reel #{r.id}"),
            "author": r.author,
            "thumbnail_url": f"/api/thumbnail/{r.shortcode}" if r.shortcode else (r.thumbnail_url or None),
            "duration": r.duration,
            "collection_id": r.collection_id,
            "collection_name": r.collection.name if r.collection else None,
            "collection_emoji": r.collection.emoji if r.collection else None,
            "source": r.source,
            "sender_id": r.sender_id,
            "sender_username": r.sender_username,
            "category": r.category or "General Knowledge",
            "tags": r.tags or [],
            "action_items": r.action_items or [],
            "status": r.status,
            "error_message": r.error_message,
            "dm_replied": r.dm_replied,
            "created_at": r.created_at.isoformat() if r.created_at else "",
            "has_transcript": bool(t),
            "language": t.language if t else "en",
            "preview_text": t.full_text[:140] if t and t.full_text else "",
            "full_text": t.full_text if t else "",
            "summary": t.summary if t else "",
            "translated_text": t.translated_text if t else None,
            "translated_summary": t.translated_summary if t else None
        })

    # Apply hybrid semantic ranking & category filter
    ranked = rank_reels_search(items, query=q or "", category_filter=category, tag_filter=tag)
    return ranked

@router.post("/reels/{reel_id}/retry")
async def retry_reel(reel_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Re-triggers downloading and AI transcription for a failed or stuck reel."""
    reel = db.query(ReelItem).filter(ReelItem.id == reel_id).first()
    if not reel:
        raise HTTPException(status_code=404, detail="Reel not found")

    reel.status = "processing"
    reel.error_message = None
    reel.created_at = datetime.datetime.utcnow()
    db.commit()

    background_tasks.add_task(
        process_reel_pipeline,
        reel_id=reel.id,
        reel_url=reel.reel_url,
        sender_id=reel.sender_id,
        source=reel.source
    )
    return {"success": True, "message": f"Reel #{reel_id} queued for reprocessing", "status": "processing"}

@router.get("/reels/{reel_id}")
def get_reel_detail(reel_id: int, db: Session = Depends(get_db)):
    """Fetches full transcript, timestamps, and metadata for a specific reel."""
    reel = db.query(ReelItem).filter(ReelItem.id == reel_id).first()
    if not reel:
        raise HTTPException(status_code=404, detail="Reel not found")

    t = reel.transcript
    segments_data = []
    full_text_val = ""
    if t:
        if isinstance(t.segments, str):
            try:
                segments_data = json.loads(t.segments)
            except Exception:
                segments_data = []
        elif isinstance(t.segments, list):
            segments_data = t.segments
        
        full_text_val = t.full_text or ""
        if not full_text_val and segments_data:
            full_text_val = " ".join([s.get("text", "").strip() for s in segments_data if isinstance(s, dict)])

    return {
        "id": reel.id,
        "reel_url": reel.reel_url,
        "shortcode": reel.shortcode,
        "title": reel.title,
        "author": reel.author,
        "thumbnail_url": f"/api/thumbnail/{reel.shortcode}" if reel.shortcode else (reel.thumbnail_url or None),
        "duration": reel.duration,
        "collection_id": reel.collection_id,
        "collection_name": reel.collection.name if reel.collection else None,
        "collection_emoji": reel.collection.emoji if reel.collection else None,
        "source": reel.source,
        "sender_id": reel.sender_id,
        "sender_username": reel.sender_username,
        "category": reel.category or "General Knowledge",
        "tags": reel.tags or [],
        "action_items": reel.action_items or [],
        "status": reel.status,
        "error_message": reel.error_message,
        "dm_replied": reel.dm_replied,
        "created_at": reel.created_at.isoformat() if reel.created_at else "",
        "transcript": {
            "full_text": full_text_val,
            "language": t.language if t else "en",
            "summary": t.summary if t else "",
            "key_points": t.key_points or [],
            "segments": segments_data,
            "translated_text": t.translated_text if t else None,
            "translated_summary": t.translated_summary if t else None
        } if t else None
    }

@router.delete("/reels/{reel_id}")
def delete_reel(reel_id: int, db: Session = Depends(get_db)):
    """Deletes a reel and its transcript from the database."""
    try:
        db.query(Transcript).filter(Transcript.reel_id == reel_id).delete(synchronize_session=False)
        db.query(ReelItem).filter(ReelItem.id == reel_id).delete(synchronize_session=False)
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"[Delete Error]: {e}")
        reel = db.query(ReelItem).filter(ReelItem.id == reel_id).first()
        if reel:
            db.delete(reel)
            db.commit()
    return {"success": True, "message": f"Reel #{reel_id} deleted successfully"}


# --- "Ask Your Reels" AI RAG Chat Endpoint ---

@router.post("/chat")
@router.post("/chat/ask")
@router.post("/ask")
async def ask_chat_endpoint(req: AskChatRequest, token: Optional[str] = Header(None), db: Session = Depends(get_db)):
    """RAG AI Chat: Answers questions across user's saved reels."""
    auth_token = req.token or token
    user = get_or_create_user(db, auth_token=auth_token)
    
    # Fetch only this user's reels
    if user.instagram_sender_id:
        reels_db = db.query(ReelItem).filter(
            or_(ReelItem.user_id == user.id, ReelItem.sender_id == user.instagram_sender_id),
            ReelItem.status.in_(["completed", "success", "processed"])
        ).all()
    else:
        reels_db = db.query(ReelItem).filter(
            ReelItem.user_id == user.id,
            ReelItem.status.in_(["completed", "success", "processed"])
        ).all()

    # Fallback to any reel associated with user if status filter was restrictive
    if not reels_db:
        if user.instagram_sender_id:
            reels_db = db.query(ReelItem).filter(
                or_(ReelItem.user_id == user.id, ReelItem.sender_id == user.instagram_sender_id)
            ).all()
        else:
            reels_db = db.query(ReelItem).filter(ReelItem.user_id == user.id).all()

    reels_context = []
    for r in reels_db:
        t = r.transcript
        full_text = (t.full_text if t else "") or r.preview_text or ""
        summary = (t.summary if t else "") or r.preview_text or ""
        reels_context.append({
            "id": r.id,
            "title": r.title or f"Reel #{r.id}",
            "author": r.author or r.sender_username,
            "shortcode": r.shortcode,
            "reel_url": r.reel_url or (f"https://www.instagram.com/reel/{r.shortcode}/" if r.shortcode else ""),
            "category": r.category,
            "tags": r.tags or [],
            "action_items": r.action_items or [],
            "summary": summary,
            "full_text": full_text
        })

    result = await ask_reels_ai(req.question, reels_context, history=req.history)
    return result


# --- Web Transcribe Endpoint ---

@router.post("/transcribe")
async def transcribe_reel_endpoint(req: TranscribeRequest, background_tasks: BackgroundTasks, token: Optional[str] = Header(None), db: Session = Depends(get_db)):
    """Accepts a reel link from Web UI and processes it."""
    if not req.url or ("instagram.com" not in req.url and "instagr.am" not in req.url):
        raise HTTPException(status_code=400, detail="Invalid Instagram URL. Please provide a valid instagram.com/reel link.")

    user = get_or_create_user(db, auth_token=token)

    if req.groq_api_key:
        settings.GROQ_API_KEY = req.groq_api_key
    if req.openai_api_key:
        settings.OPENAI_API_KEY = req.openai_api_key

    clean_url = normalize_instagram_url(req.url)
    shortcode = extract_shortcode(clean_url)

    reel = ReelItem(
        user_id=user.id,
        reel_url=clean_url,
        shortcode=shortcode,
        source="web_ui",
        status="processing"
    )
    db.add(reel)
    db.commit()
    db.refresh(reel)

    background_tasks.add_task(process_reel_pipeline, reel.id, clean_url, None, "web_ui", user.id)

    return {
        "success": True,
        "reel_id": reel.id,
        "message": "Reel registered. Transcription & AI categorization started in background."
    }

@router.post("/reels/{reel_id}/retry")
def retry_reel_processing(reel_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Forces immediate re-processing of any reel."""
    reel = db.query(ReelItem).filter(ReelItem.id == reel_id).first()
    if not reel:
        raise HTTPException(status_code=404, detail="Reel not found.")
    
    reel.status = "processing"
    reel.error_message = None
    db.commit()
    
    clean_url = reel.reel_url or (f"https://www.instagram.com/reel/{reel.shortcode}/" if reel.shortcode else "")
    background_tasks.add_task(process_reel_pipeline, reel.id, clean_url, reel.sender_id, reel.source or "web_ui", reel.user_id)
    return {"success": True, "message": f"Retrying Reel #{reel.id} in background."}


# --- Webhook & Meta Instagram Ingestion ---

@router.get("/webhook/instagram")
def verify_instagram_webhook(
    hub_mode: Optional[str] = Query(None, alias="hub.mode"),
    hub_verify_token: Optional[str] = Query(None, alias="hub.verify_token"),
    hub_challenge: Optional[str] = Query(None, alias="hub.challenge")
):
    """Meta Webhook handshake verification."""
    print(f"[Webhook Verify Handshake] Mode: {hub_mode}, Token: {hub_verify_token}")
    expected_token = settings.META_VERIFY_TOKEN
    if hub_mode == "subscribe" and hub_verify_token == expected_token:
        print("[Webhook Verification Accepted! 200 OK]")
        return Response(content=str(hub_challenge), media_type="text/plain", status_code=200)
    
    raise HTTPException(status_code=403, detail="Verification token mismatch.")

PROCESSED_MIDS = set()

@router.post("/webhook/instagram")
async def receive_instagram_webhook(request: Request, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Receives inbound Instagram DMs, pairing codes, and shared Reels."""
    try:
        body = await request.json()
        print(f"\n[Meta Webhook Event Received]:\n{body}\n")

        events = parse_webhook_payload(body)
        for item in events:
            mid = item.get("message_id")
            if mid:
                if mid in PROCESSED_MIDS:
                    print(f"[Deduplication] Skipping already processed message_id: {mid}")
                    continue
                PROCESSED_MIDS.add(mid)
                if len(PROCESSED_MIDS) > 2000:
                    PROCESSED_MIDS.clear()

            sender_id = item["sender_id"]
            reel_urls = item.get("reel_urls", [])
            message_text = (item.get("message_text") or "").strip()

            # 1. Check for Account Pairing Code (e.g. "MIND-938817", "DEX-938817", or pure "938817")
            code_match = re.search(r'(?:MIND|DEX|PAIR|LINK)?-?\s*([0-9]{5,6})\b', message_text.upper())
            if code_match and not reel_urls:
                extracted_num = code_match.group(1)
                p_code = db.query(PairingCode).filter(
                    PairingCode.code.like(f"%{extracted_num}"),
                    PairingCode.is_used == False,
                    PairingCode.expires_at > datetime.datetime.utcnow()
                ).first()

                if p_code:
                    target_user = p_code.user

                    # Merge previous records with this instagram_sender_id
                    existing_senders = db.query(User).filter(User.instagram_sender_id == sender_id, User.id != target_user.id).all()
                    for old_u in existing_senders:
                        db.query(ReelItem).filter(ReelItem.user_id == old_u.id).update({"user_id": target_user.id})
                        old_u.instagram_sender_id = None
                    db.commit()

                    # Also claim any unassigned reels from this sender_id
                    db.query(ReelItem).filter(ReelItem.sender_id == sender_id).update({"user_id": target_user.id})

                    target_user.instagram_sender_id = sender_id
                    p_code.is_used = True
                    db.commit()

                    frontend_base = (settings.FRONTEND_URL or "https://reeldex-io.vercel.app").rstrip("/")
                    vault_url = f"{frontend_base}/?token={target_user.auth_token}"
                    confirm_msg = (
                        f"🎉 Your Instagram is now CONNECTED to ReelDex!\n\n"
                        f"Any Reel you send here will be automatically transcribed, categorized, and searchable in your personal library.\n\n"
                        f"👉 Open your Vault: {vault_url}"
                    )
                    await send_instagram_dm(sender_id, confirm_msg)
                    continue
                else:
                    await send_instagram_dm(sender_id, "⚠️ Pairing code not found or expired. Please generate a new code on ReelDex.io.")
                    continue

            # 2. Get or provision user for this sender
            user = get_or_create_user(db, sender_id=sender_id)

            # 3. Process Shared Reels
            if reel_urls:
                for r_url in reel_urls:
                    clean_url = normalize_instagram_url(r_url)
                    shortcode = extract_shortcode(clean_url)

                    # Deduplication: Check if this reel was already processed or is in-flight for this user
                    dedup_filters = [
                        or_(ReelItem.user_id == user.id, ReelItem.sender_id == sender_id),
                        ReelItem.reel_url == clean_url
                    ]
                    # Only add shortcode filter if we actually extracted one
                    if shortcode:
                        dedup_filters = [
                            or_(ReelItem.user_id == user.id, ReelItem.sender_id == sender_id),
                            or_(ReelItem.shortcode == shortcode, ReelItem.reel_url == clean_url)
                        ]
                    existing_recent = db.query(ReelItem).filter(*dedup_filters).order_by(ReelItem.id.desc()).first()

                    if existing_recent:
                        if existing_recent.status in ["completed", "processing", "downloading", "transcribing"]:
                            print(f"[Deduplication] Reel #{existing_recent.id} already exists ({existing_recent.status}). Skipping.")
                            continue
                        elif existing_recent.status == "failed":
                            print(f"[Webhook Retry] Reel #{existing_recent.id} previously failed. Re-triggering pipeline on existing record.")
                            existing_recent.status = "processing"
                            existing_recent.error_message = None
                            existing_recent.created_at = datetime.datetime.utcnow()
                            db.commit()
                            background_tasks.add_task(process_reel_pipeline, existing_recent.id, clean_url, sender_id, "instagram_dm", user.id)
                            continue

                    reel = ReelItem(
                        user_id=user.id,
                        reel_url=clean_url,
                        shortcode=shortcode,
                        source="instagram_dm",
                        sender_id=sender_id,
                        sender_username=f"User #{sender_id[-4:]}",
                        status="processing"
                    )
                    db.add(reel)
                    db.commit()
                    db.refresh(reel)

                    background_tasks.add_task(process_reel_pipeline, reel.id, clean_url, sender_id, "instagram_dm", user.id)

            elif message_text:
                # Do NOT auto-reply to bot confirmation texts or echoes
                lower_text = message_text.lower()
                if "http" in lower_text or "reeldex" in lower_text or "saved to your" in lower_text:
                    continue

                # Clean, accurate welcome message
                frontend_base = (settings.FRONTEND_URL or "https://reeldex-io.vercel.app").rstrip("/")
                vault_url = f"{frontend_base}/?token={user.auth_token}" if user else frontend_base
                welcome_msg = (
                    "👋 Hi! Share or send any Instagram Reel here.\n\n"
                    "✨ ReelDex will automatically:\n"
                    "• Transcribe spoken audio & summarize key takeaways\n"
                    "• Categorize & save it to your searchable Vault\n"
                    "• Let you Ask AI questions across all your saved Reels\n\n"
                    f"👉 Open your Vault:\n{vault_url}"
                )
                await send_instagram_dm(sender_id, welcome_msg)

        return Response(content="EVENT_RECEIVED", media_type="text/plain", status_code=200)
    except Exception as e:
        print(f"[Webhook Event Error]: {repr(e)}")
        return Response(content="EVENT_RECEIVED", media_type="text/plain", status_code=200)


# --- Settings & Config ---

@router.get("/config")
def get_config():
    return {
        "groq_configured": bool(settings.GROQ_API_KEY),
        "openai_configured": bool(settings.OPENAI_API_KEY),
        "instagram_configured": bool(settings.INSTAGRAM_PAGE_ACCESS_TOKEN),
        "verify_token": settings.META_VERIFY_TOKEN
    }

@router.post("/config")
def update_config(req: ConfigUpdateRequest):
    if req.groq_api_key:
        settings.GROQ_API_KEY = req.groq_api_key
    if req.openai_api_key is not None:
        settings.OPENAI_API_KEY = req.openai_api_key
    if req.instagram_page_access_token:
        settings.INSTAGRAM_PAGE_ACCESS_TOKEN = req.instagram_page_access_token
    if req.meta_verify_token:
        settings.META_VERIFY_TOKEN = req.meta_verify_token
    return {"success": True, "message": "Configuration updated successfully"}
