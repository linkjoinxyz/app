import hmac
import logging
import secrets
import string
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from app.auth import create_token, decode_token, get_confirmed_user
from app.database import motor_db
from app.config import get_settings
from app.limiter import limiter
from app.audit import log_audit

log = logging.getLogger(__name__)
router = APIRouter(prefix="/auth/mfa", tags=["mfa"])
_settings = get_settings()

# Guessing bound per challenge: on top of the per-IP @limiter.limit on /verify,
# a challenge stops accepting attempts after this many wrong codes, forcing a
# fresh one via /resend instead of staying live for its full 10-minute TTL.
_MAX_VERIFY_ATTEMPTS = 5


def _gen_mfa_code() -> str:
    return "".join(secrets.choice(string.digits) for _ in range(6))


async def _send_mfa_code(user: dict) -> bool:
    """Create a challenge and attempt delivery. Returns False if the user has no
    way to learn the code (unconfigured Twilio or a delivery failure) — callers
    must not tell the client mfa_required in that case, since verify/resend would
    have no way to ever succeed."""
    code = _gen_mfa_code()
    await motor_db.mfa_challenges.update_many(
        {"user_id": user["user_id"], "used": False},
        {"$set": {"used": True}},
    )
    await motor_db.mfa_challenges.insert_one({
        "user_id": user["user_id"],
        "code": code,
        "created_at": datetime.now(timezone.utc),
        "used": False,
        "attempts": 0,
        "resend_count": 0,
    })

    phone = user.get("mfa_phone") or str(user.get("number", ""))
    if not (phone and _settings.twilio_sid and _settings.twilio_token):
        log.warning("MFA SMS not sent (unconfigured) for user_id=%s", user.get("user_id"))
        return False
    try:
        from twilio.rest import Client
        twilio = Client(_settings.twilio_sid, _settings.twilio_token)
        twilio.messages.create(
            from_=_settings.twilio_from_number,
            body=f"Your LinkJoin verification code is: {code}. Valid for 10 minutes.",
            to=f"+{phone}",
        )
        return True
    except Exception:
        log.warning("MFA SMS delivery failed for user_id=%s", user.get("user_id"))
        return False


@router.post("/verify")
@limiter.limit("10/hour")
async def verify_mfa(body: dict, request: Request):
    mfa_session = body.get("mfa_session")
    code = (body.get("code") or "").strip()

    if not mfa_session or not code:
        raise HTTPException(status_code=422, detail="mfa_session and code required")

    try:
        payload = decode_token(mfa_session)
    except HTTPException:
        raise HTTPException(status_code=401, detail="Invalid or expired MFA session")

    if payload.get("scope") != "mfa_only":
        raise HTTPException(status_code=401, detail="Invalid MFA session")

    email = payload.get("sub")
    user = await motor_db.login.find_one({"username": email})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    challenge = await motor_db.mfa_challenges.find_one(
        {"user_id": user["user_id"], "used": False},
        sort=[("created_at", -1)],
    )
    ip = request.client.host if request.client else None

    if not challenge or not hmac.compare_digest(challenge.get("code", ""), code):
        await log_audit(email, "auth.mfa_failure", ip=ip)
        if challenge:
            attempts = challenge.get("attempts", 0) + 1
            update = {"attempts": attempts}
            if attempts >= _MAX_VERIFY_ATTEMPTS:
                update["used"] = True
            await motor_db.mfa_challenges.update_one({"_id": challenge["_id"]}, {"$set": update})
        raise HTTPException(status_code=401, detail="Invalid or expired code")

    await motor_db.mfa_challenges.update_one(
        {"_id": challenge["_id"]},
        {"$set": {"used": True}},
    )
    await log_audit(email, "auth.mfa_success", ip=ip)

    from app.routers.auth import _token_pair

    confirmed = user.get("confirmed") == "true"
    return {
        **_token_pair(email),
        "email": email,
        "confirmed": confirmed,
        "account_type": user.get("account_type", "personal"),
        "role": user.get("role"),
        "org_id": user.get("org_id"),
        "admin": user.get("admin"),
        "onboarding_done": bool(user.get("onboarding_done", True)),
        "mfa_enabled": True,
    }


@router.post("/resend")
@limiter.limit("5/hour")
async def resend_mfa(body: dict, request: Request):
    mfa_session = body.get("mfa_session")
    if not mfa_session:
        raise HTTPException(status_code=422, detail="mfa_session required")

    try:
        payload = decode_token(mfa_session)
    except HTTPException:
        raise HTTPException(status_code=401, detail="Invalid or expired MFA session")

    if payload.get("scope") != "mfa_only":
        raise HTTPException(status_code=401, detail="Invalid MFA session")

    email = payload.get("sub")
    user = await motor_db.login.find_one({"username": email})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    # Rate limit: max 3 resends per session. `iat` is the standard numeric JWT
    # claim every token carries (see create_token) — this used to read a nonexistent
    # "iat_str" claim, which fell back to a year-2000 default and made this count
    # every challenge the user has ever received instead of just this session's.
    session_start = datetime.fromtimestamp(payload["iat"], tz=timezone.utc)
    session_resends = await motor_db.mfa_challenges.count_documents({
        "user_id": user["user_id"],
        "created_at": {"$gte": session_start},
    })
    if session_resends >= 4:
        raise HTTPException(status_code=429, detail="Too many resend attempts")

    if not await _send_mfa_code(user):
        raise HTTPException(status_code=503, detail="Could not send verification code, contact support")
    return {"message": "Code resent"}


@router.post("/setup-verify")
async def setup_verify_mfa(body: dict, request: Request, user: dict = Depends(get_confirmed_user)):
    code = (body.get("code") or "").strip()
    if not code:
        raise HTTPException(status_code=422, detail="code required")

    challenge = await motor_db.mfa_challenges.find_one(
        {"user_id": user["user_id"], "used": False},
        sort=[("created_at", -1)],
    )
    ip = request.client.host if request.client else None

    if not challenge or not hmac.compare_digest(challenge.get("code", ""), code):
        await log_audit(user["username"], "auth.mfa_setup_failure", ip=ip)
        raise HTTPException(status_code=401, detail="Invalid or expired code")

    await motor_db.mfa_challenges.update_one(
        {"_id": challenge["_id"]},
        {"$set": {"used": True}},
    )

    phone = body.get("phone") or user.get("mfa_phone") or str(user.get("number", ""))
    await motor_db.login.update_one(
        {"username": user["username"]},
        {"$set": {"mfa_enabled": True, "mfa_phone": phone}},
    )
    await log_audit(user["username"], "auth.mfa_enabled", ip=ip)
    return {"message": "MFA enabled"}
