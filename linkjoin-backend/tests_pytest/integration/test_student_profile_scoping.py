"""GET /users/student/{user_id} correctly restricted *which* students a
teacher could open, but not what data came back: enrolled_classes,
recent_attendance, and interventions were all queried by student_email/user_id
alone, with no class_id scoping — so a teacher opening a shared student's
profile saw another teacher's classes, attendance, and case notes. Admins
legitimately need the unscoped cross-class view; only the teacher path
should be scoped.
"""
import secrets
from datetime import datetime, timezone

import pytest

from app.database import motor_db


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
async def shared_student():
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
async def two_classes_one_student(institutional_teacher_user, teacher_b, shared_student):
    """Teacher A owns class_a, teacher B owns class_b; the student is in both."""
    class_a = {
        "class_id": secrets.token_urlsafe(10), "org_id": "test-org",
        "teacher_id": institutional_teacher_user["user_id"], "name": "A's Class",
        "days": ["Mon"], "time": "09:00", "student_ids": [shared_student["user_id"]],
    }
    class_b = {
        "class_id": secrets.token_urlsafe(10), "org_id": "test-org",
        "teacher_id": teacher_b["user_id"], "name": "B's Class",
        "days": ["Tue"], "time": "10:00", "student_ids": [shared_student["user_id"]],
    }
    await motor_db.classes.insert_many([dict(class_a), dict(class_b)])

    await motor_db.attendance.insert_one({
        "student_email": shared_student["username"], "class_id": class_b["class_id"],
        "class_name": class_b["name"], "opened_at": datetime.now(timezone.utc),
        "minutes_late": 0, "excused": False,
    })
    iv = {
        "intervention_id": secrets.token_urlsafe(16), "org_id": "test-org",
        "class_id": class_b["class_id"], "class_name": class_b["name"],
        "student_email": shared_student["username"], "student_name": "Shared Student",
        "student_user_id": shared_student["user_id"], "flag_type": "low_attendance",
        "status": "open", "assigned_to": None, "assignee_notified": None, "notes": [],
        "created_at": datetime.now(timezone.utc), "updated_at": datetime.now(timezone.utc),
    }
    await motor_db.interventions.insert_one(dict(iv))

    yield {"class_a": class_a, "class_b": class_b}

    await motor_db.classes.delete_many({"class_id": {"$in": [class_a["class_id"], class_b["class_id"]]}})
    await motor_db.attendance.delete_many({"class_id": class_b["class_id"]})
    await motor_db.interventions.delete_one({"intervention_id": iv["intervention_id"]})


async def test_teacher_sees_only_own_class_data(
    as_user, institutional_teacher_user, shared_student, two_classes_one_student,
):
    resp = await as_user(institutional_teacher_user).get(f"/users/student/{shared_student['user_id']}")
    assert resp.status_code == 200
    body = resp.json()

    class_ids = {c["class_id"] for c in body["classes"]}
    assert class_ids == {two_classes_one_student["class_a"]["class_id"]}

    assert body["recent_attendance"] == []
    assert body["interventions"] == []


async def test_admin_sees_both_classes_data(
    as_user, institutional_admin_user, shared_student, two_classes_one_student,
):
    resp = await as_user(institutional_admin_user).get(f"/users/student/{shared_student['user_id']}")
    assert resp.status_code == 200
    body = resp.json()

    class_ids = {c["class_id"] for c in body["classes"]}
    assert class_ids == {
        two_classes_one_student["class_a"]["class_id"],
        two_classes_one_student["class_b"]["class_id"],
    }
    assert len(body["recent_attendance"]) == 1
    assert len(body["interventions"]) == 1
