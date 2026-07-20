"""GET /attendance/class/{class_id} previously queried the last 200 rows
sorted by opened_at descending. Correction/override rows have opened_at: None,
which sorts last in a descending sort — so they were the first rows dropped by
the limit, and the fill loop then fabricated a synthetic "absent" row for a
date that actually had a real (excused/present) record.
"""
import secrets
from datetime import datetime, timedelta, timezone

import pytest

from app.database import motor_db


async def _insert_class(teacher_id: str, student_ids: list[str], org_id: str = "test-org") -> dict:
    doc = {
        "class_id": secrets.token_urlsafe(10),
        "org_id": org_id,
        "teacher_id": teacher_id,
        "name": "Algebra II",
        "days": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        "time": "09:00",
        "student_ids": student_ids,
    }
    await motor_db.classes.insert_one(dict(doc))
    return doc


@pytest.fixture
async def roster_student():
    doc = {
        "username": f"student-{secrets.token_hex(4)}@test.lincoln.edu",
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
async def cleanup_class_and_attendance():
    created = []

    async def _track(cls):
        created.append(cls)
        return cls

    yield _track
    for cls in created:
        await motor_db.classes.delete_one({"class_id": cls["class_id"]})
        await motor_db.attendance.delete_many({"class_id": cls["class_id"]})


async def test_override_correction_not_dropped_by_truncation(
    as_user, institutional_teacher_user, roster_student, cleanup_class_and_attendance,
):
    cls = await cleanup_class_and_attendance(
        await _insert_class(institutional_teacher_user["user_id"], [roster_student["user_id"]])
    )
    student = roster_student["username"]
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    corrected_date = (today - timedelta(days=1)).strftime("%Y-%m-%d")

    # 250 unrelated rows for other students/dates within the lookback window,
    # all with a real opened_at — enough to exceed the old hardcoded limit(200).
    filler = []
    for i in range(250):
        filler.append({
            "student_email": f"filler-{i}@test.lincoln.edu",
            "class_id": cls["class_id"],
            "class_name": cls["name"],
            "opened_at": today - timedelta(days=(i % 20)),
            "minutes_late": 0,
            "excused": False,
            "record_date": (today - timedelta(days=(i % 20))).strftime("%Y-%m-%d"),
        })
    await motor_db.attendance.insert_many(filler)

    # The correction: an excused-absence override for our student, opened_at
    # is null by design.
    await motor_db.attendance.insert_one({
        "student_email": student,
        "class_id": cls["class_id"],
        "class_name": cls["name"],
        "opened_at": None,
        "minutes_late": None,
        "excused": True,
        "excuse_reason": "Doctor's note",
        "record_date": corrected_date,
        "recorded_at": today,
        "manual": True,
    })

    resp = await as_user(institutional_teacher_user).get(f"/attendance/class/{cls['class_id']}")
    assert resp.status_code == 200
    records = resp.json()["records"]

    matches = [r for r in records if r["student_email"] == student and r["record_date"] == corrected_date]
    assert len(matches) == 1
    row = matches[0]
    assert row["excused"] is True
    assert row["absent"] is False, "the real override was replaced by a fabricated absence"
