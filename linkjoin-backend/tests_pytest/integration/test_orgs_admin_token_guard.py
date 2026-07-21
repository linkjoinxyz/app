"""orgs.py::_check_token gated POST /orgs by calling jwt.decode directly instead
of going through get_current_user. That skipped all three guards that make a
token a credential:

  - the _NON_ACCESS_CLAIMS rejection, so the `mfa_only` session /auth/login hands
    out BEFORE the second factor authenticated here and MFA was bypassable with
    the password alone;
  - the Redis JTI blacklist, so a logged-out token kept working;
  - the password-change epoch, so a token a reset was meant to evict kept working.

These use a real Authorization header, because the as_user fixture overrides
get_confirmed_user/get_current_user and would bypass the thing under test.
"""
import secrets
from datetime import datetime, timedelta, timezone

import pytest

from app.auth import create_token
from app.database import motor_db


@pytest.fixture
async def platform_admin():
    doc = {
        "username": f"platform-admin-{secrets.token_hex(4)}@test.linkjoin.xyz",
        "user_id": secrets.token_urlsafe(12),
        "account_type": "personal",
        "admin": "true",
        "confirmed": "true",
        "created_at": datetime.now(timezone.utc),
    }
    await motor_db.login.insert_one(dict(doc))
    yield doc
    await motor_db.login.delete_one({"username": doc["username"]})


def _org_body() -> dict:
    return {"name": f"Test org {secrets.token_hex(3)}", "type": "school"}


async def _post_org(client, token: str):
    return await client.post(
        "/orgs", json=_org_body(), headers={"Authorization": f"Bearer {token}"}
    )


async def test_pre_mfa_session_cannot_create_org(client, platform_admin):
    """The MFA bypass: this token is issued on a correct password but before the
    second factor, and must not act as a credential anywhere."""
    mfa_session = create_token(
        platform_admin["username"], minutes=10, extra={"scope": "mfa_only"}
    )
    resp = await _post_org(client, mfa_session)
    assert resp.status_code == 403


@pytest.mark.parametrize("purpose", ["reset", "confirm", "ws"])
async def test_single_purpose_tokens_cannot_create_org(client, platform_admin, purpose):
    token = create_token(platform_admin["username"], minutes=60, extra={"purpose": purpose})
    resp = await _post_org(client, token)
    assert resp.status_code == 403


async def test_token_issued_before_password_change_cannot_create_org(client, platform_admin):
    token = create_token(platform_admin["username"])
    await motor_db.login.update_one(
        {"username": platform_admin["username"]},
        {"$set": {"password_changed_at": datetime.now(timezone.utc) + timedelta(seconds=5)}},
    )
    resp = await _post_org(client, token)
    assert resp.status_code == 403


async def test_non_admin_access_token_cannot_create_org(client, personal_user_no_trial):
    """A perfectly valid credential that simply is not a platform admin."""
    resp = await _post_org(client, create_token(personal_user_no_trial["username"]))
    assert resp.status_code == 403


async def test_platform_admin_access_token_still_creates_org(client, platform_admin):
    """The guard must not break the legitimate path."""
    resp = await _post_org(client, create_token(platform_admin["username"]))
    assert resp.status_code == 201
    await motor_db.orgs.delete_one({"org_id": resp.json()["org_id"]})
