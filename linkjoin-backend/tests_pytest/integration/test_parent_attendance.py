"""Regression tests for segment 4 parent-portal findings (4.2-4.5):
- get_child_attendance must resolve to the latest-recorded row per (class,
  date), not an arbitrary cursor-order pick, and must exclude org
  blackout/summer dates and use the org's configured tardy threshold.
- list_student_notes must not let a staff caller with an empty org_id bypass
  the access check, and must restrict teachers to their own classes.
"""
import secrets
from datetime import datetime, timedelta, timezone

import pytest

from app.database import motor_db
from tests_pytest.conftest import RUN_ID


@pytest.fixture(autouse=True)
async def _cleanup():
    yield
    await motor_db.login.delete_many({"user_id": {"$regex": f"^pa-test-{RUN_ID}-"}})
    await motor_db.classes.delete_many({"class_id": {"$regex": f"^pa-test-{RUN_ID}-"}})
    await motor_db.orgs.delete_many({"org_id": {"$regex": f"^pa-test-{RUN_ID}-"}})
    await motor_db.attendance.delete_many({"class_id": {"$regex": f"^pa-test-{RUN_ID}-"}})
    await motor_db.parent_links.delete_many({"student_user_id": {"$regex": f"^pa-test-{RUN_ID}-"}})


def _today_abbr():
    return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][datetime.now(timezone.utc).weekday()]


async def _make_parent_and_student():
    parent_id = f"pa-test-{RUN_ID}-{secrets.token_hex(4)}"
    student_id = f"pa-test-{RUN_ID}-{secrets.token_hex(4)}"
    student_email = f"pa-test-{RUN_ID}-{secrets.token_hex(4)}@example.com"
    await motor_db.login.insert_one({"user_id": student_id, "username": student_email, "name": "Kid"})
    await motor_db.parent_links.insert_one({"parent_user_id": parent_id, "student_user_id": student_id})
    parent_user = {"user_id": parent_id, "role": "parent", "username": f"{parent_id}@example.com"}
    return parent_user, student_id, student_email


async def test_override_supersedes_stale_attendance_row(as_user):
    """4.2 — a teacher's absent override must win over an earlier, stale row."""
    parent_user, student_id, student_email = await _make_parent_and_student()
    class_id = f"pa-test-{RUN_ID}-{secrets.token_hex(4)}"
    await motor_db.classes.insert_one({
        "class_id": class_id, "name": "Test Class", "days": [_today_abbr()],
        "student_ids": [student_id], "org_id": "",
    })

    target_date = datetime.now(timezone.utc).date().isoformat()
    stale_time = datetime.now(timezone.utc) - timedelta(hours=2)
    await motor_db.attendance.insert_one({
        "student_email": student_email, "class_id": class_id, "class_name": "Test Class",
        "opened_at": stale_time, "minutes_late": 0, "recorded_at": stale_time,
    })
    override_time = datetime.now(timezone.utc)
    override = await motor_db.attendance.insert_one({
        "student_email": student_email, "class_id": class_id, "class_name": "Test Class",
        "opened_at": None, "minutes_late": None, "excused": False, "absent": True,
        "recorded_at": override_time, "record_date": target_date,
    })

    resp = await as_user(parent_user).get(f"/parent/children/{student_id}/attendance")
    assert resp.status_code == 200
    events = resp.json()["events"]
    matching = [e for e in events if e["date"] == target_date]
    assert len(matching) == 1
    assert matching[0]["type"] == "absent"
    assert matching[0]["record_id"] == str(override.inserted_id)


async def test_blackout_date_not_shown_as_absent(as_user):
    """4.3 — a scheduled weekday that falls on an org blackout date must not
    manufacture a fake absence."""
    parent_user, student_id, _ = await _make_parent_and_student()
    class_id = f"pa-test-{RUN_ID}-{secrets.token_hex(4)}"
    org_id = f"pa-test-{RUN_ID}-{secrets.token_hex(4)}"
    blackout_date = (datetime.now(timezone.utc).date() - timedelta(days=7)).isoformat()
    await motor_db.orgs.insert_one({"org_id": org_id, "blackout_dates": [blackout_date]})
    await motor_db.classes.insert_one({
        "class_id": class_id, "name": "Test Class",
        "days": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        "student_ids": [student_id], "org_id": org_id,
    })

    resp = await as_user(parent_user).get(f"/parent/children/{student_id}/attendance")
    assert resp.status_code == 200
    events = resp.json()["events"]
    assert not any(e["date"] == blackout_date for e in events)


async def test_uses_org_tardy_threshold_not_hardcoded_five(as_user):
    """4.4 — a 6-minute-late join must respect the org's configured threshold."""
    parent_user, student_id, student_email = await _make_parent_and_student()
    class_id = f"pa-test-{RUN_ID}-{secrets.token_hex(4)}"
    org_id = f"pa-test-{RUN_ID}-{secrets.token_hex(4)}"
    await motor_db.orgs.insert_one({"org_id": org_id, "attendance_settings": {"tardy_threshold_minutes": 10}})
    await motor_db.classes.insert_one({
        "class_id": class_id, "name": "Test Class", "days": [_today_abbr()],
        "student_ids": [student_id], "org_id": org_id,
    })
    now = datetime.now(timezone.utc)
    await motor_db.attendance.insert_one({
        "student_email": student_email, "class_id": class_id, "class_name": "Test Class",
        "opened_at": now, "minutes_late": 6, "recorded_at": now,
    })

    resp = await as_user(parent_user).get(f"/parent/children/{student_id}/attendance")
    assert resp.status_code == 200
    events = resp.json()["events"]
    today_events = [e for e in events if e["date"] == now.date().isoformat()]
    assert len(today_events) == 1
    assert today_events[0]["type"] == "on_time", "org threshold is 10 minutes, so 6 minutes late must not be tardy"


async def test_child_classes_rates_match_per_class_computation(as_user):
    """The batched get_child_classes must return the same per-class numbers as
    the unbatched compute_student_attendance_rate loop it replaced."""
    from app.routers.attendance import compute_student_attendance_rate, _LOOKBACK_DAYS
    from app.utils import lookback_cutoff, get_blackout_set

    parent_user, student_id, student_email = await _make_parent_and_student()
    org_id = f"pa-test-{RUN_ID}-{secrets.token_hex(4)}"
    await motor_db.orgs.insert_one(
        {"org_id": org_id, "attendance_settings": {"tardy_threshold_minutes": 5}}
    )

    all_days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    now = datetime.now(timezone.utc)
    class_ids = []
    for i in range(2):  # two classes so the batching (one $in vs two finds) is exercised
        cid = f"pa-test-{RUN_ID}-{secrets.token_hex(4)}"
        class_ids.append(cid)
        await motor_db.classes.insert_one({
            "class_id": cid, "name": f"Class {i}", "days": all_days,
            "student_ids": [student_id], "org_id": org_id, "time": "09:00",
        })
        for days_ago, ml in [(1, 0), (3, 20), (5, 0)]:  # on-time, tardy, on-time
            day = now - timedelta(days=days_ago)
            await motor_db.attendance.insert_one({
                "student_email": student_email, "class_id": cid, "class_name": f"Class {i}",
                "opened_at": day, "minutes_late": ml, "recorded_at": day,
                "record_date": day.date().isoformat(), "source": "linkjoin_click",
            })

    resp = await as_user(parent_user).get(f"/parent/children/{student_id}/classes")
    assert resp.status_code == 200, resp.text
    rows = {r["class_id"]: r for r in resp.json()}
    assert set(rows) == set(class_ids)

    cutoff = lookback_cutoff(now, _LOOKBACK_DAYS)
    org = await motor_db.orgs.find_one({"org_id": org_id})
    for cid in class_ids:
        cls = await motor_db.classes.find_one({"class_id": cid})
        expected = await compute_student_attendance_rate(
            cid, cls, student_email, cutoff, _LOOKBACK_DAYS, 5, get_blackout_set(org),
        )
        row = rows[cid]
        assert row["attended_last_28d"] == expected["sessions"] == 3
        assert row["tardy_last_28d"] == expected["tardy"] == 1
        assert row["expected_last_28d"] == expected["effective_expected"]
        assert row["attendance_rate"] == expected["attendance_rate"]


async def test_notes_teacher_empty_org_id_denied(as_user):
    """4.5 — a teacher with a falsy org_id must not bypass the access check."""
    _, student_id, _ = await _make_parent_and_student()
    await motor_db.login.update_one({"user_id": student_id}, {"$set": {"org_id": "some-org"}})
    teacher_user = {"user_id": f"pa-test-{RUN_ID}-{secrets.token_hex(4)}", "role": "teacher", "org_id": ""}

    resp = await as_user(teacher_user).get(f"/parent/children/{student_id}/notes")
    assert resp.status_code == 403


async def test_notes_teacher_outside_own_classes_denied(as_user):
    """4.5 — a teacher in the same org but not teaching this student must be denied."""
    _, student_id, _ = await _make_parent_and_student()
    await motor_db.login.update_one({"user_id": student_id}, {"$set": {"org_id": "shared-org"}})
    teacher_id = f"pa-test-{RUN_ID}-{secrets.token_hex(4)}"
    other_class_id = f"pa-test-{RUN_ID}-{secrets.token_hex(4)}"
    await motor_db.classes.insert_one({
        "class_id": other_class_id, "teacher_id": teacher_id, "org_id": "shared-org", "student_ids": [],
    })
    teacher_user = {"user_id": teacher_id, "role": "teacher", "org_id": "shared-org"}

    resp = await as_user(teacher_user).get(f"/parent/children/{student_id}/notes")
    assert resp.status_code == 403


async def test_notes_teacher_own_class_allowed(as_user):
    """4.5 — a teacher who actually teaches this student keeps access."""
    _, student_id, _ = await _make_parent_and_student()
    await motor_db.login.update_one({"user_id": student_id}, {"$set": {"org_id": "shared-org"}})
    teacher_id = f"pa-test-{RUN_ID}-{secrets.token_hex(4)}"
    class_id = f"pa-test-{RUN_ID}-{secrets.token_hex(4)}"
    await motor_db.classes.insert_one({
        "class_id": class_id, "teacher_id": teacher_id, "org_id": "shared-org", "student_ids": [student_id],
    })
    teacher_user = {"user_id": teacher_id, "role": "teacher", "org_id": "shared-org"}

    resp = await as_user(teacher_user).get(f"/parent/children/{student_id}/notes")
    assert resp.status_code == 200
