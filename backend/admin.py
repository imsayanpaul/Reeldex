"""Admin-only overview of users. Restricted to ADMIN_USER_IDS; everyone else gets 404."""
import datetime
from typing import Any, Dict

from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from backend.auth import rate_limit, require_admin
from backend.database import get_db
from backend.models import AIUsage, Collection, ReelItem, SavedChat, User

router = APIRouter()

# Default names given to new accounts; not worth showing as a real name
PLACEHOLDER_NAMES = ("ReelDex Explorer", "ReelMind Explorer", "Instagram @")


def _iso(dt):
    return dt.isoformat() + "Z" if dt else None


@router.get("/admin/me", dependencies=[Depends(require_admin)])
def admin_me():
    return {"admin": True}


def _empty_guests(db: Session, admin_id: int):
    """Guests with no Instagram, reels, collections or chats, not seen in the last 24 hours."""
    cutoff = datetime.datetime.utcnow() - datetime.timedelta(hours=24)
    has_reels = db.query(ReelItem.id).filter(ReelItem.user_id == User.id).exists()
    has_collections = db.query(Collection.id).filter(Collection.user_id == User.id).exists()
    has_chats = db.query(SavedChat.id).filter(SavedChat.user_id == User.id).exists()
    return db.query(User).filter(
        User.instagram_sender_id.is_(None),
        User.id != admin_id,
        ~has_reels, ~has_collections, ~has_chats,
        (User.last_seen_at.is_(None)) | (User.last_seen_at < cutoff),
        User.created_at < cutoff,
    )


@router.post("/admin/cleanup-guests", dependencies=[Depends(rate_limit("admin-cleanup", 5, 60))])
def cleanup_guests(dry_run: bool = True, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Counts (dry_run) or deletes empty guest accounts. Accounts holding any data are never touched."""
    from backend.models import PairingCode
    ids = [u.id for u in _empty_guests(db, admin.id).with_entities(User.id).all()]
    if dry_run or not ids:
        return {"count": len(ids), "deleted": 0}
    deleted = 0
    for start in range(0, len(ids), 500):
        chunk = ids[start:start + 500]
        db.query(PairingCode).filter(PairingCode.user_id.in_(chunk)).delete(synchronize_session=False)
        deleted += db.query(User).filter(User.id.in_(chunk)).delete(synchronize_session=False)
    db.commit()
    print(f"[Admin] User #{admin.id} deleted {deleted} empty guest accounts")
    return {"count": len(ids), "deleted": deleted}


@router.get("/admin/users", dependencies=[Depends(rate_limit("admin", 30, 60))])
def admin_users(background_tasks: BackgroundTasks, admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> Dict[str, Any]:
    # Fill in missing @usernames for linked users, a few per visit (they appear on the next refresh)
    from backend.routes import fill_instagram_username
    missing = db.query(User.id, User.instagram_sender_id).filter(
        User.instagram_sender_id.isnot(None), User.instagram_username.is_(None),
    ).limit(25).all()
    for user_id, sender_id in missing:
        background_tasks.add_task(fill_instagram_username, user_id, sender_id)

    reel_stats = {
        row.user_id: row for row in db.query(
            ReelItem.user_id,
            func.count(ReelItem.id).label("total"),
            func.sum(case((ReelItem.status == "completed", 1), else_=0)).label("completed"),
            func.sum(case((ReelItem.status == "failed", 1), else_=0)).label("failed"),
            func.sum(case((ReelItem.source == "instagram_dm", 1), else_=0)).label("from_dm"),
            func.max(ReelItem.created_at).label("last_reel"),
        ).group_by(ReelItem.user_id).all()
    }
    collections = dict(db.query(Collection.user_id, func.count(Collection.id)).group_by(Collection.user_id).all())
    chats = {
        row.user_id: row for row in db.query(
            SavedChat.user_id, func.count(SavedChat.id).label("n"), func.max(SavedChat.updated_at).label("last"),
        ).group_by(SavedChat.user_id).all()
    }

    since_30d = datetime.datetime.utcnow() - datetime.timedelta(days=30)
    ai = {
        row.user_id: row for row in db.query(
            AIUsage.user_id,
            func.sum(AIUsage.input_tokens).label("tin"),
            func.sum(AIUsage.output_tokens).label("tout"),
            func.sum(AIUsage.audio_seconds).label("audio"),
            func.sum(case((AIUsage.created_at >= since_30d, AIUsage.input_tokens + AIUsage.output_tokens), else_=0)).label("t30"),
            func.count(AIUsage.id).label("calls"),
        ).group_by(AIUsage.user_id).all()
    }

    users = []
    for u in db.query(User).all():
        r = reel_stats.get(u.id)
        c = chats.get(u.id)
        last_active = max([d for d in (u.last_seen_at, r.last_reel if r else None, c.last if c else None) if d], default=None)
        users.append({
            "id": u.id,
            "name": "" if (u.display_name or "").startswith(PLACEHOLDER_NAMES) else (u.display_name or ""),
            "instagram": u.instagram_username or (f"User #{u.instagram_sender_id[-4:]}" if u.instagram_sender_id else ""),
            "linked": bool(u.instagram_sender_id),
            "joinedAt": _iso(u.created_at),
            "lastSeenAt": _iso(u.last_seen_at),
            "lastActiveAt": _iso(last_active),
            "lastReelAt": _iso(r.last_reel) if r else None,
            "reels": int(r.total) if r else 0,
            "completed": int(r.completed or 0) if r else 0,
            "failed": int(r.failed or 0) if r else 0,
            "fromDm": int(r.from_dm or 0) if r else 0,
            "collections": int(collections.get(u.id, 0)),
            "savedChats": int(c.n) if c else 0,
            "inputTokens": int(ai[u.id].tin or 0) if u.id in ai else 0,
            "outputTokens": int(ai[u.id].tout or 0) if u.id in ai else 0,
            "tokens": int((ai[u.id].tin or 0) + (ai[u.id].tout or 0)) if u.id in ai else 0,
            "tokens30d": int(ai[u.id].t30 or 0) if u.id in ai else 0,
            "audioSeconds": round(float(ai[u.id].audio or 0), 1) if u.id in ai else 0,
            "aiCalls": int(ai[u.id].calls) if u.id in ai else 0,
        })

    now = datetime.datetime.utcnow()

    def within(iso, days):
        return bool(iso) and now - datetime.datetime.fromisoformat(iso.rstrip("Z")) <= datetime.timedelta(days=days)

    by_feature = [
        {"feature": f, "calls": int(n), "tokens": int((tin or 0) + (tout or 0)), "audioSeconds": round(float(audio or 0), 1)}
        for f, n, tin, tout, audio in db.query(
            AIUsage.feature, func.count(AIUsage.id), func.sum(AIUsage.input_tokens),
            func.sum(AIUsage.output_tokens), func.sum(AIUsage.audio_seconds),
        ).group_by(AIUsage.feature).all()
    ]
    unattributed = ai.get(None)

    reels_7d = db.query(func.count(ReelItem.id)).filter(ReelItem.created_at >= now - datetime.timedelta(days=7)).scalar() or 0
    total_reels = sum(u["reels"] for u in users)
    failed = sum(u["failed"] for u in users)
    return {
        "generatedAt": _iso(now),
        "summary": {
            "totalUsers": len(users),
            "linkedInstagram": sum(1 for u in users if u["linked"]),
            "withReels": sum(1 for u in users if u["reels"]),
            "newLast7Days": sum(1 for u in users if within(u["joinedAt"], 7)),
            "activeLast7Days": sum(1 for u in users if within(u["lastActiveAt"], 7)),
            "activeLast30Days": sum(1 for u in users if within(u["lastActiveAt"], 30)),
            "totalReels": total_reels,
            "reelsLast7Days": reels_7d,
            "failedReels": failed,
            "fromDm": sum(u["fromDm"] for u in users),
            "totalTokens": sum(u["tokens"] for u in users) + (int((unattributed.tin or 0) + (unattributed.tout or 0)) if unattributed else 0),
            "tokensLast30Days": sum(u["tokens30d"] for u in users) + (int(unattributed.t30 or 0) if unattributed else 0),
            "audioSeconds": round(sum(u["audioSeconds"] for u in users) + (float(unattributed.audio or 0) if unattributed else 0), 1),
        },
        "byFeature": sorted(by_feature, key=lambda f: -f["tokens"] - f["audioSeconds"]),
        "users": users,
    }
