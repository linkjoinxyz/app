"""_assert_access previously only granted a teacher access to an intervention
case if they owned the class — an assignee who doesn't own the class (the
entire point of the assignment workflow) got 403 on GET/PATCH/notes.
"""
import secrets
from datetime import datetime, timezone

import pytest

from app.database import motor_db


async def _insert_class(teacher_id: str, org_id: str = "test-org") -> dict:
    doc = {
        "class_id": secrets.token_urlsafe(10),
        "org_id": org_id,
        "teacher_id": teacher_id,
        "name": "Algebra II",
        "days": ["Mon", "Wed", "Fri"],
        "time": "09:00",
        "student_ids": [],
    }
    await motor_db.classes.insert_one(dict(doc))
    return doc


async def _insert_intervention(cls: dict, assigned_to: str | None = None, status: str = "open") -> dict:
    doc = {
        "intervention_id": secrets.token_urlsafe(16),
        "org_id": cls["org_id"],
        "class_id": cls["class_id"],
        "class_name": cls["name"],
        "student_email": "student@test.lincoln.edu",
        "student_name": "Emma Rodriguez",
        "student_user_id": secrets.token_urlsafe(12),
        "flag_type": "low_attendance",
        "status": status,
        "assigned_to": assigned_to,
        "assignee_notified": None,
        "notes": [],
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    await motor_db.interventions.insert_one(dict(doc))
    return doc


@pytest.fixture
async def teacher_b():
    doc = {
        "username": f"teacher-b-{secrets.token_hex(4)}@test.lincoln.edu",
        "user_id": secrets.token_urlsafe(12),
        "account_type": "institutional",
        "role": "teacher",
        "org_id": "test-org",
        "confirmed": "true",
        "created_at": datetime.now(timezone.utc),
    }
    await motor_db.login.insert_one(doc)
    yield doc
    await motor_db.login.delete_one({"username": doc["username"]})


@pytest.fixture
async def teacher_c():
    doc = {
        "username": f"teacher-c-{secrets.token_hex(4)}@test.lincoln.edu",
        "user_id": secrets.token_urlsafe(12),
        "account_type": "institutional",
        "role": "teacher",
        "org_id": "test-org",
        "confirmed": "true",
        "created_at": datetime.now(timezone.utc),
    }
    await motor_db.login.insert_one(doc)
    yield doc
    await motor_db.login.delete_one({"username": doc["username"]})


@pytest.fixture
async def assigned_case(institutional_teacher_user, teacher_b):
    """institutional_teacher_user (A) owns the class; teacher_b (B) is assigned."""
    cls = await _insert_class(institutional_teacher_user["user_id"])
    iv = await _insert_intervention(cls, assigned_to=teacher_b["username"])
    yield iv
    await motor_db.interventions.delete_one({"intervention_id": iv["intervention_id"]})
    await motor_db.classes.delete_one({"class_id": cls["class_id"]})


async def test_assignee_can_read_case_they_dont_own(as_user, teacher_b, assigned_case):
    resp = await as_user(teacher_b).get(f"/interventions/{assigned_case['intervention_id']}")
    assert resp.status_code == 200


async def test_assignee_can_update_case_they_dont_own(as_user, teacher_b, assigned_case):
    resp = await as_user(teacher_b).patch(
        f"/interventions/{assigned_case['intervention_id']}", json={"status": "in_progress"}
    )
    assert resp.status_code == 200


async def test_assignee_can_add_note_to_case_they_dont_own(as_user, teacher_b, assigned_case):
    resp = await as_user(teacher_b).post(
        f"/interventions/{assigned_case['intervention_id']}/notes", json={"text": "Called home."}
    )
    assert resp.status_code == 201


async def test_uninvolved_teacher_still_403s(as_user, teacher_c, assigned_case):
    resp = await as_user(teacher_c).get(f"/interventions/{assigned_case['intervention_id']}")
    assert resp.status_code == 403


async def test_assignee_retains_access_after_case_resolved(as_user, teacher_b, assigned_case):
    await motor_db.interventions.update_one(
        {"intervention_id": assigned_case["intervention_id"]}, {"$set": {"status": "resolved"}}
    )
    resp = await as_user(teacher_b).get(f"/interventions/{assigned_case['intervention_id']}")
    assert resp.status_code == 200
