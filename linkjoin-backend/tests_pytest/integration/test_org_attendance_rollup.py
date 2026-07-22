"""GET /orgs/{org_id}/attendance and the LMS score computation.

Both were completely untested, which is how a NameError (get_blackout_set used
but never imported in orgs.py) reached the org rollup unnoticed: every other
caller of the shared attendance math had coverage and stayed green.

They share compute_student_attendance_rate / expected_session_dates with the
teacher-facing surfaces, so a divergence here means an admin dashboard and an LMS
grade disagreeing with the class page about the same student.
"""
import secrets
from datetime import datetime, timedelta, timezone

import pytest

from app.database import motor_db
from app.routers.integrations import _compute_scores

_ORG = "test-org"  # the org_id conftest's institutional_admin_user belongs to


@pytest.fixture
async def org_doc():
    doc = {"org_id": _ORG, "name": "Test Org", "type": "school"}
    existing = await motor_db.orgs.find_one({"org_id": _ORG})
    if existing:
        yield existing
        return
    await motor_db.orgs.insert_one(dict(doc))
    yield doc
    await motor_db.orgs.delete_one({"org_id": _ORG})


@pytest.fixture
async def student():
    doc = {
        "username": f"rollup-student-{secrets.token_hex(4)}@test.linkjoin.xyz",
        "user_id": secrets.token_urlsafe(12),
        "account_type": "institutional", "role": "student", "org_id": _ORG,
        "confirmed": "true", "created_at": datetime.now(timezone.utc),
    }
    await motor_db.login.insert_one(dict(doc))
    yield doc
    await motor_db.login.delete_one({"username": doc["username"]})


@pytest.fixture
async def org_class(student):
    doc = {
        "class_id": secrets.token_urlsafe(12), "org_id": _ORG, "name": "Rollup Class",
        "time": "09:00", "days": ["Mon", "Tue", "Wed", "Thu", "Fri"],
        "teacher_id": secrets.token_urlsafe(12),
        "student_ids": [student["user_id"]], "link_ids": [],
    }
    await motor_db.classes.insert_one(dict(doc))
    yield doc
    await motor_db.classes.delete_one({"class_id": doc["class_id"]})
    await motor_db.attendance.delete_many({"class_id": doc["class_id"]})


async def test_org_attendance_rollup_returns_the_class(
    as_user, institutional_admin_user, org_doc, org_class, student
):
    """The regression: this raised NameError on get_blackout_set."""
    resp = await as_user(institutional_admin_user).get(f"/orgs/{_ORG}/attendance")
    assert resp.status_code == 200, resp.text
    rows = resp.json()["classes"]
    assert org_class["class_id"] in {r["class_id"] for r in rows}


async def test_org_attendance_rollup_school_year_window(
    as_user, institutional_admin_user, org_doc, org_class
):
    """The school_year branch takes a different cutoff and lookback_days, and is
    the one window whose range actually reaches today."""
    resp = await as_user(institutional_admin_user).get(f"/orgs/{_ORG}/attendance?window=school_year")
    assert resp.status_code == 200, resp.text
    assert resp.json()["window"] == "school_year"


async def test_org_attendance_rollup_denied_cross_org(as_user, institutional_teacher_user, org_doc):
    """A teacher is not a school admin."""
    resp = await as_user(institutional_teacher_user).get(f"/orgs/{_ORG}/attendance")
    assert resp.status_code == 403


# ── LMS score computation ────────────────────────────────────────────────────

def _cls(**over):
    return {"days": ["Mon", "Tue", "Wed", "Thu", "Fri"], "time": "09:00", **over}


def _joined_on(dates):
    return [{"opened_at": datetime.fromisoformat(f"{d}T09:00:00+00:00")} for d in dates]


def test_scores_are_100_when_every_expected_session_was_attended():
    now = datetime.now(timezone.utc)
    expected = [
        (now - timedelta(days=i)).strftime("%Y-%m-%d")
        for i in range(1, 29)  # window is now-28 .. now-1
        if (now - timedelta(days=i)).weekday() < 5
    ]
    scores = _compute_scores(_cls(), {"a@x.test": _joined_on(expected)}, {"a@x.test"}, set())
    assert scores["a@x.test"] == 100


def test_attending_nothing_scores_zero():
    scores = _compute_scores(_cls(), {"a@x.test": []}, {"a@x.test"}, set())
    assert scores["a@x.test"] == 0


def test_a_cancelled_date_shrinks_the_denominator():
    """A student who missed only a cancelled session should not be penalised,
    which is the whole reason cancellations exist."""
    now = datetime.now(timezone.utc)
    weekdays = [
        (now - timedelta(days=i)).strftime("%Y-%m-%d")
        for i in range(1, 29)  # window is now-28 .. now-1
        if (now - timedelta(days=i)).weekday() < 5
    ]
    skipped, attended = weekdays[0], weekdays[1:]

    before = _compute_scores(_cls(), {"a@x.test": _joined_on(attended)}, {"a@x.test"}, set())
    after = _compute_scores(
        _cls(schedule_overrides=[{"date": skipped, "type": "cancelled"}]),
        {"a@x.test": _joined_on(attended)}, {"a@x.test"}, set(),
    )
    assert before["a@x.test"] < 100
    assert after["a@x.test"] == 100


def test_a_blackout_date_shrinks_the_denominator_too():
    now = datetime.now(timezone.utc)
    weekdays = [
        (now - timedelta(days=i)).strftime("%Y-%m-%d")
        for i in range(1, 29)  # window is now-28 .. now-1
        if (now - timedelta(days=i)).weekday() < 5
    ]
    skipped, attended = weekdays[0], weekdays[1:]
    scores = _compute_scores(
        _cls(), {"a@x.test": _joined_on(attended)}, {"a@x.test"}, {skipped}
    )
    assert scores["a@x.test"] == 100


def test_class_with_no_schedule_scores_100_rather_than_dividing_by_zero():
    scores = _compute_scores({"days": [], "time": ""}, {"a@x.test": []}, {"a@x.test"}, set())
    assert scores["a@x.test"] == 100
