"""Request authentication, ownership checks and simple rate limiting."""
import hashlib
import hmac
import threading
import time
from collections import defaultdict, deque
from typing import Optional

from fastapi import Depends, Header, HTTPException, Query, Request
from sqlalchemy import or_
from sqlalchemy.orm import Session

from backend.config import settings
from backend.database import get_db
from backend.models import ReelItem, User


def read_token(
    authorization: Optional[str] = Header(None),
    token_header: Optional[str] = Header(None, alias="token"),
    token: Optional[str] = Query(None),
) -> Optional[str]:
    """Token from `Authorization: Bearer`, or the legacy `token` header / query param."""
    if authorization and authorization.lower().startswith("bearer "):
        value = authorization[7:].strip()
        if value:
            return value
    return token_header or token or None


def require_user(raw_token: Optional[str] = Depends(read_token), db: Session = Depends(get_db)) -> User:
    """The signed-in user. Unlike /auth/session, never creates an account."""
    if not raw_token:
        raise HTTPException(status_code=401, detail="Missing session token")
    user = db.query(User).filter(User.auth_token == raw_token).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return user


def owned_reels(db: Session, user: User):
    """Query over reels this user owns (saved on the web or sent from their Instagram)."""
    if user.instagram_sender_id:
        return db.query(ReelItem).filter(
            or_(ReelItem.user_id == user.id, ReelItem.sender_id == user.instagram_sender_id)
        )
    return db.query(ReelItem).filter(ReelItem.user_id == user.id)


def get_owned_reel(db: Session, user: User, reel_id: int) -> ReelItem:
    reel = owned_reels(db, user).filter(ReelItem.id == reel_id).first()
    if not reel:
        # 404 rather than 403 so ids of other people's reels aren't confirmed
        raise HTTPException(status_code=404, detail="Reel not found")
    return reel


def verify_meta_signature(raw_body: bytes, signature_header: Optional[str]) -> bool:
    """Checks Meta's X-Hub-Signature-256 (HMAC-SHA256 of the body with the app secret)."""
    secret = settings.META_APP_SECRET
    if not secret:
        return True  # not configured: accepted, with a warning at startup
    if not signature_header or not signature_header.startswith("sha256="):
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature_header[7:])


# --- Rate limiting (per client IP, per worker process) ---
_hits = defaultdict(deque)
_lock = threading.Lock()


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def rate_limit(name: str, limit: int, window_seconds: int):
    """Dependency: at most `limit` requests per `window_seconds` per IP for this bucket."""
    def dependency(request: Request):
        key = f"{name}:{client_ip(request)}"
        now = time.monotonic()
        with _lock:
            hits = _hits[key]
            while hits and now - hits[0] > window_seconds:
                hits.popleft()
            if len(hits) >= limit:
                retry = int(window_seconds - (now - hits[0])) + 1
                raise HTTPException(
                    status_code=429,
                    detail="Too many requests. Please slow down.",
                    headers={"Retry-After": str(retry)},
                )
            hits.append(now)
            # Keep memory bounded
            if len(_hits) > 10000:
                _hits.clear()
    return dependency
