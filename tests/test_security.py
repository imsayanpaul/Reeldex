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


def test_carousel_share_with_only_media_id_saves_post(client, db, monkeypatch):
    import backend.routes as routes

    async def resolve(media_id):
        assert media_id == "123456789"
        return "https://www.instagram.com/p/CarouselTest/"

    monkeypatch.setattr(routes, "resolve_shared_post", resolve)
    attachment = {"type": "ig_post", "payload": {
        "ig_post_media_id": "123456789", "url": "https://lookaside.fbsbx.com/ig_messaging_cdn/"
    }}
    event = {"sender": {"id": "559"}, "message": {"mid": "carousel-mid", "attachments": [attachment]}}
    payload = json.dumps({"entry": [{"id": "bot", "messaging": [event]}]}).encode()
    started = []
    monkeypatch.setattr(routes, "process_reel_pipeline", lambda *args, **kwargs: started.append(kwargs))
    response = client.post("/api/webhook/instagram", content=payload, headers=signed(payload))
    assert response.status_code == 200
    saved = db.query(ReelItem).filter_by(sender_id="559", shortcode="CarouselTest").one()
    assert saved.reel_url == "https://www.instagram.com/p/CarouselTest/"
    # Kept for the album fallback, and the DM preview is handed to the pipeline
    assert saved.shared_media_id == "123456789"
    assert started == [{"preview": "https://lookaside.fbsbx.com/ig_messaging_cdn/"}]


def _linkless_share(sender, mid, preview_url, title=None):
    payload = {"ig_post_media_id": "55500011", "url": preview_url}
    if title:
        payload["title"] = title
    event = {"sender": {"id": sender}, "message": {"mid": mid, "attachments": [{"type": "share", "payload": payload}]}}
    return json.dumps({"entry": [{"id": "bot", "messaging": [event]}]}).encode()


def _no_links_from_instagram(monkeypatch):
    import backend.routes as routes

    async def no_permalink(media_id):
        return None

    async def no_message_links(message_id):
        return []

    monkeypatch.setattr(routes, "resolve_shared_post", no_permalink)
    monkeypatch.setattr(routes, "shared_message_links", no_message_links)
    monkeypatch.setattr(routes, "fill_instagram_username", lambda *args: None)


def test_linkless_share_is_saved_from_its_dm_preview(client, db, monkeypatch):
    import backend.routes as routes
    from backend.models import User
    _no_links_from_instagram(monkeypatch)
    started, sent = [], []
    monkeypatch.setattr(routes, "process_reel_pipeline", lambda *args, **kwargs: started.append((args, kwargs)))
    monkeypatch.setattr(routes, "send_instagram_dm_sync", lambda *args: sent.append(args))
    cover = "https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=7"
    payload = _linkless_share("561", "linkless-mid", cover, title="Want to sound more confident?")
    assert client.post("/api/webhook/instagram", content=payload, headers=signed(payload)).status_code == 200

    saved = db.query(ReelItem).filter_by(sender_id="561").one()
    assert saved.reel_url == "instagram-media:55500011" and saved.shortcode is None
    assert saved.shared_media_id == "55500011"
    assert saved.caption == "Want to sound more confident?"
    assert started == [((saved.id, "instagram-media:55500011", "561", "instagram_dm", saved.user_id), {"preview": cover})]
    assert sent == []  # no "please copy the link" reply

    # The placeholder never reaches the page as a link
    token = db.get(User, saved.user_id).auth_token
    assert client.get(f"/api/reels/{saved.id}", headers=bearer(token)).json()["reel_url"] == ""


def test_linkless_share_without_a_usable_preview_still_asks_for_the_link(client, db, monkeypatch):
    import backend.routes as routes
    _no_links_from_instagram(monkeypatch)
    sent = []
    monkeypatch.setattr(routes, "send_instagram_dm_sync", lambda *args: sent.append(args))
    payload = _linkless_share("562", "linkless-mid-2", "https://evil.example/ig_messaging_cdn/")
    client.post("/api/webhook/instagram", content=payload, headers=signed(payload))
    assert db.query(ReelItem).filter_by(sender_id="562").count() == 0
    assert sent and "copy the Instagram post link" in sent[0][1]


def test_linkless_reel_reads_only_the_preview_and_says_so(db, monkeypatch):
    import backend.routes as routes
    read, sent = [], []
    real_reply = routes.reply_in_dm  # the slide stubs replace it
    _stub_slide_steps(monkeypatch, read)
    monkeypatch.setattr(routes, "shared_album_images", lambda media_id: [])

    def must_not_run(*args):
        raise AssertionError("there is no post page to read or download")

    monkeypatch.setattr(routes, "post_images", must_not_run)
    monkeypatch.setattr(routes, "download_audio_from_reel", must_not_run)
    cover = "https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=8"
    reel = ReelItem(reel_url="instagram-media:55500012", source="instagram_dm", status="processing",
                    shared_media_id="55500012")
    db.add(reel)
    db.commit()
    routes.real_process_reel_pipeline(reel.id, reel.reel_url, preview=cover)
    assert read == [[cover]]
    db.expire_all()
    done = db.get(ReelItem, reel.id)
    assert done.status == "completed"
    assert all(s.get("cover_only") for s in done.slides)

    # The DM reply tells them only the first slide was read
    monkeypatch.setattr(routes.settings, "INSTAGRAM_PAGE_ACCESS_TOKEN", "test-token")
    monkeypatch.setattr(routes, "send_instagram_dm_sync", lambda sender, msg: sent.append(msg) or True)
    done.dm_replied = False
    real_reply(db, done, "563", "instagram_dm")
    assert sent and "I saved the first slide" in sent[0]
    assert "Copy link" in sent[0] and "Paste the link here" in sent[0]  # step-by-step link instructions


def test_linkless_reel_retry_without_preview_fails_with_advice(db, monkeypatch):
    import backend.routes as routes
    read = []
    _stub_slide_steps(monkeypatch, read)
    monkeypatch.setattr(routes, "shared_album_images", lambda media_id: [])
    reel = ReelItem(reel_url="instagram-media:55500013", source="web_ui", status="processing",
                    shared_media_id="55500013")
    db.add(reel)
    db.commit()
    routes.real_process_reel_pipeline(reel.id, reel.reel_url)  # a vault retry: the DM preview is gone
    db.expire_all()
    failed = db.get(ReelItem, reel.id)
    assert failed.status == "failed" and "Send the post link" in (failed.error_message or "")
    assert read == []


def test_lookups_only_use_graph_instagram(monkeypatch):
    import asyncio
    import httpx
    import backend.instagram_bot as bot
    hosts = []

    def refuse(request):
        hosts.append(request.url.host)
        return httpx.Response(404, json={})

    original_async, original_sync = httpx.AsyncClient, httpx.Client
    monkeypatch.setattr(bot.settings, "INSTAGRAM_PAGE_ACCESS_TOKEN", "test-token")
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: original_async(transport=httpx.MockTransport(refuse), **kw))
    monkeypatch.setattr(httpx, "Client", lambda **kw: original_sync(transport=httpx.MockTransport(refuse), **kw))
    assert asyncio.run(bot.resolve_shared_post("123")) is None
    assert asyncio.run(bot.shared_message_links("mid-1")) == []
    assert bot.fetch_instagram_username("456") is None
    assert hosts and set(hosts) == {"graph.instagram.com"}


def test_failed_username_lookup_is_not_retried_for_a_week(db, monkeypatch):
    import datetime as dt
    import backend.routes as routes
    from backend.models import User
    calls = []
    monkeypatch.setattr(routes, "fetch_instagram_username", lambda sender_id: calls.append(sender_id))
    user = User(display_name="Instagram @9001", auth_token="rm_no_username", instagram_sender_id="99009001")
    db.add(user)
    db.commit()
    routes.fill_instagram_username(user.id, "99009001")
    routes.fill_instagram_username(user.id, "99009001")
    assert calls == ["99009001"]  # the second visit didn't ask Instagram again
    db.expire_all()
    stored = db.get(User, user.id)
    assert stored.username_lookup_failed_at is not None
    stored.username_lookup_failed_at -= dt.timedelta(days=8)
    db.commit()
    routes.fill_instagram_username(user.id, "99009001")
    assert calls == ["99009001", "99009001"]  # tried again after a week


def _carousel_reel(db, shortcode, media_id=None):
    reel = ReelItem(reel_url=f"https://www.instagram.com/p/{shortcode}/", shortcode=shortcode,
                    source="instagram_dm", status="processing", shared_media_id=media_id)
    db.add(reel)
    db.commit()
    return reel.id


def _stub_slide_steps(monkeypatch, read):
    import backend.routes as routes

    def blocked(shortcode):
        raise ConnectionError("Instagram refused the post read")

    def extract(images, previous, save_progress):
        read.append(images)
        return [{"number": 1, "text": "Five tools for designers", "status": "read"}]

    monkeypatch.setattr(routes, "post_images", blocked)
    monkeypatch.setattr(routes, "extract_slides", extract)
    monkeypatch.setattr(routes, "slide_insights", lambda slides, title, caption=None: (
        "Slide 1\nFive tools for designers", {"summary": "Design tools", "category": "Design"}))
    monkeypatch.setattr(routes, "reply_in_dm", lambda *args, **kwargs: None)
    monkeypatch.setattr(routes, "save_cover_thumbnail", lambda media_id, url: None)


def test_media_id_converts_to_shortcode_and_caption_must_match():
    from backend.carousel import shortcode_from_media_id, caption_matches
    assert shortcode_from_media_id("1") == "B"
    assert shortcode_from_media_id("64") == "BA"
    assert shortcode_from_media_id(str(64 ** 2 * 3 + 64 * 62 + 63)) == "D-_"
    assert shortcode_from_media_id("12ab") is None and shortcode_from_media_id("0") is None
    share = "Want to sound more confident and impressive while speaking in public? ⭐ Your opening lines…"
    assert caption_matches(share, "Want to sound more confident and impressive while speaking in public? ⭐ Your opening lines matter")
    assert not caption_matches(share, "Ten pasta recipes for busy weeknights")
    assert not caption_matches("Hi", "Hi there")  # too short to trust
    assert not caption_matches(None, "anything")


def _linkless_reel(db, media_id, caption):
    reel = ReelItem(reel_url=f"instagram-media:{media_id}", source="instagram_dm", status="processing",
                    shared_media_id=media_id, caption=caption)
    db.add(reel)
    db.commit()
    return reel.id


def test_shared_media_id_leads_to_the_full_post(db, monkeypatch):
    import backend.routes as routes
    from backend.carousel import shortcode_from_media_id
    read = []
    _stub_slide_steps(monkeypatch, read)
    shortcode = shortcode_from_media_id("3123456789012345678")
    slides = [f"https://scontent.cdninstagram.com/{n}.jpg" for n in range(10)]
    caption = "Want to sound more confident and impressive while speaking in public? Ten openers inside"
    monkeypatch.setattr(routes, "post_images", lambda code: (slides, caption, "passionatelearners") if code == shortcode else None)
    reel_id = _linkless_reel(db, "3123456789012345678", "Want to sound more confident and impressive while speaking in public?")
    routes.real_process_reel_pipeline(reel_id, "instagram-media:3123456789012345678",
                                      preview="https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=9")
    assert read == [slides]  # every slide, not the cover
    db.expire_all()
    done = db.get(ReelItem, reel_id)
    assert done.status == "completed"
    assert done.shortcode == shortcode and done.reel_url == f"https://www.instagram.com/p/{shortcode}/"
    assert not any(s.get("cover_only") for s in done.slides)


def test_wrong_post_from_media_id_is_not_used(db, monkeypatch):
    import backend.routes as routes
    read, thumbs = [], []
    _stub_slide_steps(monkeypatch, read)
    monkeypatch.setattr(routes, "shared_album_images", lambda media_id: [])
    monkeypatch.setattr(routes, "post_images", lambda code: (["https://scontent.cdninstagram.com/x.jpg"], "Ten pasta recipes for busy weeknights", "chef"))
    monkeypatch.setattr(routes, "save_cover_thumbnail", lambda media_id, url: thumbs.append((media_id, url)) or f"/api/thumbnail/m{media_id}")
    cover = "https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=10"
    reel_id = _linkless_reel(db, "3123456789012340001", "Want to sound more confident and impressive while speaking in public?")
    routes.real_process_reel_pipeline(reel_id, "instagram-media:3123456789012340001", preview=cover)
    assert read == [[cover]]  # the guessed post's caption didn't match, so only the cover
    db.expire_all()
    done = db.get(ReelItem, reel_id)
    assert done.shortcode is None and done.reel_url == "instagram-media:3123456789012340001"
    assert all(s.get("cover_only") for s in done.slides)
    # The cover is kept as the thumbnail
    assert thumbs == [("3123456789012340001", cover)]
    assert done.thumbnail_url == "/api/thumbnail/m3123456789012340001"



SHARE_TEXT = "Want to sound more confident and impressive while speaking in public?"
FULL_CAPTION = SHARE_TEXT + " Your opening lines decide whether people listen. Save this for later!"


def _owner_with_cover_copy(db, token, sender, collection_name=None):
    from backend.models import User, Collection
    owner = User(display_name="owner", auth_token=token, instagram_sender_id=sender)
    db.add(owner)
    db.commit()
    collection_id = None
    if collection_name:
        collection = Collection(user_id=owner.id, name=collection_name)
        db.add(collection)
        db.commit()
        collection_id = collection.id
    cover = ReelItem(user_id=owner.id, sender_id=sender, reel_url=f"instagram-media:181066572626{sender}",
                     source="instagram_dm", status="completed", caption=SHARE_TEXT, collection_id=collection_id,
                     slides=[{"number": 1, "text": "Powerful Phrases", "status": "read", "cover_only": True}])
    db.add(cover)
    db.commit()
    return owner, cover.id, collection_id


def _read_full_post(db, monkeypatch, owner, sender, shortcode, caption):
    import backend.routes as routes
    read, replies = [], []
    _stub_slide_steps(monkeypatch, read)
    slides = [f"https://scontent.cdninstagram.com/{shortcode}-{n}.jpg" for n in range(10)]
    monkeypatch.setattr(routes, "post_images", lambda code: (slides, caption, "passionatelearners"))
    monkeypatch.setattr(routes, "extract_slides", lambda images, previous, save: [
        {"number": n + 1, "text": f"Phrase {n + 1}", "status": "read"} for n in range(len(images))])
    monkeypatch.setattr(routes, "reply_in_dm", lambda db_, reel, sender_id, source, replaced=0: replies.append(replaced))
    full = ReelItem(user_id=owner.id, sender_id=sender, reel_url=f"https://www.instagram.com/p/{shortcode}/",
                    shortcode=shortcode, source="instagram_dm", status="processing")
    db.add(full)
    db.commit()
    routes.real_process_reel_pipeline(full.id, full.reel_url, sender, "instagram_dm", owner.id)
    db.expire_all()
    return full.id, replies


def test_link_after_a_share_replaces_the_cover_only_copy(db, monkeypatch):
    owner, cover_id, collection_id = _owner_with_cover_copy(db, "rm_upgrade_owner", "71001", "Speaking")
    full_id, replies = _read_full_post(db, monkeypatch, owner, "71001", "UpgradeTest", FULL_CAPTION)
    assert db.get(ReelItem, cover_id) is None  # the cover-only copy is gone
    full = db.get(ReelItem, full_id)
    assert full.status == "completed" and len(full.slides) == 10
    assert full.collection_id == collection_id  # it took the copy's collection
    assert replies == [1]  # the DM says it replaced the earlier version


def test_link_for_a_different_post_keeps_the_cover_only_copy(db, monkeypatch):
    owner, cover_id, _ = _owner_with_cover_copy(db, "rm_upgrade_other_post", "71002")
    _, replies = _read_full_post(db, monkeypatch, owner, "71002", "OtherPostTest", "Ten pasta recipes for busy weeknights")
    assert db.get(ReelItem, cover_id) is not None
    assert replies == [0]


def test_link_never_removes_someone_elses_cover_copy(db, monkeypatch):
    from backend.models import User
    _, cover_id, _ = _owner_with_cover_copy(db, "rm_upgrade_victim", "71003")
    stranger = User(display_name="stranger", auth_token="rm_upgrade_stranger", instagram_sender_id="71004")
    db.add(stranger)
    db.commit()
    _, replies = _read_full_post(db, monkeypatch, stranger, "71004", "StrangerTest", FULL_CAPTION)
    assert db.get(ReelItem, cover_id) is not None
    assert replies == [0]


def _image(url, w=1080, h=1350):
    return {"image_versions2": {"candidates": [{"url": url.replace(".jpg", "-small.jpg"), "width": 320, "height": 400},
                                               {"url": url, "width": w, "height": h}]}}


def test_post_data_gives_every_slide_in_order():
    from backend.carousel import slides_from_post_data
    post = {"caption": {"text": "Ten openers"}, "user": {"username": "passionatelearners"}, "media_type": 8,
            "carousel_media": [
                dict(_image("https://instagram.fccu27-3.fna.fbcdn.net/1.jpg"), media_type=1),
                {"media_type": 2},  # a video slide
                dict(_image("https://scontent.cdninstagram.com/3.jpg"), media_type=1),
                dict(_image("https://evil.example/4.jpg"), media_type=1),  # never an outside host
            ]}
    images, caption, owner = slides_from_post_data(post)
    assert images == ["https://instagram.fccu27-3.fna.fbcdn.net/1.jpg", None, "https://scontent.cdninstagram.com/3.jpg", None]
    assert caption == "Ten openers" and owner == "passionatelearners"


def test_post_data_single_image_and_video():
    from backend.carousel import slides_from_post_data
    single = dict(_image("https://scontent.cdninstagram.com/only.jpg"), media_type=1, caption=None, user={})
    assert slides_from_post_data(single) == (["https://scontent.cdninstagram.com/only.jpg"], "", None)
    assert slides_from_post_data({"media_type": 2}) is None  # a reel goes to the audio pipeline
    with pytest.raises(ValueError):
        slides_from_post_data({})


def test_post_reader_prefers_ytdlp_and_falls_back_to_instaloader(monkeypatch):
    import backend.carousel as carousel
    used = []
    monkeypatch.setattr(carousel, "_post_from_ytdlp", lambda code: used.append("yt-dlp") or (["a"], "c", "o"))
    monkeypatch.setattr(carousel, "_post_from_instaloader", lambda code: used.append("instaloader") or (["b"], "c", "o"))
    assert carousel.post_images("Abc123") == (["a"], "c", "o") and used == ["yt-dlp"]

    def blocked(code):
        raise ConnectionError("rate limited")

    used.clear()
    monkeypatch.setattr(carousel, "_post_from_ytdlp", blocked)
    assert carousel.post_images("Abc123") == (["b"], "c", "o") and used == ["instaloader"]


def test_non_webp_slides_go_to_ocr_unchanged():
    from backend.carousel import as_png_if_webp
    jpeg = b"\xff\xd8\xff\xe0" + b"0" * 100
    assert as_png_if_webp(jpeg) is jpeg


def test_graph_api_id_from_a_share_is_not_guessed(db, monkeypatch):
    import backend.routes as routes
    from backend.carousel import looks_like_post_id
    assert not looks_like_post_id("18106657262648081")  # a Graph API id, as DM shares carry
    assert looks_like_post_id("3123456789012345678")    # an Instagram post id
    read = []
    _stub_slide_steps(monkeypatch, read)
    monkeypatch.setattr(routes, "shared_album_images", lambda media_id: [])

    def must_not_run(code):
        raise AssertionError("a Graph API id doesn't convert to a shortcode, so Instagram isn't asked")

    monkeypatch.setattr(routes, "post_images", must_not_run)
    cover = "https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=11"
    reel_id = _linkless_reel(db, "18106657262648081", "Want to sound more confident and impressive while speaking in public?")
    routes.real_process_reel_pipeline(reel_id, "instagram-media:18106657262648081", preview=cover)
    assert read == [[cover]]
    db.expire_all()
    assert db.get(ReelItem, reel_id).status == "completed"

def test_cover_only_summary_uses_the_caption_and_is_told_not_to_invent(monkeypatch):
    import backend.carousel as carousel
    calls = []
    monkeypatch.setattr(carousel, "extract_reel_insights",
                        lambda text, title, caption=None, **kw: calls.append((text, caption, kw)) or {"summary": "s"})
    slides = [{"number": 1, "text": "Powerful Phrases to Start a Speech", "status": "read", "cover_only": True}]
    carousel.slide_insights(slides, "Powerful Phrases", caption="Want to sound more confident?")
    assert calls == [("Slide 1\nPowerful Phrases to Start a Speech", "Want to sound more confident?",
                      {"slides": True, "partial": True})]


def test_missing_saved_cover_is_a_404(client):
    assert client.get("/api/thumbnail/m99999999").status_code == 404


def test_cover_thumbnail_only_from_meta_hosts():
    import backend.routes as routes
    assert routes.save_cover_thumbnail("123", "https://evil.example/ig_messaging_cdn/") is None
    assert routes.save_cover_thumbnail("../x", "https://lookaside.fbsbx.com/ig_messaging_cdn/") is None


def _status(db, reel_id):
    db.expire_all()
    return db.get(ReelItem, reel_id).status


def test_blocked_post_read_uses_graph_api_album(db, monkeypatch):
    import backend.routes as routes
    read = []
    _stub_slide_steps(monkeypatch, read)
    album = ["https://scontent.cdninstagram.com/one.jpg", None]
    monkeypatch.setattr(routes, "shared_album_images", lambda media_id: album if media_id == "987" else [])

    def no_download(url):
        raise AssertionError("the audio downloader must not run when the album was found")

    monkeypatch.setattr(routes, "download_audio_from_reel", no_download)
    reel_id = _carousel_reel(db, "AlbumFallback", media_id="987")
    routes.real_process_reel_pipeline(reel_id, "https://www.instagram.com/p/AlbumFallback/")
    assert read == [album]
    assert _status(db, reel_id) == "completed"


def test_blocked_post_read_falls_back_to_dm_preview(db, monkeypatch):
    import backend.routes as routes
    read = []
    _stub_slide_steps(monkeypatch, read)
    monkeypatch.setattr(routes, "shared_album_images", lambda media_id: [])
    monkeypatch.setattr(routes, "download_audio_from_reel", lambda url: {})  # not a video post either
    cover = "https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=1"
    reel_id = _carousel_reel(db, "PreviewFallback", media_id="988")
    routes.real_process_reel_pipeline(reel_id, "https://www.instagram.com/p/PreviewFallback/", preview=cover)
    assert read == [[cover]]
    assert _status(db, reel_id) == "completed"


def test_preview_from_another_host_is_never_read(db, monkeypatch):
    import backend.routes as routes
    read = []
    _stub_slide_steps(monkeypatch, read)

    def download_fails(url):
        raise RuntimeError("no audio")

    monkeypatch.setattr(routes, "download_audio_from_reel", download_fails)
    reel_id = _carousel_reel(db, "NoFallback")
    routes.real_process_reel_pipeline(reel_id, "https://www.instagram.com/p/NoFallback/",
                                      preview="https://evil.example/ig_messaging_cdn/")
    assert read == []
    assert _status(db, reel_id) == "failed"


def test_carousel_preview_recovers_permalink_from_dm(client, db, monkeypatch):
    import httpx
    import backend.instagram_bot as bot
    import backend.routes as routes

    def message_lookup(request):
        assert request.url.path == "/v21.0/carousel-preview-mid"
        assert request.url.params["fields"] == "shares{link}"
        return httpx.Response(200, json={"shares": {"data": [{"link": "https://www.instagram.com/p/CoverTest/"}]}})

    original_client = httpx.AsyncClient
    monkeypatch.setattr(bot.settings, "INSTAGRAM_PAGE_ACCESS_TOKEN", "test-token")
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: original_client(
        transport=httpx.MockTransport(message_lookup), **kw))
    monkeypatch.setattr(routes, "fill_instagram_username", lambda *args: None)
    share = {"type": "share", "payload": {"url": "https://lookaside.fbsbx.com/ig_messaging_cdn/"}}
    event = {"sender": {"id": "560"}, "message": {"mid": "carousel-preview-mid", "attachments": [share]}}
    payload = json.dumps({"entry": [{"id": "bot", "messaging": [event]}]}).encode()
    client.post("/api/webhook/instagram", content=payload, headers=signed(payload))
    assert db.query(ReelItem).filter_by(sender_id="560", shortcode="CoverTest").one().reel_url.endswith("/p/CoverTest/")


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


def test_resending_a_saved_reel_gets_a_reply(client, db, monkeypatch):
    """A reel the sender already has isn't saved twice, and they're told it's already in their vault."""
    import datetime as dt
    import backend.routes as routes
    from backend.models import WebhookEvent
    sent = []
    monkeypatch.setattr(routes, "send_instagram_dm", lambda *a, **k: None)
    monkeypatch.setattr(routes, "send_instagram_dm_sync", lambda to, text: sent.append((to, text)) or True)
    monkeypatch.setattr(routes, "process_reel_pipeline", lambda *a, **k: None)

    def share(mid):
        msg = {"entry": [{"id": "bot", "messaging": [{"sender": {"id": "557"}, "message": {
            "mid": mid, "attachments": [{"type": "ig_reel", "payload": {"url": "https://www.instagram.com/reel/DUPtest03/"}}]}}]}]}
        payload = json.dumps(msg).encode()
        assert client.post("/api/webhook/instagram", content=payload, headers=signed(payload)).status_code == 200

    share("resend-1")
    db.expire_all()
    reel = db.query(ReelItem).filter(ReelItem.shortcode == "DUPtest03").one()
    reel.status, reel.title = "completed", "Three habits that changed my mornings"
    # The 2-minute duplicate window has passed: this is a real second share
    db.query(WebhookEvent).filter(WebhookEvent.mid.like("reel:%DUPtest03")).update({"created_at": dt.datetime.utcnow() - dt.timedelta(minutes=5)}, synchronize_session=False)
    db.commit()

    share("resend-2")
    db.expire_all()
    assert db.query(ReelItem).filter(ReelItem.shortcode == "DUPtest03").count() == 1
    assert len(sent) == 1 and sent[0][0] == "557"
    assert "already saved" in sent[0][1] and "Three habits" in sent[0][1]


def test_reel_without_audio_is_not_called_silent_and_resend_retries(client, db, monkeypatch):
    """When Instagram sends no sound, the reel isn't labelled 'no talking', and sending it again reprocesses it."""
    import datetime as dt
    import backend.routes as routes
    from backend.models import WebhookEvent
    sent, queued = [], []
    monkeypatch.setattr(routes, "send_instagram_dm", lambda *a, **k: None)
    monkeypatch.setattr(routes, "send_instagram_dm_sync", lambda to, text: sent.append(text) or True)
    monkeypatch.setattr(routes, "process_reel_pipeline", lambda reel_id, *a, **k: queued.append(reel_id))

    def share(mid):
        msg = {"entry": [{"id": "bot", "messaging": [{"sender": {"id": "558"}, "message": {
            "mid": mid, "attachments": [{"type": "ig_reel", "payload": {"url": "https://www.instagram.com/reel/NOAUDIO01/"}}]}}]}]}
        payload = json.dumps(msg).encode()
        assert client.post("/api/webhook/instagram", content=payload, headers=signed(payload)).status_code == 200

    share("noaudio-1")
    db.expire_all()
    reel = db.query(ReelItem).filter(ReelItem.shortcode == "NOAUDIO01").one()
    reel.status, reel.dm_replied = "completed", True
    db.add(Transcript(reel_id=reel.id, full_text="", language=routes.NO_AUDIO, summary="From the caption"))
    db.query(WebhookEvent).filter(WebhookEvent.mid.like("reel:%NOAUDIO01")).update({"created_at": dt.datetime.utcnow() - dt.timedelta(minutes=5)}, synchronize_session=False)
    db.commit()
    db.refresh(reel)

    flags = routes.speech_flags(reel)
    assert flags["audio_missing"] and not flags["no_speech"]

    share("noaudio-2")
    db.expire_all()
    reel = db.query(ReelItem).filter(ReelItem.shortcode == "NOAUDIO01").one()
    assert queued == [reel.id, reel.id]          # processed again, not "already saved"
    assert reel.dm_replied is False and not sent  # a fresh reply will follow the new run


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


def test_dm_sender_gets_instagram_username(client, db, monkeypatch):
    import backend.routes as routes
    from backend.models import User
    monkeypatch.setattr(routes, "send_instagram_dm", lambda *a, **k: None)
    monkeypatch.setattr(routes, "fetch_instagram_username", lambda sender_id: "surf.daily" if sender_id == "4242" else None)
    payload = dm("4242", "m-user-1", "hello")
    assert client.post("/api/webhook/instagram", content=payload, headers=signed(payload)).status_code == 200
    db.expire_all()
    user = db.query(User).filter(User.instagram_sender_id == "4242").first()
    assert user.instagram_username == "surf.daily"
    assert user.display_name == "surf.daily"


# --- Admin view ---

def _user_id(client, token):
    return client.post("/api/auth/session", json={"token": token}).json()["user_id"]


def test_admin_hidden_when_no_admins_configured(client, user_a, monkeypatch):
    from backend.config import settings
    monkeypatch.setattr(settings, "ADMIN_USER_IDS", "")
    assert client.get("/api/admin/users", headers=bearer(user_a)).status_code == 404


def test_admin_needs_login(client):
    assert client.get("/api/admin/users").status_code == 401


def _instagram_user(db, token, username, sender_id):
    from backend.models import User
    user = User(display_name=username or "guest", auth_token=token,
                instagram_username=username, instagram_sender_id=sender_id)
    db.add(user)
    db.commit()
    return token


def test_admin_by_linked_instagram_username(client, db, monkeypatch):
    from backend.config import settings
    monkeypatch.setattr(settings, "ADMIN_USER_IDS", "")
    monkeypatch.setattr(settings, "ADMIN_INSTAGRAM_USERNAMES", "@ImSayanPaul, someone_else")
    owner = _instagram_user(db, "rm_ig_owner", "imsayanpaul", "90001")
    assert client.get("/api/admin/me", headers=bearer(owner)).status_code == 200
    assert client.get("/api/admin/users", headers=bearer(owner)).status_code == 200


def test_admin_username_needs_a_linked_account(client, db, monkeypatch):
    from backend.config import settings
    monkeypatch.setattr(settings, "ADMIN_USER_IDS", "")
    monkeypatch.setattr(settings, "ADMIN_INSTAGRAM_USERNAMES", "imsayanpaul")
    # Same name but no linked Instagram sender, and a different linked account
    unlinked = _instagram_user(db, "rm_ig_unlinked", "imsayanpaul", None)
    other = _instagram_user(db, "rm_ig_other", "not_the_owner", "90002")
    assert client.get("/api/admin/me", headers=bearer(unlinked)).status_code == 404
    assert client.get("/api/admin/me", headers=bearer(other)).status_code == 404


def test_admin_hidden_from_normal_users(client, user_a, user_b, monkeypatch):
    from backend.config import settings
    monkeypatch.setattr(settings, "ADMIN_USER_IDS", str(_user_id(client, user_a)))
    assert client.get("/api/admin/users", headers=bearer(user_b)).status_code == 404
    assert client.get("/api/admin/me", headers=bearer(user_b)).status_code == 404


def test_admin_sees_users_and_summary(client, user_a, monkeypatch):
    from backend.config import settings
    me = _user_id(client, user_a)
    monkeypatch.setattr(settings, "ADMIN_USER_IDS", f"999, {me}")
    r = client.get("/api/admin/users", headers=bearer(user_a))
    assert r.status_code == 200
    body = r.json()
    row = next(u for u in body["users"] if u["id"] == me)
    assert row["reels"] >= 1 and row["lastSeenAt"]
    assert body["summary"]["totalUsers"] == len(body["users"])
    assert "auth_token" not in r.text  # never expose session tokens


def test_empty_guests_are_not_counted_as_active(client, db, user_a, monkeypatch):
    import datetime as dt
    from backend.config import settings
    from backend.models import User
    me = _user_id(client, user_a)
    monkeypatch.setattr(settings, "ADMIN_USER_IDS", str(me))
    now = dt.datetime.utcnow()
    db.add_all([
        User(display_name="crawler guest", auth_token="rm_active_empty_guest", last_seen_at=now),
        User(display_name="linked, no reels yet", auth_token="rm_active_linked", instagram_sender_id="88001", last_seen_at=now),
    ])
    db.commit()
    body = client.get("/api/admin/users", headers=bearer(user_a)).json()
    rows = {u["name"]: u for u in body["users"]}
    assert rows["crawler guest"]["real"] is False
    assert rows["linked, no reels yet"]["real"] is True
    real_recent = sum(1 for u in body["users"] if u["real"] and u["lastActiveAt"]
                      and now - dt.datetime.fromisoformat(u["lastActiveAt"].rstrip("Z")) <= dt.timedelta(days=7))
    s = body["summary"]
    assert s["activeLast7Days"] == real_recent  # only real users count
    assert s["emptyGuestsLast7Days"] >= 1
    assert s["realUsers"] == sum(1 for u in body["users"] if u["real"])


def test_ai_usage_is_recorded_per_user(client, user_a, monkeypatch):
    from types import SimpleNamespace
    from backend import usage
    from backend.config import settings
    me = _user_id(client, user_a)
    monkeypatch.setattr(settings, "ADMIN_USER_IDS", str(me))
    usage.for_user(me)
    usage.record("insights", "test-model", SimpleNamespace(usage=SimpleNamespace(prompt_tokens=100, completion_tokens=50)))
    usage.record("transcription", "whisper-test", audio_seconds=30)
    usage.for_user(None)
    usage.record("ask-dex", "test-model", {"usage": {"prompt_tokens": 7, "completion_tokens": 3}})  # no user

    body = client.get("/api/admin/users", headers=bearer(user_a)).json()
    row = next(u for u in body["users"] if u["id"] == me)
    assert row["tokens"] >= 150 and row["inputTokens"] >= 100 and row["audioSeconds"] >= 30
    features = {f["feature"]: f for f in body["byFeature"]}
    assert features["insights"]["tokens"] >= 150 and features["transcription"]["audioSeconds"] >= 30
    assert body["summary"]["totalTokens"] >= row["tokens"] + 10  # includes the unattributed call


def test_heartbeat_counts_time_at_most_once_a_minute(client, db, user_a, monkeypatch):
    import datetime as dt
    from backend.config import settings
    from backend.models import ActivityDay
    me = _user_id(client, user_a)
    assert client.post("/api/heartbeat").status_code == 401
    assert client.post("/api/heartbeat", headers=bearer(user_a)).json()["counted"] is True
    assert client.post("/api/heartbeat", headers=bearer(user_a)).json()["counted"] is False  # too soon
    # a minute later it counts again
    row = db.query(ActivityDay).filter(ActivityDay.user_id == me).first()
    row.last_beat_at = dt.datetime.utcnow() - dt.timedelta(seconds=61)
    db.commit()
    assert client.post("/api/heartbeat", headers=bearer(user_a)).json()["counted"] is True
    monkeypatch.setattr(settings, "ADMIN_USER_IDS", str(me))
    body = client.get("/api/admin/users", headers=bearer(user_a)).json()
    mine = next(u for u in body["users"] if u["id"] == me)
    assert mine["activeSeconds"] == 120 and mine["activeSeconds7d"] == 120
    assert body["summary"]["activeSeconds"] >= 120


def test_feedback_needs_a_session(client):
    assert client.post("/api/feedback", json={"message": "hello there"}).status_code == 401


def test_feedback_validates_input(client, user_b):
    assert client.post("/api/feedback", json={"message": "x" * 2001}, headers=bearer(user_b)).status_code == 422
    assert client.post("/api/feedback", json={"message": "ok", "rating": 9}, headers=bearer(user_b)).status_code == 422


def test_feedback_reaches_admin_only(client, user_a, user_b, monkeypatch):
    from backend.config import settings
    r = client.post("/api/feedback", headers=bearer(user_b), json={
        "category": "Bug", "rating": 2, "message": "Ask Dex cut off my answer", "contact": "b@example.com", "page": "ask"})
    assert r.status_code == 200
    client.post("/api/feedback", headers=bearer(user_b), json={"category": "Weird", "message": "Unknown category"})
    me = _user_id(client, user_a)
    monkeypatch.setattr(settings, "ADMIN_USER_IDS", str(me))
    assert client.get("/api/admin/feedback", headers=bearer(user_b)).status_code == 404
    body = client.get("/api/admin/feedback", headers=bearer(user_a)).json()
    messages = {f["message"]: f for f in body["feedback"]}
    bug = messages["Ask Dex cut off my answer"]
    assert bug["category"] == "Bug" and bug["rating"] == 2 and bug["contact"] == "b@example.com" and bug["page"] == "ask"
    assert messages["Unknown category"]["category"] == "Other"
    assert body["summary"]["total"] >= 2


def test_cleanup_deletes_only_old_empty_guests(client, db, user_a, user_b, monkeypatch):
    import datetime as dt
    from backend.config import settings
    from backend.models import User, PairingCode
    me = _user_id(client, user_a)
    monkeypatch.setattr(settings, "ADMIN_USER_IDS", str(me))
    old = dt.datetime.utcnow() - dt.timedelta(days=40)
    stale = User(display_name="old guest", auth_token="rm_stale_guest", created_at=old, last_seen_at=old)
    fresh = User(display_name="new guest", auth_token="rm_fresh_guest")
    linked = User(display_name="ig", auth_token="rm_old_linked", instagram_sender_id="7777", created_at=old)
    db.add_all([stale, fresh, linked]); db.commit()
    db.add(PairingCode(code="MIND-000001", user_id=stale.id, expires_at=old)); db.commit()
    stale_id, fresh_id, linked_id = stale.id, fresh.id, linked.id

    # Not allowed for normal users
    assert client.post("/api/admin/cleanup-guests?dry_run=false", headers=bearer(user_b)).status_code == 404
    # Dry run counts without deleting
    preview = client.post("/api/admin/cleanup-guests", headers=bearer(user_a)).json()
    assert preview["count"] >= 1 and preview["deleted"] == 0
    assert db.get(User, stale_id) is not None
    # Real run deletes the old empty guest only
    done = client.post("/api/admin/cleanup-guests?dry_run=false", headers=bearer(user_a)).json()
    assert done["deleted"] == preview["count"]
    db.expire_all()
    assert db.get(User, stale_id) is None
    assert db.get(User, fresh_id) is not None      # seen recently
    assert db.get(User, linked_id) is not None     # has Instagram
    assert db.get(User, me) is not None            # has reels, and is the admin


# --- Rate limits (keep last: it exhausts the sign-in limit) ---

def test_session_creation_is_rate_limited(client):
    codes = [client.post("/api/auth/session", json={}).status_code for _ in range(40)]
    assert 429 in codes
