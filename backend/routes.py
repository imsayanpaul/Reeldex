import os
import re
import json
import uuid
import datetime
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query, Header, Request, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc

from backend.database import get_db, engine, Base
from backend.models import ReelItem, Transcript, User, PairingCode
from backend.downloader import download_audio_from_reel, normalize_instagram_url, extract_shortcode
from backend.transcriber import transcribe_audio_file
from backend.summarizer import extract_reel_insights, CATEGORIES
from backend.search import rank_reels_search, ask_reels_ai
from backend.instagram_bot import send_instagram_dm, parse_webhook_payload
from backend.config import settings

# Create all tables on startup
Base.metadata.create_all(bind=engine)

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
async def process_reel_pipeline(reel_id: int, reel_url: str, sender_id: Optional[str] = None, source: str = "web_ui", user_id: Optional[int] = None):
    """
    1. Downloads pure audio stream (yt-dlp) in ~1s.
    2. Transcribes with Groq Whisper.
    3. Categorizes, tags & extracts action items with Groq LLaMA 3.3 70B.
    4. Auto-replies to user on Instagram with summary, tags & magic link.
    """
    from backend.database import SessionLocal
    db = SessionLocal()
    reel = None
    try:
        reel = db.query(ReelItem).filter(ReelItem.id == reel_id).first()
        if not reel:
            return

        reel.status = "downloading"
        db.commit()

        # 1. Download pure audio stream & extract metadata
        dl_result = download_audio_from_reel(reel_url)
        audio_path = dl_result.get("audio_path")
        
        reel.title = dl_result.get("title") or reel.title or f"Reel {reel.shortcode or ''}"
        reel.author = dl_result.get("author") or reel.author
        reel.thumbnail_url = dl_result.get("thumbnail_url") or reel.thumbnail_url
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

        # Cleanup audio file
        try:
            if os.path.exists(audio_path):
                os.remove(audio_path)
        except Exception:
            pass

        # 3. Extract AI Insights, Category, Tags & Action Items
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
        if source == "instagram_dm" and sender_id and settings.INSTAGRAM_PAGE_ACCESS_TOKEN:
            # Find user token for magic link
            user = db.query(User).filter(User.id == reel.user_id).first() if reel.user_id else None
            frontend_base = (settings.FRONTEND_URL or "https://reeldex-io.vercel.app").rstrip("/")
            vault_url = f"{frontend_base}/?token={user.auth_token}" if user else frontend_base

            # Format title and creator
            video_title = reel.title or "Instagram Reel"
            creator_tag = f" by @{reel.author}" if reel.author else ""

            # Clean DM response
            summary_msg = f"✨ Saved to your ReelDex!\n\n🎬 {video_title}{creator_tag}\n🏷️ [{category}]\n\n🔗 View summary & transcript:\n{vault_url}"
            sent = await send_instagram_dm(sender_id, summary_msg)
            reel.dm_replied = sent
            db.commit()

    except Exception as e:
        print(f"[Pipeline Error for Reel #{reel_id}]: {e}")
        if reel:
            reel.status = "failed"
            reel.error_message = f"Pipeline error: {str(e)}"
            db.commit()
    finally:
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

class AuthSessionRequest(BaseModel):
    token: Optional[str] = None


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

    reels_db = query_builder.order_by(desc(ReelItem.created_at)).all()
    
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
            "thumbnail_url": r.thumbnail_url,
            "duration": r.duration,
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
            "preview_text": t.full_text[:140] if t and t.full_text else "",
            "full_text": t.full_text if t else "",
            "summary": t.summary if t else ""
        })

    # Apply hybrid semantic ranking & category filter
    ranked = rank_reels_search(items, query=q or "", category_filter=category, tag_filter=tag)
    return ranked

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
        "thumbnail_url": reel.thumbnail_url,
        "duration": reel.duration,
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
            "language": t.language,
            "summary": t.summary,
            "key_points": t.key_points or [],
            "segments": segments_data
        } if t else None
    }

@router.delete("/reels/{reel_id}")
def delete_reel(reel_id: int, db: Session = Depends(get_db)):
    """Deletes a reel and its transcript from the database."""
    reel = db.query(ReelItem).filter(ReelItem.id == reel_id).first()
    if not reel:
        raise HTTPException(status_code=404, detail="Reel not found")
    
    db.delete(reel)
    db.commit()
    return {"success": True, "message": f"Reel #{reel_id} deleted successfully"}


# --- "Ask Your Reels" AI RAG Chat Endpoint ---

@router.post("/chat/ask")
async def ask_chat_endpoint(req: AskChatRequest, token: Optional[str] = Header(None), db: Session = Depends(get_db)):
    """RAG AI Chat: Answers questions across user's saved reels."""
    user = get_or_create_user(db, auth_token=token)
    
    # Fetch only this user's reels
    if user.instagram_sender_id:
        reels_db = db.query(ReelItem).filter(
            or_(ReelItem.user_id == user.id, ReelItem.sender_id == user.instagram_sender_id),
            ReelItem.status == "completed"
        ).all()
    else:
        reels_db = db.query(ReelItem).filter(
            ReelItem.user_id == user.id,
            ReelItem.status == "completed"
        ).all()

    reels_context = []
    for r in reels_db:
        t = r.transcript
        if t and t.full_text:
            reels_context.append({
                "id": r.id,
                "title": r.title or f"Reel #{r.id}",
                "author": r.author,
                "reel_url": r.reel_url,
                "category": r.category,
                "tags": r.tags or [],
                "action_items": r.action_items or [],
                "summary": t.summary or "",
                "full_text": t.full_text
            })

    result = await ask_reels_ai(req.question, reels_context)
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

@router.post("/webhook/instagram")
async def receive_instagram_webhook(request: Request, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Receives inbound Instagram DMs, pairing codes, and shared Reels."""
    try:
        body = await request.json()
        print(f"\n[Meta Webhook Event Received]:\n{body}\n")

        events = parse_webhook_payload(body)
        for item in events:
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

                    vault_url = f"https://birthday-leone-hair-spoke.trycloudflare.com/?token={target_user.auth_token}"
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
                # Welcome reply for plain text message
                welcome_msg = (
                    "👋 Hi! Send me any Instagram Reel or video share, "
                    "and ReelDex will transcribe, summarize, and categorize it for you instantly! 🎙️✨"
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
