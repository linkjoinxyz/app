"""GET /links/c/{slug} — the attendance-integrity redirect flow. Session-start
timing is monkeypatched to a fixed value so these tests don't depend on the
real day-of-week/timezone matching the class's schedule."""
import secrets
from datetime import datetime, timezone

import pytest

from app.database import motor_db
from tests_pytest.conftest import RUN_ID
from app.encryption import encrypt

FIXED_SESSION_START = datetime(2026, 3, 2, 14, 0, 0, tzinfo=timezone.utc)  # a Monday

# Per-run, so a concurrent run's teardown cannot delete this run's links.
_OWNER = f"owner-{RUN_ID}@test.lincoln.edu"


@pytest.fixture(autouse=True)
def _fixed_session_start(monkeypatch):
    # today_session_start_utc returns (local calendar day, session start UTC).
    # The local day is what record_date is now derived from, instead of the UTC
    # instant, so it is pinned here alongside the start.
    monkeypatch.setattr(
        "app.routers.links.today_session_start_utc",
        lambda cls, tz_name, now_utc, blackout=frozenset(): (
            FIXED_SESSION_START.date(), FIXED_SESSION_START,
        ),
    )


@pytest.fixture(autouse=True)
async def _cleanup_test_classes_and_links():
    yield
    await motor_db.classes.delete_many({"class_id": {"$regex": f"^class-{RUN_ID}-"}})
    await motor_db.links.delete_many({"username": _OWNER})
    await motor_db.attendance.delete_many({"class_id": {"$regex": f"^class-{RUN_ID}-"}})
    await motor_db.audit_logs.delete_many({"resource_id": {"$regex": f"^class-{RUN_ID}-"}})


async def _make_class(student_ids, teacher_id="teacher-fixture"):
    class_id = f"class-{RUN_ID}-{secrets.token_hex(6)}"
    doc = {
        "class_id": class_id,
        "name": "Algebra II",
        "teacher_id": teacher_id,
        "student_ids": student_ids,
        "time": "9:00",
        "days": ["Mon"],
        "org_id": "test-org",
    }
    await motor_db.classes.insert_one(doc)
    return class_id


async def _make_link(*, class_id=None, class_name=None):
    slug = secrets.token_urlsafe(12)
    doc = {
        "slug": slug,
        "id": secrets.randbelow(10_000_000),
        "username": _OWNER,
        "link": encrypt("https://zoom.us/j/1234567890"),
        "name": "Class Meeting",
        "class_id": class_id,
        "class_name": class_name,
    }
    await motor_db.links.insert_one(doc)
    return slug


@pytest.fixture
async def rostered_student(institutional_teacher_user):
    """A student user distinct from the teacher fixture, for roster-membership tests."""
    import secrets as _secrets
    from datetime import datetime as _dt
    doc = {
        "username": f"student-{_secrets.token_hex(4)}@test.lincoln.edu",
        "user_id": _secrets.token_urlsafe(12),
        "account_type": "institutional",
        "role": "student",
        "org_id": "test-org",
        "confirmed": "true",
        "created_at": _dt.now(timezone.utc),
    }
    await motor_db.login.insert_one(doc)
    yield doc
    await motor_db.login.delete_one({"username": doc["username"]})


async def test_unknown_slug_404(as_user, institutional_teacher_user):
    resp = await as_user(institutional_teacher_user).get("/links/c/does-not-exist")
    assert resp.status_code == 404


async def test_rostered_student_on_time_logs_attendance(as_user, rostered_student):
    class_id = await _make_class([rostered_student["user_id"]])
    slug = await _make_link(class_id=class_id, class_name="Algebra II")

    resp = await as_user(rostered_student).get(f"/links/c/{slug}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["logged"] is True
    assert body["url"] == "https://zoom.us/j/1234567890"

    row = await motor_db.attendance.find_one({"class_id": class_id, "student_email": rostered_student["username"]})
    assert row is not None
    assert row["source"] == "linkjoin_click"
    assert row["record_date"] == FIXED_SESSION_START.strftime("%Y-%m-%d")


async def test_same_day_rehit_is_idempotent(as_user, rostered_student):
    class_id = await _make_class([rostered_student["user_id"]])
    slug = await _make_link(class_id=class_id, class_name="Algebra II")

    first = await as_user(rostered_student).get(f"/links/c/{slug}")
    second = await as_user(rostered_student).get(f"/links/c/{slug}")
    assert first.status_code == 200 and second.status_code == 200
    assert first.json()["logged"] is True
    assert second.json()["logged"] is True

    count = await motor_db.attendance.count_documents(
        {"class_id": class_id, "student_email": rostered_student["username"]}
    )
    assert count == 1


async def test_non_rostered_student_gets_403(as_user, rostered_student):
    """A student not on this class's roster is not entitled to its meeting URL."""
    class_id = await _make_class([])  # rostered_student is NOT in student_ids
    slug = await _make_link(class_id=class_id, class_name="Algebra II")

    resp = await as_user(rostered_student).get(f"/links/c/{slug}")
    assert resp.status_code == 403

    row = await motor_db.attendance.find_one({"class_id": class_id, "student_email": rostered_student["username"]})
    assert row is None

    audit = await motor_db.audit_logs.find_one({
        "user": rostered_student["username"],
        "action": "attendance.roster_miss",
        "resource_id": class_id,
    })
    assert audit is not None


async def test_owning_teacher_gets_url_no_attendance_side_effect(as_user, institutional_teacher_user):
    class_id = await _make_class([], teacher_id=institutional_teacher_user["user_id"])
    slug = await _make_link(class_id=class_id, class_name="Algebra II")

    resp = await as_user(institutional_teacher_user).get(f"/links/c/{slug}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["logged"] is False
    assert body["url"] == "https://zoom.us/j/1234567890"

    row = await motor_db.attendance.find_one({"class_id": class_id})
    assert row is None


async def test_other_teacher_gets_403(as_user, institutional_teacher_user):
    """A teacher who doesn't own this class has no standing exception."""
    class_id = await _make_class([], teacher_id="some-other-teacher-id")
    slug = await _make_link(class_id=class_id, class_name="Algebra II")

    resp = await as_user(institutional_teacher_user).get(f"/links/c/{slug}")
    assert resp.status_code == 403


async def test_org_admin_gets_url(as_user, institutional_admin_user):
    class_id = await _make_class([])  # org_id="test-org", matches institutional_admin_user
    slug = await _make_link(class_id=class_id, class_name="Algebra II")

    resp = await as_user(institutional_admin_user).get(f"/links/c/{slug}")
    assert resp.status_code == 200
    assert resp.json()["url"] == "https://zoom.us/j/1234567890"


async def test_other_org_admin_gets_403(as_user):
    import secrets as _secrets
    from datetime import datetime as _dt
    other_admin = {
        "username": f"admin-{_secrets.token_hex(4)}@other.example.edu",
        "user_id": _secrets.token_urlsafe(12),
        "account_type": "institutional",
        "role": "school_admin",
        "org_id": "other-org",
        "confirmed": "true",
        "created_at": _dt.now(timezone.utc),
    }
    await motor_db.login.insert_one(other_admin)
    try:
        class_id = await _make_class([])  # org_id="test-org"
        slug = await _make_link(class_id=class_id, class_name="Algebra II")

        resp = await as_user(other_admin).get(f"/links/c/{slug}")
        assert resp.status_code == 403
    finally:
        await motor_db.login.delete_one({"username": other_admin["username"]})


async def test_personal_link_straight_through(as_user, institutional_teacher_user):
    slug = await _make_link(class_id=None)
    resp = await as_user(institutional_teacher_user).get(f"/links/c/{slug}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["url"] == "https://zoom.us/j/1234567890"
    assert body["logged"] is False
