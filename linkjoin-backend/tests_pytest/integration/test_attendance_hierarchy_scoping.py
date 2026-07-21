"""Segment 7.1: attendance.py repeats the same school_admin/district_admin
org-scope guard at 6 call sites. GET /attendance/class/{class_id} is used
here as representative coverage — all 6 sites share the identical pattern
(cls["org_id"] not in await get_accessible_org_ids(user)), so this is not
duplicated across all 6.
"""
import secrets
from datetime import datetime, timezone

import pytest

from app.database import motor_db


async def _insert_org(org_type: str, parent_org_id: str | None = None) -> dict:
    doc = {
        "org_id": secrets.token_urlsafe(12),
        "name": f"Test {org_type} {secrets.token_hex(3)}",
        "type": org_type,
        "parent_org_id": parent_org_id,
        "created_at": datetime.now(timezone.utc),
    }
    await motor_db.orgs.insert_one(dict(doc))
    return doc


async def _insert_class(org_id: str) -> dict:
    doc = {
        "class_id": secrets.token_urlsafe(10),
        "org_id": org_id,
        "teacher_id": "someone",
        "name": "Physics",
        "days": ["Mon"],
        "time": "09:00",
        "student_ids": [],
    }
    await motor_db.classes.insert_one(dict(doc))
    return doc


@pytest.fixture
async def district_org():
    doc = await _insert_org("district")
    yield doc
    await motor_db.orgs.delete_one({"org_id": doc["org_id"]})


@pytest.fixture
async def child_school_class(district_org):
    school = await _insert_org("school", parent_org_id=district_org["org_id"])
    cls = await _insert_class(school["org_id"])
    yield cls
    await motor_db.classes.delete_one({"class_id": cls["class_id"]})
    await motor_db.orgs.delete_one({"org_id": school["org_id"]})


@pytest.fixture
async def unrelated_school_class():
    school = await _insert_org("school")
    cls = await _insert_class(school["org_id"])
    yield cls
    await motor_db.classes.delete_one({"class_id": cls["class_id"]})
    await motor_db.orgs.delete_one({"org_id": school["org_id"]})


@pytest.fixture
async def district_admin_user(district_org):
    doc = {
        "username": f"district-admin-{secrets.token_hex(4)}@test.lincoln.edu",
        "user_id": secrets.token_urlsafe(12),
        "account_type": "institutional",
        "role": "district_admin",
        "org_id": district_org["org_id"],
        "confirmed": "true",
        "created_at": datetime.now(timezone.utc),
    }
    await motor_db.login.insert_one(dict(doc))
    yield doc
    await motor_db.login.delete_one({"username": doc["username"]})


async def test_district_admin_reads_child_school_attendance(as_user, district_admin_user, child_school_class):
    resp = await as_user(district_admin_user).get(f"/attendance/class/{child_school_class['class_id']}")
    assert resp.status_code == 200


async def test_district_admin_cannot_read_unrelated_school_attendance(as_user, district_admin_user, unrelated_school_class):
    resp = await as_user(district_admin_user).get(f"/attendance/class/{unrelated_school_class['class_id']}")
    assert resp.status_code == 403
