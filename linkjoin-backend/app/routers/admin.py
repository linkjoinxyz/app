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
