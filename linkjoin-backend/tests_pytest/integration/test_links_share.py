"""POST /links/share used to trust the whole link document from the request body.

That let a caller share links they did not own, hand-craft the row inserted into
the recipient's account, and fan a LinkJoin-branded email out to an unbounded
recipient list. Only the integer id is trusted now.
"""
import pytest

from app.database import motor_db
from app.encryption import encrypt


@pytest.fixture(autouse=True)
def _no_smtp(monkeypatch):
    """conftest has no SMTP mock; sends are batched into one background task."""
    sent = []
    monkeypatch.setattr("app.routers.links.send_email_batch", lambda msgs: sent.append(msgs) or len(msgs))
    return sent


async def _make_link(username: str, link_id: int, **extra):
    doc = {
        "username": username, "id": link_id, "name": "Standup",
        "link": encrypt("https://zoom.us/j/123"), "time": "9:00",
        "days": ["Mon"], "repeat": "week", "active": "true", "text": "false",
        **extra,
    }
    await motor_db.links.insert_one(doc)
    return doc


async def test_cannot_share_a_link_owned_by_someone_else(as_user, personal_user_no_trial, premium_active_user):
    """The whole point. The old contract took the link doc from the body, so the
    server never checked who owned it."""
    victim_link_id = 990001
    await _make_link(premium_active_user["username"], victim_link_id)
    try:
        resp = await as_user(personal_user_no_trial).post(
            "/links/share",
            json={"link_id": victim_link_id, "emails": ["someone@example.com"]},
        )
        assert resp.status_code == 404
        assert await motor_db.pending_links.count_documents({"share_id": victim_link_id}) == 0
    finally:
        await motor_db.links.delete_many({"id": victim_link_id})


async def test_legacy_body_shape_still_resolves_but_stays_scoped(as_user, personal_user_no_trial, premium_active_user):
    """An older frontend bundle sends the whole link object. It must keep working
    for links you own — and must still refuse links you do not, since only the id
    is read from it."""
    victim_link_id = 990002
    await _make_link(premium_active_user["username"], victim_link_id)
    try:
        resp = await as_user(personal_user_no_trial).post(
            "/links/share",
            json={
                "link": {"id": victim_link_id, "name": "spoofed", "link": "https://evil.example"},
                "emails": ["someone@example.com"],
            },
        )
        assert resp.status_code == 404
    finally:
        await motor_db.links.delete_many({"id": victim_link_id})


async def test_class_links_cannot_be_shared(as_user, personal_user_no_trial):
    """Class links carry the org's meeting URL, which every read path redacts so
    students only ever get the /c/:slug redirect. Sharing one would hand the raw
    URL to an arbitrary recipient."""
    link_id = 990003
    await _make_link(personal_user_no_trial["username"], link_id, class_id="cls-abc")
    try:
        resp = await as_user(personal_user_no_trial).post(
            "/links/share", json={"link_id": link_id, "emails": ["parent@example.com"]}
        )
        assert resp.status_code == 403
        assert await motor_db.pending_links.count_documents({"share_id": link_id}) == 0
    finally:
        await motor_db.links.delete_many({"id": link_id})


async def test_recipient_list_is_capped(as_user, personal_user_no_trial):
    link_id = 990004
    await _make_link(personal_user_no_trial["username"], link_id)
    try:
        resp = await as_user(personal_user_no_trial).post(
            "/links/share",
            json={"link_id": link_id, "emails": [f"user{i}@example.com" for i in range(25)]},
        )
        assert resp.status_code == 422
    finally:
        await motor_db.links.delete_many({"id": link_id})


async def test_malformed_recipients_are_rejected(as_user, personal_user_no_trial):
    link_id = 990005
    await _make_link(personal_user_no_trial["username"], link_id)
    try:
        resp = await as_user(personal_user_no_trial).post(
            "/links/share", json={"link_id": link_id, "emails": ["not-an-email"]}
        )
        assert resp.status_code == 422
    finally:
        await motor_db.links.delete_many({"id": link_id})


async def test_sharing_own_link_succeeds_and_dedupes(as_user, personal_user_no_trial):
    link_id = 990006
    await _make_link(personal_user_no_trial["username"], link_id)
    try:
        resp = await as_user(personal_user_no_trial).post(
            "/links/share",
            json={"link_id": link_id, "emails": ["Dup@example.com", "dup@example.com"]},
        )
        assert resp.status_code == 200
        assert resp.json()["recipients"] == 1
        assert await motor_db.pending_links.count_documents({"share_id": link_id}) == 1
    finally:
        await motor_db.links.delete_many({"id": link_id})
        await motor_db.pending_links.delete_many({"share_id": link_id})
