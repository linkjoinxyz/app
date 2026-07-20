import logging
import secrets
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, Request
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, InvalidHashError
import httpx
from app.database import motor_db
from app.auth import create_token, decode_token, get_confirmed_user, get_current_user, is_confirmed
from app.roles import is_admin_role
from app.limiter import limiter
from app.models.user import RegisterRequest, LoginRequest, ResetPasswordRequest
from app.config import get_settings
from app.email_service import send_email
from app.utils import gen_id, track_event
from app.redis_client import get_redis
from app.audit import log_audit
import re

log = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])
hasher = PasswordHasher()
_settings = get_settings()

# Pre-computed hash used to equalize timing for non-existent users
_DUMMY_HASH = hasher.hash("__dummy_timing_password__")


def _gen_otp() -> str:
    return secrets.token_urlsafe(20)


def _normalize_number(number: str, countrycode: str = "1") -> str | None:
    digits = "".join(c for c in number if c.isdigit())
    if not digits:
        return None
    if len(digits) < 11:
        digits = countrycode.lstrip("+") + digits
    return digits


async def _blacklist_token(payload: dict) -> None:
    jti = payload.get("jti")
    exp = payload.get("exp")
    if jti and exp:
        ttl = max(1, int(exp - datetime.now(timezone.utc).timestamp()))
        await get_redis().setex(f"jti:{jti}", ttl, "1")


@router.post("/register", status_code=201)
@limiter.limit("5/minute")
async def register(request: Request, body: RegisterRequest, background_tasks: BackgroundTasks):
    email = body.email.lower()

    if body.jwt:
        try:
            google_info = id_token.verify_oauth2_token(
                body.jwt, google_requests.Request(), _settings.google_client_id
            )
            email = google_info["email"].lower()
        except Exception:
            raise HTTPException(status_code=400, detail="google_signup_failed")
    else:
        if not re.match(r"^[^@ ]+@[^@ ]+\.[^@ .]{2,}$", email):
            raise HTTPException(status_code=422, detail="invalid_email")

    if body.under_13:
        raise HTTPException(status_code=403, detail="Users under 13 must be registered by a school administrator.")

    if await motor_db.login.find_one({"username": email}):
        raise HTTPException(status_code=409, detail="email_in_use")

    _trial_start = datetime.now(timezone.utc)
    account: dict = {
        "username": email,
        "user_id": secrets.token_urlsafe(16),
        "account_type": "personal",
        "premium_status": "trial",
        "trial_start": _trial_start,
        "trial_end": _trial_start + timedelta(days=14),
        "refer": gen_id(),
        "onboarding_done": False,
        "popup_check_done": False,
        "trial_welcome_seen": False,
        "offset": body.offset,
        "notes": {},
        "confirmed": "false",
        "timezone": body.timezone or "",
        "org_name": email.split("@")[1],
        "created_at": datetime.now(timezone.utc),
    }

    if body.jwt:
        account["confirmed"] = "true"
    elif body.password is not None:
        account["password"] = hasher.hash(body.password)

    if body.number:
        normalized = _normalize_number(body.number, body.countrycode or "1")
        if normalized:
            account["number"] = int(normalized)

    await motor_db.login.insert_one(account)

    if account["confirmed"] == "false":
        confirm_token = create_token(
            email, minutes=_settings.confirm_token_expire_minutes, extra={"purpose": "confirm"}
        )
        confirm_url = f"{_settings.app_base_url}/confirm?token={confirm_token}"
        background_tasks.add_task(
            send_email,
            f"<p>Confirm your email: <a href='{confirm_url}'>{confirm_url}</a></p>",
            "LinkJoin: Confirm email address",
            email,
        )
        await track_event("signup", user_id=account.get("user_id"))
        await log_audit(email, "auth.register", ip=request.client.host if request.client else None)
        access_token = create_token(email)
        return {
            "access_token": access_token, "token_type": "bearer", "email": email, "confirmed": False,
            "account_type": account.get("account_type", "personal"),
            "role": account.get("role"),
            "org_id": account.get("org_id"),
            "admin": account.get("admin"),
            "onboarding_done": bool(account.get("onboarding_done", False)),
        }

    await track_event("signup", user_id=account.get("user_id"))
    await log_audit(email, "auth.register", ip=request.client.host if request.client else None)
    access_token = create_token(email)
    return {
        "access_token": access_token, "token_type": "bearer", "email": email, "confirmed": True,
        "account_type": account.get("account_type", "personal"),
        "role": account.get("role"),
        "org_id": account.get("org_id"),
        "admin": account.get("admin"),
    }


@router.get("/confirm")
async def confirm_email(token: str):
    try:
        payload = decode_token(token)
    except HTTPException:
        raise HTTPException(status_code=400, detail="Invalid or expired confirmation link")

    if payload.get("purpose") != "confirm":
        raise HTTPException(status_code=400, detail="Invalid token purpose")

    # Blacklist token to prevent reuse
    jti = payload.get("jti")
    if jti and await get_redis().exists(f"jti:{jti}"):
        raise HTTPException(status_code=400, detail="Invalid or expired confirmation link")

    email = payload.get("sub")
    user = await motor_db.login.find_one({"username": email})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if is_confirmed(user):
        await _blacklist_token(payload)
        return {"message": "Already confirmed"}

    await motor_db.login.update_one({"username": email}, {"$set": {"confirmed": "true"}})
    await _blacklist_token(payload)
    await track_event("signup", user_id=user.get("user_id"))
    user = await motor_db.login.find_one({"username": email})
    access_token = create_token(email)
    return {
        "access_token": access_token, "token_type": "bearer", "email": email,
        "account_type": user.get("account_type", "personal") if user else "personal",
        "role": user.get("role") if user else None,
        "org_id": user.get("org_id") if user else None,
        "admin": user.get("admin") if user else None,
        "onboarding_done": bool(user.get("onboarding_done", False)) if user else False,
    }


@router.post("/resend-confirmation")
@limiter.limit("3/minute")
async def resend_confirmation(request: Request, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user)):
    if is_confirmed(user):
        return {"message": "Already confirmed"}
    email = user["username"]
    confirm_token = create_token(
        email, minutes=_settings.confirm_token_expire_minutes, extra={"purpose": "confirm"}
    )
    confirm_url = f"{_settings.app_base_url}/confirm?token={confirm_token}"
    background_tasks.add_task(
        send_email,
        f"<p>Confirm your email: <a href='{confirm_url}'>{confirm_url}</a></p>",
        "LinkJoin: Confirm email address",
        email,
    )
    return {"message": "Confirmation email sent"}


@router.post("/login")
@limiter.limit("10/minute")
async def login(request: Request, body: LoginRequest):
    if body.jwt:
        try:
            google_info = id_token.verify_oauth2_token(
                body.jwt, google_requests.Request(), _settings.google_client_id
            )
            email = google_info["email"].lower()
        except Exception:
            raise HTTPException(status_code=400, detail="google_login_failed")
    else:
        if not body.email or not body.password:
            raise HTTPException(status_code=422, detail="Email and password required")
        email = body.email.lower()

        user = await motor_db.login.find_one({"username": email})
        if not user:
            # Always run a hash to equalize timing regardless of whether user exists
            try:
                hasher.verify(_DUMMY_HASH, body.password or "")
            except Exception:
                pass
            raise HTTPException(status_code=401, detail="Invalid credentials")

        if "password" not in user:
            raise HTTPException(status_code=401, detail="no_password")

        try:
            hasher.verify(user["password"], body.password)
        except (VerifyMismatchError, InvalidHashError):
            raise HTTPException(status_code=401, detail="Invalid credentials")

    user = await motor_db.login.find_one({"username": email})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    consent = user.get("parental_consent")
    if consent and consent.get("required") and consent.get("status") == "pending":
        raise HTTPException(
            status_code=403,
            detail="parental_consent_pending"
        )

    if user.get("offset") is None:
        await motor_db.login.update_one({"username": email}, {"$set": {"offset": "0.0"}})

    await track_event("login", org_id=user.get("org_id"), user_id=user.get("user_id"))
    ip = request.client.host if request.client else None
    await log_audit(email, "auth.login", ip=ip)

    admin_role = is_admin_role(user)
    force_mfa = user.get("mfa_enabled") or (admin_role and user.get("number"))
    if force_mfa:
        from app.routers.mfa import _send_mfa_code
        if not await _send_mfa_code(user):
            raise HTTPException(status_code=503, detail="Could not send verification code, contact support")
        mfa_session = create_token(email, minutes=10, extra={"scope": "mfa_only"})
        return {"mfa_required": True, "mfa_session": mfa_session}

    access_token = create_token(email)
    confirmed = is_confirmed(user)
    return {
        "access_token": access_token, "token_type": "bearer", "email": email, "confirmed": confirmed,
        "account_type": user.get("account_type", "personal"),
        "role": user.get("role"),
        "org_id": user.get("org_id"),
        "admin": user.get("admin"),
        "onboarding_done": bool(user.get("onboarding_done", True)),
        "mfa_enabled": bool(user.get("mfa_enabled", False)),
        "must_change_password": bool(user.get("must_change_password", False)),
        "mfa_setup_required": admin_role and not user.get("mfa_enabled") and not user.get("number"),
    }


@router.post("/set-password")
async def set_password(body: dict, user: dict = Depends(get_confirmed_user)):
    new_password = body.get("new_password", "")
    confirm_password = body.get("confirm_password", "")
    if len(new_password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters")
    if new_password != confirm_password:
        raise HTTPException(status_code=422, detail="Passwords do not match")
    email = user["username"]
    await motor_db.login.update_one(
        {"username": email},
        {"$set": {"password": hasher.hash(new_password)}, "$unset": {"must_change_password": ""}}
    )
    return {"ok": True}



def _allowed_google_audiences() -> set[str]:
    # Empty strings are filtered so an unset env var can never act as a wildcard.
    return {a for a in (_settings.google_client_id, _settings.google_chrome_client_id) if a}


@router.post("/google-token")
@limiter.limit("10/minute")
async def google_token_auth(request: Request, body: dict):
    access_token = body.get("access_token")
    if not access_token:
        raise HTTPException(status_code=400, detail="google_login_failed")

    # tokeninfo, NOT userinfo. userinfo answers for any token Google considers
    # valid and never reveals which OAuth client it was issued to, so a token
    # minted for an unrelated app would authenticate as that user here. tokeninfo
    # returns `aud`, which is the only thing that binds the token to us. It also
    # returns the email, so this replaces the userinfo call rather than adding to it.
    async with httpx.AsyncClient() as client:
        info_resp = await client.get(
            "https://oauth2.googleapis.com/tokeninfo",
            params={"access_token": access_token},
        )

    if info_resp.status_code != 200:
        raise HTTPException(status_code=400, detail="google_login_failed")

    info = info_resp.json()

    allowed = _allowed_google_audiences()
    if info.get("aud") not in allowed:
        # Logged loudly: a misconfigured GOOGLE_CLIENT_ID / GOOGLE_CHROME_CLIENT_ID
        # breaks *all* Google sign-in and is otherwise indistinguishable from an
        # attack. This line tells you which it is immediately.
        log.warning(
            "[auth] google-token rejected: aud=%r not in configured audiences (%d configured)",
            info.get("aud"), len(allowed),
        )
        raise HTTPException(status_code=400, detail="google_login_failed")
    # tokeninfo returns JSON booleans as strings on some responses.
    if str(info.get("email_verified", "")).lower() != "true":
        raise HTTPException(status_code=400, detail="google_login_failed")

    email = (info.get("email") or "").lower()
    if not email:
        raise HTTPException(status_code=400, detail="google_login_failed")

    user = await motor_db.login.find_one({"username": email})
    if not user and body.get("intent") == "login":
        raise HTTPException(status_code=401, detail="no_google_account")
    if not user:
        _trial_start = datetime.now(timezone.utc)
        account = {
            "username": email,
            "user_id": secrets.token_urlsafe(16),
            "account_type": "personal",
            "premium_status": "trial",
            "trial_start": _trial_start,
            "trial_end": _trial_start + timedelta(days=14),
            "refer": gen_id(),
            "onboarding_done": False,
            "popup_check_done": False,
            "trial_welcome_seen": False,
            "offset": 0,
            "notes": {},
            "confirmed": "true",
            "timezone": "",
            "org_name": email.split("@")[1],
        }
        await motor_db.login.insert_one(account)
        await track_event("signup", user_id=account.get("user_id"))
        user = account

    admin_role = is_admin_role(user)
    force_mfa = user.get("mfa_enabled") or (admin_role and user.get("number"))
    if force_mfa:
        from app.routers.mfa import _send_mfa_code
        if not await _send_mfa_code(user):
            raise HTTPException(status_code=503, detail="Could not send verification code, contact support")
        mfa_session = create_token(email, minutes=10, extra={"scope": "mfa_only"})
        return {"mfa_required": True, "mfa_session": mfa_session}

    access_token_jwt = create_token(email)
    confirmed = is_confirmed(user)
    return {
        "access_token": access_token_jwt, "token_type": "bearer", "email": email, "confirmed": confirmed,
        "account_type": user.get("account_type", "personal"),
        "role": user.get("role"),
        "org_id": user.get("org_id"),
        "admin": user.get("admin"),
        "onboarding_done": bool(user.get("onboarding_done", True)),
        "must_change_password": bool(user.get("must_change_password", False)),
        "mfa_setup_required": admin_role and not user.get("mfa_enabled") and not user.get("number"),
    }


@router.post("/forgot-password")
@limiter.limit("3/minute")
async def forgot_password(request: Request, body: dict, background_tasks: BackgroundTasks):
    email = (body.get("email") or "").lower()
    user = await motor_db.login.find_one({"username": email})
    if not user:
        return {"message": "If that email exists you will receive a reset link"}

    reset_token = create_token(
        email, minutes=_settings.reset_token_expire_minutes, extra={"purpose": "reset"}
    )
    reset_url = f"{_settings.frontend_url}/reset-password?token={reset_token}"
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td align="center" style="background:#091B30;padding:28px 40px;">
            <span style="font-size:26px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">LinkJoin</span>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px 48px 36px;">
            <p style="margin:0 0 8px;font-size:22px;font-weight:600;color:#111827;">Reset your password</p>
            <p style="margin:0 0 28px;font-size:15px;color:#6b7280;line-height:1.6;">
              We received a request to reset the password for your LinkJoin account. Click the button below to choose a new one.
            </p>
            <table cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
              <tr>
                <td align="center" style="background:#2b8fd8;border-radius:8px;">
                  <a href="{reset_url}" style="display:inline-block;padding:14px 36px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:0.2px;">Reset password</a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 6px;font-size:13px;color:#9ca3af;line-height:1.6;">
              This link expires in 30 minutes. If you didn&#39;t request a password reset, you can safely ignore this email.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 48px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">&copy; 2025 LinkJoin. All rights reserved.</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>"""
    background_tasks.add_task(
        send_email,
        html,
        "Reset your LinkJoin password",
        email,
    )
    return {"message": "If that email exists you will receive a reset link"}


@router.post("/reset-password/{token}")
@limiter.limit("5/hour")
async def reset_password_with_token(request: Request, token: str, body: ResetPasswordRequest):
    try:
        payload = decode_token(token)
    except HTTPException:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")

    if payload.get("purpose") != "reset":
        raise HTTPException(status_code=400, detail="Invalid token purpose")

    # Blacklist token to prevent reuse
    jti = payload.get("jti")
    if jti and await get_redis().exists(f"jti:{jti}"):
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")

    email = payload.get("sub")
    hashed = hasher.hash(body.password)
    # password_changed_at is the session epoch: get_current_user rejects any token
    # issued before it, so a reset evicts sessions on every other device. Without
    # it, a stolen 7-day access token survives the reset that was meant to kill it.
    result = await motor_db.login.update_one(
        {"username": email},
        {"$set": {"password": hashed, "password_changed_at": datetime.now(timezone.utc)}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")

    await _blacklist_token(payload)
    await log_audit(email, "auth.password_changed")
    return {"message": "Password updated"}


@router.post("/logout")
async def logout(user: dict = Depends(get_confirmed_user)):
    jti = user.get("_jti")
    exp = user.get("_exp")
    if jti and exp:
        ttl = max(1, int(exp - datetime.now(timezone.utc).timestamp()))
        await get_redis().setex(f"jti:{jti}", ttl, "1")
    await log_audit(user["username"], "auth.logout")
    return {"message": "Logged out"}
