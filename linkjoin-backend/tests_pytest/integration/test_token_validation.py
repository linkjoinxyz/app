"""What get_current_user will and will not accept as a credential.

These go through the real dependency with a real Authorization header. The
`as_user` fixture overrides get_confirmed_user, so it bypasses everything under
test here and cannot be used.
"""
import time
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app.auth import create_token, get_current_user
from app.database import motor_db


def _creds(token: str) -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


async def _assert_401(token: str):
    with pytest.raises(HTTPException) as excinfo:
        await get_current_user(_creds(token))
    assert excinfo.value.status_code == 401
    return excinfo.value


# --- A0: single-purpose tokens are not credentials ---------------------------

async def test_pre_mfa_session_token_is_not_a_credential(personal_user_no_trial):
    """The MFA bypass. /auth/login returns this token on a correct password but
    BEFORE the second factor. It was accepted as a full bearer credential, so
    anyone with the password could skip MFA entirely."""
    mfa_session = create_token(
        personal_user_no_trial["username"], minutes=10, extra={"scope": "mfa_only"}
    )
    await _assert_401(mfa_session)


@pytest.mark.parametrize("purpose", ["reset", "confirm", "ws"])
async def test_single_purpose_tokens_are_not_credentials(personal_user_no_trial, purpose):
    """Reset and confirm tokens are emailed; ws tickets are query params and land
    in access logs. None may act as an access token."""
    token = create_token(
        personal_user_no_trial["username"], minutes=60, extra={"purpose": purpose}
    )
    await _assert_401(token)


async def test_plain_access_token_still_works(personal_user_no_trial):
    """The guard must not break ordinary sign-in."""
    user = await get_current_user(_creds(create_token(personal_user_no_trial["username"])))
    assert user["username"] == personal_user_no_trial["username"]


# --- 1.5: password-reset token epoch ----------------------------------------

async def _set_epoch(username: str, when: datetime):
    await motor_db.login.update_one(
        {"username": username}, {"$set": {"password_changed_at": when}}
    )


async def test_token_issued_before_password_reset_is_rejected(personal_user_no_trial):
    """The point of the epoch: resetting a password evicts a stolen token."""
    token = create_token(personal_user_no_trial["username"])
    await _set_epoch(personal_user_no_trial["username"], datetime.now(timezone.utc) + timedelta(seconds=5))
    await _assert_401(token)


async def test_token_issued_after_password_reset_is_accepted(personal_user_no_trial):
    await _set_epoch(personal_user_no_trial["username"], datetime.now(timezone.utc) - timedelta(seconds=5))
    token = create_token(personal_user_no_trial["username"])
    user = await get_current_user(_creds(token))
    assert user["username"] == personal_user_no_trial["username"]


async def test_same_second_reset_does_not_revoke_a_fresh_token(personal_user_no_trial):
    """iat has whole-second granularity but password_changed_at has milliseconds,
    so a token minted microseconds after the change can carry an earlier iat.
    Without leeway this false-revokes the session the user just created."""
    token = create_token(personal_user_no_trial["username"])
    await _set_epoch(personal_user_no_trial["username"], datetime.now(timezone.utc))
    user = await get_current_user(_creds(token))
    assert user["username"] == personal_user_no_trial["username"]


async def test_legacy_user_without_epoch_field_is_accepted(personal_user_no_trial):
    """Every account predates this field; none of them may be locked out."""
    await motor_db.login.update_one(
        {"username": personal_user_no_trial["username"]}, {"$unset": {"password_changed_at": ""}}
    )
    user = await get_current_user(_creds(create_token(personal_user_no_trial["username"])))
    assert user["username"] == personal_user_no_trial["username"]


async def test_non_datetime_epoch_does_not_500(personal_user_no_trial):
    """A script or a manual Atlas edit writing a string must degrade to "no
    epoch", not raise AttributeError on every request for that user."""
    await _set_epoch(personal_user_no_trial["username"], "2026-01-01T00:00:00+00:00")
    user = await get_current_user(_creds(create_token(personal_user_no_trial["username"])))
    assert user["username"] == personal_user_no_trial["username"]


async def test_epoch_comparison_is_timezone_correct(personal_user_no_trial, monkeypatch):
    """Mongo returns naive datetimes. Calling .timestamp() on one interprets it as
    LOCAL time, which happens to be right on the UTC container and silently fails
    OPEN by the developer's offset anywhere else — so a naive implementation
    passes every test except this one.
    """
    if not hasattr(time, "tzset"):
        pytest.skip("tzset unavailable on this platform")
    monkeypatch.setenv("TZ", "America/Los_Angeles")
    time.tzset()
    try:
        token = create_token(personal_user_no_trial["username"])
        # Naive, as Mongo would hand it back, and 1 hour in the future.
        naive_future = (datetime.now(timezone.utc) + timedelta(hours=1)).replace(tzinfo=None)
        await _set_epoch(personal_user_no_trial["username"], naive_future)
        # Read as UTC this is +1h and must revoke. Read as US/Pacific it is 8h in
        # the past and would wrongly pass.
        await _assert_401(token)
    finally:
        monkeypatch.undo()
        time.tzset()
