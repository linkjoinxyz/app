"""Scheduler jobs called directly as async functions (not through APScheduler
itself, and not through HTTP) against the real test DB."""
import secrets
from datetime import datetime, timedelta, timezone

import pytest

from app import scheduler as scheduler_module
from app.database import motor_db
from tests_pytest.conftest import RUN_ID
from app.scheduler import auto_delete_past_links, _send_sms, check_absences, send_class_reminders


@pytest.fixture(autouse=True)
async def _cleanup_links():
    yield
    await motor_db.links.delete_many({"username": {"$regex": f"^sched-test-{RUN_ID}-"}})
    await motor_db.classes.delete_many({"class_id": {"$regex": f"^sched-test-{RUN_ID}-"}})
    await motor_db.login.delete_many({"user_id": {"$regex": f"^sched-test-{RUN_ID}-"}})
    await motor_db.absence_alerts.delete_many({"class_id": {"$regex": f"^sched-test-{RUN_ID}-"}})
    await motor_db.parent_reminder_log.delete_many({"class_id": {"$regex": f"^sched-test-{RUN_ID}-"}})
    await motor_db.parent_links.delete_many({"student_user_id": {"$regex": f"^sched-test-{RUN_ID}-"}})


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


_DAY_ABBRS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

# The scheduler evaluates only the current day's session, so a test session set
# 45 min in the past or 10 min ahead of the real clock crosses to another
# weekday in the ~1 hour around UTC midnight and stops matching. Pin now to a
# fixed Wednesday noon (injected via the functions' now_utc param) so the
# offsets always land on one day, whatever time CI actually runs.
_FIXED_NOW = datetime(2026, 3, 4, 12, 0, 0, tzinfo=timezone.utc)  # a Wednesday


@pytest.fixture
def fixed_clock():
    return _FIXED_NOW


async def _make_class(class_id: str, teacher_id: str, student_ids: list, *, start: datetime, family_alerts: bool):
    # Derive weekday and time from the SAME instant so they can't disagree across
    # a day boundary.
    await motor_db.classes.insert_one({
        "class_id": class_id,
        "teacher_id": teacher_id,
        "org_id": "",
        "days": [_DAY_ABBRS[start.weekday()]],
        "time": start.strftime("%H:%M"),
        "family_alerts": family_alerts,
        "student_ids": student_ids,
        "name": "Test Class",
    })


async def test_check_absences_sends_alert_without_crashing(monkeypatch, fixed_clock):
    """Regression for the h/m NameError (segment 4.1) that killed every run."""
    class_start = fixed_clock - timedelta(minutes=45)
    class_id = f"sched-test-{RUN_ID}-{secrets.token_hex(4)}"
    teacher_id = f"sched-test-{RUN_ID}-{secrets.token_hex(4)}"
    student_id = f"sched-test-{RUN_ID}-{secrets.token_hex(4)}"
    student_email = f"sched-test-{RUN_ID}-{secrets.token_hex(4)}@example.com"

    await motor_db.login.insert_one({"user_id": teacher_id, "username": f"{teacher_id}@example.com", "timezone": "UTC"})
    await motor_db.login.insert_one({"user_id": student_id, "username": student_email, "parent_email": "parent@example.com"})
    await _make_class(class_id, teacher_id, [student_id], start=class_start, family_alerts=True)

    sent = []
    monkeypatch.setattr("app.email_service.send_email", lambda *a, **k: sent.append((a, k)))

    await check_absences(now_utc=fixed_clock)  # must not raise NameError

    alert = await motor_db.absence_alerts.find_one({"class_id": class_id, "student_email": student_email})
    assert alert is not None
    assert alert["email_sent"] is True


async def test_check_absences_one_bad_class_does_not_abort_others(monkeypatch, fixed_clock):
    """A single class raising mid-loop must not stop later classes from being evaluated."""
    class_start = fixed_clock - timedelta(minutes=45)
    good_class_id = f"sched-test-{RUN_ID}-{secrets.token_hex(4)}"
    bad_class_id = f"sched-test-{RUN_ID}-{secrets.token_hex(4)}"
    teacher_id = f"sched-test-{RUN_ID}-{secrets.token_hex(4)}"
    student_id = f"sched-test-{RUN_ID}-{secrets.token_hex(4)}"
    student_email = f"sched-test-{RUN_ID}-{secrets.token_hex(4)}@example.com"

    await motor_db.login.insert_one({"user_id": teacher_id, "username": f"{teacher_id}@example.com", "timezone": "UTC"})
    await motor_db.login.insert_one({"user_id": student_id, "username": student_email, "parent_email": "parent@example.com"})
    await _make_class(bad_class_id, teacher_id, [student_id], start=class_start, family_alerts=True)
    await _make_class(good_class_id, teacher_id, [student_id], start=class_start, family_alerts=True)

    orig_compute = scheduler_module.today_session_start_utc
    def _boom(cls, *a, **kw):
        if cls.get("time") == class_start.strftime("%H:%M") and _boom.calls == 0:
            _boom.calls += 1
            raise RuntimeError("simulated crash in one class")
        return orig_compute(cls, *a, **kw)
    _boom.calls = 0
    monkeypatch.setattr(scheduler_module, "today_session_start_utc", _boom)
    monkeypatch.setattr("app.email_service.send_email", lambda *a, **k: None)

    await check_absences(now_utc=fixed_clock)  # must not raise despite the first class blowing up

    alert = await motor_db.absence_alerts.find_one({"class_id": good_class_id, "student_email": student_email})
    assert alert is not None, "the second class must still be processed after the first one crashes"


async def test_send_class_reminders_ignores_family_alerts_flag(monkeypatch, fixed_clock):
    """Regression for segment 4.6: family_alerts gates absence alerts only —
    class reminders are opted into per-parent and must fire regardless."""
    class_start = fixed_clock + timedelta(minutes=10)
    class_id = f"sched-test-{RUN_ID}-{secrets.token_hex(4)}"
    teacher_id = f"sched-test-{RUN_ID}-{secrets.token_hex(4)}"
    student_id = f"sched-test-{RUN_ID}-{secrets.token_hex(4)}"
    parent_id = f"sched-test-{RUN_ID}-{secrets.token_hex(4)}"

    await motor_db.login.insert_one({"user_id": teacher_id, "username": f"{teacher_id}@example.com", "timezone": "UTC"})
    await motor_db.login.insert_one({"user_id": student_id, "username": f"{student_id}@example.com", "name": "Kid"})
    await motor_db.login.insert_one({
        "user_id": parent_id, "username": f"{parent_id}@example.com",
        "number": 15551234567, "parent_reminders_sms": True,
    })
    await motor_db.parent_links.insert_one({"parent_user_id": parent_id, "student_user_id": student_id})
    await _make_class(class_id, teacher_id, [student_id], start=class_start, family_alerts=False)

    fake = _FakeTwilio()
    monkeypatch.setattr("twilio.rest.Client", lambda *a, **kw: fake)

    await send_class_reminders(now_utc=fixed_clock)

    assert fake.sent, "family_alerts=False must not block a parent-opted-in class reminder"
    log_row = await motor_db.parent_reminder_log.find_one({"class_id": class_id, "parent_user_id": parent_id})
    assert log_row is not None


async def test_send_class_reminders_dedup_is_atomic(monkeypatch, fixed_clock):
    """Regression for segment 4.7: two ticks for the same window must not double-send."""
    class_start = fixed_clock + timedelta(minutes=10)
    class_id = f"sched-test-{RUN_ID}-{secrets.token_hex(4)}"
    teacher_id = f"sched-test-{RUN_ID}-{secrets.token_hex(4)}"
    student_id = f"sched-test-{RUN_ID}-{secrets.token_hex(4)}"
    parent_id = f"sched-test-{RUN_ID}-{secrets.token_hex(4)}"

    await motor_db.login.insert_one({"user_id": teacher_id, "username": f"{teacher_id}@example.com", "timezone": "UTC"})
    await motor_db.login.insert_one({"user_id": student_id, "username": f"{student_id}@example.com", "name": "Kid"})
    await motor_db.login.insert_one({
        "user_id": parent_id, "username": f"{parent_id}@example.com",
        "number": 15551234567, "parent_reminders_sms": True,
    })
    await motor_db.parent_links.insert_one({"parent_user_id": parent_id, "student_user_id": student_id})
    await _make_class(class_id, teacher_id, [student_id], start=class_start, family_alerts=True)

    fake = _FakeTwilio()
    monkeypatch.setattr("twilio.rest.Client", lambda *a, **kw: fake)

    await send_class_reminders(now_utc=fixed_clock)
    await send_class_reminders(now_utc=fixed_clock)  # simulates a second worker/tick hitting the same window

    assert len(fake.sent) == 1, "the second run must be deduped, not send a duplicate text"


class _FakeTwilio:
    def __init__(self):
        self.sent = []
        self.messages = self

    def create(self, **kwargs):
        self.sent.append(kwargs)
