"""/auth/set-password changed an account password with no proof of knowledge of
the existing one, so a stolen access token was enough to take the account over
outright. It also skipped password_changed_at, so the change did not evict any
other session -- including the intruder's.

The must_change_password flow (AdminOnboarding) must keep working without a
current password, since the temp password was already proven at login.
"""
import secrets
from datetime import datetime, timezone

import pytest
from argon2 import PasswordHasher

from app.database import motor_db

_hasher = PasswordHasher()
_CURRENT = "correct-horse-battery"


async def _insert(**overrides) -> dict:
    doc = {
        "username": f"setpw-{secrets.token_hex(4)}@test.linkjoin.xyz",
        "user_id": secrets.token_urlsafe(12),
        "account_type": "personal",
        "confirmed": "true",
        "created_at": datetime.now(timezone.utc),
        **overrides,
    }
    await motor_db.login.insert_one(dict(doc))
    return doc


@pytest.fixture
async def user_with_password():
    doc = await _insert(password=_hasher.hash(_CURRENT))
    yield doc
    await motor_db.login.delete_one({"username": doc["username"]})


@pytest.fixture
async def user_must_change_password():
    doc = await _insert(password=_hasher.hash(_CURRENT), must_change_password=True)
    yield doc
    await motor_db.login.delete_one({"username": doc["username"]})


@pytest.fixture
async def user_without_password():
    """Google-only account: there is no current password to prove."""
    doc = await _insert()
    yield doc
    await motor_db.login.delete_one({"username": doc["username"]})


async def test_cannot_change_password_without_current_password(as_user, user_with_password):
    resp = await as_user(user_with_password).post(
        "/auth/set-password", json={"new_password": "brand-new-pw-1", "confirm_password": "brand-new-pw-1"}
    )
    assert resp.status_code == 422

    # And the stored hash is untouched.
    after = await motor_db.login.find_one({"username": user_with_password["username"]}, {"password": 1})
    _hasher.verify(after["password"], _CURRENT)


async def test_cannot_change_password_with_wrong_current_password(as_user, user_with_password):
    resp = await as_user(user_with_password).post(
        "/auth/set-password",
        json={
            "current_password": "not-the-password",
            "new_password": "brand-new-pw-1",
            "confirm_password": "brand-new-pw-1",
        },
    )
    assert resp.status_code == 401

    after = await motor_db.login.find_one({"username": user_with_password["username"]}, {"password": 1})
    _hasher.verify(after["password"], _CURRENT)


async def test_correct_current_password_changes_it_and_stamps_epoch(as_user, user_with_password):
    resp = await as_user(user_with_password).post(
        "/auth/set-password",
        json={
            "current_password": _CURRENT,
            "new_password": "brand-new-pw-1",
            "confirm_password": "brand-new-pw-1",
        },
    )
    assert resp.status_code == 200
    # A replacement credential is returned, because the epoch just revoked the caller's.
    assert resp.json().get("access_token")

    after = await motor_db.login.find_one(
        {"username": user_with_password["username"]}, {"password": 1, "password_changed_at": 1}
    )
    _hasher.verify(after["password"], "brand-new-pw-1")
    assert isinstance(after.get("password_changed_at"), datetime)


async def test_must_change_password_flow_needs_no_current_password(as_user, user_must_change_password):
    """AdminOnboarding's forced rotation: the temp password was proven at login."""
    resp = await as_user(user_must_change_password).post(
        "/auth/set-password", json={"new_password": "brand-new-pw-1", "confirm_password": "brand-new-pw-1"}
    )
    assert resp.status_code == 200

    after = await motor_db.login.find_one(
        {"username": user_must_change_password["username"]},
        {"password": 1, "must_change_password": 1},
    )
    _hasher.verify(after["password"], "brand-new-pw-1")
    assert "must_change_password" not in after


async def test_account_without_a_password_can_set_one(as_user, user_without_password):
    resp = await as_user(user_without_password).post(
        "/auth/set-password", json={"new_password": "brand-new-pw-1", "confirm_password": "brand-new-pw-1"}
    )
    assert resp.status_code == 200

    after = await motor_db.login.find_one({"username": user_without_password["username"]}, {"password": 1})
    _hasher.verify(after["password"], "brand-new-pw-1")
