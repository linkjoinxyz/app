"""override_class_attendance built its timestamps in UTC while a teacher enters
join_time as a local wall clock and a class's scheduled start is local too.

Two consequences for any negative-UTC-offset teacher:
  - the session-start probe used midnight UTC, which is the PREVIOUS local day,
    so compute_session_start_utc resolved the wrong weekday. For a Mon-Fri class,
    a Monday override found no scheduled session and minutes_late was forced to 0,
    silently recording a late student as on time.
  - join_time was stamped tzinfo=utc, so a 09:05 join against a 09:00 class in
    US/Eastern computed minutes_late = -235 instead of 5.

These assert on the stored attendance row, which is what every downstream tardy
count, flag, and parent-facing rate reads.
"""
import secrets
from datetime import datetime, timezone

import pytest

from app.database import motor_db

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


@pytest.mark.parametrize("date_str", [_MONDAY, _TUESDAY])
async def test_five_minutes_late_records_as_five(
    as_user, eastern_teacher, morning_class, student_in_class, date_str
):
    """The headline bug: this recorded -235 on Tuesday and 0 on Monday."""
    rec = await _override(as_user, eastern_teacher, morning_class, student_in_class, date_str, "09:05")
    assert rec["minutes_late"] == 5


async def test_on_time_join_records_zero(as_user, eastern_teacher, morning_class, student_in_class):
    rec = await _override(as_user, eastern_teacher, morning_class, student_in_class, _MONDAY, "09:00")
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
