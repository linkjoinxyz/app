from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from app.auth import get_confirmed_user
from app.database import motor_db
from app.utils import configure_data
from app.websocket_manager import manager
from app.audit import log_audit
from app.roles import TEACHER_ROLES

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
    if not q.strip():
        raise HTTPException(status_code=422, detail="q is required")
    results = []
    async for u in motor_db.login.find(
        {"username": {"$regex": q.strip(), "$options": "i"}},
        {"password": 0, "_id": 0},
    ).limit(20):
        results.append(u)
    return results


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
