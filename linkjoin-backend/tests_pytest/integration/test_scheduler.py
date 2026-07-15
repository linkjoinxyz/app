"""Scheduler jobs called directly as async functions (not through APScheduler
itself, and not through HTTP) against the real test DB."""
import secrets
from datetime import datetime, timedelta, timezone

import pytest

from app.database import motor_db
from app.scheduler import auto_delete_past_links, _send_sms


@pytest.fixture(autouse=True)
async def _cleanup_links():
    yield
    await motor_db.links.delete_many({"username": {"$regex": "^sched-test-"}})


async def _make_one_off_link(username: str, *, when: datetime, auto_delete_owner: bool, premium_status: str):
    await motor_db.login.update_one(
        {"username": username},
        {"$set": {"auto_delete_past": auto_delete_owner, "premium_status": premium_status}},
        upsert=True,
    )
    link_id = secrets.randbelow(10_000_000)
    await motor_db.links.insert_one({
        "id": link_id,
        "username": username,
        "repeat": "never",
        "date": when.strftime("%m/%d/%Y"),
        "time": when.strftime("%H:%M"),
        "link": "unused",
    })
    return link_id


async def test_auto_delete_removes_past_link_for_entitled_owner(premium_active_user):
    when = datetime.now(timezone.utc) - timedelta(hours=8)
    link_id = await _make_one_off_link(
        premium_active_user["username"], when=when, auto_delete_owner=True, premium_status="active"
    )

    await auto_delete_past_links()

    row = await motor_db.links.find_one({"username": premium_active_user["username"], "id": link_id})
    assert row is None


async def test_auto_delete_leaves_link_for_non_entitled_owner(personal_user_no_trial):
    when = datetime.now(timezone.utc) - timedelta(hours=8)
    link_id = await _make_one_off_link(
        personal_user_no_trial["username"], when=when, auto_delete_owner=True, premium_status="expired"
    )

    await auto_delete_past_links()

    row = await motor_db.links.find_one({"username": personal_user_no_trial["username"], "id": link_id})
    assert row is not None


async def test_auto_delete_respects_grace_window(premium_active_user):
    """Occurrence 2 hours ago — inside the 6-hour grace window, must not be deleted yet."""
    when = datetime.now(timezone.utc) - timedelta(hours=2)
    link_id = await _make_one_off_link(
        premium_active_user["username"], when=when, auto_delete_owner=True, premium_status="active"
    )

    await auto_delete_past_links()

    row = await motor_db.links.find_one({"username": premium_active_user["username"], "id": link_id})
    assert row is not None


async def test_send_sms_skips_when_vacation_mode_and_entitled(premium_active_user, monkeypatch):
    await motor_db.login.update_one(
        {"username": premium_active_user["username"]}, {"$set": {"vacation_mode": True, "number": 15551234567}}
    )

    calls = []
    monkeypatch.setattr("twilio.rest.Client", lambda *a, **kw: calls.append((a, kw)) or _FakeTwilio())

    await _send_sms({
        "link": {"id": 1, "username": premium_active_user["username"], "name": "Test", "text": "5"},
        "job_id": "irrelevant-job-id",
        "repeat": "week",
    })

    assert calls == []


async def test_send_sms_sends_when_vacation_mode_but_not_entitled(personal_user_no_trial, monkeypatch):
    await motor_db.login.update_one(
        {"username": personal_user_no_trial["username"]},
        {"$set": {"vacation_mode": True, "number": 15551234567, "premium_status": "expired"}},
    )

    fake = _FakeTwilio()
    monkeypatch.setattr("twilio.rest.Client", lambda *a, **kw: fake)

    await _send_sms({
        "link": {"id": 2, "username": personal_user_no_trial["username"], "name": "Test", "text": "5"},
        "job_id": "irrelevant-job-id",
        "repeat": "week",
    })

    assert fake.sent, "vacation_mode is set but the owner isn't premium-entitled, so the SMS should still send"


class _FakeTwilio:
    def __init__(self):
        self.sent = []
        self.messages = self

    def create(self, **kwargs):
        self.sent.append(kwargs)
