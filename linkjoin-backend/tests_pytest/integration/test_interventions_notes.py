"""interventions.py had zero log_audit calls despite holding the most
sensitive data in the product (case notes on children). This covers the note
add/delete audit entries added alongside 5.7 (assignment audit is covered in
test_interventions_assignment.py).
"""
import secrets
from datetime import datetime, timezone

import pytest

from app.database import motor_db


@pytest.fixture(autouse=True)
async def _cleanup_audit():
    yield
    await motor_db.audit_logs.delete_many({"action": {"$in": [
        "intervention.note_add", "intervention.note_delete",
    ]}})


@pytest.fixture
async def owned_intervention(institutional_teacher_user):
    cls = {
        "class_id": secrets.token_urlsafe(10), "org_id": "test-org",
        "teacher_id": institutional_teacher_user["user_id"], "name": "Algebra II",
        "days": ["Mon"], "time": "09:00", "student_ids": [],
    }
    await motor_db.classes.insert_one(dict(cls))
    iv = {
        "intervention_id": secrets.token_urlsafe(16), "org_id": "test-org",
        "class_id": cls["class_id"], "class_name": cls["name"],
        "student_email": "student@test.lincoln.edu", "student_name": "Emma Rodriguez",
        "student_user_id": secrets.token_urlsafe(12), "flag_type": "low_attendance",
        "status": "open", "assigned_to": None, "assignee_notified": None, "notes": [],
        "created_at": datetime.now(timezone.utc), "updated_at": datetime.now(timezone.utc),
    }
    await motor_db.interventions.insert_one(dict(iv))
    yield iv
    await motor_db.interventions.delete_one({"intervention_id": iv["intervention_id"]})
    await motor_db.classes.delete_one({"class_id": cls["class_id"]})


async def test_add_note_writes_audit_entry(as_user, institutional_teacher_user, owned_intervention):
    resp = await as_user(institutional_teacher_user).post(
        f"/interventions/{owned_intervention['intervention_id']}/notes",
        json={"text": "Called home, no answer."},
    )
    assert resp.status_code == 201
    note_id = resp.json()["note_id"]

    audit = await motor_db.audit_logs.find_one({
        "user": institutional_teacher_user["username"],
        "action": "intervention.note_add",
        "detail.intervention_id": owned_intervention["intervention_id"],
    })
    assert audit is not None
    assert audit["detail"]["note_id"] == note_id


async def test_delete_note_writes_audit_entry(as_user, institutional_teacher_user, owned_intervention):
    add_resp = await as_user(institutional_teacher_user).post(
        f"/interventions/{owned_intervention['intervention_id']}/notes",
        json={"text": "Follow-up scheduled."},
    )
    note_id = add_resp.json()["note_id"]

    del_resp = await as_user(institutional_teacher_user).delete(
        f"/interventions/{owned_intervention['intervention_id']}/notes/{note_id}"
    )
    assert del_resp.status_code == 204

    audit = await motor_db.audit_logs.find_one({
        "user": institutional_teacher_user["username"],
        "action": "intervention.note_delete",
        "detail.intervention_id": owned_intervention["intervention_id"],
        "detail.note_id": note_id,
    })
    assert audit is not None
