"""Segment 7.1: district_admin previously behaved exactly like a school_admin
scoped to one org — get_authorized_class/list_classes only matched flat
org_id equality, so a district_admin saw none of their district's child
schools. Regression coverage for get_accessible_org_ids being threaded
through classes.py.
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


async def _insert_class(org_id: str, teacher_id: str = "someone") -> dict:
    doc = {
        "class_id": secrets.token_urlsafe(10),
        "org_id": org_id,
        "teacher_id": teacher_id,
        "name": "Chemistry",
        "days": ["Tue", "Thu"],
        "time": "10:00",
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
async def child_school_org(district_org):
    doc = await _insert_org("school", parent_org_id=district_org["org_id"])
    yield doc
    await motor_db.orgs.delete_one({"org_id": doc["org_id"]})


@pytest.fixture
async def unrelated_school_org():
    doc = await _insert_org("school")
    yield doc
    await motor_db.orgs.delete_one({"org_id": doc["org_id"]})


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


@pytest.fixture
async def child_school_class(child_school_org):
    cls = await _insert_class(child_school_org["org_id"])
    yield cls
    await motor_db.classes.delete_one({"class_id": cls["class_id"]})


@pytest.fixture
async def unrelated_school_class(unrelated_school_org):
    cls = await _insert_class(unrelated_school_org["org_id"])
    yield cls
    await motor_db.classes.delete_one({"class_id": cls["class_id"]})


async def test_district_admin_lists_child_school_class(
    as_user, district_admin_user, child_school_class, unrelated_school_class
):
    resp = await as_user(district_admin_user).get("/classes")
    assert resp.status_code == 200
    class_ids = {c["class_id"] for c in resp.json()}
    assert child_school_class["class_id"] in class_ids
    assert unrelated_school_class["class_id"] not in class_ids


async def test_district_admin_reads_child_school_class_directly(
    as_user, district_admin_user, child_school_class
):
    resp = await as_user(district_admin_user).get(f"/classes/{child_school_class['class_id']}")
    assert resp.status_code == 200


async def test_district_admin_cannot_read_unrelated_school_class(
    as_user, district_admin_user, unrelated_school_class
):
    resp = await as_user(district_admin_user).get(f"/classes/{unrelated_school_class['class_id']}")
    assert resp.status_code == 403
