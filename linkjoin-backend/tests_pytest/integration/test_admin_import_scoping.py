"""admin.py's /import-staff and /import-parents are callable by a school_admin
for their own org, but both resolved target accounts by email across the ENTIRE
login collection with no org scoping.

/import-parents was the worse of the two: parent_links is the sole authorization
check the parent portal performs (routers/parent.py:_parent_student_ids does no
org check), so a school admin could link a parent account they control to any
student on the platform and then read that student's roster and attendance.

/import-staff rewrote role/org_id/account_type on any existing account keyed only
on an attacker-supplied email, pulling arbitrary users into the caller's org.

Regression coverage: both sides of every write must be inside the caller's own
org hierarchy, and the legitimate same-org flows must keep working.
"""
import secrets
from datetime import datetime, timezone

import pytest

from app.database import motor_db


@pytest.fixture(autouse=True)
def _no_email(monkeypatch):
    # admin.py does `from app.email_service import send_email` at module import,
    # so the name has to be patched in the router's namespace, not the source
    # module's (same reasoning as test_interventions_assignment.py).
    monkeypatch.setattr("app.routers.admin.send_email", lambda *a, **k: None)


async def _insert_org() -> dict:
    doc = {
        "org_id": secrets.token_urlsafe(12),
        "name": f"Test school {secrets.token_hex(3)}",
        "type": "school",
        "parent_org_id": None,
        "created_at": datetime.now(timezone.utc),
    }
    await motor_db.orgs.insert_one(dict(doc))
    return doc


async def _insert_user(org_id: str | None, role: str) -> dict:
    doc = {
        "username": f"{role}-{secrets.token_hex(4)}@test.import.edu",
        "user_id": secrets.token_urlsafe(12),
        "account_type": "institutional",
        "role": role,
        "org_id": org_id,
        "confirmed": "true",
        "created_at": datetime.now(timezone.utc),
    }
    await motor_db.login.insert_one(dict(doc))
    return doc


@pytest.fixture
async def caller_org():
    doc = await _insert_org()
    yield doc
    await motor_db.orgs.delete_one({"org_id": doc["org_id"]})


@pytest.fixture
async def unrelated_org():
    doc = await _insert_org()
    yield doc
    await motor_db.orgs.delete_one({"org_id": doc["org_id"]})


@pytest.fixture
async def caller_admin(caller_org):
    doc = await _insert_user(caller_org["org_id"], "school_admin")
    yield doc
    await motor_db.login.delete_one({"username": doc["username"]})


@pytest.fixture
async def victim_student(unrelated_org):
    doc = await _insert_user(unrelated_org["org_id"], "student")
    yield doc
    await motor_db.login.delete_one({"username": doc["username"]})


@pytest.fixture
async def own_student(caller_org):
    doc = await _insert_user(caller_org["org_id"], "student")
    yield doc
    await motor_db.login.delete_one({"username": doc["username"]})


@pytest.fixture
async def created_parents():
    """Collects parent emails created by a test so they can be swept afterwards."""
    emails: list[str] = []
    yield emails
    for email in emails:
        doc = await motor_db.login.find_one({"username": email}, {"user_id": 1})
        if doc:
            await motor_db.parent_links.delete_many({"parent_user_id": doc["user_id"]})
        await motor_db.login.delete_one({"username": email})


# ── /import-parents ──────────────────────────────────────────────────────────

async def test_cannot_link_parent_to_student_in_unrelated_org(
    as_user, caller_admin, caller_org, victim_student, created_parents
):
    parent_email = f"attacker-{secrets.token_hex(4)}@evil.test"
    created_parents.append(parent_email)

    resp = await as_user(caller_admin).post(
        f"/admin/orgs/{caller_org['org_id']}/import-parents",
        json={"rows": [{"parent_email": parent_email, "student_email": victim_student["username"]}]},
    )

    assert resp.status_code == 200
    assert resp.json()["results"][0]["status"] == "error"

    # The critical assertion: no parent_links row bridging into the other org.
    parent_doc = await motor_db.login.find_one({"username": parent_email}, {"user_id": 1})
    if parent_doc:
        link = await motor_db.parent_links.find_one({
            "parent_user_id": parent_doc["user_id"],
            "student_user_id": victim_student["user_id"],
        })
        assert link is None


async def test_cross_org_student_is_indistinguishable_from_missing(
    as_user, caller_admin, caller_org, victim_student, created_parents
):
    """The refusal must not confirm that the address exists on the platform."""
    parent_email = f"attacker-{secrets.token_hex(4)}@evil.test"
    created_parents.append(parent_email)
    missing_email = f"nobody-{secrets.token_hex(4)}@evil.test"

    resp = await as_user(caller_admin).post(
        f"/admin/orgs/{caller_org['org_id']}/import-parents",
        json={"rows": [
            {"parent_email": parent_email, "student_email": victim_student["username"]},
            {"parent_email": parent_email, "student_email": missing_email},
        ]},
    )

    results = resp.json()["results"]
    assert results[0]["error"] == results[1]["error"]


async def test_can_link_parent_to_student_in_own_org(
    as_user, caller_admin, caller_org, own_student, created_parents
):
    parent_email = f"parent-{secrets.token_hex(4)}@test.import.edu"
    created_parents.append(parent_email)

    resp = await as_user(caller_admin).post(
        f"/admin/orgs/{caller_org['org_id']}/import-parents",
        json={"rows": [{"parent_email": parent_email, "student_email": own_student["username"]}]},
    )

    assert resp.status_code == 200
    assert resp.json()["results"][0]["status"] == "created"

    parent_doc = await motor_db.login.find_one({"username": parent_email}, {"user_id": 1})
    assert parent_doc is not None
    link = await motor_db.parent_links.find_one({
        "parent_user_id": parent_doc["user_id"],
        "student_user_id": own_student["user_id"],
    })
    assert link is not None


# ── /import-staff ────────────────────────────────────────────────────────────

async def test_cannot_reassign_account_from_unrelated_org(
    as_user, caller_admin, caller_org, unrelated_org
):
    victim = await _insert_user(unrelated_org["org_id"], "district_admin")
    try:
        resp = await as_user(caller_admin).post(
            f"/admin/orgs/{caller_org['org_id']}/import-staff",
            json={"rows": [{"email": victim["username"], "role": "teacher"}]},
        )

        assert resp.status_code == 200
        assert resp.json()["results"][0]["status"] == "error"

        after = await motor_db.login.find_one(
            {"username": victim["username"]}, {"org_id": 1, "role": 1, "_id": 0}
        )
        assert after["org_id"] == unrelated_org["org_id"]
        assert after["role"] == "district_admin"
    finally:
        await motor_db.login.delete_one({"username": victim["username"]})


async def test_can_update_existing_account_in_own_org(as_user, caller_admin, caller_org):
    colleague = await _insert_user(caller_org["org_id"], "teacher")
    try:
        resp = await as_user(caller_admin).post(
            f"/admin/orgs/{caller_org['org_id']}/import-staff",
            json={"rows": [{"email": colleague["username"], "role": "school_admin"}]},
        )

        assert resp.status_code == 200
        assert resp.json()["results"][0]["status"] == "updated"

        after = await motor_db.login.find_one({"username": colleague["username"]}, {"role": 1, "_id": 0})
        assert after["role"] == "school_admin"
    finally:
        await motor_db.login.delete_one({"username": colleague["username"]})


async def test_can_still_create_brand_new_staff_account(as_user, caller_admin, caller_org):
    email = f"new-teacher-{secrets.token_hex(4)}@test.import.edu"
    try:
        resp = await as_user(caller_admin).post(
            f"/admin/orgs/{caller_org['org_id']}/import-staff",
            json={"rows": [{"email": email, "role": "teacher"}]},
        )

        assert resp.status_code == 200
        assert resp.json()["results"][0]["status"] == "created"

        created = await motor_db.login.find_one({"username": email}, {"org_id": 1, "_id": 0})
        assert created["org_id"] == caller_org["org_id"]
    finally:
        await motor_db.login.delete_one({"username": email})


async def test_import_staff_race_is_reported_per_row_not_fatal(as_user, caller_admin, caller_org, monkeypatch):
    """With the unique username index, a concurrent create landing between a row's
    find_one and its insert raises DuplicateKeyError. The batch must flag that row
    as a retryable error and keep going — one raced row cannot abort the import."""
    from pymongo.errors import DuplicateKeyError
    from motor.motor_asyncio import AsyncIOMotorCollection

    raced = f"raced-{secrets.token_hex(4)}@test.import.edu"
    ok = f"ok-{secrets.token_hex(4)}@test.import.edu"
    orig_insert = AsyncIOMotorCollection.insert_one

    async def racing_insert(self, doc, *a, **k):
        if self.name == "login" and doc.get("username") == raced:
            raise DuplicateKeyError("E11000 duplicate key: username")
        return await orig_insert(self, doc, *a, **k)

    monkeypatch.setattr(AsyncIOMotorCollection, "insert_one", racing_insert)
    try:
        resp = await as_user(caller_admin).post(
            f"/admin/orgs/{caller_org['org_id']}/import-staff",
            json={"rows": [
                {"email": raced, "role": "teacher"},
                {"email": ok, "role": "teacher"},
            ]},
        )
        assert resp.status_code == 200, resp.text
        results = {r["email"]: r for r in resp.json()["results"]}
        assert results[raced]["status"] == "error"
        assert "retry" in results[raced]["error"].lower()
        assert results[ok]["status"] == "created"  # the batch kept going past the race
    finally:
        monkeypatch.undo()
        await motor_db.login.delete_many({"username": {"$in": [raced, ok]}})
