"""override_class_attendance built its timestamps in UTC while a teacher enters
join_time as a local wall clock and a class's scheduled start is local too.

For any negative-UTC-offset teacher the session-start probe used midnight UTC,
which is the PREVIOUS local day, so the wrong weekday was resolved: a Monday
override on a Mon-Fri class found no session and forced minutes_late to 0,
silently recording a late student as on time, and a Tuesday override computed
-235 instead of 5.

The probe is gone; session_start_utc now takes the override's own date directly.
These assert on the stored attendance row, which is what every downstream tardy
count, flag and parent-facing rate reads, plus the resolver itself for the
timezone edges that are awkward to reach through the endpoint.
"""
import secrets
from datetime import date, datetime, timezone

import pytest

from app.database import motor_db
from app.utils import session_start_utc, session_time_on

# 2026-07-20 is a Monday, 2026-07-21 a Tuesday.
_MONDAY = "2026-07-20"
_TUESDAY = "2026-07-21"


@pytest.fixture
async def eastern_teacher():
    doc = {
        "username": f"tz-teacher-{secrets.token_hex(4)}@test.linkjoin.xyz",
        "user_id": secrets.token_urlsafe(12),
        "account_type": "institutional",
        "role": "teacher",
        "org_id": "test-org",
        "timezone": "US/Eastern",
        "confirmed": "true",
        "created_at": datetime.now(timezone.utc),
    }
    await motor_db.login.insert_one(dict(doc))
    yield doc
    await motor_db.login.delete_one({"username": doc["username"]})


@pytest.fixture
async def student_in_class():
    doc = {
        "username": f"tz-student-{secrets.token_hex(4)}@test.linkjoin.xyz",
        "user_id": secrets.token_urlsafe(12),
        "account_type": "institutional",
        "role": "student",
        "org_id": "test-org",
        "confirmed": "true",
        "created_at": datetime.now(timezone.utc),
    }
    await motor_db.login.insert_one(dict(doc))
    yield doc
    await motor_db.login.delete_one({"username": doc["username"]})


@pytest.fixture
async def morning_class(eastern_teacher, student_in_class):
    doc = {
        "class_id": secrets.token_urlsafe(12),
        "org_id": "test-org",
        "name": "Homeroom",
        "time": "09:00",
        "days": ["Mon", "Tue", "Wed", "Thu", "Fri"],
        "teacher_id": eastern_teacher["user_id"],
        "student_ids": [student_in_class["user_id"]],
        "link_ids": [],
    }
    await motor_db.classes.insert_one(dict(doc))
    yield doc
    await motor_db.classes.delete_one({"class_id": doc["class_id"]})
    await motor_db.attendance.delete_many({"class_id": doc["class_id"]})


async def _override(as_user, teacher, cls, student, date_str, join_time):
    resp = await as_user(teacher).post(
        f"/attendance/class/{cls['class_id']}/override",
        json={
            "date": date_str,
            "student_emails": [student["username"]],
            "status": "present",
            "reason_code": "device_failure",
            "join_time": join_time,
        },
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["written"] == 1
    return await motor_db.attendance.find_one(
        {"class_id": cls["class_id"], "student_email": student["username"], "record_date": date_str}
    )


# ── through the endpoint ─────────────────────────────────────────────────────

@pytest.mark.parametrize("date_str", [_MONDAY, _TUESDAY])
async def test_five_minutes_late_records_as_five(
    as_user, eastern_teacher, morning_class, student_in_class, date_str
):
    """The headline bug: this recorded 0 on Monday and -235 on Tuesday."""
    rec = await _override(as_user, eastern_teacher, morning_class, student_in_class, date_str, "09:05")
    assert rec["minutes_late"] == 5


async def test_on_time_join_records_zero(as_user, eastern_teacher, morning_class, student_in_class):
    rec = await _override(as_user, eastern_teacher, morning_class, student_in_class, _MONDAY, "09:00")
    assert rec["minutes_late"] == 0


async def test_early_join_records_zero_not_negative(
    as_user, eastern_teacher, morning_class, student_in_class
):
    """A student who joins before the bell is on time, not "-5 minutes late" —
    a raw negative would pollute the CSV export, parent view and average."""
    rec = await _override(as_user, eastern_teacher, morning_class, student_in_class, _MONDAY, "08:55")
    assert rec["minutes_late"] == 0


async def test_ninety_minutes_late_records_ninety(
    as_user, eastern_teacher, morning_class, student_in_class
):
    rec = await _override(as_user, eastern_teacher, morning_class, student_in_class, _MONDAY, "10:30")
    assert rec["minutes_late"] == 90


async def test_opened_at_lands_on_the_intended_local_day(
    as_user, eastern_teacher, morning_class, student_in_class
):
    """09:05 US/Eastern is 13:05 UTC on the same date; a naive UTC build would
    store 09:05 UTC and drift the calendar day for late-evening classes."""
    rec = await _override(as_user, eastern_teacher, morning_class, student_in_class, _MONDAY, "09:05")
    opened = rec["opened_at"]
    if opened.tzinfo is None:
        opened = opened.replace(tzinfo=timezone.utc)
    assert opened.astimezone(timezone.utc).hour == 13
    assert opened.astimezone(timezone.utc).strftime("%Y-%m-%d") == _MONDAY


async def test_late_start_override_moves_the_bell(
    as_user, eastern_teacher, morning_class, student_in_class
):
    """A student arriving at the late bell is on time, not 90 minutes late."""
    await motor_db.classes.update_one(
        {"class_id": morning_class["class_id"]},
        {"$set": {"schedule_overrides": [{"date": _MONDAY, "type": "late_start", "time": "10:30"}]}},
    )
    rec = await _override(as_user, eastern_teacher, morning_class, student_in_class, _MONDAY, "10:30")
    assert rec["minutes_late"] == 0


# ── the resolver directly ────────────────────────────────────────────────────

def _cls(**over):
    return {"time": "09:00", "days": ["Mon", "Tue", "Wed", "Thu", "Fri"], **over}


def test_resolver_uses_the_requested_date_not_today():
    """The whole point of replacing the midday-local day_probe."""
    start = session_start_utc(_cls(), date(2026, 7, 20), "US/Eastern")
    assert start == datetime(2026, 7, 20, 13, 0, tzinfo=timezone.utc)


def test_resolver_survives_a_dst_boundary():
    """2026-03-08 is the US spring-forward date; 09:00 local is 13:00 UTC after
    it and 14:00 UTC before, so a fixed offset would be an hour out."""
    before = session_start_utc(_cls(), date(2026, 3, 6), "US/Eastern")  # Friday, EST
    after = session_start_utc(_cls(), date(2026, 3, 9), "US/Eastern")   # Monday, EDT
    assert before.hour == 14
    assert after.hour == 13


def test_unknown_timezone_falls_back_to_utc_rather_than_raising():
    start = session_start_utc(_cls(), date(2026, 7, 20), "Not/AZone")
    assert start == datetime(2026, 7, 20, 9, 0, tzinfo=timezone.utc)


def test_late_start_wins_over_the_class_time():
    cls = _cls(schedule_overrides=[{"date": "2026-07-20", "type": "late_start", "time": "10:30"}])
    assert session_time_on(cls, date(2026, 7, 20)) == "10:30"
    assert session_start_utc(cls, date(2026, 7, 20), "US/Eastern").hour == 14  # 10:30 EDT


def test_cancelled_and_blackout_yield_no_session():
    cancelled = _cls(schedule_overrides=[{"date": "2026-07-20", "type": "cancelled"}])
    assert session_start_utc(cancelled, date(2026, 7, 20), "US/Eastern") is None
    assert session_start_utc(_cls(), date(2026, 7, 20), "US/Eastern", {"2026-07-20"}) is None


def test_blackout_beats_a_late_start():
    """School closed outranks a later bell."""
    cls = _cls(schedule_overrides=[{"date": "2026-07-20", "type": "late_start", "time": "10:30"}])
    assert session_start_utc(cls, date(2026, 7, 20), "US/Eastern", {"2026-07-20"}) is None
