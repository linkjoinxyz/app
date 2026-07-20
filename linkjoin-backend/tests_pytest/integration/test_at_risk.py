"""GET /interventions/at-risk previously hardcoded its flagging thresholds and
never consulted the org's configured attendance_settings, never applied
_resolve_latest_records dedup, and never excluded excused absences — silently
disagreeing with GET /attendance/class/{id}/patterns, which does all three.
These tests exercise the shared compute_class_flag_metrics/resolve_org_thresholds
helper both endpoints now use, and cross-check that /at-risk and /patterns agree.
"""
import secrets
from datetime import datetime, timedelta, timezone

import pytest

from app.database import motor_db

_DAY_TO_WEEKDAY = {'Sun': 6, 'Mon': 0, 'Tue': 1, 'Wed': 2, 'Thu': 3, 'Fri': 4, 'Sat': 5}
_LOOKBACK_DAYS = 28
_ALL_DAYS = list(_DAY_TO_WEEKDAY.keys())


def _expected_dates() -> list[str]:
    # cutoff is `now - 28 days` with a real time-of-day component, so the
    # earliest date string, reconstructed at midnight, can fall just before
    # the exact `$gte: cutoff` boundary depending on what time the test runs.
    # Drop the first two days of margin so test data is unambiguously inside
    # the window regardless of time of day.
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=_LOOKBACK_DAYS)
    return [(cutoff + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(2, _LOOKBACK_DAYS)]


async def _insert_class(teacher_id: str, org_id: str, **extra) -> dict:
    doc = {
        "class_id": secrets.token_urlsafe(10),
        "org_id": org_id,
        "teacher_id": teacher_id,
        "name": "Algebra II",
        "days": _ALL_DAYS,
        "time": "09:00",
        "student_ids": [],
        **extra,
    }
    await motor_db.classes.insert_one(dict(doc))
    return doc


async def _insert_attendance(class_id: str, class_name: str, student_email: str, date_str: str, **extra):
    day = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    doc = {
        "student_email": student_email,
        "class_id": class_id,
        "class_name": class_name,
        "opened_at": day,
        "minutes_late": 0,
        "excused": False,
        "record_date": date_str,
        **extra,
    }
    await motor_db.attendance.insert_one(dict(doc))


@pytest.fixture
async def org_with_settings():
    org_id = f"org-{secrets.token_hex(4)}"
    doc = {"org_id": org_id, "attendance_settings": {}}
    await motor_db.orgs.insert_one(dict(doc))
    yield doc
    await motor_db.orgs.delete_one({"org_id": org_id})


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
        await motor_db.interventions.delete_many({"class_id": cls["class_id"]})


async def test_at_risk_uses_org_configured_tardy_rate_flag(
    as_user, institutional_teacher_user, org_with_settings, cleanup_class_and_attendance,
):
    await motor_db.orgs.update_one(
        {"org_id": org_with_settings["org_id"]},
        {"$set": {"attendance_settings.tardy_rate_flag": 0.15}},
    )
    cls = await cleanup_class_and_attendance(
        await _insert_class(institutional_teacher_user["user_id"], org_with_settings["org_id"])
    )
    student = f"student-{secrets.token_hex(4)}@test.lincoln.edu"
    dates = _expected_dates()
    # 5 attended sessions, 1 tardy => tardy_rate 0.2 — above the org's custom
    # 0.15 flag but below the hardcoded 0.33 default, so this only flags if
    # /at-risk actually reads org config.
    for i, d in enumerate(dates[:5]):
        minutes_late = 10 if i == 0 else 0
        await _insert_attendance(cls["class_id"], cls["name"], student, d, minutes_late=minutes_late)

    resp = await as_user(institutional_teacher_user).get("/interventions/at-risk")
    assert resp.status_code == 200
    hits = [r for r in resp.json() if r["student_email"] == student and r["flag_type"] == "repeat_tardy"]
    assert len(hits) == 1
    assert hits[0]["class_id"] == cls["class_id"]

    # Cross-check: /patterns must agree — this is the core regression test for
    # the /at-risk vs /patterns divergence.
    patterns_resp = await as_user(institutional_teacher_user).get(f"/attendance/class/{cls['class_id']}/patterns")
    assert patterns_resp.status_code == 200
    student_row = next(s for s in patterns_resp.json()["students"] if s["student_email"] == student)
    assert "repeat_tardy" in student_row["flags"]


async def test_at_risk_excludes_excused_absences(
    as_user, institutional_teacher_user, org_with_settings, cleanup_class_and_attendance,
):
    cls = await cleanup_class_and_attendance(
        await _insert_class(institutional_teacher_user["user_id"], org_with_settings["org_id"])
    )
    dates = _expected_dates()  # candidate dates within production's real 28-day window

    flagged_student = f"flagged-{secrets.token_hex(4)}@test.lincoln.edu"
    excused_student = f"excused-{secrets.token_hex(4)}@test.lincoln.edu"

    # Both students attend 10 sessions out of an expected_count of 28 (every
    # day is scheduled) => raw rate 10/28 ≈ 0.36, below the 0.5 default.
    for d in dates[:10]:
        await _insert_attendance(cls["class_id"], cls["name"], flagged_student, d)
        await _insert_attendance(cls["class_id"], cls["name"], excused_student, d)

    # excused_student has every remaining candidate date excused, dropping
    # effective_expected well below flagged_student's => higher attendance_rate.
    await motor_db.classes.update_one(
        {"class_id": cls["class_id"]},
        {"$set": {"excused_absences": [
            {"student_email": excused_student, "date": d} for d in dates[10:]
        ]}},
    )

    resp = await as_user(institutional_teacher_user).get("/interventions/at-risk")
    assert resp.status_code == 200
    by_email = {r["student_email"]: r for r in resp.json() if r["flag_type"] == "low_attendance"}
    assert flagged_student in by_email
    assert excused_student not in by_email


async def test_at_risk_matches_patterns_after_override_correction(
    as_user, institutional_teacher_user, org_with_settings, cleanup_class_and_attendance,
):
    cls = await cleanup_class_and_attendance(
        await _insert_class(institutional_teacher_user["user_id"], org_with_settings["org_id"])
    )
    student = f"student-{secrets.token_hex(4)}@test.lincoln.edu"
    dates = _expected_dates()

    # Attend 4 real sessions.
    for d in dates[:4]:
        await _insert_attendance(cls["class_id"], cls["name"], student, d)

    # A 5th date has a stale "present" join later corrected to an excused
    # absence — the correction must win, not the raw join.
    corrected_date = dates[4]
    stale_ts = datetime.strptime(corrected_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    await _insert_attendance(cls["class_id"], cls["name"], student, corrected_date, recorded_at=stale_ts)
    await motor_db.attendance.insert_one({
        "student_email": student,
        "class_id": cls["class_id"],
        "class_name": cls["name"],
        "opened_at": None,
        "minutes_late": None,
        "excused": True,
        "record_date": corrected_date,
        "recorded_at": stale_ts + timedelta(hours=1),
    })

    at_risk_resp = await as_user(institutional_teacher_user).get("/interventions/at-risk")
    patterns_resp = await as_user(institutional_teacher_user).get(f"/attendance/class/{cls['class_id']}/patterns")
    assert at_risk_resp.status_code == 200 and patterns_resp.status_code == 200

    student_row = next(s for s in patterns_resp.json()["students"] if s["student_email"] == student)
    # 4 attended sessions, not 5 — the corrected date must not count.
    assert student_row["sessions"] == 4
    assert corrected_date in student_row["excused_absence_dates"]

    low_attendance_hits = [
        r for r in at_risk_resp.json()
        if r["student_email"] == student and r["flag_type"] == "low_attendance"
    ]
    if low_attendance_hits:
        assert low_attendance_hits[0]["sessions"] == 4
