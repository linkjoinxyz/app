import re
import secrets
from datetime import date, datetime, timedelta, timezone
from typing import Optional
import httpx
from argon2 import PasswordHasher as _PH
from icalendar import Calendar
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from app.auth import get_confirmed_user
from app.database import motor_db
from app.config import get_settings
from app.models.org import CreateOrgRequest, UpdateOrgRequest
from app.roles import require_school_admin
from app.utils import track_event
from app.email_service import send_email

_hasher = _PH()

# Keywords that identify "no school" events in a calendar feed
_NO_SCHOOL_KEYWORDS = {
    "no school", "holiday", "break", "vacation", "recess",
    "inservice", "in-service", "in service", "professional development",
    "pd day", "staff development", "teacher workday", "teacher work day",
    "last day", "first day", "spring break", "winter break",
    "fall break", "thanksgiving", "presidents", "martin luther",
    "memorial day", "labor day", "independence day", "new year",
    "christmas", "hanukkah", "snow day", "emergency",
}

router = APIRouter(prefix="/orgs", tags=["orgs"])
_settings = get_settings()
_bearer = HTTPBearer(auto_error=False)


async def _check_token(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    x_admin_token: str | None = Header(default=None),
) -> None:
    if _settings.add_accounts_token and x_admin_token == _settings.add_accounts_token:
        return
    if credentials:
        try:
            payload = jwt.decode(credentials.credentials, _settings.jwt_secret, algorithms=[_settings.jwt_algorithm])
            email = payload.get("sub")
            if email:
                from app.database import motor_db as _db
                user = await _db.login.find_one({"username": email}, {"admin": 1})
                if user and user.get("admin") == "true":
                    return
        except JWTError:
            pass
    raise HTTPException(status_code=403, detail="Admin token or platform admin account required")


def _admin_welcome_email(org_name: str, email: str, temp_password: str, login_url: str) -> str:
    return f"""
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0c1e32;padding:40px 32px;border-radius:12px">
  <img src="https://linkjoin.xyz/images/logo-full.png" alt="LinkJoin" style="height:32px;margin-bottom:28px" />
  <h2 style="color:#fff;font-size:20px;margin:0 0 12px">You've been added as an admin for {org_name}</h2>
  <p style="color:rgba(255,255,255,0.6);font-size:14px;margin:0 0 24px">
    Your LinkJoin administrator account has been created. Use the credentials below to log in and complete your setup.
  </p>
  <div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:16px 20px;margin-bottom:24px">
    <p style="color:rgba(255,255,255,0.5);font-size:12px;margin:0 0 4px;text-transform:uppercase;letter-spacing:.06em">Email</p>
    <p style="color:#fff;font-size:15px;font-weight:600;margin:0 0 14px">{email}</p>
    <p style="color:rgba(255,255,255,0.5);font-size:12px;margin:0 0 4px;text-transform:uppercase;letter-spacing:.06em">Temporary password</p>
    <p style="color:#fff;font-size:15px;font-weight:600;margin:0;font-family:monospace;letter-spacing:.08em">{temp_password}</p>
  </div>
  <p style="color:rgba(255,255,255,0.5);font-size:13px;margin:0 0 24px">
    You will be asked to set a permanent password when you first log in.
  </p>
  <a href="{login_url}" style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px">
    Log in to LinkJoin
  </a>
</div>"""


@router.post("", status_code=201)
async def create_org(body: CreateOrgRequest, background_tasks: BackgroundTasks, _: None = Depends(_check_token)):
    if body.type not in ("school", "district"):
        raise HTTPException(status_code=422, detail="type must be 'school' or 'district'")
    org_id = secrets.token_urlsafe(16)
    doc = {
        "org_id": org_id,
        "name": body.name,
        "type": body.type,
        "parent_org_id": body.parent_org_id,
        "address": body.address,
        "city": body.city,
        "state": body.state,
        "zip_code": body.zip_code,
        "website": body.website,
        "phone": body.phone,
        "timezone": body.timezone,
        "grade_levels": body.grade_levels or [],
        "school_year_start": body.school_year_start,
        "school_year_end": body.school_year_end,
        "created_at": datetime.now(timezone.utc),
    }
    await motor_db.orgs.insert_one(doc)
    await track_event("org_created")

    admin_created = False
    if body.admin_email:
        admin_email = body.admin_email.strip().lower()
        if re.match(r"^[^@ ]+@[^@ ]+\.[^@ .]{2,}$", admin_email):
            existing = await motor_db.login.find_one({"username": admin_email}, {"_id": 1})
            if not existing:
                temp_pw = secrets.token_urlsafe(9)  # 12-char URL-safe password
                user_doc = {
                    "username": admin_email,
                    "user_id": secrets.token_urlsafe(16),
                    "password": _hasher.hash(temp_pw),
                    "role": "school_admin",
                    "org_id": org_id,
                    "account_type": "personal",
                    "premium": "false",
                    "confirmed": "true",
                    "onboarding_done": False,
                    "must_change_password": True,
                    "org_name": admin_email.split("@")[1],
                    "created_at": datetime.now(timezone.utc),
                }
                await motor_db.login.insert_one(user_doc)
                login_url = f"{_settings.app_base_url}/login"
                background_tasks.add_task(
                    send_email,
                    _admin_welcome_email(body.name, admin_email, temp_pw, login_url),
                    f"Your LinkJoin admin account for {body.name}",
                    admin_email,
                )
                admin_created = True

    result = {k: v for k, v in doc.items() if k != "_id"}
    result["admin_created"] = admin_created
    return result


@router.get("/{org_id}/members")
async def get_org_members(org_id: str, user: dict = Depends(get_confirmed_user)):
    require_school_admin(user)
    if user.get("org_id") != org_id and user.get("role") != "district_admin":
        raise HTTPException(status_code=403, detail="Access denied")
    members = []
    async for u in motor_db.login.find({"org_id": org_id}, {"password": 0, "_id": 0}):
        members.append(u)
    return members


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
    org = await motor_db.orgs.find_one(
        {"org_id": org_id},
        {"_id": 0, "blackout_dates": 1, "summer_start": 1, "summer_end": 1, "ical_url": 1},
    )
    if not org:
        raise HTTPException(status_code=404, detail="Org not found")
    return {
        "blackout_dates": sorted(org.get("blackout_dates") or []),
        "summer_start": org.get("summer_start") or "",
        "summer_end": org.get("summer_end") or "",
        "ical_url": org.get("ical_url") or "",
    }


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


@router.put("/{org_id}/calendar/summer", status_code=200)
async def set_summer_break(org_id: str, body: dict, user: dict = Depends(get_confirmed_user)):
    require_school_admin(user)
    if user.get("org_id") != org_id:
        raise HTTPException(status_code=403, detail="Access denied")
    import datetime as dt
    start = (body.get("summer_start") or "").strip()
    end = (body.get("summer_end") or "").strip()
    update: dict = {}
    if start:
        try:
            dt.datetime.strptime(start, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=422, detail="summer_start must be YYYY-MM-DD")
        update["summer_start"] = start
    else:
        update["summer_start"] = ""
    if end:
        try:
            dt.datetime.strptime(end, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=422, detail="summer_end must be YYYY-MM-DD")
        update["summer_end"] = end
    else:
        update["summer_end"] = ""
    if update.get("summer_start") and update.get("summer_end") and update["summer_start"] > update["summer_end"]:
        raise HTTPException(status_code=422, detail="summer_start must be before summer_end")
    await motor_db.orgs.update_one({"org_id": org_id}, {"$set": update})
    return {"message": "Saved"}


def _parse_ical(data: bytes) -> dict:
    """Parse an iCal feed and extract blackout dates and summer break.

    Returns:
        {
            "blackout_dates": ["2026-11-26", ...],
            "summer_start": "2026-06-13",  # or ""
            "summer_end": "2026-08-22",    # or ""
        }
    """
    cal = Calendar.from_ical(data)
    blackout: set[str] = set()
    summer_candidates: list[tuple[date, date]] = []  # (start, end) of long breaks

    for component in cal.walk():
        if component.name != "VEVENT":
            continue

        summary = str(component.get("SUMMARY") or "").lower().strip()
        dtstart = component.get("DTSTART")
        dtend = component.get("DTEND")
        if not dtstart:
            continue

        # Normalise to date objects (some feeds use datetime)
        start_val = dtstart.dt
        if hasattr(start_val, "date"):
            start_val = start_val.date()

        end_val = dtend.dt if dtend else None
        if end_val and hasattr(end_val, "date"):
            end_val = end_val.date()
        if not end_val:
            end_val = start_val

        # iCal DTEND for all-day events is exclusive (the day after the last day)
        duration = (end_val - start_val).days

        # Check if summary matches any no-school keyword
        is_no_school = any(kw in summary for kw in _NO_SCHOOL_KEYWORDS)

        if not is_no_school:
            continue

        # Long multi-day break (>= 14 days) that spans summer months → summer candidate
        if duration >= 14 and (start_val.month >= 5 or end_val.month <= 9):
            # DTEND is exclusive, so the last actual day is end_val - 1 day
            actual_end = end_val - timedelta(days=1)
            summer_candidates.append((start_val, actual_end))
        else:
            # Expand the range into individual blackout dates (DTEND exclusive)
            cur = start_val
            while cur < end_val:
                blackout.add(cur.isoformat())
                cur += timedelta(days=1)

    # Pick the longest summer candidate
    summer_start = ""
    summer_end = ""
    if summer_candidates:
        longest = max(summer_candidates, key=lambda p: (p[1] - p[0]).days)
        summer_start = longest[0].isoformat()
        summer_end = longest[1].isoformat()

    return {
        "blackout_dates": sorted(blackout),
        "summer_start": summer_start,
        "summer_end": summer_end,
    }


@router.post("/{org_id}/calendar/ical", status_code=200)
async def import_ical(org_id: str, body: dict, user: dict = Depends(get_confirmed_user)):
    """Fetch an iCal URL and import no-school events into the org calendar."""
    require_school_admin(user)
    if user.get("org_id") != org_id:
        raise HTTPException(status_code=403, detail="Access denied")

    url = (body.get("url") or "").strip()
    if not url:
        raise HTTPException(status_code=422, detail="url is required")

    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
            resp = await client.get(url, headers={"User-Agent": "LinkJoin/1.0"})
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=400, detail=f"Calendar fetch failed: {e.response.status_code}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not fetch calendar: {str(e)}")

    try:
        parsed = _parse_ical(resp.content)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not parse calendar: {str(e)}")

    update: dict = {"ical_url": url}
    if parsed["summer_start"]:
        update["summer_start"] = parsed["summer_start"]
        update["summer_end"] = parsed["summer_end"]
    if parsed["blackout_dates"]:
        # Merge with existing dates rather than replacing
        await motor_db.orgs.update_one(
            {"org_id": org_id},
            {"$addToSet": {"blackout_dates": {"$each": parsed["blackout_dates"]}}, "$set": {k: v for k, v in update.items() if k != "blackout_dates"}},
        )
    else:
        await motor_db.orgs.update_one({"org_id": org_id}, {"$set": update})

    return {
        "imported_dates": len(parsed["blackout_dates"]),
        "summer_start": parsed["summer_start"],
        "summer_end": parsed["summer_end"],
    }


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
