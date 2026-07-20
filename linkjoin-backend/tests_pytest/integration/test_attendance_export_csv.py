"""GET /attendance/class/{class_id}/export writes excuse_reason/note and a
student's display name into a CSV via csv.writer with no sanitization — a
value starting with =/+/-/@ executes as a formula when the file is opened in
Excel/Sheets. These files go to school admins and SIS import workflows.
"""
import csv as csv_module
import io
import secrets
from datetime import datetime, timezone

import pytest

from app.database import motor_db


@pytest.fixture
async def payload_student():
    doc = {
        "username": f"student-{secrets.token_hex(4)}@test.lincoln.edu",
        "user_id": secrets.token_urlsafe(12),
        "account_type": "institutional",
        "role": "student",
        "org_id": "test-org",
        "confirmed": "true",
        "name": "=1+1",
        "created_at": datetime.now(timezone.utc),
    }
    await motor_db.login.insert_one(doc)
    yield doc
    await motor_db.login.delete_one({"username": doc["username"]})


@pytest.fixture
async def normal_student():
    doc = {
        "username": f"student-{secrets.token_hex(4)}@test.lincoln.edu",
        "user_id": secrets.token_urlsafe(12),
        "account_type": "institutional",
        "role": "student",
        "org_id": "test-org",
        "confirmed": "true",
        "name": "Jamie Lee",
        "created_at": datetime.now(timezone.utc),
    }
    await motor_db.login.insert_one(doc)
    yield doc
    await motor_db.login.delete_one({"username": doc["username"]})


@pytest.fixture
async def export_class(institutional_teacher_user, payload_student, normal_student):
    doc = {
        "class_id": secrets.token_urlsafe(10),
        "org_id": "test-org",
        "teacher_id": institutional_teacher_user["user_id"],
        "name": "Algebra II",
        "days": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        "time": "09:00",
        "student_ids": [payload_student["user_id"], normal_student["user_id"]],
    }
    await motor_db.classes.insert_one(dict(doc))

    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    date_str = today.strftime("%Y-%m-%d")
    await motor_db.attendance.insert_many([
        {
            "student_email": payload_student["username"], "class_id": doc["class_id"],
            "class_name": doc["name"], "opened_at": None, "minutes_late": None,
            "absent": True, "excused": True,
            "excuse_reason": "+cmd|'/c calc'!A1", "record_date": date_str, "recorded_at": today,
        },
        {
            "student_email": normal_student["username"], "class_id": doc["class_id"],
            "class_name": doc["name"], "opened_at": today, "minutes_late": 0,
            "excused": False, "excuse_reason": "", "record_date": date_str,
        },
    ])

    yield doc
    await motor_db.classes.delete_one({"class_id": doc["class_id"]})
    await motor_db.attendance.delete_many({"class_id": doc["class_id"]})


async def test_formula_injection_payloads_are_quoted(as_user, institutional_teacher_user, export_class):
    resp = await as_user(institutional_teacher_user).get(f"/attendance/class/{export_class['class_id']}/export")
    assert resp.status_code == 200

    rows = list(csv_module.reader(io.StringIO(resp.text)))
    header, *body = rows
    by_name_col = {r[1]: r for r in body}

    assert "'=1+1" in by_name_col
    payload_row = by_name_col["'=1+1"]
    assert payload_row[header.index("excuse_reason")] == "'+cmd|'/c calc'!A1"


async def test_normal_values_are_not_quoted(as_user, institutional_teacher_user, export_class):
    resp = await as_user(institutional_teacher_user).get(f"/attendance/class/{export_class['class_id']}/export")
    assert resp.status_code == 200

    rows = list(csv_module.reader(io.StringIO(resp.text)))
    _header, *body = rows
    names = {r[1] for r in body}
    assert "Jamie Lee" in names
