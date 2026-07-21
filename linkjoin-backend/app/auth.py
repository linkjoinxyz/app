import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.config import get_settings
from app.database import motor_db
from app.redis_client import get_redis
from app.roles import is_admin_role

log = logging.getLogger(__name__)
_settings = get_settings()
_bearer = HTTPBearer(auto_error=False)

# Tokens minted for a single narrow job (the pre-MFA session, password reset,
# email confirmation, WebSocket tickets) carry one of these claims. None of them
# is an access token, and get_current_user must never accept one — otherwise the
# mfa_only session handed out by /auth/login *before* the second factor works as
# a full credential and MFA is bypassable with the password alone.
_NON_ACCESS_CLAIMS = ("purpose", "scope")

# iat has whole-second granularity while password_changed_at is stored with
# millisecond precision, so a token minted microseconds *after* a password change
# can still carry an earlier iat. Without leeway that token is wrongly revoked.
# The cost is a sub-second window in which a token minted immediately before the
# change survives, which requires the attacker to already hold valid credentials.
_EPOCH_LEEWAY_SECONDS = 1


def create_token(sub: str, minutes: int | None = None, extra: dict | None = None) -> str:
    expire_minutes = minutes if minutes is not None else _settings.access_token_expire_minutes
    payload = {
        "sub": sub,
        "jti": str(uuid.uuid4()),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=expire_minutes),
        "iat": datetime.now(timezone.utc),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, _settings.jwt_secret, algorithm=_settings.jwt_algorithm)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, _settings.jwt_secret, algorithms=[_settings.jwt_algorithm])
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


def _reject_if_pre_password_change(payload: dict, user: dict) -> None:
    """401 any token issued before the account's last password reset.

    Resetting a password has to evict a stolen token; blacklisting only the reset
    token itself left every previously-issued session alive for up to 7 days.
    """
    changed = user.get("password_changed_at")
    # Tolerate a non-datetime (a script or a manual Atlas edit writing an ISO
    # string) by treating it as "no epoch" rather than 500ing every request.
    if not isinstance(changed, datetime):
        return
    if changed.tzinfo is None:
        # Mongo hands back naive datetimes even though they are stored as UTC.
        # Without this, .timestamp() would read them as *local* time — which
        # happens to work on the UTC container and silently fails open by the
        # developer's offset anywhere else.
        changed = changed.replace(tzinfo=timezone.utc)

    iat = payload.get("iat")
    if iat is None or int(iat) + _EPOCH_LEEWAY_SECONDS < changed.timestamp():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired, please sign in again",
        )


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> dict:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = decode_token(credentials.credentials)

    if any(payload.get(claim) for claim in _NON_ACCESS_CLAIMS):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    jti = payload.get("jti")
    if jti:
        try:
            if await get_redis().exists(f"jti:{jti}"):
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token revoked")
        except HTTPException:
            raise
        except Exception as exc:
            log.error("[auth] Redis jti-revocation check failed, allowing request: %s", exc)

    email: str = payload.get("sub")
    if not email:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user = await motor_db.login.find_one({"username": email}, {"password": 0})
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    if _settings.enforce_password_epoch:
        _reject_if_pre_password_change(payload, user)

    # Attach JTI and exp so endpoints (e.g. logout) can blacklist the token
    user["_jti"] = jti
    user["_exp"] = payload.get("exp")
    return user


def is_confirmed(user: dict) -> bool:
    # Only an explicit "false" (set at signup, cleared on confirmation) means
    # "genuinely needs to confirm." A missing field — accounts predating this
    # feature, or created via a path that never set it — defaults to confirmed
    # rather than being silently locked out.
    return user.get("confirmed") != "false"


# Endpoints an account must still be able to reach while it's gated below —
# to change a temp password or to finish MFA enrollment. Everything else 403s
# until the account acts, so a leaked temp password or an MFA-less admin
# session isn't a standing credential (findings 6.5/6.6).
_SELF_SERVICE_ALLOWLIST = {
    ("POST", "/auth/set-password"),
    ("POST", "/auth/logout"),
    ("GET", "/users/me"),
    ("PATCH", "/users/mfa"),
    ("POST", "/auth/mfa/setup-verify"),
    # Status read: a disabled account has to be able to learn that it is disabled,
    # otherwise the org_disabled gate below makes the check that reports it 403.
    ("GET", "/admin/org-disabled"),
}


def is_org_disabled(user: dict) -> bool:
    """admin.disable_all writes this flag; it is stored as the string "true"."""
    return str(user.get("org_disabled", "")).lower() == "true"


async def get_confirmed_user(request: Request, user: dict = Depends(get_current_user)) -> dict:
    if not is_confirmed(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Email not confirmed")

    if (request.method, request.url.path) in _SELF_SERVICE_ALLOWLIST:
        return user

    # Enforced here rather than only in the client. /admin/disable-all set this
    # flag and three frontend components read it, but no server-side code ever
    # did, so a "disabled" account kept full API access by calling it directly or
    # just leaving a tab open with a cached token.
    if is_org_disabled(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="org_disabled")

    if user.get("must_change_password"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="must_change_password")

    # Mirrors the force_mfa/mfa_setup_required logic in /auth/login: a phone
    # number already gets an admin MFA-challenged every login even before they've
    # run the explicit enable flow, so only block when neither path is present.
    if is_admin_role(user) and not user.get("mfa_enabled") and not user.get("number"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="mfa_setup_required")

    return user
