"""GET /users/parent-contact/{student_user_id} was admin-only, but the teacher
class page requests it for every student on the roster, so it 403'd on every row
and a teacher could not see the contact details for a parent they needed to call
about an absence.

Teachers are scoped to students in their own classes; admins to their org
hierarchy. Same split get_student_profile already applies.
"""
import secrets
from datetime import datetime, timezone

import pytest

from app.database import motor_db

_ORG = "test-org"  # conftest's institutional_teacher_user / institutional_admin_user org


async def _student(org_id=_ORG):
    doc = {
        "username": f"pc-student-{secrets.token_hex(4)}@test.linkjoin.xyz",
        "user_id": secrets.token_urlsafe(12),
        "account_type": "institutional", "role": "student", "org_id": org_id,
        "confirmed": "true", "created_at": datetime.now(timezone.utc),
        "parent_name": "Dana Guardian", "parent_email": "guardian@test.linkjoin.xyz",
        "parent_phone": "5551234567", "parent_phone_country": "1",
    }
    await motor_db.login.insert_one(dict(doc))
    return doc


@pytest.fixture
async def my_student(institutional_teacher_user):
    """A student on the requesting teacher's own roster."""
    s = await _student()
    cls = {
        "class_id": secrets.token_urlsafe(12), "org_id": _ORG, "name": "PC Class",
        "time": "9:00", "days": ["Mon"], "teacher_id": institutional_teacher_user["user_id"],
        "student_ids": [s["user_id"]], "link_ids": [],
    }
    await motor_db.classes.insert_one(dict(cls))
    yield s
    await motor_db.classes.delete_one({"class_id": cls["class_id"]})
    await motor_db.login.delete_one({"username": s["username"]})


@pytest.fixture
async def other_student():
    """Same org, but not in the requesting teacher's classes."""
    s = await _student()
    yield s
    await motor_db.login.delete_one({"username": s["username"]})


async def test_teacher_can_read_parent_contact_for_own_student(
    as_user, institutional_teacher_user, my_student
):
    resp = await as_user(institutional_teacher_user).get(f"/users/parent-contact/{my_student['user_id']}")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["parent_email"] == "guardian@test.linkjoin.xyz"
    assert body["parent_name"] == "Dana Guardian"


async def test_teacher_cannot_read_a_student_they_do_not_teach(
    as_user, institutional_teacher_user, other_student
):
    """Widening this to teachers must not widen it to the whole org."""
    resp = await as_user(institutional_teacher_user).get(f"/users/parent-contact/{other_student['user_id']}")
    assert resp.status_code == 403


async def test_admin_can_still_read_any_student_in_the_org(
    as_user, institutional_admin_user, other_student
):
    resp = await as_user(institutional_admin_user).get(f"/users/parent-contact/{other_student['user_id']}")
    assert resp.status_code == 200


async def test_student_cannot_read_parent_contact(as_user, my_student):
    resp = await as_user(my_student).get(f"/users/parent-contact/{my_student['user_id']}")
    assert resp.status_code == 403


async def test_cross_org_student_is_denied_to_admin(as_user, institutional_admin_user):
    outsider = await _student(org_id="some-other-org")
    try:
        resp = await as_user(institutional_admin_user).get(f"/users/parent-contact/{outsider['user_id']}")
        assert resp.status_code == 403
    finally:
        await motor_db.login.delete_one({"username": outsider["username"]})
