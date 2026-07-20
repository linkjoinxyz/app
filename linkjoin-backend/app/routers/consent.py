import secrets
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from pymongo import ReturnDocument
from app.auth import get_confirmed_user
from app.database import motor_db
from app.audit import log_audit

router = APIRouter(tags=["consent"])


_SUCCESS_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Consent Granted - LinkJoin</title>
<style>
  body {{ margin: 0; background: #142539; display: flex; align-items: center; justify-content: center; min-height: 100vh; font-family: 'Montserrat', sans-serif; }}
  .card {{ background: #1a2f45; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 48px 40px; max-width: 440px; text-align: center; }}
  .icon {{ color: #4ade80; margin-bottom: 16px; }}
  h1 {{ color: #fff; font-size: 22px; font-weight: 700; margin: 0 0 12px; }}
  p {{ color: rgba(255,255,255,0.6); font-size: 14px; line-height: 1.6; margin: 0; }}
</style>
</head>
<body>
<div class="card">
  <div class="icon">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"/><polyline points="20 6 9 17 4 12"/>
    </svg>
  </div>
  <h1>Consent granted</h1>
  <p>Thank you. Your child's LinkJoin account has been activated. They can now log in using the credentials provided by their school administrator.</p>
</div>
</body>
</html>"""

_ALREADY_GRANTED_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Already Granted - LinkJoin</title>
<style>
  body {{ margin: 0; background: #142539; display: flex; align-items: center; justify-content: center; min-height: 100vh; font-family: 'Montserrat', sans-serif; }}
  .card {{ background: #1a2f45; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 48px 40px; max-width: 440px; text-align: center; }}
  h1 {{ color: #fff; font-size: 22px; font-weight: 700; margin: 0 0 12px; }}
  p {{ color: rgba(255,255,255,0.6); font-size: 14px; line-height: 1.6; margin: 0; }}
</style>
</head>
<body>
<div class="card">
  <h1>Already activated</h1>
  <p>This account has already been activated. Your child can log in using the credentials provided by their school administrator.</p>
</div>
</body>
</html>"""

_INVALID_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Invalid Link - LinkJoin</title>
<style>
  body {{ margin: 0; background: #142539; display: flex; align-items: center; justify-content: center; min-height: 100vh; font-family: 'Montserrat', sans-serif; }}
  .card {{ background: #1a2f45; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 48px 40px; max-width: 440px; text-align: center; }}
  h1 {{ color: #f87171; font-size: 22px; font-weight: 700; margin: 0 0 12px; }}
  p {{ color: rgba(255,255,255,0.6); font-size: 14px; line-height: 1.6; margin: 0; }}
</style>
</head>
<body>
<div class="card">
  <h1>Invalid or expired link</h1>
  <p>This consent link is invalid or has already been used. Please contact your school administrator to resend the consent email.</p>
</div>
</body>
</html>"""


@router.get("/consent/grant", response_class=HTMLResponse)
async def grant_parental_consent(token: str, request: Request):
    ip = request.client.host if request.client else None

    # Atomic compare-and-swap: only a document still "pending" (not already
    # granted) matches, so two concurrent hits on the same token can't both
    # succeed — the loser falls through to the invalid/already-granted branch.
    user = await motor_db.login.find_one_and_update(
        {"parental_consent.token": token, "parental_consent.status": {"$ne": "granted"}},
        {"$set": {
            "parental_consent.status": "granted",
            "parental_consent.granted_at": datetime.now(timezone.utc),
            "parental_consent.grant_ip": ip,
            "parental_consent.token": None,
        }},
        return_document=ReturnDocument.BEFORE,
    )
    if user is None:
        existing = await motor_db.login.find_one({"parental_consent.token": token})
        if not existing:
            return HTMLResponse(_INVALID_HTML, status_code=400)
        return HTMLResponse(_ALREADY_GRANTED_HTML)

    consent = user.get("parental_consent", {})
    await log_audit(
        user["username"],
        "consent.parental_granted",
        ip=ip,
        detail={"parent_email": consent.get("parent_email")},
    )
    return HTMLResponse(_SUCCESS_HTML)


@router.get("/consent/status/{student_id}")
async def get_consent_status(student_id: str, caller: dict = Depends(get_confirmed_user)):
    role = caller.get("role")
    if role not in ("school_admin", "district_admin"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    student = await motor_db.login.find_one(
        {"user_id": student_id, "org_id": caller.get("org_id")},
        {"parental_consent": 1, "username": 1},
    )
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    consent = student.get("parental_consent")
    if not consent:
        return {"required": False, "status": "not_required"}

    return {
        "required": consent.get("required", False),
        "status": consent.get("status", "not_required"),
        "parent_email": consent.get("parent_email"),
        "granted_at": consent.get("granted_at").isoformat() if consent.get("granted_at") else None,
    }
