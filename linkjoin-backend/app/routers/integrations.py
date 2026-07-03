import urllib.parse
from datetime import datetime, timezone, timedelta
from collections import defaultdict

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from app.auth import get_confirmed_user
from app.config import get_settings
from app.database import motor_db
from app.roles import require_teacher

router = APIRouter(prefix="/integrations", tags=["integrations"])

_GC_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_GC_TOKEN_URL = "https://oauth2.googleapis.com/token"
_GC_API = "https://classroom.googleapis.com/v1"
_SCOPES = " ".join([
    "https://www.googleapis.com/auth/classroom.courses.readonly",
    "https://www.googleapis.com/auth/classroom.rosters.readonly",
    "https://www.googleapis.com/auth/classroom.coursework.students",
    "openid",
    "email",
])
_LOOKBACK_DAYS = 28
_DAY_TO_WEEKDAY = {'Sun': 6, 'Mon': 0, 'Tue': 1, 'Wed': 2, 'Thu': 3, 'Fri': 4, 'Sat': 5}


class ConnectBody(BaseModel):
    class_id: str
    gc_course_id: str
    gc_course_name: str


# ── helpers ──────────────────────────────────────────────────────────────────

def _redirect_uri() -> str:
    s = get_settings()
    base = s.app_base_url if s.environment != "local" else "http://localhost:8000"
    return f"{base}/integrations/google/callback"


async def _get_token(user_id: str) -> dict | None:
    return await motor_db.integrations.find_one(
        {"user_id": user_id, "provider": "google_classroom"},
        {"_id": 0},
    )


async def _refresh_if_needed(token_doc: dict) -> str:
    """Return a valid access token, refreshing if expired."""
    expiry = token_doc.get("token_expiry")
    if expiry:
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) < expiry - timedelta(seconds=60):
            return token_doc["access_token"]

    s = get_settings()
    async with httpx.AsyncClient() as client:
        resp = await client.post(_GC_TOKEN_URL, data={
            "client_id": s.google_client_id,
            "client_secret": s.google_client_secret,
            "refresh_token": token_doc["refresh_token"],
            "grant_type": "refresh_token",
        })
    resp.raise_for_status()
    data = resp.json()
    new_access = data["access_token"]
    new_expiry = datetime.now(timezone.utc) + timedelta(seconds=data.get("expires_in", 3600))
    await motor_db.integrations.update_one(
        {"user_id": token_doc["user_id"], "provider": "google_classroom"},
        {"$set": {"access_token": new_access, "token_expiry": new_expiry}},
    )
    return new_access


async def _gc_get(access_token: str, path: str, params: dict | None = None) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{_GC_API}{path}",
            params=params,
            headers={"Authorization": f"Bearer {access_token}"},
        )
    resp.raise_for_status()
    return resp.json()


async def _gc_post(access_token: str, path: str, body: dict) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{_GC_API}{path}",
            json=body,
            headers={"Authorization": f"Bearer {access_token}"},
        )
    resp.raise_for_status()
    return resp.json()


async def _gc_patch(access_token: str, path: str, body: dict, update_mask: str) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.patch(
            f"{_GC_API}{path}",
            json=body,
            params={"updateMask": update_mask},
            headers={"Authorization": f"Bearer {access_token}"},
        )
    resp.raise_for_status()
    return resp.json()


def _compute_scores(cls: dict, records_by_email: dict, enrolled_emails: set, blackout_dates: set) -> dict[str, int]:
    """
    Returns {student_email: score_0_to_100} using the rolling attendance-rate model.
    Mirrors the logic in attendance.py patterns endpoint.
    """
    from datetime import date as date_type
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=_LOOKBACK_DAYS)

    class_days = cls.get("days") or []
    scheduled_weekdays = {_DAY_TO_WEEKDAY[d] for d in class_days if d in _DAY_TO_WEEKDAY}
    expected_dates_set: set[str] = {
        (cutoff + timedelta(days=i)).strftime("%Y-%m-%d")
        for i in range(_LOOKBACK_DAYS)
        if (cutoff + timedelta(days=i)).weekday() in scheduled_weekdays
        and (cutoff + timedelta(days=i)).strftime("%Y-%m-%d") not in blackout_dates
    }
    expected_count = len(expected_dates_set)
    class_excused = cls.get("excused_absences") or []

    scores: dict[str, int] = {}
    for email in enrolled_emails:
        records = records_by_email.get(email, [])
        student_excused = {
            e["date"] for e in class_excused
            if e.get("student_email") == email and e.get("date") in expected_dates_set
        }
        effective_expected = max(expected_count - len(student_excused), 0)
        joined = sum(1 for r in records if r.get("opened_at") and
                     (r["opened_at"].strftime("%Y-%m-%d") if isinstance(r.get("opened_at"), datetime)
                      else str(r.get("opened_at", ""))[:10]) in expected_dates_set)
        if effective_expected == 0:
            rate = 1.0
        else:
            rate = min(joined / effective_expected, 1.0)
        scores[email] = round(rate * 100)
    return scores


# ── endpoints ─────────────────────────────────────────────────────────────────

@router.get("/google/authorize-url")
async def google_authorize_url(user: dict = Depends(get_confirmed_user)):
    require_teacher(user)
    s = get_settings()
    params = {
        "client_id": s.google_client_id,
        "redirect_uri": _redirect_uri(),
        "response_type": "code",
        "scope": _SCOPES,
        "access_type": "offline",
        "prompt": "consent",
        "state": user["user_id"],
    }
    url = f"{_GC_AUTH_URL}?{urllib.parse.urlencode(params)}"
    return {"url": url}


@router.get("/google/callback")
async def google_callback(code: str = Query(...), state: str = Query(...)):
    """Exchanges auth code for tokens and stores them. Returns a self-closing HTML page."""
    s = get_settings()
    async with httpx.AsyncClient() as client:
        resp = await client.post(_GC_TOKEN_URL, data={
            "code": code,
            "client_id": s.google_client_id,
            "client_secret": s.google_client_secret,
            "redirect_uri": _redirect_uri(),
            "grant_type": "authorization_code",
        })

    if resp.status_code != 200:
        return HTMLResponse("<script>window.opener&&window.opener.postMessage({gc:'error'},'*');window.close()</script>")

    data = resp.json()
    expiry = datetime.now(timezone.utc) + timedelta(seconds=data.get("expires_in", 3600))
    await motor_db.integrations.update_one(
        {"user_id": state, "provider": "google_classroom"},
        {"$set": {
            "user_id": state,
            "provider": "google_classroom",
            "access_token": data["access_token"],
            "refresh_token": data.get("refresh_token", ""),
            "token_expiry": expiry,
            "connected_at": datetime.now(timezone.utc),
        }},
        upsert=True,
    )
    return HTMLResponse("<script>window.opener&&window.opener.postMessage({gc:'connected'},'*');window.close()</script>")


@router.get("/google/status")
async def google_status(user: dict = Depends(get_confirmed_user)):
    require_teacher(user)
    doc = await _get_token(user["user_id"])
    return {"connected": bool(doc and doc.get("refresh_token"))}


@router.get("/google/courses")
async def google_courses(user: dict = Depends(get_confirmed_user)):
    require_teacher(user)
    doc = await _get_token(user["user_id"])
    if not doc:
        raise HTTPException(status_code=400, detail="Google Classroom not connected")
    try:
        access_token = await _refresh_if_needed(doc)
        data = await _gc_get(access_token, "/courses", {"teacherId": "me", "courseStates": "ACTIVE", "pageSize": 50})
        courses = [{"id": c["id"], "name": c["name"]} for c in data.get("courses") or []]
        return {"courses": courses}
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Google API error {e.response.status_code}: {e.response.text[:300]}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Integration error: {type(e).__name__}: {str(e)}")


@router.post("/google/connect")
async def connect_class(body: ConnectBody, user: dict = Depends(get_confirmed_user)):
    require_teacher(user)
    cls = await motor_db.classes.find_one({"class_id": body.class_id})
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")
    if user.get("role") == "teacher" and cls.get("teacher_id") != user["user_id"]:
        raise HTTPException(status_code=403, detail="Access denied")

    await motor_db.classes.update_one(
        {"class_id": body.class_id},
        {"$set": {
            "gc_course_id": body.gc_course_id,
            "gc_course_name": body.gc_course_name,
            "gc_connected_at": datetime.now(timezone.utc),
            "gc_coursework_id": None,
        }},
    )
    return {"ok": True}


@router.delete("/google/disconnect/{class_id}")
async def disconnect_class(class_id: str, user: dict = Depends(get_confirmed_user)):
    require_teacher(user)
    cls = await motor_db.classes.find_one({"class_id": class_id})
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")
    if user.get("role") == "teacher" and cls.get("teacher_id") != user["user_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    await motor_db.classes.update_one(
        {"class_id": class_id},
        {"$unset": {"gc_course_id": "", "gc_course_name": "", "gc_connected_at": "", "gc_coursework_id": ""}},
    )
    return {"ok": True}


async def _run_sync(class_id: str, cls: dict, caller_user_id: str | None = None) -> dict:
    """Core sync logic. Separated so background tasks can call it directly."""
    gc_course_id = cls.get("gc_course_id")
    if not gc_course_id:
        return {"synced": 0, "message": "Not connected"}

    doc = await _get_token(cls["teacher_id"])
    if not doc and caller_user_id:
        doc = await _get_token(caller_user_id)
    if not doc:
        return {"synced": 0, "message": "No token"}

    access_token = await _refresh_if_needed(doc)

    enrolled_emails: set[str] = set()
    for uid in cls.get("student_ids") or []:
        u = await motor_db.login.find_one({"user_id": uid}, {"_id": 0, "username": 1})
        if u:
            enrolled_emails.add(u["username"])

    cutoff = datetime.now(timezone.utc) - timedelta(days=_LOOKBACK_DAYS)
    records_by_email: dict[str, list] = defaultdict(list)
    async for r in motor_db.attendance.find({"class_id": class_id, "opened_at": {"$gte": cutoff}}):
        records_by_email[r["student_email"]].append(r)

    org = await motor_db.orgs.find_one({"org_id": cls.get("org_id", "")}, {"blackout_dates": 1})
    blackout_dates: set[str] = set((org or {}).get("blackout_dates") or [])

    scores = _compute_scores(cls, records_by_email, enrolled_emails, blackout_dates)
    if not scores:
        return {"synced": 0, "message": "No enrolled students"}

    cw_id = cls.get("gc_coursework_id")
    if not cw_id:
        cw = await _gc_post(access_token, f"/courses/{gc_course_id}/courseWork", {
            "title": "Attendance",
            "description": "Attendance score synced by LinkJoin. Updated after each session.",
            "workType": "ASSIGNMENT",
            "state": "PUBLISHED",
            "maxPoints": 100,
        })
        cw_id = cw["id"]
        await motor_db.classes.update_one(
            {"class_id": class_id},
            {"$set": {"gc_coursework_id": cw_id}},
        )

    gc_students = await _gc_get(access_token, f"/courses/{gc_course_id}/students", {"pageSize": 200})
    email_to_gc_id: dict[str, str] = {
        s["profile"]["emailAddress"]: s["userId"]
        for s in gc_students.get("students") or []
        if s.get("profile", {}).get("emailAddress")
    }

    synced = 0
    for email, score in scores.items():
        gc_user_id = email_to_gc_id.get(email)
        if not gc_user_id:
            continue
        subs = await _gc_get(access_token,
                             f"/courses/{gc_course_id}/courseWork/{cw_id}/studentSubmissions",
                             {"userId": gc_user_id})
        sub_list = subs.get("studentSubmissions") or []
        if not sub_list:
            continue
        sub_id = sub_list[0]["id"]
        await _gc_patch(
            access_token,
            f"/courses/{gc_course_id}/courseWork/{cw_id}/studentSubmissions/{sub_id}",
            {"assignedGrade": score, "draftGrade": score},
            "assignedGrade,draftGrade",
        )
        synced += 1

    await motor_db.classes.update_one(
        {"class_id": class_id},
        {"$set": {"gc_last_synced": datetime.now(timezone.utc)}},
    )
    return {"synced": synced, "total": len(scores)}


@router.post("/google/sync/{class_id}")
async def sync_attendance(class_id: str, user: dict = Depends(get_confirmed_user)):
    require_teacher(user)
    cls = await motor_db.classes.find_one({"class_id": class_id})
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")
    if user.get("role") == "teacher" and cls.get("teacher_id") != user["user_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    if not cls.get("gc_course_id"):
        raise HTTPException(status_code=400, detail="Class not connected to Google Classroom")
    return await _run_sync(class_id, cls, caller_user_id=user["user_id"])
