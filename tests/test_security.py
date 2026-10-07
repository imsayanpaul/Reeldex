"""Security and access-control tests for the ReelDex API.

Two users, A and B, share one database. Every test checks that a user can only see and change
their own reels, collections and saved chats, that webhooks must be signed by Meta, and that
the abuse protections (rate limits, input validation) hold.

Tests run top to bottom and share state on purpose: later tests build on the reel, collection
and chat that earlier ones create. Run with `pytest` from the repo root.
"""
import hashlib
import hmac
import json

import pytest
from sqlalchemy import text

from backend.models import Collection, ReelItem, Transcript
from conftest import META_SECRET, bearer

REEL_URL = "https://www.instagram.com/reel/ABCdef123/?igsh=x"


def signed(payload: bytes):
    return {"x-hub-signature-256": "sha256=" + hmac.new(META_SECRET, payload, hashlib.sha256).hexdigest()}


def dm(sender, mid, text_):
    return json.dumps({"entry": [{"id": "bot", "messaging": [{"sender": {"id": sender}, "message": {"mid": mid, "text": text_}}]}]}).encode()


@pytest.fixture(scope="module")
def reel_id(client, db, user_a):
    """A reel owned by user A, marked completed with a transcript."""
    r = client.post("/api/transcribe", json={"url": REEL_URL}, headers=bearer(user_a))
    assert r.status_code == 200, r.text
    rid = r.json()["reel_id"]
    reel = db.get(ReelItem, rid)
    reel.status = "completed"
    db.add(Transcript(reel_id=rid, full_text="hello world transcript text", summary="s"))
    db.commit()
    return rid


@pytest.fixture(scope="module")
def collection_a(client, user_a):
    return client.post("/api/collections", json={"name": "Ideas"}, headers=bearer(user_a)).json()["id"]


# --- Saving reels ---

def test_a_can_save_a_reel(reel_id):
    assert reel_id


def test_same_reel_twice_returns_existing(client, user_a, reel_id):
    dup = client.post("/api/transcribe", json={"url": "https://instagram.com/reel/ABCdef123/"}, headers=bearer(user_a)).json()
    assert dup.get("duplicate") and dup["reel_id"] == reel_id


def test_non_reel_url_rejected(client, user_a):
    assert client.post("/api/transcribe", json={"url": "https://instagram.com/someone"}, headers=bearer(user_a)).status_code == 400


# --- Authentication ---

def test_no_token_gets_401(client):
    assert client.get("/api/reels").status_code == 401


def test_bad_token_gets_401(client):
    assert client.get("/api/reels", headers=bearer("nope")).status_code == 401


def test_anonymous_calls_dont_create_accounts(client, db):
    before = db.execute(text("select count(*) from users")).scalar()
    client.get("/api/collections")
    client.get("/api/reels")
    assert db.execute(text("select count(*) from users")).scalar() == before


# --- Reel ownership ---

def test_a_sees_own_reel(client, user_a, reel_id):
    assert any(x["id"] == reel_id for x in client.get("/api/reels", headers=bearer(user_a)).json())


def test_list_omits_full_transcripts(client, user_a, reel_id):
    assert "full_text" not in client.get("/api/reels", headers=bearer(user_a)).json()[0]


def test_a_reads_own_detail(client, user_a, reel_id):
    assert client.get(f"/api/reels/{reel_id}", headers=bearer(user_a)).status_code == 200


def test_b_cant_list_a_reel(client, user_b, reel_id):
    assert client.get("/api/reels", headers=bearer(user_b)).json() == []


def test_b_cant_read_a_reel(client, user_b, reel_id):
    assert client.get(f"/api/reels/{reel_id}", headers=bearer(user_b)).status_code == 404


def test_b_cant_retry_a_reel(client, user_b, reel_id):
    assert client.post(f"/api/reels/{reel_id}/retry", headers=bearer(user_b)).status_code == 404


def test_b_cant_translate_a_reel(client, user_b, reel_id):
    assert client.post(f"/api/reels/{reel_id}/translate", headers=bearer(user_b)).status_code == 404


def test_b_cant_delete_a_reel(client, user_b, reel_id):
    assert client.delete(f"/api/reels/{reel_id}", headers=bearer(user_b)).status_code == 404


def test_b_batch_delete_removes_nothing(client, db, user_b, reel_id):
    r = client.post("/api/reels/batch/delete", json={"reel_ids": [reel_id]}, headers=bearer(user_b)).json()
    assert r["count"] == 0
    assert db.get(ReelItem, reel_id) is not None


# --- Collection ownership ---

def test_a_sees_own_collection(client, user_a, collection_a):
    assert len(client.get("/api/collections", headers=bearer(user_a)).json()) == 1


def test_b_doesnt_see_a_collection(client, user_b, collection_a):
    assert client.get("/api/collections", headers=bearer(user_b)).json() == []


def test_b_cant_take_over_a_collection(client, db, user_a, user_b, reel_id, collection_a):
    r = client.post("/api/reels/batch/assign", json={"reel_ids": [reel_id], "collection_id": collection_a}, headers=bearer(user_b))
    db.expire_all()
    assert r.status_code == 404
    assert db.get(Collection, collection_a).user_id is not None
    assert client.get("/api/collections", headers=bearer(user_a)).json()[0]["id"] == collection_a


def test_b_cant_rename_a_collection(client, user_b, collection_a):
    assert client.patch(f"/api/collections/{collection_a}", json={"name": "x"}, headers=bearer(user_b)).status_code == 404


def test_b_cant_move_a_reel(client, user_b, reel_id):
    assert client.patch(f"/api/reels/{reel_id}/collection", json={"collection_id": None}, headers=bearer(user_b)).status_code == 404


def test_a_batch_assigns_own_reel(client, user_a, reel_id, collection_a):
    r = client.post("/api/reels/batch/assign", json={"reel_ids": [reel_id], "collection_id": collection_a}, headers=bearer(user_a))
    assert r.json().get("count") == 1
    assert client.get("/api/collections", headers=bearer(user_a)).json()[0]["count"] == 1


# --- Older clients ---

def test_legacy_query_token_still_works(client, user_a):
    assert client.get(f"/api/reels?token={user_a}").status_code == 200


def test_legacy_token_header_still_works(client, user_a):
    assert client.get("/api/reels", headers={"token": user_a}).status_code == 200


# --- Server config can't be changed or read over HTTP ---

def test_post_config_removed(client):
    assert client.post("/api/config", json={"groq_api_key": "evil"}).status_code in (404, 405)


def test_get_config_hides_secrets(client):
    assert "verify_token" not in client.get("/api/config").json()


# --- Input validation ---

def test_thumbnail_rejects_bad_shortcode(client):
    assert client.get("/api/thumbnail/..%5C..%5Cetc").status_code in (400, 404)


# --- Instagram webhook ---

def verify(client, token):
    return client.get("/api/webhook/instagram", params={"hub.mode": "subscribe", "hub.verify_token": token, "hub.challenge": "42"})


def test_verify_handshake_fails_without_configured_token(client, monkeypatch):
    from backend.config import settings
    monkeypatch.setattr(settings, "META_VERIFY_TOKEN", "")
    assert verify(client, "instam_secret_verify_token_2026").status_code == 403
    assert verify(client, "").status_code == 403


def test_verify_handshake_needs_exact_token(client, monkeypatch):
    from backend.config import settings
    monkeypatch.setattr(settings, "META_VERIFY_TOKEN", "rdx_test_token")
    assert verify(client, "rdx_test_toke").status_code == 403
    r = verify(client, "rdx_test_token")
    assert r.status_code == 200 and r.text == "42"


def test_unsigned_webhook_rejected(client):
    assert client.post("/api/webhook/instagram", content=dm("999", "m1", "hi")).status_code == 403


def test_signed_webhook_accepted(client):
    payload = dm("999", "m1", "hi")
    assert client.post("/api/webhook/instagram", content=payload, headers=signed(payload)).status_code == 200


def test_partial_pairing_code_doesnt_link(client, user_a):
    code = client.post("/api/auth/generate-code", json={}, headers=bearer(user_a)).json()["code"]
    pytest.pairing_code = code
    payload = dm("777", "m2", code.split("-")[1][1:])  # only 5 of the 6 digits
    client.post("/api/webhook/instagram", content=payload, headers=signed(payload))
    assert not client.post("/api/auth/session", json={"token": user_a}).json()["is_instagram_linked"]


def test_exact_pairing_code_links(client, user_a):
    payload = dm("777", "m3", pytest.pairing_code)
    client.post("/api/webhook/instagram", content=payload, headers=signed(payload))
    assert client.post("/api/auth/session", json={"token": user_a}).json()["is_instagram_linked"]


def test_same_message_delivered_twice_saves_one_reel(client, db, monkeypatch):
    import threading
    import backend.routes as routes
    monkeypatch.setattr(routes, "send_instagram_dm", lambda *a, **k: None)
    msg = {"entry": [{"id": "bot", "messaging": [{"sender": {"id": "555"}, "message": {
        "mid": "dup-mid-1", "attachments": [{"type": "ig_reel", "payload": {"url": "https://www.instagram.com/reel/DUPtest01/"}}]}}]}]}
    payload = json.dumps(msg).encode()
    codes = []
    threads = [threading.Thread(target=lambda: codes.append(
        client.post("/api/webhook/instagram", content=payload, headers=signed(payload)).status_code)) for _ in range(2)]
    for t in threads: t.start()
    for t in threads: t.join()
    client.post("/api/webhook/instagram", content=payload, headers=signed(payload))  # a late retry
    db.expire_all()
    assert codes == [200, 200]
    assert db.query(ReelItem).filter(ReelItem.shortcode == "DUPtest01").count() == 1


def test_same_reel_in_two_messages_saves_one_reel(client, db, monkeypatch):
    """Two different message ids for the same reel, e.g. Meta sending it twice."""
    import backend.routes as routes
    monkeypatch.setattr(routes, "send_instagram_dm", lambda *a, **k: None)
    for mid in ("dup-mid-2", "dup-mid-3"):
        msg = {"entry": [{"id": "bot", "messaging": [{"sender": {"id": "556"}, "message": {
            "mid": mid, "attachments": [{"type": "ig_reel", "payload": {"url": "https://www.instagram.com/reel/DUPtest02/"}}]}}]}]}
        payload = json.dumps(msg).encode()
        assert client.post("/api/webhook/instagram", content=payload, headers=signed(payload)).status_code == 200
    db.expire_all()
    assert db.query(ReelItem).filter(ReelItem.shortcode == "DUPtest02").count() == 1


def test_reel_can_be_saved_again_later(db):
    """A claim older than the window is renewed, so re-sending a deleted reel later still works."""
    import datetime as dt
    from backend.models import WebhookEvent
    from backend.routes import claim_message
    window = dt.timedelta(minutes=2)
    assert claim_message(db, "reel:test:LATER01", window)
    assert not claim_message(db, "reel:test:LATER01", window)
    db.query(WebhookEvent).filter(WebhookEvent.mid == "reel:test:LATER01").update(
        {"created_at": dt.datetime.utcnow() - dt.timedelta(minutes=10)})
    db.commit()
    assert claim_message(db, "reel:test:LATER01", window)


# --- Ask Dex ---

def test_ask_dex_uses_only_own_reels(client, user_b):
    r = client.post("/api/chat", json={"question": "what did I save?"}, headers=bearer(user_b))
    assert r.status_code == 200
    assert "don't have any reels" in r.json()["answer"]


# --- Saved chats ---

MESSAGES = [
    {"role": "user", "content": "What tools were mentioned?"},
    {"role": "assistant", "content": "Figma and Relume.", "citations": [{"reel_id": 1, "title": "x"}]},
]


@pytest.fixture(scope="module")
def chat_id(client, user_a):
    r = client.post("/api/chats", json={"messages": MESSAGES}, headers=bearer(user_a))
    assert r.status_code == 200, r.text
    return r.json()["id"]


def test_saving_a_chat_needs_login(client):
    assert client.post("/api/chats", json={"messages": MESSAGES}).status_code == 401


def test_a_saves_chat_with_auto_title(client, user_a, chat_id):
    chats = client.get("/api/chats", headers=bearer(user_a)).json()
    assert chats[0]["title"] == "What tools were mentioned?"
    assert chats[0]["message_count"] == 2


def test_a_lists_own_chats(client, user_a, chat_id):
    assert [x["id"] for x in client.get("/api/chats", headers=bearer(user_a)).json()] == [chat_id]


def test_a_reads_chat_with_citations(client, user_a, chat_id):
    got = client.get(f"/api/chats/{chat_id}", headers=bearer(user_a)).json()
    assert got["messages"][1]["citations"][0]["title"] == "x"


def test_a_updates_chat(client, user_a, chat_id):
    r = client.put(f"/api/chats/{chat_id}", json={"messages": MESSAGES + [{"role": "user", "content": "more"}], "title": "Tools"}, headers=bearer(user_a))
    assert r.status_code == 200
    assert r.json()["message_count"] == 3 and r.json()["title"] == "Tools"


def test_chat_rejects_unknown_role(client, user_a):
    r = client.post("/api/chats", json={"messages": [{"role": "system", "content": "x"}]}, headers=bearer(user_a))
    assert r.status_code == 422


def test_b_doesnt_see_a_chats(client, user_b, chat_id):
    assert client.get("/api/chats", headers=bearer(user_b)).json() == []


def test_b_cant_read_a_chat(client, user_b, chat_id):
    assert client.get(f"/api/chats/{chat_id}", headers=bearer(user_b)).status_code == 404


def test_b_cant_overwrite_a_chat(client, user_b, chat_id):
    assert client.put(f"/api/chats/{chat_id}", json={"messages": MESSAGES}, headers=bearer(user_b)).status_code == 404


def test_b_cant_delete_a_chat(client, user_b, chat_id):
    assert client.delete(f"/api/chats/{chat_id}", headers=bearer(user_b)).status_code == 404


def test_a_deletes_own_chat(client, user_a, chat_id):
    assert client.delete(f"/api/chats/{chat_id}", headers=bearer(user_a)).status_code == 200
    assert client.get("/api/chats", headers=bearer(user_a)).json() == []


# --- Rate limits (keep last: it exhausts the sign-in limit) ---

def test_session_creation_is_rate_limited(client):
    codes = [client.post("/api/auth/session", json={}).status_code for _ in range(40)]
    assert 429 in codes
