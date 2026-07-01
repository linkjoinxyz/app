import secrets
from fastapi import APIRouter, Depends, HTTPException, Header
from app.auth import get_confirmed_user
from app.database import motor_db
from app.config import get_settings
from app.models.org import CreateOrgRequest, UpdateOrgRequest
from app.roles import require_school_admin

router = APIRouter(prefix="/orgs", tags=["orgs"])
_settings = get_settings()


def _check_token(x_admin_token: str | None = Header(default=None)) -> None:
    if not _settings.add_accounts_token or x_admin_token != _settings.add_accounts_token:
        raise HTTPException(status_code=403, detail="Invalid admin token")


@router.post("", status_code=201)
async def create_org(body: CreateOrgRequest, _: None = Depends(_check_token)):
    if body.type not in ("school", "district"):
        raise HTTPException(status_code=422, detail="type must be 'school' or 'district'")
    org_id = secrets.token_urlsafe(16)
    doc = {
        "org_id": org_id,
        "name": body.name,
        "type": body.type,
        "parent_org_id": body.parent_org_id,
    }
    await motor_db.orgs.insert_one(doc)
    return {"org_id": org_id, "name": body.name}


@router.get("/{org_id}")
async def get_org(org_id: str, user: dict = Depends(get_confirmed_user)):
    require_school_admin(user)
    if user.get("org_id") != org_id and user.get("role") != "district_admin":
        raise HTTPException(status_code=403, detail="Access denied")
    org = await motor_db.orgs.find_one({"org_id": org_id}, {"_id": 0})
    if not org:
        raise HTTPException(status_code=404, detail="Org not found")
    return org


@router.patch("/{org_id}")
async def update_org(org_id: str, body: UpdateOrgRequest, user: dict = Depends(get_confirmed_user)):
    require_school_admin(user)
    if user.get("org_id") != org_id:
        raise HTTPException(status_code=403, detail="Access denied")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        return {"message": "Nothing to update"}
    await motor_db.orgs.update_one({"org_id": org_id}, {"$set": updates})
    return {"message": "Updated"}


@router.get("/{org_id}/calendar")
async def get_calendar(org_id: str, user: dict = Depends(get_confirmed_user)):
    require_school_admin(user)
    if user.get("org_id") != org_id:
        raise HTTPException(status_code=403, detail="Access denied")
    org = await motor_db.orgs.find_one({"org_id": org_id}, {"_id": 0, "blackout_dates": 1})
    if not org:
        raise HTTPException(status_code=404, detail="Org not found")
    return {"blackout_dates": sorted(org.get("blackout_dates") or [])}


@router.post("/{org_id}/calendar/blackout", status_code=201)
async def add_blackout_date(org_id: str, body: dict, user: dict = Depends(get_confirmed_user)):
    require_school_admin(user)
    if user.get("org_id") != org_id:
        raise HTTPException(status_code=403, detail="Access denied")
    date_str = (body.get("date") or "").strip()
    try:
        __import__("datetime").datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=422, detail="date must be YYYY-MM-DD")
    await motor_db.orgs.update_one({"org_id": org_id}, {"$addToSet": {"blackout_dates": date_str}})
    return {"message": "Added"}


@router.delete("/{org_id}/calendar/blackout/{date}")
async def remove_blackout_date(org_id: str, date: str, user: dict = Depends(get_confirmed_user)):
    require_school_admin(user)
    if user.get("org_id") != org_id:
        raise HTTPException(status_code=403, detail="Access denied")
    await motor_db.orgs.update_one({"org_id": org_id}, {"$pull": {"blackout_dates": date}})
    return {"message": "Removed"}


_DEFAULT_ATTENDANCE_SETTINGS = {
    "tardy_threshold_minutes": 5,
    "tardy_rate_flag": 0.33,
    "attendance_rate_flag": 0.50,
    "min_sessions_to_flag": 3,
}


@router.get("/{org_id}/attendance-settings")
async def get_attendance_settings(org_id: str, user: dict = Depends(get_confirmed_user)):
    require_school_admin(user)
    if user.get("org_id") != org_id:
        raise HTTPException(status_code=403, detail="Access denied")
    org = await motor_db.orgs.find_one({"org_id": org_id}, {"_id": 0, "attendance_settings": 1})
    if not org:
        raise HTTPException(status_code=404, detail="Org not found")
    return {**_DEFAULT_ATTENDANCE_SETTINGS, **(org.get("attendance_settings") or {})}


@router.patch("/{org_id}/attendance-settings")
async def update_attendance_settings(org_id: str, body: dict, user: dict = Depends(get_confirmed_user)):
    require_school_admin(user)
    if user.get("org_id") != org_id:
        raise HTTPException(status_code=403, detail="Access denied")

    allowed = {"tardy_threshold_minutes", "tardy_rate_flag", "attendance_rate_flag", "min_sessions_to_flag"}
    updates = {k: v for k, v in body.items() if k in allowed and v is not None}

    if "tardy_threshold_minutes" in updates:
        v = updates["tardy_threshold_minutes"]
        if not isinstance(v, (int, float)) or v < 0 or v > 60:
            raise HTTPException(status_code=422, detail="tardy_threshold_minutes must be 0–60")
        updates["tardy_threshold_minutes"] = int(v)

    for pct_key in ("tardy_rate_flag", "attendance_rate_flag"):
        if pct_key in updates:
            v = updates[pct_key]
            if not isinstance(v, (int, float)) or v < 0 or v > 1:
                raise HTTPException(status_code=422, detail=f"{pct_key} must be between 0 and 1")
            updates[pct_key] = round(float(v), 4)

    if "min_sessions_to_flag" in updates:
        v = updates["min_sessions_to_flag"]
        if not isinstance(v, (int, float)) or v < 1 or v > 20:
            raise HTTPException(status_code=422, detail="min_sessions_to_flag must be 1–20")
        updates["min_sessions_to_flag"] = int(v)

    if not updates:
        return {"message": "Nothing to update"}

    await motor_db.orgs.update_one(
        {"org_id": org_id},
        {"$set": {f"attendance_settings.{k}": v for k, v in updates.items()}}
    )
    return {"message": "Updated"}
