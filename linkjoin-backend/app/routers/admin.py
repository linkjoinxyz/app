import secrets
import string
from datetime import datetime, timezone
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from app.auth import get_confirmed_user
from app.config import get_settings
from app.database import motor_db
from app.email_service import send_email
from app.utils import configure_data, gen_id
from app.websocket_manager import manager
from app.audit import log_audit
from app.roles import TEACHER_ROLES
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

router = APIRouter(prefix="/admin", tags=["admin"])


def _require_admin(user: dict) -> None:
    if user.get("admin") != "true" or user.get("org_name") == "gmail.com":
        raise HTTPException(status_code=403, detail="Admin access required")


@router.post("/disable-all")
async def disable_all(body: dict, user: dict = Depends(get_confirmed_user)):
    _require_admin(user)
    disable = str(body.get("disable", "true")).lower()
    org = user["org_name"]

    async for org_user in motor_db.login.find({"org_name": org}):
        await motor_db.login.update_one(
            {"username": org_user["username"]}, {"$set": {"org_disabled": disable}}
        )
        await manager.broadcast(await configure_data(org_user["username"]), org_user["username"])

    await log_audit(user["username"], "admin.disable_all", detail={"disable": disable, "org": org})
    return {"message": "Updated"}


@router.get("/org-disabled")
async def org_disabled(user: dict = Depends(get_confirmed_user)):
    return {"disabled": user.get("org_disabled")}


@router.post("/view")
async def toggle_admin_view(body: dict, user: dict = Depends(get_confirmed_user)):
    _require_admin(user)
    value = str(body.get("admin_view", "false")).lower()
    await motor_db.login.update_one({"username": user["username"]}, {"$set": {"admin_view": value}})
    await log_audit(user["username"], "admin.toggle_view", detail={"admin_view": value})
    return {"message": "Updated"}


@router.patch("/users/{user_id}/role")
async def set_user_role(user_id: str, body: dict, user: dict = Depends(get_confirmed_user)):
    _require_admin(user)
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


@router.get("/orgs/{org_id}")
async def get_org_detail(org_id: str, user: dict = Depends(get_confirmed_user)):
    if user.get("admin") != "true":
        raise HTTPException(status_code=403, detail="Platform admin access required")
    org = await motor_db.orgs.find_one({"org_id": org_id}, {"_id": 0})
    if not org:
        raise HTTPException(status_code=404, detail="Org not found")
    members = []
    async for u in motor_db.login.find({"org_id": org_id}, {"password": 0, "_id": 0}):
        members.append(u)
    return {**org, "members": members}


@router.patch("/orgs/{org_id}")
async def update_org_detail(org_id: str, body: dict, user: dict = Depends(get_confirmed_user)):
    if user.get("admin") != "true":
        raise HTTPException(status_code=403, detail="Platform admin access required")
    org = await motor_db.orgs.find_one({"org_id": org_id}, {"_id": 0, "org_id": 1})
    if not org:
        raise HTTPException(status_code=404, detail="Org not found")
    allowed = {"name", "type", "address", "city", "state", "zip_code", "website",
               "phone", "timezone", "grade_levels", "school_year_start", "school_year_end", "parent_org_id"}
    updates = {k: v for k, v in body.items() if k in allowed}
    if not updates:
        return {"message": "Nothing to update"}
    await motor_db.orgs.update_one({"org_id": org_id}, {"$set": updates})
    await log_audit(user["username"], "admin.update_org", detail={"org_id": org_id, "fields": list(updates.keys())})
    return {"message": "Updated"}


@router.patch("/orgs/{org_id}/members/{user_id}/role")
async def update_member_role(org_id: str, user_id: str, body: dict, user: dict = Depends(get_confirmed_user)):
    if user.get("admin") != "true":
        raise HTTPException(status_code=403, detail="Platform admin access required")
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
    if user.get("admin") != "true":
        raise HTTPException(status_code=403, detail="Platform admin access required")
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
    if user.get("admin") != "true":
        raise HTTPException(status_code=403, detail="Platform admin access required")
    orgs = []
    async for org in motor_db.orgs.find({}, {"_id": 0}):
        orgs.append(org)
    return orgs


@router.get("/users/search")
async def search_users(q: str = "", user: dict = Depends(get_confirmed_user)):
    if user.get("admin") != "true":
        raise HTTPException(status_code=403, detail="Platform admin access required")
    results = []
    if q.strip():
        query: dict = {"username": {"$regex": q.strip(), "$options": "i"}}
        async for u in motor_db.login.find(query, {"password": 0, "_id": 0}).limit(20):
            results.append(u)
    else:
        async for u in motor_db.login.find({}, {"password": 0, "_id": 0}).sort("created_at", -1).limit(20):
            results.append(u)
    return results


@router.delete("/orgs/{org_id}", status_code=204)
async def delete_org(org_id: str, user: dict = Depends(get_confirmed_user)):
    if user.get("admin") != "true":
        raise HTTPException(status_code=403, detail="Platform admin access required")
    org = await motor_db.orgs.find_one({"org_id": org_id})
    if not org:
        raise HTTPException(status_code=404, detail="Org not found")
    await motor_db.orgs.delete_one({"org_id": org_id})
    await motor_db.login.update_many(
        {"org_id": org_id},
        {"$set": {"account_type": "personal", "role": None, "org_id": None}},
    )
    await log_audit(user["username"], "admin.delete_org", detail={"org_id": org_id, "org_name": org.get("name")})


@router.post("/orgs/{org_id}/import")
async def import_org_members(
    org_id: str,
    body: dict,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_confirmed_user),
):
    if user.get("admin") != "true":
        raise HTTPException(status_code=403, detail="Platform admin access required")
    org = await motor_db.orgs.find_one({"org_id": org_id})
    if not org:
        raise HTTPException(status_code=404, detail="Org not found")
    org_name = org.get("name", "your school")

    rows = body.get("rows", [])
    if not rows or not isinstance(rows, list):
        raise HTTPException(status_code=422, detail="rows must be a non-empty list")

    results = []
    for row in rows:
        email = (row.get("email") or "").strip().lower()
        role = (row.get("role") or "").strip()
        first_name = (row.get("first_name") or "").strip()
        last_name = (row.get("last_name") or "").strip()

        if not email or "@" not in email:
            results.append({"email": email or "(blank)", "status": "error", "error": "Invalid email"})
            continue
        if role not in VALID_IMPORT_ROLES:
            results.append({"email": email, "status": "error", "error": f"Invalid role '{role}'"})
            continue

        existing = await motor_db.login.find_one({"username": email}, {"_id": 0, "user_id": 1})
        if existing:
            await motor_db.login.update_one(
                {"username": email},
                {"$set": {"role": role, "org_id": org_id, "account_type": "institutional"}},
            )
            results.append({"email": email, "status": "updated"})
            await log_audit(user["username"], "admin.import_member_updated", detail={"email": email, "role": role, "org_id": org_id})
            continue

        temp_pw = _gen_temp_password()
        hashed = _hasher.hash(temp_pw)
        new_user = {
            "username": email,
            "password": hashed,
            "user_id": gen_id(),
            "account_type": "institutional",
            "role": role,
            "org_id": org_id,
            "org_name": org_name,
            "first_name": first_name,
            "last_name": last_name,
            "premium": "false",
            "confirmed": "true",
            "must_reset_password": True,
            "created_at": datetime.now(timezone.utc),
            "tutorial": "true",
            "popup_check_done": "false",
            "offset": 0,
            "notes": "",
        }
        await motor_db.login.insert_one(new_user)
        await log_audit(user["username"], "admin.import_member_created", detail={"email": email, "role": role, "org_id": org_id})

        app_url = _settings.frontend_url
        html = _welcome_email_html(email, org_name, role, temp_pw, app_url)
        background_tasks.add_task(send_email, html, f"Welcome to {org_name} on LinkJoin", email)

        results.append({"email": email, "status": "created"})

    return {"results": results}


@router.post("/orgs/{org_id}/import-parents")
async def import_org_parents(
    org_id: str,
    body: dict,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_confirmed_user),
):
    if user.get("admin") != "true":
        raise HTTPException(status_code=403, detail="Platform admin access required")
    org = await motor_db.orgs.find_one({"org_id": org_id})
    if not org:
        raise HTTPException(status_code=404, detail="Org not found")
    org_name = org.get("name", "your school")

    rows = body.get("rows", [])
    if not rows or not isinstance(rows, list):
        raise HTTPException(status_code=422, detail="rows must be a non-empty list")

    app_url = _settings.frontend_url
    results = []
    for row in rows:
        parent_email = (row.get("parent_email") or "").strip().lower()
        student_email = (row.get("student_email") or "").strip().lower()

        if not parent_email or "@" not in parent_email or not student_email or "@" not in student_email:
            results.append({"parent_email": parent_email or "(blank)", "student_email": student_email or "(blank)", "status": "error", "error": "Invalid email"})
            continue

        student = await motor_db.login.find_one({"username": student_email}, {"user_id": 1, "_id": 0})
        if not student:
            results.append({"parent_email": parent_email, "student_email": student_email, "status": "error", "error": "Student not found"})
            continue
        student_user_id = student["user_id"]

        existing_parent = await motor_db.login.find_one({"username": parent_email}, {"user_id": 1, "_id": 0})
        if not existing_parent:
            temp_pw = _gen_temp_password()
            parent_user_id = gen_id()
            await motor_db.login.insert_one({
                "username": parent_email,
                "password": _hasher.hash(temp_pw),
                "user_id": parent_user_id,
                "account_type": "institutional",
                "role": "parent",
                "org_id": org_id,
                "confirmed": "true",
                "must_reset_password": True,
                "created_at": datetime.now(timezone.utc),
                "premium": "false",
                "tutorial": "true",
                "popup_check_done": "false",
                "offset": 0,
                "notes": "",
            })
            html = _welcome_email_html(parent_email, org_name, "parent", temp_pw, app_url)
            background_tasks.add_task(send_email, html, f"Welcome to {org_name} on LinkJoin - Parent Portal", parent_email)
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

    return {"results": results}


@router.get("/orgs/{org_id}/classes")
async def get_org_classes(org_id: str, user: dict = Depends(get_confirmed_user)):
    if user.get("admin") != "true":
        raise HTTPException(status_code=403, detail="Platform admin access required")
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
    _require_admin(user)
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
        "recent_audit": recent_audit,
    }


@router.patch("/users/{user_id}/platform-admin")
async def set_platform_admin(user_id: str, body: dict, user: dict = Depends(get_confirmed_user)):
    if user.get("admin") != "true":
        raise HTTPException(status_code=403, detail="Platform admin access required")
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
