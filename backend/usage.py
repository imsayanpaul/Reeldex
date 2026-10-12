"""Per-user AI usage tracking.

The code that knows the user (a route, the reel pipeline) calls `for_user(user_id)`;
the code that calls the model calls `record(...)`. A context variable connects the two,
so model wrappers don't need a user argument. Recording never breaks the request.
"""
import contextvars
from typing import Any, Optional

_current_user: contextvars.ContextVar[Optional[int]] = contextvars.ContextVar("ai_usage_user", default=None)


def for_user(user_id: Optional[int]) -> None:
    """Attribute AI calls made from here on (in this request or worker) to this user."""
    _current_user.set(user_id)


def _tokens(response: Any):
    usage = getattr(response, "usage", None)
    if usage is None and isinstance(response, dict):
        usage = response.get("usage")
    if usage is None:
        return 0, 0
    get = (lambda k: usage.get(k)) if isinstance(usage, dict) else (lambda k: getattr(usage, k, None))
    return int(get("prompt_tokens") or 0), int(get("completion_tokens") or 0)


def record(feature: str, model: str, response: Any = None, audio_seconds: float = 0.0) -> None:
    """Saves one AI call. Pass the model response for token counts, or audio_seconds for Whisper."""
    try:
        from backend.database import SessionLocal
        from backend.models import AIUsage
        input_tokens, output_tokens = _tokens(response) if response is not None else (0, 0)
        db = SessionLocal()
        try:
            db.add(AIUsage(
                user_id=_current_user.get(), feature=feature, model=model,
                input_tokens=input_tokens, output_tokens=output_tokens, audio_seconds=float(audio_seconds or 0),
            ))
            db.commit()
        finally:
            db.close()
    except Exception as err:
        print(f"[Usage] Could not record {feature}: {err}")
