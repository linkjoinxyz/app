"""Class schedules and their one-off per-date overrides.

Two things are covered here. First, the class is authoritative for schedule and
its writes flow down to the attached link and to every student's pushed copy:
left unsynced, a class at 09:00 whose link says 09:05 opens five minutes late for
every student and records all of them tardy, permanently.

Second, the override endpoints: a `late_start` moves the bell for one date and a
`cancelled` removes the session entirely, so nobody is marked absent and the date
leaves the attendance-rate denominator.
"""
import secrets
from datetime import date, datetime, timezone

import pytest

from app.database import motor_db
from app.encryption import encrypt
from app.utils import class_meets_on, expected_session_dates

_MONDAY = "2026-07-20"


@pytest.fixture(autouse=True)
def _no_scheduler(monkeypatch):
    """publish_link_job_change talks to Redis pub/sub; the assertions here are
    about the documents, not the job registration."""
    published = []

    async def _fake(action, link, update=False):
        published.append((action, link.get("id"), link.get("time"), tuple(link.get("days") or [])))

    monkeypatch.setattr("app.routers.classes.publish_link_job_change", _fake)
    return published


@pytest.fixture
async def teacher():
    doc = {
        "username": f"sched-teacher-{secrets.token_hex(4)}@test.linkjoin.xyz",
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
async def student():
    doc = {
        "username": f"sched-student-{secrets.token_hex(4)}@test.linkjoin.xyz",
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
async def cls_with_link(teacher, student):
    """A class, the teacher's link, and the copy pushed to the student."""
    class_id = secrets.token_urlsafe(12)
    link_id = 995001
    student_link_id = 995002

    await motor_db.links.insert_one({
        "username": teacher["username"], "id": link_id, "name": "Homeroom",
        "link": encrypt("https://zoom.us/j/1"), "time": "09:00", "days": ["Mon", "Wed"],
        "repeat": "week", "active": "true", "text": "false", "class_id": class_id,
    })
    await motor_db.links.insert_one({
        "username": student["username"], "id": student_link_id, "share_id": link_id,
        "name": "Homeroom", "link": encrypt("https://zoom.us/j/1"), "time": "09:00",
        "days": ["Mon", "Wed"], "repeat": "week", "active": "true", "text": "false",
        "class_id": class_id,
    })
    doc = {
        "class_id": class_id, "org_id": "test-org", "name": "Homeroom",
        "time": "09:00", "days": ["Mon", "Wed"], "teacher_id": teacher["user_id"],
        "student_ids": [student["user_id"]], "link_ids": [link_id],
    }
    await motor_db.classes.insert_one(dict(doc))
    yield doc
    await motor_db.classes.delete_one({"class_id": class_id})
    await motor_db.links.delete_many({"id": {"$in": [link_id, student_link_id]}})


# ── schedule propagation ─────────────────────────────────────────────────────

async def test_class_schedule_change_reaches_link_and_student_copy(
    as_user, teacher, student, cls_with_link
):
    resp = await as_user(teacher).put(
        f"/classes/{cls_with_link['class_id']}", json={"time": "10:15", "days": ["Tue", "Thu"]}
    )
    assert resp.status_code == 200

    for username in (teacher["username"], student["username"]):
        link = await motor_db.links.find_one({"username": username}, {"time": 1, "days": 1, "_id": 0})
        assert link["time"] == "10:15", f"{username} link time not propagated"
        assert link["days"] == ["Tue", "Thu"], f"{username} link days not propagated"


async def test_propagation_reregisters_scheduler_jobs_once_per_link(
    as_user, teacher, cls_with_link, _no_scheduler
):
    """A stale cron would keep texting at the old time; a doubled one would text
    twice. Exactly one delete and one create per affected link."""
    await as_user(teacher).put(f"/classes/{cls_with_link['class_id']}", json={"time": "10:15"})

    deletes = [p for p in _no_scheduler if p[0] == "delete"]
    creates = [p for p in _no_scheduler if p[0] == "create"]
    assert len(deletes) == 2  # teacher's link + student's copy
    assert len(creates) == 2
    assert {c[2] for c in creates} == {"10:15"}


async def test_propagation_skips_links_already_in_step(as_user, teacher, cls_with_link, _no_scheduler):
    """Renaming a class must not churn scheduler jobs."""
    await as_user(teacher).put(f"/classes/{cls_with_link['class_id']}", json={"name": "Renamed"})
    assert _no_scheduler == []


async def test_clearing_a_schedule_is_rejected(as_user, teacher, cls_with_link):
    """update_class filters on `is not None`, so "" and [] would be written and
    would silently disable attendance for the class."""
    for payload in ({"time": ""}, {"days": []}):
        resp = await as_user(teacher).put(f"/classes/{cls_with_link['class_id']}", json=payload)
        assert resp.status_code == 422, payload

    after = await motor_db.classes.find_one(
        {"class_id": cls_with_link["class_id"]}, {"time": 1, "days": 1, "_id": 0}
    )
    assert after["time"] == "09:00" and after["days"] == ["Mon", "Wed"]


async def test_invalid_schedule_is_rejected(as_user, teacher, cls_with_link):
    for payload in ({"time": "25:00"}, {"time": "nope"}, {"days": ["Funday"]}):
        resp = await as_user(teacher).put(f"/classes/{cls_with_link['class_id']}", json=payload)
        assert resp.status_code == 422, payload


# ── override endpoints ───────────────────────────────────────────────────────

async def test_set_and_remove_a_late_start(as_user, teacher, cls_with_link):
    cid = cls_with_link["class_id"]
    resp = await as_user(teacher).put(
        f"/classes/{cid}/schedule-override",
        json={"date": _MONDAY, "type": "late_start", "time": "10:30", "reason": "assembly"},
    )
    assert resp.status_code == 200
    assert resp.json()["meets"] is True

    stored = await motor_db.classes.find_one({"class_id": cid}, {"schedule_overrides": 1})
    assert stored["schedule_overrides"][0]["time"] == "10:30"

    resp = await as_user(teacher).delete(f"/classes/{cid}/schedule-override/{_MONDAY}")
    assert resp.status_code == 200 and resp.json()["removed"] is True
    stored = await motor_db.classes.find_one({"class_id": cid}, {"schedule_overrides": 1})
    assert stored["schedule_overrides"] == []


async def test_setting_the_same_date_twice_replaces_rather_than_appends(as_user, teacher, cls_with_link):
    """$addToSet would leave one date holding both a cancelled and a late_start."""
    cid = cls_with_link["class_id"]
    await as_user(teacher).put(
        f"/classes/{cid}/schedule-override", json={"date": _MONDAY, "type": "late_start", "time": "10:30"}
    )
    await as_user(teacher).put(
        f"/classes/{cid}/schedule-override", json={"date": _MONDAY, "type": "cancelled"}
    )
    stored = await motor_db.classes.find_one({"class_id": cid}, {"schedule_overrides": 1})
    assert len(stored["schedule_overrides"]) == 1
    assert stored["schedule_overrides"][0]["type"] == "cancelled"
    assert stored["schedule_overrides"][0]["time"] is None


async def test_late_start_requires_a_time(as_user, teacher, cls_with_link):
    resp = await as_user(teacher).put(
        f"/classes/{cls_with_link['class_id']}/schedule-override",
        json={"date": _MONDAY, "type": "late_start"},
    )
    assert resp.status_code == 422


async def test_override_on_a_non_meeting_weekday_is_accepted_but_inert(as_user, teacher, cls_with_link):
    """Accepted so it cannot be stranded undeletable if the weekday is dropped
    later, but flagged so the UI can say it does nothing."""
    tuesday = "2026-07-21"  # class meets Mon/Wed
    resp = await as_user(teacher).put(
        f"/classes/{cls_with_link['class_id']}/schedule-override",
        json={"date": tuesday, "type": "cancelled"},
    )
    assert resp.status_code == 200
    assert resp.json()["meets"] is False

    stored = await motor_db.classes.find_one({"class_id": cls_with_link["class_id"]})
    assert class_meets_on(stored, date(2026, 7, 21)) is False  # was already false


async def test_cancelled_date_leaves_the_expected_session_dates(as_user, teacher, cls_with_link):
    """The reason cancelling matters: it shrinks the attendance-rate denominator
    instead of counting as a session everyone missed."""
    cid = cls_with_link["class_id"]
    before = await motor_db.classes.find_one({"class_id": cid})
    week = (date(2026, 7, 20), date(2026, 7, 24))
    assert expected_session_dates(before, *week) == ["2026-07-20", "2026-07-22"]

    await as_user(teacher).put(
        f"/classes/{cid}/schedule-override", json={"date": _MONDAY, "type": "cancelled"}
    )
    after = await motor_db.classes.find_one({"class_id": cid})
    assert expected_session_dates(after, *week) == ["2026-07-22"]


async def test_a_teacher_cannot_override_another_teachers_class(as_user, cls_with_link, institutional_teacher_user):
    resp = await as_user(institutional_teacher_user).put(
        f"/classes/{cls_with_link['class_id']}/schedule-override",
        json={"date": _MONDAY, "type": "cancelled"},
    )
    assert resp.status_code == 403


async def test_bad_date_is_rejected(as_user, teacher, cls_with_link):
    resp = await as_user(teacher).put(
        f"/classes/{cls_with_link['class_id']}/schedule-override",
        json={"date": "20/07/2026", "type": "cancelled"},
    )
    assert resp.status_code == 422
