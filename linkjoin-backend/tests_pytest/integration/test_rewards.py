"""GET /attendance/me/rewards.

Two bugs: (1) it was the only attendance-reading endpoint that didn't collapse
same-day duplicate rows to the most-recently-written one, so a stale/duplicate
join row could keep a day counted as on-time even after a later, worse record
existed for that day; (2) it required premium unconditionally, which blocked a
personal-account student with an expired trial from viewing their own already-
tracked attendance streaks.
"""
import secrets
from datetime import datetime, timedelta, timezone

import pytest

from app.database import motor_db
from tests_pytest.conftest import RUN_ID


@pytest.fixture(autouse=True)
async def _cleanup():
    yield
    await motor_db.attendance.delete_many({"student_email": {"$regex": f"^rewards-test-{RUN_ID}-"}})
    await motor_db.login.delete_many({"username": {"$regex": f"^rewards-test-{RUN_ID}-"}})


@pytest.fixture
async def institutional_student_user():
    doc = {
        "username": f"rewards-test-{RUN_ID}-{secrets.token_hex(4)}@test.lincoln.edu",
        "user_id": secrets.token_urlsafe(12),
        "account_type": "institutional",
        "role": "student",
        "org_id": "test-org",
        "confirmed": "true",
        "created_at": datetime.now(timezone.utc),
    }
    await motor_db.login.insert_one(doc)
    yield doc
    await motor_db.login.delete_one({"username": doc["username"]})


@pytest.fixture
async def personal_student_no_premium():
    doc = {
        "username": f"rewards-test-{RUN_ID}-{secrets.token_hex(4)}@example.com",
        "user_id": secrets.token_urlsafe(12),
        "account_type": "personal",
        "role": "student",
        "premium_status": "expired",
        "confirmed": "true",
        "created_at": datetime.now(timezone.utc),
    }
    await motor_db.login.insert_one(doc)
    yield doc
    await motor_db.login.delete_one({"username": doc["username"]})


async def test_later_recorded_row_wins_over_earlier_duplicate(as_user, institutional_student_user):
    email = institutional_student_user["username"]
    day = datetime(2026, 3, 2, 9, 5, tzinfo=timezone.utc)  # a Monday, on time
    await motor_db.attendance.insert_many([
        {
            "student_email": email, "class_id": "class-x", "opened_at": day,
            "minutes_late": 0, "record_date": "2026-03-02", "recorded_at": day,
        },
        {
            "student_email": email, "class_id": "class-x",
            "opened_at": day + timedelta(minutes=45), "minutes_late": 45,
            "record_date": "2026-03-02", "recorded_at": day + timedelta(minutes=50),
        },
    ])

    resp = await as_user(institutional_student_user).get("/attendance/me/rewards")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_sessions"] == 1
    assert body["on_time_sessions"] == 0  # the later, later-arriving row is the current one


async def test_absent_override_supersedes_earlier_join(as_user, institutional_student_user):
    email = institutional_student_user["username"]
    join_time = datetime(2026, 3, 2, 9, 0, tzinfo=timezone.utc)
    await motor_db.attendance.insert_many([
        {
            "student_email": email, "class_id": "class-x", "opened_at": join_time,
            "minutes_late": 0, "record_date": "2026-03-02", "recorded_at": join_time,
        },
        {
            "student_email": email, "class_id": "class-x", "opened_at": None,
            "minutes_late": None, "record_date": "2026-03-02",
            "recorded_at": join_time + timedelta(hours=1), "manual": True,
        },
    ])

    resp = await as_user(institutional_student_user).get("/attendance/me/rewards")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_sessions"] == 0  # the override, not the stale join, is current


async def test_personal_student_no_premium_still_gets_200(as_user, personal_student_no_premium):
    resp = await as_user(personal_student_no_premium).get("/attendance/me/rewards")
    assert resp.status_code == 200


async def test_personal_non_student_without_premium_gets_403(as_user, personal_user_no_trial):
    resp = await as_user(personal_user_no_trial).get("/attendance/me/rewards")
    assert resp.status_code == 403
