import asyncio
import csv
import io
import json
import logging
import re
import secrets
import string
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pymongo.errors import DuplicateKeyError
from fastapi.responses import StreamingResponse
from app.auth import get_confirmed_user
from app.config import get_settings
from app.database import motor_db
from app.email_service import send_email, send_email_batch
from app.routers.classes import _cascade_delete_class_data
from app.utils import configure_data, gen_id, STAFF_HIDDEN_FIELDS
from app.websocket_manager import manager
from app.audit import log_audit
from app.roles import TEACHER_ROLES, require_platform_admin, get_accessible_org_ids, assert_org_seats_available
from argon2 import PasswordHasher

_hasher = PasswordHasher()
_settings = get_settings()

VALID_IMPORT_ROLES = {"school_admin", "district_admin", "teacher", "parent"}


def _gen_temp_password() -> str:
    upper = secrets.choice(string.ascii_uppercase)
    lower = "".join(secrets.choice(string.ascii_lowercase) for _ in range(4))
    digits = "".join(secrets.choice(string.digits) for _ in range(3))
    pw = list(f"Lj{upper}{lower}{digits}!")
    secrets.SystemRandom().shuffle(pw[2:])
    return "".join(pw)


def _welcome_email_html(email: str, org_name: str, role: str, temp_password: str, app_url: str) -> str:
    role_labels = {
        "school_admin": "School Administrator",
        "district_admin": "District Administrator",
        "teacher": "Teacher",
        "parent": "Parent/Guardian",
    }
    role_label = role_labels.get(role, role.title())
    login_url = f"{app_url}/login"
    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#060F1A;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#060F1A;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#0d1a2a;border-radius:12px;border:1px solid rgba(255,255,255,0.08);overflow:hidden;">
        <tr><td style="background:#2b8fd8;padding:20px 32px;">
          <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.3px;">LinkJoin</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="color:#e8edf2;font-size:16px;margin:0 0 8px;">Welcome to {org_name} on LinkJoin.</p>
          <p style="color:rgba(255,255,255,0.5);font-size:13px;margin:0 0 24px;">You have been added as a <strong style="color:#e8edf2;">{role_label}</strong>. Use the credentials below to sign in.</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.04);border-radius:8px;border:1px solid rgba(255,255,255,0.08);margin-bottom:28px;">
            <tr><td style="padding:20px 24px;">
              <div style="margin-bottom:14px;">
                <span style="color:rgba(255,255,255,0.4);font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">Email</span><br>
                <span style="color:#e8edf2;font-size:14px;font-weight:600;">{email}</span>
              </div>
              <div>
                <span style="color:rgba(255,255,255,0.4);font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">Temporary password</span><br>
                <span style="color:#e8edf2;font-size:16px;font-weight:700;letter-spacing:0.05em;font-family:monospace;">{temp_password}</span>
              </div>
            </td></tr>
          </table>
          <p style="color:rgba(255,255,255,0.4);font-size:12px;margin:0 0 20px;">You will be prompted to set a new password on first login.</p>
          <a href="{login_url}" style="display:inline-block;background:#2b8fd8;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;">Sign in to LinkJoin</a>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid rgba(255,255,255,0.06);">
          <p style="color:rgba(255,255,255,0.3);font-size:12px;margin:0;">LinkJoin - School meeting management</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""

def _consent_email_html(student_name: str, org_name: str, grant_url: str) -> str:
    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#060F1A;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#060F1A;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#0d1a2a;border-radius:12px;border:1px solid rgba(255,255,255,0.08);overflow:hidden;">
        <tr><td style="background:#2b8fd8;padding:20px 32px;">
          <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.3px;">LinkJoin</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="color:#e8edf2;font-size:16px;margin:0 0 8px;">Parental consent required</p>
          <p style="color:rgba(255,255,255,0.5);font-size:13px;margin:0 0 24px;">
            <strong style="color:#e8edf2;">{org_name}</strong> has added <strong style="color:#e8edf2;">{student_name}</strong> to LinkJoin, a school meeting management platform. Because this student is under 13, we require your consent before activating their account.
          </p>
          <p style="color:rgba(255,255,255,0.5);font-size:13px;margin:0 0 24px;">
            LinkJoin is used by teachers to manage class meeting links and track attendance. Student data is stored exclusively in the United States and is never sold or used for advertising.
          </p>
          <a href="{grant_url}" style="display:inline-block;background:#2b8fd8;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;margin-bottom:24px;">I consent - activate account</a>
          <p style="color:rgba(255,255,255,0.3);font-size:12px;margin:0 0 8px;">This link is single-use. If you did not expect this email, contact your school administrator.</p>
          <p style="color:rgba(255,255,255,0.3);font-size:12px;margin:0;">
            <a href="https://linkjoin.xyz/dpa" style="color:rgba(43,143,216,0.7);">Data Processing Agreement</a> &middot;
            <a href="https://linkjoin.xyz/privacy-schools" style="color:rgba(43,143,216,0.7);">School Privacy Policy</a>
          </p>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid rgba(255,255,255,0.06);">
          <p style="color:rgba(255,255,255,0.3);font-size:12px;margin:0;">LinkJoin - School meeting management</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


def _mask_email(email: str) -> str:
    if not email or "@" not in email:
        return "***"
    local, domain = email.split("@", 1)
    return local[:2] + "***@" + domain


def _mask_ip(ip: str | None) -> str | None:
    if not ip:
        return None
    parts = ip.split(".")
    if len(parts) >= 2:
        return ".".join(parts[:2]) + ".x.x"
    return "x.x"


log = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


# org_name is derived from the email domain (auth.register sets it to
# email.split("@")[1]), so scoping a bulk write by it means a platform admin on a
# consumer mailbox would disable every unrelated user sharing that domain.
_PUBLIC_EMAIL_DOMAINS = {
    "gmail.com", "googlemail.com", "yahoo.com", "hotmail.com", "outlook.com",
    "live.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com",
}


@router.post("/disable-all")
async def disable_all(body: dict, user: dict = Depends(get_confirmed_user)):
    require_platform_admin(user)
    disable = str(body.get("disable", "true")).lower()

    # Prefer org_id: it is the real tenant key. org_name is only a fallback for
    # legacy accounts that predate org_id, and is refused outright for consumer
    # domains, where the blast radius is "everyone on gmail".
    org_id = user.get("org_id")
    if org_id:
        query = {"org_id": org_id}
        scope = {"org_id": org_id}
    else:
        org = (user.get("org_name") or "").strip().lower()
        if not org or org in _PUBLIC_EMAIL_DOMAINS:
            raise HTTPException(
                status_code=422,
                detail="Your account has no organization to scope this to.",
            )
        query = {"org_name": org}
        scope = {"org_name": org}

    async for org_user in motor_db.login.find(query):
        await motor_db.login.update_one(
            {"username": org_user["username"]}, {"$set": {"org_disabled": disable}}
        )
        await manager.broadcast(await configure_data(org_user["username"]), org_user["username"])

    await log_audit(user["username"], "admin.disable_all", detail={"disable": disable, **scope})
    return {"message": "Updated"}


@router.get("/org-disabled")
async def org_disabled(user: dict = Depends(get_confirmed_user)):
    return {"disabled": user.get("org_disabled")}


@router.post("/view")
async def toggle_admin_view(body: dict, user: dict = Depends(get_confirmed_user)):
    require_platform_admin(user)
    value = str(body.get("admin_view", "false")).lower()
    await motor_db.login.update_one({"username": user["username"]}, {"$set": {"admin_view": value}})
    await log_audit(user["username"], "admin.toggle_view", detail={"admin_view": value})
    return {"message": "Updated"}


@router.patch("/users/{user_id}/role")
async def set_user_role(user_id: str, body: dict, user: dict = Depends(get_confirmed_user)):
    require_platform_admin(user)
    account_type = body.get("account_type")
    role = body.get("role")
    org_id = body.get("org_id")

    if account_type not in ("personal", "institutional"):
        raise HTTPException(status_code=422, detail="account_type must be 'personal' or 'institutional'")
    if account_type == "institutional":
        if role not in ("student", "teacher", "school_admin", "district_admin"):
            raise HTTPException(status_code=422, detail="Invalid role")
        if not org_id:
            raise HTTPException(status_code=422, detail="org_id required for institutional users")

    updates: dict = {"account_type": account_type}
    if account_type == "institutional":
        updates["role"] = role
        updates["org_id"] = org_id
    else:
        updates["role"] = None
        updates["org_id"] = None

    target = await motor_db.login.find_one({"user_id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    await motor_db.login.update_one({"user_id": user_id}, {"$set": updates})
    await log_audit(user["username"], "admin.set_role", detail={"target_user_id": user_id, **updates})
    return {"message": "Role updated"}


# Declared before /orgs/{org_id}: FastAPI matches routes in declaration
# order, so a later literal path is swallowed by the parameterized one
# ("pending" arrives as an org_id and 404s "Org not found").
@router.get("/orgs/pending")
async def list_pending_orgs(user: dict = Depends(get_confirmed_user)):
    """Self-serve orgs awaiting verification. Seat-capped and on trial
    entitlement until approved via PATCH /admin/orgs/{org_id}/verify."""
    require_platform_admin(user)
    orgs = await motor_db.orgs.find(
        {"verification_status": "pending"}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    for org in orgs:
        org["member_count"] = await motor_db.login.count_documents({"org_id": org["org_id"]})
    return orgs


@router.get("/orgs/{org_id}")
async def get_org_detail(org_id: str, user: dict = Depends(get_confirmed_user)):
    require_platform_admin(user)
    org = await motor_db.orgs.find_one({"org_id": org_id}, {"_id": 0})
    if not org:
        raise HTTPException(status_code=404, detail="Org not found")
    members = []
    async for u in motor_db.login.find({"org_id": org_id}, STAFF_HIDDEN_FIELDS):
        members.append(u)
    return {**org, "members": members}


@router.patch("/orgs/{org_id}")
async def update_org_detail(org_id: str, body: dict, user: dict = Depends(get_confirmed_user)):
    require_platform_admin(user)
    org = await motor_db.orgs.find_one({"org_id": org_id}, {"_id": 0, "org_id": 1})
    if not org:
        raise HTTPException(status_code=404, detail="Org not found")
    allowed = {"name", "type", "address", "city", "state", "zip_code", "website",
               "phone", "timezone", "grade_levels", "school_year_start", "school_year_end", "parent_org_id"}
    updates = {k: v for k, v in body.items() if k in allowed}
    if not updates:
        return {"message": "Nothing to update"}
    if updates.get("parent_org_id"):
        parent = await motor_db.orgs.find_one({"org_id": updates["parent_org_id"]}, {"type": 1})
        if not parent or parent.get("type") != "district":
            raise HTTPException(status_code=422, detail="parent_org_id must reference an existing district org")
    await motor_db.orgs.update_one({"org_id": org_id}, {"$set": updates})
    await log_audit(user["username"], "admin.update_org", detail={"org_id": org_id, "fields": list(updates.keys())})
    return {"message": "Updated"}


# Gmail throttles rapid authenticated connections and caps daily volume, so a
# roster import is chunked rather than fired as one unbounded run.
_EMAIL_BATCH_SIZE = 50


async def _send_batch_and_record(messages: list[dict], org_id: str, kind: str) -> None:
    """Send onboarding mail in batches and record what actually happened.

    Replaces one add_task(send_email) per member, which opened a fresh TLS
    handshake and AUTH to Gmail for every single recipient. Failures used to be
    a log line only; since the welcome email carries the temp password, a
    dropped send meant that person could never log in and nobody knew.
    """
    if not messages:
        return
    for start in range(0, len(messages), _EMAIL_BATCH_SIZE):
        chunk = messages[start:start + _EMAIL_BATCH_SIZE]
        result = await asyncio.to_thread(send_email_batch, chunk)
        failed = set(result.get("failed") or [])
        now = datetime.now(timezone.utc)
        rows = [{
            "org_id": org_id,
            "kind": kind,
            "to": m["to"],
            "subject": m["subject"],
            "status": "failed" if m["to"] in failed else "sent",
            "created_at": now,
        } for m in chunk]
        try:
            await motor_db.email_deliveries.insert_many(rows)
        except Exception:
            log.exception("[email] could not record delivery outcomes for org %s", org_id)
        if failed:
            log.error("[email] %d/%d %s emails failed for org %s",
                      len(failed), len(chunk), kind, org_id)


def _require_org_admin_access(user: dict, org_id: str) -> bool:
    """Platform admin, or an admin of THIS org. Returns whether it was the former.

    Scoped to the caller's own org_id rather than the path parameter, so the URL
    is never the authority on which roster you may touch. Callers need the
    return value: an org admin is additionally restricted to their own hierarchy
    further down (get_accessible_org_ids), while a platform admin is not.
    """
    is_platform_admin = user.get("admin") == "true"
    is_own_org_admin = (
        user.get("role") in {"school_admin", "district_admin"} and user.get("org_id") == org_id
    )
    if not is_platform_admin and not is_own_org_admin:
        raise HTTPException(status_code=403, detail="Access denied")
    return is_platform_admin


@router.get("/leads")
async def list_leads(user: dict = Depends(get_confirmed_user), limit: int = Query(100, le=500)):
    """Demo/contact submissions. These are the entire inbound org pipeline, and
    used to exist only as an email to one inbox — visible here so a filtered or
    failed notification does not mean a lost lead (emailed:false flags those)."""
    require_platform_admin(user)
    rows = await motor_db.leads.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return rows


@router.get("/orgs/{org_id}/email-failures")
async def list_email_failures(org_id: str, user: dict = Depends(get_confirmed_user)):
    """Onboarding emails that never landed.

    A welcome email is the only copy of a member's temp password, so a failed
    send is an account nobody can get into. Surfaced per-org so an admin can see
    and retry it instead of discovering it as a support ticket.
    """
    _require_org_admin_access(user, org_id)
    rows = await motor_db.email_deliveries.find(
        {"org_id": org_id, "status": "failed"}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    return rows


@router.post("/orgs/{org_id}/resend-welcome")
async def resend_welcome(org_id: str, body: dict, background_tasks: BackgroundTasks,
                         user: dict = Depends(get_confirmed_user)):
    """Reissue a temp password and resend the welcome email to one member.

    The original password was hashed on write and only ever existed in the email
    that failed, so recovery means minting a new one rather than resending the
    old message.
    """
    _require_org_admin_access(user, org_id)
    email = (body.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=422, detail="email is required")
    member = await motor_db.login.find_one({"username": email, "org_id": org_id})
    if not member:
        raise HTTPException(status_code=404, detail="No such member in this organization")

    org = await motor_db.orgs.find_one({"org_id": org_id}, {"name": 1})
    org_name = (org or {}).get("name", "your school")
    temp_pw = _gen_temp_password()
    await motor_db.login.update_one(
        {"username": email},
        {"$set": {"password": _hasher.hash(temp_pw), "must_change_password": True}},
    )
    html = _welcome_email_html(email, org_name, member.get("role", "teacher"), temp_pw, _settings.frontend_url)
    background_tasks.add_task(
        _send_batch_and_record,
        [{"html_content": html, "subject": f"Welcome to {org_name} on LinkJoin", "to": email}],
        org_id, "welcome_resend",
    )
    await log_audit(user["username"], "admin.resend_welcome", detail={"email": email, "org_id": org_id})
    return {"message": "Resending"}


@router.patch("/orgs/{org_id}/verify")
async def verify_org(org_id: str, user: dict = Depends(get_confirmed_user)):
    """Approve a self-serve org: lifts the seat cap and the entitlement gate.

    Both gates read a denormalized flag rather than joining on every request:
    verification_status on the org (seats) and org_verified on each member
    (roles.is_premium). So both have to be written here.
    """
    require_platform_admin(user)
    org = await motor_db.orgs.find_one({"org_id": org_id}, {"_id": 0, "org_id": 1, "name": 1})
    if not org:
        raise HTTPException(status_code=404, detail="Org not found")

    await motor_db.orgs.update_one(
        {"org_id": org_id},
        {"$set": {
            "verification_status": "verified",
            "verified_at": datetime.now(timezone.utc),
            "verified_by": user["username"],
        }},
    )
    result = await motor_db.login.update_many(
        {"org_id": org_id}, {"$set": {"org_verified": True}}
    )
    await log_audit(
        user["username"], "admin.verify_org",
        detail={"org_id": org_id, "members_updated": result.modified_count},
    )
    return {"message": "Verified", "members_updated": result.modified_count}


@router.patch("/orgs/{org_id}/members/{user_id}/role")
async def update_member_role(org_id: str, user_id: str, body: dict, user: dict = Depends(get_confirmed_user)):
    require_platform_admin(user)
    role = body.get("role")
    if role not in ("student", "teacher", "school_admin", "district_admin"):
        raise HTTPException(status_code=422, detail="Invalid role")
    target = await motor_db.login.find_one({"user_id": user_id, "org_id": org_id})
    if not target:
        raise HTTPException(status_code=404, detail="Member not found in this org")
    await motor_db.login.update_one({"user_id": user_id}, {"$set": {"role": role}})
    await log_audit(user["username"], "admin.update_member_role", detail={"org_id": org_id, "target_user_id": user_id, "role": role})
    return {"message": "Updated"}


@router.delete("/orgs/{org_id}/members/{user_id}")
async def remove_member(org_id: str, user_id: str, user: dict = Depends(get_confirmed_user)):
    require_platform_admin(user)
    target = await motor_db.login.find_one({"user_id": user_id, "org_id": org_id})
    if not target:
        raise HTTPException(status_code=404, detail="Member not found in this org")
    await motor_db.login.update_one(
        {"user_id": user_id},
        {"$set": {"account_type": "personal", "role": None, "org_id": None}},
    )
    await log_audit(user["username"], "admin.remove_member", detail={"org_id": org_id, "target_user_id": user_id})
    return {"message": "Removed"}


@router.get("/orgs")
async def list_all_orgs(user: dict = Depends(get_confirmed_user)):
    require_platform_admin(user)
    orgs = []
    async for org in motor_db.orgs.find({}, {"_id": 0}):
        orgs.append(org)
    return orgs


@router.get("/users/search")
async def search_users(q: str = "", user: dict = Depends(get_confirmed_user)):
    require_platform_admin(user)
    q = q.strip()
    results = []
    if q:
        query: dict = {"username": {"$regex": re.escape(q), "$options": "i"}}
        async for u in motor_db.login.find(query, STAFF_HIDDEN_FIELDS).limit(20):
            results.append(u)
    else:
        async for u in motor_db.login.find({}, STAFF_HIDDEN_FIELDS).sort("created_at", -1).limit(20):
            results.append(u)
    await log_audit(user["username"], "admin.search_users", detail={"query": q})
    return results


@router.delete("/orgs/{org_id}", status_code=204)
async def delete_org(org_id: str, user: dict = Depends(get_confirmed_user)):
    require_platform_admin(user)
    org = await motor_db.orgs.find_one({"org_id": org_id})
    if not org:
        raise HTTPException(status_code=404, detail="Org not found")
    class_ids = [c["class_id"] async for c in motor_db.classes.find({"org_id": org_id}, {"class_id": 1})]
    await _cascade_delete_class_data(class_ids)
    await motor_db.classes.delete_many({"org_id": org_id})
    await motor_db.parent_links.delete_many({"org_id": org_id})
    await motor_db.orgs.delete_one({"org_id": org_id})
    await motor_db.login.update_many(
        {"org_id": org_id},
        {"$set": {"account_type": "personal", "role": None, "org_id": None}},
    )
    await log_audit(user["username"], "admin.delete_org", detail={"org_id": org_id, "org_name": org.get("name")})


@router.post("/create-admin-account", status_code=201)
async def create_admin_account(body: dict, background_tasks: BackgroundTasks, user: dict = Depends(get_confirmed_user)):
    require_platform_admin(user)
    email = (body.get("email") or "").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=422, detail="Valid email required")
    existing = await motor_db.login.find_one({"username": email})
    if existing:
        raise HTTPException(status_code=409, detail="An account with that email already exists")
    temp_pw = _gen_temp_password()
    # The find_one above is a check, not a lock: a second create for the same
    # email can slip between it and this insert. The unique index on
    # login.username then rejects the loser, and rather than 500 we ask the admin
    # to retry — by then the find_one guard will see the account and 409 cleanly.
    try:
        await motor_db.login.insert_one({
            "username": email,
            "password": _hasher.hash(temp_pw),
            "user_id": gen_id(),
            "account_type": "institutional",
            "role": "school_admin",
            "org_id": None,
            "confirmed": "true",
            "must_change_password": True,
            "onboarding_done": False,
            "created_at": datetime.now(timezone.utc),
        })
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="That email was just registered. Please try again.")
    login_url = f"{_settings.frontend_url}/login"
    html = f"""
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0c1e32;padding:40px 32px;border-radius:12px">
  <img src="https://linkjoin.xyz/images/logo-text.png" alt="LinkJoin" style="height:32px;margin-bottom:28px" />
  <h2 style="color:#fff;font-size:20px;margin:0 0 12px">Welcome to LinkJoin</h2>
  <p style="color:rgba(255,255,255,0.6);font-size:14px;margin:0 0 24px">
    A LinkJoin administrator account has been created for you. Log in to set up your school.
  </p>
  <div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:16px 20px;margin-bottom:24px">
    <p style="color:rgba(255,255,255,0.5);font-size:12px;margin:0 0 4px;text-transform:uppercase;letter-spacing:.06em">Email</p>
    <p style="color:#fff;font-size:15px;font-weight:600;margin:0 0 14px">{email}</p>
    <p style="color:rgba(255,255,255,0.5);font-size:12px;margin:0 0 4px;text-transform:uppercase;letter-spacing:.06em">Temporary password</p>
    <p style="color:#fff;font-size:15px;font-weight:600;margin:0;font-family:monospace;letter-spacing:.08em">{temp_pw}</p>
  </div>
  <p style="color:rgba(255,255,255,0.5);font-size:13px;margin:0 0 24px">You will be asked to set a permanent password and configure your school when you first log in.</p>
  <a href="{login_url}" style="display:inline-block;background:#2B8FD8;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px">Log in to LinkJoin</a>
</div>"""
    background_tasks.add_task(send_email, html, "Welcome to LinkJoin", email)
    await log_audit(user["username"], "admin.create_admin_account", detail={"email": email})
    return {"ok": True, "email": email}


VALID_STAFF_ROLES = {"teacher", "school_admin", "district_admin"}

@router.post("/orgs/{org_id}/import-staff")
async def import_staff(
    org_id: str,
    body: dict,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_confirmed_user),
):
    is_platform_admin = _require_org_admin_access(user, org_id)

    org = await motor_db.orgs.find_one({"org_id": org_id})
    if not org:
        raise HTTPException(status_code=404, detail="Org not found")
    org_name = org.get("name", "your school")
    app_url = _settings.frontend_url

    rows = body.get("rows", [])
    if not rows or not isinstance(rows, list):
        raise HTTPException(status_code=422, detail="rows must be a non-empty list")
    await assert_org_seats_available(org_id, adding=len(rows))

    # A non-platform admin may only rewrite accounts that are already inside their
    # own org hierarchy. Without this, the update branch below reassigns role/org_id
    # keyed on nothing but an attacker-supplied email, which let any school admin
    # pull an arbitrary account (any org, any role) into their own org and then read
    # it through /orgs/{id}/members and /users/student/{id}.
    accessible_org_ids = None if is_platform_admin else await get_accessible_org_ids(user)

    results = []
    pending_emails: list[dict] = []
    for row in rows:
        email = (row.get("email") or "").strip().lower()
        role = (row.get("role") or "teacher").strip()
        first_name = (row.get("first_name") or "").strip()
        last_name = (row.get("last_name") or "").strip()

        if not email or "@" not in email:
            results.append({"email": email or "(blank)", "status": "error", "error": "Invalid email"})
            continue
        if role not in VALID_STAFF_ROLES:
            results.append({"email": email, "status": "error", "error": f"Invalid role '{role}'"})
            continue

        existing = await motor_db.login.find_one({"username": email})
        if existing:
            # Onboarding someone who already has an account is legitimate only when
            # they are already in this admin's hierarchy. An unaffiliated or
            # other-org account has to consent via the teacher invite flow
            # (POST /invites, type "teacher"), which mails them a link.
            if accessible_org_ids is not None and existing.get("org_id") not in accessible_org_ids:
                results.append({
                    "email": email,
                    "status": "error",
                    "error": "An account with that email exists outside your organization. Send an invite instead.",
                })
                continue
            await motor_db.login.update_one(
                {"username": email},
                {"$set": {"role": role, "org_id": org_id, "account_type": "institutional"}}
            )
            results.append({"email": email, "status": "updated"})
            await log_audit(user["username"], "admin.import_staff_updated", detail={"email": email, "role": role, "org_id": org_id})
            continue

        temp_pw = _gen_temp_password()
        new_user: dict = {
            "username": email,
            "password": _hasher.hash(temp_pw),
            "user_id": gen_id(),
            "account_type": "institutional",
            "role": role,
            "org_id": org_id,
            "org_name": org_name,
            "first_name": first_name,
            "last_name": last_name,
            "confirmed": "true",
            "must_change_password": True,
            "onboarding_done": False,
            "created_at": datetime.now(timezone.utc),
        }
        try:
            await motor_db.login.insert_one(new_user)
        except DuplicateKeyError:
            results.append({"email": email, "status": "error",
                            "error": "Created by another request. Please retry this row."})
            continue
        html = _welcome_email_html(email, org_name, role, temp_pw, app_url)
        pending_emails.append({
            "html_content": html,
            "subject": f"Welcome to {org_name} on LinkJoin",
            "to": email,
        })
        results.append({"email": email, "status": "created"})
        await log_audit(user["username"], "admin.import_staff_created", detail={"email": email, "role": role, "org_id": org_id})

    background_tasks.add_task(_send_batch_and_record, pending_emails, org_id, "welcome_staff")
    return {"results": results}


@router.post("/orgs/{org_id}/import")
async def import_org_members(
    org_id: str,
    body: dict,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_confirmed_user),
):
    # Was platform-admin only, which put LinkJoin staff on the critical path for
    # every school's roster. Now matches import-staff/import-parents: an admin
    # of this org may import into it. The FERPA School Official notice is shown
    # during onboarding (AdminOnboarding Step1).
    _require_org_admin_access(user, org_id)
    org = await motor_db.orgs.find_one({"org_id": org_id})
    if not org:
        raise HTTPException(status_code=404, detail="Org not found")
    org_name = org.get("name", "your school")

    rows = body.get("rows", [])
    if not rows or not isinstance(rows, list):
        raise HTTPException(status_code=422, detail="rows must be a non-empty list")
    await assert_org_seats_available(org_id, adding=len(rows))

    app_url = _settings.frontend_url
    results = []
    pending_emails: list[dict] = []
    for row in rows:
        email = (row.get("email") or "").strip().lower()
        role = (row.get("role") or "").strip()
        first_name = (row.get("first_name") or "").strip()
        last_name = (row.get("last_name") or "").strip()
        parent_email = (row.get("parent_email") or "").strip().lower()
        requires_consent = (row.get("requires_consent") or "").strip().lower() == "yes"

        if not email or "@" not in email:
            results.append({"email": email or "(blank)", "status": "error", "error": "Invalid email"})
            continue
        if role not in VALID_IMPORT_ROLES:
            results.append({"email": email, "status": "error", "error": f"Invalid role '{role}'"})
            continue

        consent_needed = requires_consent and parent_email and "@" in parent_email

        existing = await motor_db.login.find_one({"username": email}, {"_id": 0, "user_id": 1})
        if existing:
            update: dict = {"$set": {"role": role, "org_id": org_id, "account_type": "institutional"}}
            if consent_needed:
                consent_token = secrets.token_urlsafe(32)
                update["$set"]["parental_consent"] = {
                    "required": True,
                    "status": "pending",
                    "parent_email": parent_email,
                    "token": consent_token,
                    "granted_at": None,
                    "grant_ip": None,
                }
                grant_url = f"{app_url}/consent/grant?token={consent_token}"
                student_name = f"{first_name} {last_name}".strip() or email
                consent_html = _consent_email_html(student_name, org_name, grant_url)
                pending_emails.append({
                    "html_content": consent_html,
                    "subject": f"Parental consent required for {org_name} on LinkJoin",
                    "to": parent_email,
                })
                await log_audit(user["username"], "consent.parental_required", detail={"email": email, "parent_email": parent_email, "org_id": org_id})
            await motor_db.login.update_one({"username": email}, update)
            results.append({"email": email, "status": "updated"})
            await log_audit(user["username"], "admin.import_member_updated", detail={"email": email, "role": role, "org_id": org_id})
            continue

        temp_pw = _gen_temp_password()
        hashed = _hasher.hash(temp_pw)
        new_user: dict = {
            "username": email,
            "password": hashed,
            "user_id": gen_id(),
            "account_type": "institutional",
            "role": role,
            "org_id": org_id,
            "org_name": org_name,
            "first_name": first_name,
            "last_name": last_name,
            "confirmed": "true",
            "must_change_password": True,
            "created_at": datetime.now(timezone.utc),
            "tutorial": "true",
            "popup_check_done": "false",
            "offset": 0,
            "notes": "",
        }
        if consent_needed:
            consent_token = secrets.token_urlsafe(32)
            new_user["parental_consent"] = {
                "required": True,
                "status": "pending",
                "parent_email": parent_email,
                "token": consent_token,
                "granted_at": None,
                "grant_ip": None,
            }
        try:
            await motor_db.login.insert_one(new_user)
        except DuplicateKeyError:
            # Raced with a concurrent import/signup after the find_one guard above.
            # Flag the row so the admin can retry it rather than aborting the batch.
            results.append({"email": email, "status": "error",
                            "error": "Created by another request. Please retry this row."})
            continue
        await log_audit(user["username"], "admin.import_member_created", detail={"email": email, "role": role, "org_id": org_id})

        html = _welcome_email_html(email, org_name, role, temp_pw, app_url)
        pending_emails.append({
            "html_content": html,
            "subject": f"Welcome to {org_name} on LinkJoin",
            "to": email,
        })

        if consent_needed:
            grant_url = f"{app_url}/consent/grant?token={new_user['parental_consent']['token']}"
            student_name = f"{first_name} {last_name}".strip() or email
            consent_html = _consent_email_html(student_name, org_name, grant_url)
            pending_emails.append({
                "html_content": consent_html,
                "subject": f"Parental consent required for {org_name} on LinkJoin",
                "to": parent_email,
            })
            await log_audit(user["username"], "consent.parental_required", detail={"email": email, "parent_email": parent_email, "org_id": org_id})

        results.append({"email": email, "status": "created"})

    background_tasks.add_task(_send_batch_and_record, pending_emails, org_id, "welcome_member")
    return {"results": results}


@router.post("/orgs/{org_id}/import-parents")
async def import_org_parents(
    org_id: str,
    body: dict,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_confirmed_user),
):
    is_platform_admin = _require_org_admin_access(user, org_id)
    org = await motor_db.orgs.find_one({"org_id": org_id})
    if not org:
        raise HTTPException(status_code=404, detail="Org not found")
    org_name = org.get("name", "your school")

    rows = body.get("rows", [])
    if not rows or not isinstance(rows, list):
        raise HTTPException(status_code=422, detail="rows must be a non-empty list")
    await assert_org_seats_available(org_id, adding=len(rows))

    app_url = _settings.frontend_url

    # parent_links is the *sole* authorization check the parent portal performs
    # (routers/parent.py:_parent_student_ids does no org check at all), so a link
    # written here hands over that student's roster, attendance, and rates in full.
    # Both sides of the link must therefore be inside the caller's own hierarchy.
    accessible_org_ids = None if is_platform_admin else await get_accessible_org_ids(user)

    results = []
    pending_emails: list[dict] = []
    for row in rows:
        parent_email = (row.get("parent_email") or "").strip().lower()
        student_email = (row.get("student_email") or "").strip().lower()

        if not parent_email or "@" not in parent_email or not student_email or "@" not in student_email:
            results.append({"parent_email": parent_email or "(blank)", "student_email": student_email or "(blank)", "status": "error", "error": "Invalid email"})
            continue

        student = await motor_db.login.find_one({"username": student_email}, {"user_id": 1, "org_id": 1, "_id": 0})
        if not student:
            results.append({"parent_email": parent_email, "student_email": student_email, "status": "error", "error": "Student not found"})
            continue
        # Deliberately the same message as "not found": an admin who may not see
        # this student should not learn whether the address exists on the platform.
        if accessible_org_ids is not None and student.get("org_id") not in accessible_org_ids:
            results.append({"parent_email": parent_email, "student_email": student_email, "status": "error", "error": "Student not found"})
            continue
        student_user_id = student["user_id"]

        existing_parent = await motor_db.login.find_one({"username": parent_email}, {"user_id": 1, "org_id": 1, "_id": 0})
        if existing_parent and accessible_org_ids is not None and existing_parent.get("org_id") not in accessible_org_ids:
            # Refuse to convert an unaffiliated or other-org account into a parent
            # of this org; that is an account takeover keyed on an email address.
            results.append({
                "parent_email": parent_email,
                "student_email": student_email,
                "status": "error",
                "error": "An account with that parent email exists outside your organization.",
            })
            continue
        if not existing_parent:
            temp_pw = _gen_temp_password()
            parent_user_id = gen_id()
            try:
                await motor_db.login.insert_one({
                    "username": parent_email,
                    "password": _hasher.hash(temp_pw),
                    "user_id": parent_user_id,
                    "account_type": "institutional",
                    "role": "parent",
                    "org_id": org_id,
                    "confirmed": "true",
                    "must_change_password": True,
                    "created_at": datetime.now(timezone.utc),
                    "onboarding_done": True,
                    "popup_check_done": "false",
                    "offset": 0,
                    "notes": "",
                })
            except DuplicateKeyError:
                results.append({
                    "parent_email": parent_email,
                    "student_email": student_email,
                    "status": "error",
                    "error": "Created by another request. Please retry this row.",
                })
                continue
            html = _welcome_email_html(parent_email, org_name, "parent", temp_pw, app_url)
            pending_emails.append({
                "html_content": html,
                "subject": f"Welcome to {org_name} on LinkJoin - Parent Portal",
                "to": parent_email,
            })
            status = "created"
        else:
            parent_user_id = existing_parent["user_id"]
            await motor_db.login.update_one(
                {"username": parent_email},
                {"$set": {"role": "parent", "org_id": org_id}},
            )
            status = "updated"

        existing_link = await motor_db.parent_links.find_one({
            "parent_user_id": parent_user_id,
            "student_user_id": student_user_id,
        })
        if not existing_link:
            await motor_db.parent_links.insert_one({
                "link_id": gen_id(),
                "parent_user_id": parent_user_id,
                "student_user_id": student_user_id,
                "org_id": org_id,
                "linked_at": datetime.now(timezone.utc),
                "linked_by": user["username"],
            })

        await log_audit(user["username"], "admin.import_parent", detail={"parent_email": parent_email, "student_email": student_email, "org_id": org_id})
        results.append({"parent_email": parent_email, "student_email": student_email, "status": status})

    background_tasks.add_task(_send_batch_and_record, pending_emails, org_id, "welcome_parent")
    return {"results": results}


@router.get("/orgs/{org_id}/classes")
async def get_org_classes(org_id: str, user: dict = Depends(get_confirmed_user)):
    require_platform_admin(user)
    classes = []
    async for cls in motor_db.classes.find({"org_id": org_id}, {"_id": 0}):
        classes.append(dict(cls))
    class_ids = [c["class_id"] for c in classes]
    join_tokens: dict = {}
    if class_ids:
        async for inv in motor_db.invites.find(
            {"class_id": {"$in": class_ids}, "type": "student_class", "status": "pending"},
            {"_id": 0, "class_id": 1, "token": 1},
        ):
            join_tokens[inv["class_id"]] = inv["token"]
    for cls in classes:
        cls["join_token"] = join_tokens.get(cls["class_id"])
    return classes


@router.get("/analytics")
async def get_analytics(user: dict = Depends(get_confirmed_user)):
    require_platform_admin(user)
    now = datetime.now(timezone.utc)

    # Last 6 YYYY-MM labels
    months = []
    y, m = now.year, now.month
    for _ in range(6):
        months.append(f"{y}-{m:02d}")
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    months.reverse()

    # Live totals
    total_users = await motor_db.login.count_documents({})
    institutional = await motor_db.login.count_documents({"account_type": "institutional"})
    total_orgs = await motor_db.orgs.count_documents({})

    role_counts: dict = {}
    for role in ("student", "teacher", "school_admin", "district_admin"):
        role_counts[role] = await motor_db.login.count_documents({"role": role})
    role_counts["personal"] = await motor_db.login.count_documents({"account_type": "personal"})

    org_by_type: dict = {}
    for t in ("school", "district"):
        org_by_type[t] = await motor_db.orgs.count_documents({"type": t})

    # Invite funnel
    total_invites = await motor_db.invites.count_documents({})
    accepted_invites = await motor_db.invites.count_documents({"status": "accepted"})
    pending_invites = await motor_db.invites.count_documents({"status": "pending"})
    rescinded_invites = await motor_db.invites.count_documents({"status": {"$in": ["rescinded", "revoked"]}})
    expired_invites = await motor_db.invites.count_documents({"status": "expired"})
    invite_by_type: dict = {}
    for t in ("school_admin", "teacher", "student_class"):
        invite_by_type[t] = await motor_db.invites.count_documents({"type": t})

    # Monthly signups from new analytics_events collection
    monthly: dict = {}
    async for doc in motor_db.analytics_events.aggregate([
        {"$match": {"event": "signup", "ym": {"$in": months}}},
        {"$group": {"_id": "$ym", "count": {"$sum": 1}}},
    ]):
        monthly[doc["_id"]] = doc["count"]

    # Fallback: derive from audit_logs if analytics_events has no data yet
    if not any(monthly.values()):
        cutoff = datetime(now.year - 1, 1, 1, tzinfo=timezone.utc)
        async for doc in motor_db.audit_logs.aggregate([
            {"$match": {"action": "auth.register", "ts": {"$gte": cutoff}}},
            {"$group": {"_id": {"$dateToString": {"format": "%Y-%m", "date": "$ts"}}, "count": {"$sum": 1}}},
        ]):
            if doc["_id"] in months:
                monthly[doc["_id"]] = doc["count"]

    monthly_signups = [{"ym": mo, "count": monthly.get(mo, 0)} for mo in months]

    # Last-30-day activity counts from analytics_events
    thirty_days_ago = now - timedelta(days=30)

    async def event_stats(event: str) -> dict:
        pipeline = [
            {"$match": {"event": event, "ts": {"$gte": thirty_days_ago}}},
            {"$group": {"_id": None, "count": {"$sum": 1}, "users": {"$addToSet": "$user_id"}}},
        ]
        docs = await motor_db.analytics_events.aggregate(pipeline).to_list(1)
        if not docs:
            return {"count": 0, "unique_users": 0}
        return {"count": docs[0]["count"], "unique_users": len([u for u in docs[0]["users"] if u])}

    stats = await asyncio.gather(
        event_stats("login"),
        event_stats("signup"),
        event_stats("link_open"),
        event_stats("link_create"),
        event_stats("link_share"),
    )
    logins_30d, signups_30d, link_opens_30d, link_creates_30d, link_shares_30d = stats

    # Recent audit log
    recent_audit = []
    async for entry in motor_db.audit_logs.find(
        {}, {"_id": 0, "ts": 1, "user": 1, "action": 1}
    ).sort("ts", -1).limit(15):
        ts = entry.get("ts")
        entry["ts"] = ts.isoformat() if hasattr(ts, "isoformat") else str(ts)
        recent_audit.append(entry)

    return {
        "users": {"total": total_users, "institutional": institutional, "by_role": role_counts},
        "orgs": {"total": total_orgs, "by_type": org_by_type},
        "invites": {
            "total": total_invites,
            "accepted": accepted_invites,
            "pending": pending_invites,
            "rescinded": rescinded_invites,
            "expired": expired_invites,
            "acceptance_rate": round(accepted_invites / total_invites * 100) if total_invites else 0,
            "by_type": invite_by_type,
        },
        "monthly_signups": monthly_signups,
        "last_30d": {
            "logins":       logins_30d,
            "signups":      signups_30d,
            "link_opens":   link_opens_30d,
            "link_creates": link_creates_30d,
            "link_shares":  link_shares_30d,
        },
        "recent_audit": recent_audit,
    }


@router.patch("/users/{user_id}/platform-admin")
async def set_platform_admin(user_id: str, body: dict, user: dict = Depends(get_confirmed_user)):
    require_platform_admin(user)
    enabled = body.get("enabled", False)
    target = await motor_db.login.find_one({"user_id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    await motor_db.login.update_one(
        {"user_id": user_id},
        {"$set": {"admin": "true" if enabled else "false"}},
    )
    await log_audit(user["username"], "admin.set_platform_admin", detail={"target_user_id": user_id, "enabled": enabled})
    return {"message": "Updated"}


@router.post("/orgs/{org_id}/resend-consent")
async def resend_consent_email(
    org_id: str,
    body: dict,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_confirmed_user),
):
    role = user.get("role")
    if role not in ("school_admin", "district_admin") and user.get("admin") != "true":
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    if user.get("admin") != "true" and org_id not in await get_accessible_org_ids(user):
        raise HTTPException(status_code=403, detail="Org mismatch")

    student_id = body.get("student_id")
    if not student_id:
        raise HTTPException(status_code=422, detail="student_id required")

    student = await motor_db.login.find_one({"user_id": student_id, "org_id": org_id})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    consent = student.get("parental_consent")
    if not consent or not consent.get("required"):
        raise HTTPException(status_code=400, detail="Parental consent not required for this account")
    if consent.get("status") == "granted":
        raise HTTPException(status_code=400, detail="Consent already granted")

    parent_email = consent.get("parent_email")
    if not parent_email:
        raise HTTPException(status_code=400, detail="No parent email on record")

    new_token = secrets.token_urlsafe(32)
    await motor_db.login.update_one(
        {"user_id": student_id},
        {"$set": {"parental_consent.token": new_token}},
    )

    org = await motor_db.orgs.find_one({"org_id": org_id}, {"name": 1})
    org_name = org.get("name", "your school") if org else "your school"
    first_name = student.get("first_name", "")
    last_name = student.get("last_name", "")
    student_name = f"{first_name} {last_name}".strip() or student["username"]

    app_url = _settings.frontend_url
    grant_url = f"{app_url}/consent/grant?token={new_token}"
    html = _consent_email_html(student_name, org_name, grant_url)
    background_tasks.add_task(send_email, html, f"Parental consent required for {org_name} on LinkJoin", parent_email)
    await log_audit(user["username"], "consent.parental_resent", detail={"student_id": student_id, "parent_email": parent_email, "org_id": org_id})
    return {"message": "Consent email resent"}


@router.get("/audit-logs/export.csv")
async def export_audit_logs_csv(
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    action: str | None = Query(None),
    user: dict = Depends(get_confirmed_user),
):
    role = user.get("role")
    if role not in ("school_admin", "district_admin") and user.get("admin") != "true":
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    query = await _build_audit_query(user, from_date, to_date, action)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["timestamp", "user", "action", "ip", "detail"])
    async for log in motor_db.audit_logs.find(query, {"_id": 0}).sort("ts", -1).limit(10000):
        ts = log.get("ts")
        writer.writerow([
            ts.isoformat() if hasattr(ts, "isoformat") else str(ts),
            _mask_email(log.get("user", "")),
            log.get("action", ""),
            _mask_ip(log.get("ip")),
            str(log.get("detail", {}))[:200] if log.get("detail") else "",
        ])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=audit-log.csv"},
    )


@router.get("/audit-logs/export.json")
async def export_audit_logs_json(
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    action: str | None = Query(None),
    user: dict = Depends(get_confirmed_user),
):
    role = user.get("role")
    if role not in ("school_admin", "district_admin") and user.get("admin") != "true":
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    query = await _build_audit_query(user, from_date, to_date, action)
    entries = []
    async for log in motor_db.audit_logs.find(query, {"_id": 0}).sort("ts", -1).limit(10000):
        ts = log.get("ts")
        entries.append({
            "ts": ts.isoformat() if hasattr(ts, "isoformat") else str(ts),
            "user": _mask_email(log.get("user", "")),
            "action": log.get("action", ""),
            "resource_type": log.get("resource_type"),
            "resource_id": log.get("resource_id"),
            "ip": _mask_ip(log.get("ip")),
            "detail": log.get("detail") or {},
            "hash": log.get("hash"),
        })
    return StreamingResponse(
        iter([json.dumps(entries, indent=2)]),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=audit-log.json"},
    )


@router.get("/audit-logs")
async def list_audit_logs(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    action: str | None = Query(None),
    user: dict = Depends(get_confirmed_user),
):
    role = user.get("role")
    if role not in ("school_admin", "district_admin") and user.get("admin") != "true":
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    query = await _build_audit_query(user, from_date, to_date, action)
    total = await motor_db.audit_logs.count_documents(query)
    skip = (page - 1) * limit
    items = []
    async for log in motor_db.audit_logs.find(query, {"_id": 0}).sort("ts", -1).skip(skip).limit(limit):
        ts = log.get("ts")
        items.append({
            "ts": ts.isoformat() if hasattr(ts, "isoformat") else str(ts),
            "user": _mask_email(log.get("user", "")),
            "action": log.get("action"),
            "ip": _mask_ip(log.get("ip")),
            "detail_summary": str(log.get("detail", {}))[:120] if log.get("detail") else None,
        })
    return {"total": total, "page": page, "limit": limit, "items": items}


async def _build_audit_query(user: dict, from_date: str | None, to_date: str | None, action: str | None) -> dict:
    if user.get("admin") == "true":
        query: dict = {}
    else:
        org_id = user.get("org_id")
        if not org_id:
            return {"user": "__no_org__"}
        accessible_org_ids = list(await get_accessible_org_ids(user))
        org_usernames = [u["username"] async for u in motor_db.login.find({"org_id": {"$in": accessible_org_ids}}, {"username": 1, "_id": 0})]
        query = {"user": {"$in": org_usernames}}

    ts_filter: dict = {}
    if from_date:
        try:
            ts_filter["$gte"] = datetime.fromisoformat(from_date.replace("Z", "+00:00"))
        except Exception:
            pass
    if to_date:
        try:
            ts_filter["$lte"] = datetime.fromisoformat(to_date.replace("Z", "+00:00"))
        except Exception:
            pass
    if ts_filter:
        query["ts"] = ts_filter
    if action:
        query["action"] = {"$regex": f"^{action}", "$options": "i"}
    return query
