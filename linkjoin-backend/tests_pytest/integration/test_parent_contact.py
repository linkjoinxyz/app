"""PATCH /users/parent-contact — a student self-edit used to let a student
silently overwrite their own parent_phone/parent_email, redirecting their own
truancy alerts (scheduler.check_absences reads exactly those fields) with no
audit trail and no notice to whoever was contacted before.
"""
import secrets
from datetime import datetime, timezone

import pytest

from app.database import motor_db


@pytest.fixture(autouse=True)
def _no_smtp(monkeypatch):
    """No SMTP mock in conftest; the notice email is sent from a background task."""
    sent = []
    monkeypatch.setattr("app.email_service.send_email", lambda *a, **k: sent.append((a, k)))
    return sent


@pytest.fixture(autouse=True)
async def _cleanup_audit():
    yield
    await motor_db.audit_logs.delete_many({"action": "user.parent_contact_self_edit"})


@pytest.fixture
async def institutional_student_user():
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


async def test_self_edit_first_time_no_notification(as_user, institutional_student_user, _no_smtp):
    resp = await as_user(institutional_student_user).patch(
        "/users/parent-contact",
        json={"parent_email": "mom@example.com", "parent_phone": "5551234567"},
    )
    assert resp.status_code == 200
    assert _no_smtp == []  # nothing to notify, no prior value on the account

    row = await motor_db.login.find_one({"username": institutional_student_user["username"]})
    assert row["parent_email"] == "mom@example.com"

    audit = await motor_db.audit_logs.find_one({
        "user": institutional_student_user["username"],
        "action": "user.parent_contact_self_edit",
    })
    assert audit is not None


async def test_self_edit_changing_existing_email_notifies_old_address(as_user, institutional_student_user, _no_smtp):
    await motor_db.login.update_one(
        {"username": institutional_student_user["username"]},
        {"$set": {"parent_email": "realparent@example.com"}},
    )
    institutional_student_user["parent_email"] = "realparent@example.com"

    resp = await as_user(institutional_student_user).patch(
        "/users/parent-contact",
        json={"parent_email": "burner@attacker.example", "parent_phone": "5551234567"},
    )
    assert resp.status_code == 200

    assert len(_no_smtp) == 1
    args, _kwargs = _no_smtp[0]
    # send_email(html_content, subject, to, ...) — the OLD address gets notified, not the new one
    assert args[2] == "realparent@example.com"

    row = await motor_db.login.find_one({"username": institutional_student_user["username"]})
    assert row["parent_email"] == "burner@attacker.example"

    audit = await motor_db.audit_logs.find_one({
        "user": institutional_student_user["username"],
        "action": "user.parent_contact_self_edit",
    })
    assert audit is not None


async def test_self_edit_resubmitting_same_email_does_not_notify(as_user, institutional_student_user, _no_smtp):
    await motor_db.login.update_one(
        {"username": institutional_student_user["username"]},
        {"$set": {"parent_email": "realparent@example.com"}},
    )

    resp = await as_user(institutional_student_user).patch(
        "/users/parent-contact",
        json={"parent_email": "realparent@example.com", "parent_phone": "5551234567"},
    )
    assert resp.status_code == 200
    assert _no_smtp == []


async def test_admin_edit_outside_org_still_403(as_user, institutional_admin_user):
    other_org_student = {
        "username": f"student-{secrets.token_hex(4)}@other.example.edu",
        "user_id": secrets.token_urlsafe(12),
        "account_type": "institutional",
        "role": "student",
        "org_id": "other-org",
        "confirmed": "true",
        "created_at": datetime.now(timezone.utc),
    }
    await motor_db.login.insert_one(other_org_student)
    try:
        resp = await as_user(institutional_admin_user).patch(
            "/users/parent-contact",
            json={"parent_email": "x@example.com", "student_user_id": other_org_student["user_id"]},
        )
        assert resp.status_code == 403
    finally:
        await motor_db.login.delete_one({"username": other_org_student["username"]})


async def test_admin_edit_own_org_succeeds(as_user, institutional_admin_user, institutional_student_user):
    resp = await as_user(institutional_admin_user).patch(
        "/users/parent-contact",
        json={"parent_email": "verified@example.com", "student_user_id": institutional_student_user["user_id"]},
    )
    assert resp.status_code == 200
    row = await motor_db.login.find_one({"username": institutional_student_user["username"]})
    assert row["parent_email"] == "verified@example.com"
