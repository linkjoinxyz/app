"""Access tokens are short-lived (60m) and renewed via POST /auth/refresh.

The refresh token carries purpose="refresh", which app.auth._NON_ACCESS_CLAIMS
already refuses as a credential -- so it can renew a session but can never itself
authenticate a request. The refresh endpoint has to re-apply the revocation
checks that the purpose claim would otherwise route around: a token blacklisted
by logout, or one predating a password change, must not mint fresh credentials.
"""
import secrets
from datetime import datetime, timedelta, timezone

import pytest

from app.auth import create_token, get_current_user
from app.config import get_settings
from app.database import motor_db
from app.redis_client import get_redis
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

_settings = get_settings()


@pytest.fixture
async def refresh_user():
    doc = {
        "username": f"refresh-{secrets.token_hex(4)}@test.linkjoin.xyz",
        "user_id": secrets.token_urlsafe(12),
        "account_type": "personal",
        "confirmed": "true",
        "created_at": datetime.now(timezone.utc),
    }
    await motor_db.login.insert_one(dict(doc))
    yield doc
    await motor_db.login.delete_one({"username": doc["username"]})


def _refresh_token(email: str) -> str:
    return create_token(
        email, minutes=_settings.refresh_token_expire_minutes, extra={"purpose": "refresh"}
    )


async def test_refresh_returns_a_usable_access_token(client, refresh_user):
    resp = await client.post("/auth/refresh", json={"refresh_token": _refresh_token(refresh_user["username"])})
    assert resp.status_code == 200
    data = resp.json()
    assert data["access_token"] and data["refresh_token"]

    user = await get_current_user(
        HTTPAuthorizationCredentials(scheme="Bearer", credentials=data["access_token"])
    )
    assert user["username"] == refresh_user["username"]


async def test_refresh_token_is_not_itself_a_credential(refresh_user):
    """The whole reason purpose="refresh" is used: it must not authenticate."""
    token = _refresh_token(refresh_user["username"])
    with pytest.raises(HTTPException) as exc:
        await get_current_user(HTTPAuthorizationCredentials(scheme="Bearer", credentials=token))
    assert exc.value.status_code == 401


async def test_an_access_token_cannot_be_used_to_refresh(client, refresh_user):
    resp = await client.post(
        "/auth/refresh", json={"refresh_token": create_token(refresh_user["username"])}
    )
    assert resp.status_code == 401


async def test_refresh_token_is_rotated_and_the_old_one_stops_working(client, refresh_user):
    token = _refresh_token(refresh_user["username"])
    first = await client.post("/auth/refresh", json={"refresh_token": token})
    assert first.status_code == 200
    assert first.json()["refresh_token"] != token

    replay = await client.post("/auth/refresh", json={"refresh_token": token})
    assert replay.status_code == 401


async def test_refresh_rejected_after_password_change(client, refresh_user):
    token = _refresh_token(refresh_user["username"])
    await motor_db.login.update_one(
        {"username": refresh_user["username"]},
        {"$set": {"password_changed_at": datetime.now(timezone.utc) + timedelta(seconds=5)}},
    )
    resp = await client.post("/auth/refresh", json={"refresh_token": token})
    assert resp.status_code == 401


async def test_refresh_rejected_for_a_disabled_org(client, refresh_user):
    await motor_db.login.update_one(
        {"username": refresh_user["username"]}, {"$set": {"org_disabled": "true"}}
    )
    try:
        resp = await client.post(
            "/auth/refresh", json={"refresh_token": _refresh_token(refresh_user["username"])}
        )
        assert resp.status_code == 403
    finally:
        await motor_db.login.update_one(
            {"username": refresh_user["username"]}, {"$unset": {"org_disabled": ""}}
        )


async def test_missing_refresh_token_is_a_422(client):
    resp = await client.post("/auth/refresh", json={})
    assert resp.status_code == 422
