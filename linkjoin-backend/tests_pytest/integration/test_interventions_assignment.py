"""PATCH /interventions/{id} assigned_to — previously accepted any string and
emailed a student's name/class/flag type (PII on a minor) to it with no
validation that the target was even a LinkJoin user, let alone staff in the
same org. Also covers the audit trail added alongside this fix (5.7).
"""
import secrets
from datetime import datetime, timezone

import pytest

from app.database import motor_db


@pytest.fixture(autouse=True)
def _no_smtp(monkeypatch):
    # interventions.py does `from app.email_service import send_email` at
    # module level, so the patch target must be the name bound in that
    # module's namespace, not app.email_service.send_email itself.
    sent = []
    monkeypatch.setattr("app.routers.interventions.send_email", lambda *a, **k: sent.append((a, k)))
    return sent


@pytest.fixture(autouse=True)
async def _cleanup_audit():
    yield
    await motor_db.audit_logs.delete_many({"action": {"$in": [
        "intervention.create", "intervention.update", "intervention.note_add", "intervention.note_delete",
    ]}})


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


async def _insert_intervention(cls: dict) -> dict:
    doc = {
        "intervention_id": secrets.token_urlsafe(16),
        "org_id": cls["org_id"],
        "class_id": cls["class_id"],
        "class_name": cls["name"],
        "student_email": "student@test.lincoln.edu",
        "student_name": "Emma Rodriguez",
        "student_user_id": secrets.token_urlsafe(12),
        "flag_type": "low_attendance",
        "status": "open",
        "assigned_to": None,
        "assignee_notified": None,
        "notes": [],
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    await motor_db.interventions.insert_one(dict(doc))
    return doc


@pytest.fixture
async def other_org_teacher():
    doc = {
        "username": f"teacher-{secrets.token_hex(4)}@other.example.edu",
        "user_id": secrets.token_urlsafe(12),
        "account_type": "institutional",
        "role": "teacher",
        "org_id": "other-org",
        "confirmed": "true",
        "created_at": datetime.now(timezone.utc),
    }
    await motor_db.login.insert_one(doc)
    yield doc
    await motor_db.login.delete_one({"username": doc["username"]})


@pytest.fixture
async def same_org_teacher():
    doc = {
        "username": f"teacher-{secrets.token_hex(4)}@test.lincoln.edu",
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
async def same_org_student():
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
async def owned_intervention(institutional_teacher_user):
    cls = await _insert_class(institutional_teacher_user["user_id"])
    iv = await _insert_intervention(cls)
    yield iv
    await motor_db.interventions.delete_one({"intervention_id": iv["intervention_id"]})
    await motor_db.classes.delete_one({"class_id": cls["class_id"]})


async def test_assigned_to_nonexistent_user_rejected(as_user, institutional_teacher_user, owned_intervention, _no_smtp):
    resp = await as_user(institutional_teacher_user).patch(
        f"/interventions/{owned_intervention['intervention_id']}",
        json={"assigned_to": "nobody@nowhere.example"},
    )
    assert resp.status_code == 422
    assert _no_smtp == []
    doc = await motor_db.interventions.find_one({"intervention_id": owned_intervention["intervention_id"]})
    assert doc["assigned_to"] is None


async def test_assigned_to_non_staff_rejected(as_user, institutional_teacher_user, owned_intervention, same_org_student, _no_smtp):
    resp = await as_user(institutional_teacher_user).patch(
        f"/interventions/{owned_intervention['intervention_id']}",
        json={"assigned_to": same_org_student["username"]},
    )
    assert resp.status_code == 422
    assert _no_smtp == []


async def test_assigned_to_other_org_teacher_rejected(as_user, institutional_teacher_user, owned_intervention, other_org_teacher, _no_smtp):
    resp = await as_user(institutional_teacher_user).patch(
        f"/interventions/{owned_intervention['intervention_id']}",
        json={"assigned_to": other_org_teacher["username"]},
    )
    assert resp.status_code == 422
    assert _no_smtp == []


async def test_assigned_to_same_org_teacher_succeeds(as_user, institutional_teacher_user, owned_intervention, same_org_teacher, _no_smtp):
    resp = await as_user(institutional_teacher_user).patch(
        f"/interventions/{owned_intervention['intervention_id']}",
        json={"assigned_to": same_org_teacher["username"]},
    )
    assert resp.status_code == 200
    doc = await motor_db.interventions.find_one({"intervention_id": owned_intervention["intervention_id"]})
    assert doc["assigned_to"] == same_org_teacher["username"]

    assert len(_no_smtp) == 1
    args, _kwargs = _no_smtp[0]
    # send_email(html_content, subject, to)
    assert args[2] == same_org_teacher["username"]

    audit = await motor_db.audit_logs.find_one({
        "user": institutional_teacher_user["username"],
        "action": "intervention.update",
        "detail.intervention_id": owned_intervention["intervention_id"],
    })
    assert audit is not None
    assert audit["detail"]["assigned_to"] == same_org_teacher["username"]
