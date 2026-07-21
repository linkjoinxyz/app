"""orgs.py's get_org / get_org_members previously granted ANY district_admin
read access to ANY org on the platform (role == "district_admin" was enough,
with no parent_org_id check at all). Regression coverage for the fix: access
must be limited to the district's own org plus its child schools.
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


async def test_district_admin_reads_child_school_org(as_user, district_admin_user, child_school_org):
    resp = await as_user(district_admin_user).get(f"/orgs/{child_school_org['org_id']}")
    assert resp.status_code == 200


async def test_district_admin_reads_child_school_members(as_user, district_admin_user, child_school_org):
    resp = await as_user(district_admin_user).get(f"/orgs/{child_school_org['org_id']}/members")
    assert resp.status_code == 200


async def test_district_admin_cannot_read_unrelated_org(as_user, district_admin_user, unrelated_school_org):
    resp = await as_user(district_admin_user).get(f"/orgs/{unrelated_school_org['org_id']}")
    assert resp.status_code == 403


async def test_district_admin_cannot_read_unrelated_org_members(as_user, district_admin_user, unrelated_school_org):
    resp = await as_user(district_admin_user).get(f"/orgs/{unrelated_school_org['org_id']}/members")
    assert resp.status_code == 403


async def test_district_admin_cannot_edit_child_school(as_user, district_admin_user, child_school_org):
    resp = await as_user(district_admin_user).patch(
        f"/orgs/{child_school_org['org_id']}", json={"name": "Renamed"}
    )
    assert resp.status_code == 403


async def test_school_admin_unaffected_by_hierarchy_check(as_user, institutional_admin_user, unrelated_school_org):
    """A plain school_admin (org_id == 'test-org') still can't reach an unrelated org."""
    resp = await as_user(institutional_admin_user).get(f"/orgs/{unrelated_school_org['org_id']}")
    assert resp.status_code == 403


async def test_district_admin_lists_own_children(as_user, district_admin_user, district_org, child_school_org):
    resp = await as_user(district_admin_user).get(f"/orgs/{district_org['org_id']}/children")
    assert resp.status_code == 200
    org_ids = {c["org_id"] for c in resp.json()}
    assert org_ids == {child_school_org["org_id"]}


async def test_district_admin_cannot_list_unrelated_org_children(as_user, district_admin_user, unrelated_school_org):
    resp = await as_user(district_admin_user).get(f"/orgs/{unrelated_school_org['org_id']}/children")
    assert resp.status_code == 403
