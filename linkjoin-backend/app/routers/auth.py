import secrets
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, Request
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, InvalidHashError
from pydantic import BaseModel
import httpx
from app.database import motor_db
from app.auth import create_token, decode_token, get_confirmed_user, get_current_user
from app.limiter import limiter
from app.models.user import RegisterRequest, LoginRequest, ResetPasswordRequest, TokenResponse
from app.config import get_settings
from app.email_service import send_email
from app.utils import gen_id, analytics
from app.redis_client import get_redis
from jose import JWTError
import re

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

    if await motor_db.login.find_one({"username": email}):
        raise HTTPException(status_code=409, detail="email_in_use")

    account: dict = {
        "username": email,
        "premium": "false",
        "refer": gen_id(),
        "tutorial": -1,
        "offset": body.offset,
        "notes": {},
        "confirmed": "false",
        "timezone": body.timezone or "",
        "org_name": email.split("@")[1],
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
        await analytics("signups")
        access_token = create_token(email)
        return {"access_token": access_token, "token_type": "bearer", "email": email, "confirmed": False}

    await analytics("signups")
    access_token = create_token(email)
    return {"access_token": access_token, "token_type": "bearer", "email": email, "confirmed": True}


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
    if user.get("confirmed") == "true":
        await _blacklist_token(payload)
        return {"message": "Already confirmed"}

    await motor_db.login.update_one({"username": email}, {"$set": {"confirmed": "true"}})
    await _blacklist_token(payload)
    await analytics("signups")
    access_token = create_token(email)
    return TokenResponse(access_token=access_token, email=email)


@router.post("/resend-confirmation")
@limiter.limit("3/minute")
async def resend_confirmation(request: Request, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user)):
    if user.get("confirmed") == "true":
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

    if user.get("offset") is None:
        await motor_db.login.update_one({"username": email}, {"$set": {"offset": "0.0"}})

    await analytics("logins")
    access_token = create_token(email)
    confirmed = user.get("confirmed") == "true"
    return {"access_token": access_token, "token_type": "bearer", "email": email, "confirmed": confirmed}


class GoogleCodeRequest(BaseModel):
    code: str
    redirect_uri: str
    code_verifier: str
    client_id: str


@router.post("/google-code")
@limiter.limit("10/minute")
async def google_code_exchange(request: Request, body: GoogleCodeRequest):
    # Chrome App clients are public clients — PKCE alone is sufficient, no secret needed.
    # Web application clients require the secret.
    is_chrome_app = body.client_id == _settings.google_chrome_client_id
    exchange_data = {
        "code": body.code,
        "client_id": body.client_id,
        "redirect_uri": body.redirect_uri,
        "grant_type": "authorization_code",
        "code_verifier": body.code_verifier,
    }
    if not is_chrome_app:
        exchange_data["client_secret"] = _settings.google_client_secret

    async with httpx.AsyncClient() as client:
        token_resp = await client.post("https://oauth2.googleapis.com/token", data=exchange_data)

    if token_resp.status_code != 200:
        raise HTTPException(status_code=400, detail="google_login_failed")

    id_token_jwt = token_resp.json().get("id_token")
    if not id_token_jwt:
        raise HTTPException(status_code=400, detail="google_login_failed")

    try:
        google_info = id_token.verify_oauth2_token(
            id_token_jwt, google_requests.Request(), body.client_id
        )
        email = google_info["email"].lower()
    except Exception:
        raise HTTPException(status_code=400, detail="google_login_failed")

    user = await motor_db.login.find_one({"username": email})
    if not user:
        account = {
            "username": email,
            "premium": "false",
            "refer": gen_id(),
            "tutorial": -1,
            "offset": 0,
            "notes": {},
            "confirmed": "true",
            "timezone": "",
            "org_name": email.split("@")[1],
        }
        await motor_db.login.insert_one(account)
        await analytics("signups")
        user = account

    access_token = create_token(email)
    confirmed = user.get("confirmed") == "true"
    return {"access_token": access_token, "token_type": "bearer", "email": email, "confirmed": confirmed}


@router.post("/google-token")
@limiter.limit("10/minute")
async def google_token_auth(request: Request, body: dict):
    access_token = body.get("access_token")
    if not access_token:
        raise HTTPException(status_code=400, detail="google_login_failed")

    async with httpx.AsyncClient() as client:
        info_resp = await client.get(
            "https://www.googleapis.com/oauth2/v1/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )

    if info_resp.status_code != 200:
        raise HTTPException(status_code=400, detail="google_login_failed")

    info = info_resp.json()
    email = info.get("email", "").lower()
    if not email:
        raise HTTPException(status_code=400, detail="google_login_failed")

    user = await motor_db.login.find_one({"username": email})
    if not user:
        account = {
            "username": email,
            "premium": "false",
            "refer": gen_id(),
            "tutorial": -1,
            "offset": 0,
            "notes": {},
            "confirmed": "true",
            "timezone": "",
            "org_name": email.split("@")[1],
        }
        await motor_db.login.insert_one(account)
        await analytics("signups")
        user = account

    access_token_jwt = create_token(email)
    confirmed = user.get("confirmed") == "true"
    return {"access_token": access_token_jwt, "token_type": "bearer", "email": email, "confirmed": confirmed}


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
async def reset_password_with_token(token: str, body: ResetPasswordRequest):
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
    result = await motor_db.login.update_one({"username": email}, {"$set": {"password": hashed}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")

    await _blacklist_token(payload)
    return {"message": "Password updated"}


@router.post("/logout")
async def logout(user: dict = Depends(get_confirmed_user)):
    jti = user.get("_jti")
    exp = user.get("_exp")
    if jti and exp:
        ttl = max(1, int(exp - datetime.now(timezone.utc).timestamp()))
        await get_redis().setex(f"jti:{jti}", ttl, "1")
    return {"message": "Logged out"}
