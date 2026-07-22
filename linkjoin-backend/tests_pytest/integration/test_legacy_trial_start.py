"""Pre-launch personal accounts carry no premium_status at all, so is_premium
reads them as expired and every Premium feature 403s. Rather than backfilling
~2400 accounts to a permanent grant, each one starts a 14-day trial on its next
sign-in, so the clock reflects that person's real first exposure to the features.

The existing "Your 14-day free trial has started" modal is driven by
premium_status == 'trial' && !trial_welcome_seen, so setting both here surfaces
it with no frontend change.
"""
import secrets
from datetime import datetime, timedelta, timezone

import pytest
from argon2 import PasswordHasher

from app.database import motor_db
from app.roles import TRIAL_DAYS, ensure_trial_started, is_premium

_PW = "Test1234!"
_hasher = PasswordHasher()


async def _account(**overrides):
    doc = {
        "username": f"legacy-{secrets.token_hex(4)}@test.linkjoin.xyz",
        "user_id": secrets.token_urlsafe(12),
        "password": _hasher.hash(_PW),
        "account_type": "personal",
        "confirmed": "true",
        # Deliberately no premium_status, no created_at: the legacy shape.
        **overrides,
    }
    await motor_db.login.insert_one(dict(doc))
    return doc


@pytest.fixture
async def legacy_user():
    doc = await _account()
    yield doc
    await motor_db.login.delete_one({"username": doc["username"]})


async def test_login_starts_a_trial_for_a_pre_launch_account(client, legacy_user):
    before = await motor_db.login.find_one({"username": legacy_user["username"]})
    assert "premium_status" not in before
    assert is_premium(before) is False  # this is the 403 everyone was hitting

    resp = await client.post("/auth/login", json={"email": legacy_user["username"], "password": _PW})
    assert resp.status_code == 200, resp.text

    after = await motor_db.login.find_one({"username": legacy_user["username"]})
    assert after["premium_status"] == "trial"
    assert is_premium(after) is True
    # The flag the existing trial-welcome modal keys on.
    assert after["trial_welcome_seen"] is False
    days = (after["trial_end"] - after["trial_start"]).days
    assert days == TRIAL_DAYS


async def test_a_second_login_does_not_restart_the_clock(client, legacy_user):
    await client.post("/auth/login", json={"email": legacy_user["username"], "password": _PW})
    first = await motor_db.login.find_one({"username": legacy_user["username"]})

    await client.post("/auth/login", json={"email": legacy_user["username"], "password": _PW})
    second = await motor_db.login.find_one({"username": legacy_user["username"]})

    assert second["trial_end"] == first["trial_end"], "logging in again must not extend the trial"


async def test_access_lapses_when_the_trial_ends(legacy_user):
    """No expiry job exists; is_premium checks trial_end on every call."""
    await ensure_trial_started(legacy_user)
    assert is_premium(legacy_user) is True

    expired = dict(legacy_user)
    expired["trial_end"] = datetime.now(timezone.utc) - timedelta(seconds=1)
    assert is_premium(expired) is False


@pytest.mark.parametrize("existing", ["active", "grandfathered", "expired", "trial"])
async def test_an_account_that_already_has_a_status_is_left_alone(existing):
    doc = await _account(premium_status=existing, trial_end=datetime.now(timezone.utc))
    try:
        await ensure_trial_started(doc)
        assert doc["premium_status"] == existing
        stored = await motor_db.login.find_one({"username": doc["username"]})
        assert stored["premium_status"] == existing
    finally:
        await motor_db.login.delete_one({"username": doc["username"]})


async def test_institutional_accounts_are_untouched():
    """School plans are entitled outright; giving them a trial would imply it
    could lapse."""
    doc = await _account(account_type="institutional", role="teacher", org_id="test-org")
    try:
        await ensure_trial_started(doc)
        assert "premium_status" not in doc
        stored = await motor_db.login.find_one({"username": doc["username"]})
        assert "premium_status" not in stored
        assert is_premium(stored) is True
    finally:
        await motor_db.login.delete_one({"username": doc["username"]})
