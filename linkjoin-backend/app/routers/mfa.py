import secrets
import string
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from app.auth import create_token, decode_token, get_confirmed_user
from app.database import motor_db
from app.config import get_settings
from app.audit import log_audit

router = APIRouter(prefix="/auth/mfa", tags=["mfa"])
_settings = get_settings()


def _gen_mfa_code() -> str:
    return "".join(secrets.choice(string.digits) for _ in range(6))


async def _send_mfa_code(user: dict) -> str:
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
        "resend_count": 0,
    })

    phone = user.get("mfa_phone") or str(user.get("number", ""))
    if phone and _settings.twilio_sid and _settings.twilio_token:
        try:
            from twilio.rest import Client
            twilio = Client(_settings.twilio_sid, _settings.twilio_token)
            twilio.messages.create(
                from_=_settings.twilio_from_number,
                body=f"Your LinkJoin verification code is: {code}. Valid for 10 minutes.",
                to=f"+{phone}",
            )
        except Exception:
            pass
    return code


@router.post("/verify")
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

    if not challenge or challenge.get("code") != code:
        await log_audit(email, "auth.mfa_failure", ip=ip)
        raise HTTPException(status_code=401, detail="Invalid or expired code")

    await motor_db.mfa_challenges.update_one(
        {"_id": challenge["_id"]},
        {"$set": {"used": True}},
    )
    await log_audit(email, "auth.mfa_success", ip=ip)

    access_token = create_token(email)
    confirmed = user.get("confirmed") == "true"
    return {
        "access_token": access_token,
        "token_type": "bearer",
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

    # Rate limit: max 3 resends per session
    session_resends = await motor_db.mfa_challenges.count_documents({
        "user_id": user["user_id"],
        "created_at": {"$gte": datetime.fromisoformat(payload.get("iat_str", "2000-01-01T00:00:00+00:00"))},
    })
    if session_resends >= 4:
        raise HTTPException(status_code=429, detail="Too many resend attempts")

    await _send_mfa_code(user)
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

    if not challenge or challenge.get("code") != code:
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
