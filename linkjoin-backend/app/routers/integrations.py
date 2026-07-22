import base64
import hashlib
import hmac
import secrets
import time
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
from app.roles import require_teacher, require_school_admin
from app.utils import get_blackout_set, expected_session_dates

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
    Shares expected_session_dates with the attendance surfaces, so an LMS grade
    cannot disagree with the rate a teacher sees.
    """
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=_LOOKBACK_DAYS)

    expected_dates_set: set[str] = set(expected_session_dates(
        cls, cutoff.date(), (cutoff + timedelta(days=_LOOKBACK_DAYS - 1)).date(),
        blackout_dates, through=now.date(),
    ))
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

    org = await motor_db.orgs.find_one(
        {"org_id": cls.get("org_id", "")},
        {"blackout_dates": 1, "summer_start": 1, "summer_end": 1},
    )
    blackout_dates: set[str] = get_blackout_set(org or {})

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


# ── Clever ────────────────────────────────────────────────────────────────────

_CLEVER_AUTH_URL = "https://clever.com/oauth/authorize"
_CLEVER_TOKEN_URL = "https://clever.com/oauth/tokens"
_CLEVER_API = "https://api.clever.com/v3.0"
_CLEVER_SYNC_COOLDOWN_SECONDS = 300  # 5 minutes


def _clever_redirect_uri() -> str:
    s = get_settings()
    base = s.app_base_url if s.environment != "local" else "http://localhost:8000"
    return f"{base}/integrations/clever/callback"


async def _get_clever_token(org_id: str) -> dict | None:
    return await motor_db.integrations.find_one(
        {"org_id": org_id, "provider": "clever"},
        {"_id": 0},
    )


async def _clever_get(access_token: str, path: str, params: dict | None = None) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{_CLEVER_API}{path}",
            params=params,
            headers={"Authorization": f"Bearer {access_token}"},
        )
    resp.raise_for_status()
    return resp.json()


async def _clever_get_all(access_token: str, path: str, extra_params: dict | None = None) -> list:
    """Fetch all pages from a Clever endpoint, following exact 'next' link URIs."""
    results: list = []
    current_path = path
    current_params: dict = {"limit": 100, **(extra_params or {})}
    while True:
        data = await _clever_get(access_token, current_path, current_params)
        items = data.get("data") or []
        results.extend(items)
        next_uri = next(
            (lnk["uri"] for lnk in (data.get("links") or []) if lnk.get("rel") == "next"),
            None,
        )
        if not next_uri or not items:
            break
        parsed = urllib.parse.urlparse(next_uri)
        current_path = parsed.path.replace("/v3.0", "", 1)
        current_params = dict(urllib.parse.parse_qsl(parsed.query))
    return results


async def _get_district_app_token(district_id: str) -> str:
    """Retrieve the current district-app bearer token from Clever using app credentials."""
    s = get_settings()
    encoded = base64.b64encode(f"{s.clever_client_id}:{s.clever_client_secret}".encode()).decode()
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://clever.com/oauth/tokens",
            params={"district": district_id},
            headers={"Authorization": f"Basic {encoded}"},
        )
    resp.raise_for_status()
    tokens = resp.json().get("data") or []
    if not tokens:
        raise ValueError("No district-app token found")
    token_obj = tokens[0]
    # Clever returns the token id as the bearer string
    return token_obj.get("id") or token_obj.get("access_token") or ""


async def _run_clever_sync(org_id: str) -> dict:
    """Sync all Clever sections/students into LinkJoin for the given org."""
    token_doc = await _get_clever_token(org_id)
    if not token_doc:
        raise HTTPException(status_code=400, detail="Clever not connected")

    last_sync = token_doc.get("last_sync_at")
    if last_sync:
        if last_sync.tzinfo is None:
            last_sync = last_sync.replace(tzinfo=timezone.utc)
        elapsed = (datetime.now(timezone.utc) - last_sync).total_seconds()
        if elapsed < _CLEVER_SYNC_COOLDOWN_SECONDS:
            wait = int(_CLEVER_SYNC_COOLDOWN_SECONDS - elapsed)
            raise HTTPException(status_code=429, detail=f"Sync cooldown. Try again in {wait}s")

    # Re-fetch the district-app token before each sync to handle token rotation
    district_id = token_doc.get("district_id") or ""
    try:
        access_token = await _get_district_app_token(district_id)
        # Keep stored token current
        await motor_db.integrations.update_one(
            {"org_id": org_id, "provider": "clever"},
            {"$set": {"access_token": access_token}},
        )
    except Exception:
        # Fall back to stored token if refresh fails
        access_token = token_doc.get("access_token", "")
        if not access_token:
            raise HTTPException(status_code=400, detail="Clever token unavailable")

    try:
        sections_raw = await _clever_get_all(access_token, "/sections")
        # v3.0 uses /users?role=teacher and /users?role=student (not /teachers or /students)
        teachers_raw = await _clever_get_all(access_token, "/users", {"role": "teacher"})
        students_raw = await _clever_get_all(access_token, "/users", {"role": "student"})
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Clever API error {e.response.status_code}: {e.response.text[:200]}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Clever API error: {type(e).__name__}: {str(e)}")

    teacher_map: dict[str, str] = {}
    for t in teachers_raw:
        td = t.get("data") or {}
        if td.get("id") and td.get("email"):
            teacher_map[td["id"]] = td["email"]

    student_map: dict[str, str] = {}
    for s in students_raw:
        sd = s.get("data") or {}
        if sd.get("id") and sd.get("email"):
            student_map[sd["id"]] = sd["email"]

    total_students_added = 0
    new_classes = 0
    new_accounts = 0

    for section_item in sections_raw:
        sd = section_item.get("data") or {}
        clever_section_id = sd.get("id")
        if not clever_section_id:
            continue
        section_name = sd.get("name") or f"Section {clever_section_id[:8]}"
        teacher_ids = sd.get("teachers") or ([sd["teacher"]] if sd.get("teacher") else [])
        student_ids_clever: list[str] = sd.get("students") or []

        teacher_email = next((teacher_map[tid] for tid in teacher_ids if tid in teacher_map), None)

        cls = await motor_db.classes.find_one({"clever_section_id": clever_section_id, "org_id": org_id})

        if not cls and teacher_email:
            teacher_user = await motor_db.login.find_one({"username": teacher_email, "org_id": org_id})
            if teacher_user:
                cls = await motor_db.classes.find_one({
                    "teacher_id": teacher_user["user_id"],
                    "name": section_name,
                    "org_id": org_id,
                })

        if cls:
            await motor_db.classes.update_one(
                {"class_id": cls["class_id"]},
                {"$set": {"clever_section_id": clever_section_id}},
            )
            class_id: str = cls["class_id"]
            existing_student_ids: set[str] = set(cls.get("student_ids") or [])
        else:
            class_id = secrets.token_urlsafe(16)
            teacher_user_id = ""
            if teacher_email:
                tu = await motor_db.login.find_one({"username": teacher_email, "org_id": org_id})
                if tu:
                    teacher_user_id = tu["user_id"]
            await motor_db.classes.insert_one({
                "class_id": class_id,
                "org_id": org_id,
                "name": section_name,
                "time": "08:00",
                "days": ["Mon", "Tue", "Wed", "Thu", "Fri"],
                "teacher_id": teacher_user_id,
                "student_ids": [],
                "link_ids": [],
                "clever_section_id": clever_section_id,
            })
            existing_student_ids = set()
            new_classes += 1

        students_to_add: list[str] = []
        for clever_sid in student_ids_clever:
            student_email = student_map.get(clever_sid)
            if not student_email:
                continue
            user_doc = await motor_db.login.find_one({"username": student_email})
            if user_doc:
                uid = user_doc["user_id"]
                if not user_doc.get("clever_user_id"):
                    await motor_db.login.update_one({"user_id": uid}, {"$set": {"clever_user_id": clever_sid}})
            else:
                uid = secrets.token_urlsafe(16)
                await motor_db.login.insert_one({
                    "username": student_email,
                    "user_id": uid,
                    "account_type": "institutional",
                    "role": "student",
                    "org_id": org_id,
                    "confirmed": "false",
                    "clever_user_id": clever_sid,
                })
                new_accounts += 1
            if uid not in existing_student_ids:
                students_to_add.append(uid)
                existing_student_ids.add(uid)

        if students_to_add:
            await motor_db.classes.update_one(
                {"class_id": class_id},
                {"$push": {"student_ids": {"$each": students_to_add}}},
            )
            total_students_added += len(students_to_add)

    stats = {
        "sections": len(sections_raw),
        "students": total_students_added,
        "new_classes": new_classes,
        "new_accounts": new_accounts,
    }
    await motor_db.integrations.update_one(
        {"org_id": org_id, "provider": "clever"},
        {"$set": {"last_sync_at": datetime.now(timezone.utc), "last_sync_stats": stats}},
    )
    return stats


# ── Clever endpoints ──────────────────────────────────────────────────────────

@router.get("/clever/authorize-url")
async def clever_authorize_url(user: dict = Depends(get_confirmed_user)):
    require_school_admin(user)
    org_id = user.get("org_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="User has no org")
    s = get_settings()
    params = {
        "response_type": "code",
        "client_id": s.clever_client_id,
        "redirect_uri": _clever_redirect_uri(),
        "state": org_id,
    }
    return {"url": f"{_CLEVER_AUTH_URL}?{urllib.parse.urlencode(params)}"}


@router.get("/clever/callback")
async def clever_callback(code: str = Query(...), state: str = Query(...)):
    """state = org_id.
    SSO token from the code exchange is used only to identify the district.
    The district-app token (fetched via app credentials) is what we store for roster sync.
    """
    s = get_settings()
    encoded = base64.b64encode(f"{s.clever_client_id}:{s.clever_client_secret}".encode()).decode()

    # Step 1: Exchange code for SSO access token (limited to /me, /districts, /users/{id})
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            _CLEVER_TOKEN_URL,
            data={"code": code, "grant_type": "authorization_code", "redirect_uri": _clever_redirect_uri()},
            headers={"Authorization": f"Basic {encoded}"},
        )
    if resp.status_code != 200:
        return HTMLResponse("<script>window.opener&&window.opener.postMessage({clever:'error'},'*');window.close()</script>")

    sso_token = resp.json().get("access_token", "")

    # Step 2: Use SSO token to identify the district
    district_id = ""
    district_name = ""
    district_app_token = ""
    try:
        me = await _clever_get(sso_token, "/me")
        me_data = (me.get("data") or {})
        district_id = me_data.get("district") or ""

        if district_id:
            dist_resp = await _clever_get(sso_token, f"/districts/{district_id}")
            district_name = (dist_resp.get("data") or {}).get("name") or ""

            # Step 3: Fetch the district-app token — required for roster sync endpoints
            district_app_token = await _get_district_app_token(district_id)
    except Exception:
        pass

    if not district_app_token:
        return HTMLResponse("<script>window.opener&&window.opener.postMessage({clever:'error'},'*');window.close()</script>")

    await motor_db.integrations.update_one(
        {"org_id": state, "provider": "clever"},
        {"$set": {
            "org_id": state,
            "provider": "clever",
            "access_token": district_app_token,
            "district_id": district_id,
            "district_name": district_name,
            "connected_at": datetime.now(timezone.utc),
            "last_sync_at": None,
            "last_sync_stats": None,
        }},
        upsert=True,
    )
    return HTMLResponse("<script>window.opener&&window.opener.postMessage({clever:'connected'},'*');window.close()</script>")


@router.get("/clever/status")
async def clever_status(user: dict = Depends(get_confirmed_user), org_id: str = Query(...)):
    require_school_admin(user)
    if user.get("org_id") != org_id:
        raise HTTPException(status_code=403, detail="Access denied")
    doc = await _get_clever_token(org_id)
    if not doc or not doc.get("access_token"):
        return {"connected": False}
    return {
        "connected": True,
        "district_name": doc.get("district_name") or "",
        "last_sync_at": doc.get("last_sync_at"),
        "last_sync_stats": doc.get("last_sync_stats"),
    }


@router.post("/clever/sync/{org_id}")
async def clever_sync(org_id: str, user: dict = Depends(get_confirmed_user)):
    require_school_admin(user)
    if user.get("org_id") != org_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return await _run_clever_sync(org_id)


@router.delete("/clever/disconnect/{org_id}")
async def clever_disconnect(org_id: str, user: dict = Depends(get_confirmed_user)):
    require_school_admin(user)
    if user.get("org_id") != org_id:
        raise HTTPException(status_code=403, detail="Access denied")
    await motor_db.integrations.delete_one({"org_id": org_id, "provider": "clever"})
    return {"ok": True}


# ── OneRoster helpers ─────────────────────────────────────────────────────────

_OR_SYNC_COOLDOWN_SECONDS = 300


def _or_base(base_url: str) -> str:
    return base_url.rstrip("/")


async def _or_get_token(base_url: str, client_id: str, client_secret: str) -> str:
    """Fetch a short-lived bearer token via OAuth 2.0 client credentials."""
    encoded = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    token_url = f"{_or_base(base_url)}/token"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            token_url,
            data={"grant_type": "client_credentials"},
            headers={"Authorization": f"Basic {encoded}", "Content-Type": "application/x-www-form-urlencoded"},
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=400, detail=f"OneRoster token request failed: {resp.status_code}")
    return resp.json().get("access_token") or ""


async def _or_get(base_url: str, token: str, path: str, params: dict | None = None) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{_or_base(base_url)}{path}",
            params=params,
            headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
        )
    resp.raise_for_status()
    return resp.json()


async def _or_get_all(base_url: str, token: str, path: str, extra: dict | None = None) -> list:
    """Paginate through a OneRoster collection, following Link header or offset."""
    results: list = []
    limit = 100
    offset = 0
    while True:
        params = {"limit": limit, "offset": offset, **(extra or {})}
        data = await _or_get(base_url, token, path, params)
        # OneRoster wraps responses in a key matching the resource name
        items = next((v for v in data.values() if isinstance(v, list)), [])
        results.extend(items)
        if len(items) < limit:
            break
        offset += limit
    return results


async def _run_oneroster_sync(org_id: str) -> dict:
    """Sync all OneRoster classes/students into LinkJoin for the given org."""
    doc = await motor_db.integrations.find_one({"org_id": org_id, "provider": "oneroster"})
    if not doc or not doc.get("client_id"):
        raise HTTPException(status_code=400, detail="OneRoster not connected")

    last_sync = doc.get("last_sync_at")
    if last_sync:
        if last_sync.tzinfo is None:
            last_sync = last_sync.replace(tzinfo=timezone.utc)
        elapsed = (datetime.now(timezone.utc) - last_sync).total_seconds()
        if elapsed < _OR_SYNC_COOLDOWN_SECONDS:
            wait = int(_OR_SYNC_COOLDOWN_SECONDS - elapsed)
            raise HTTPException(status_code=429, detail=f"Sync cooldown. Try again in {wait}s")

    base_url = doc["base_url"]
    client_id = doc["client_id"]
    client_secret = doc["client_secret"]

    # Re-fetch token for each sync (tokens are short-lived, ~1 hour)
    token = await _or_get_token(base_url, client_id, client_secret)

    try:
        classes_raw = await _or_get_all(base_url, token, "/classes")
        enrollments_raw = await _or_get_all(base_url, token, "/enrollments")
        users_raw = await _or_get_all(base_url, token, "/users")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"OneRoster API error {e.response.status_code}: {e.response.text[:200]}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"OneRoster API error: {type(e).__name__}: {str(e)}")

    # Build user lookup: sourcedId → {email, role}
    user_map: dict[str, dict] = {}
    for u in users_raw:
        sid = u.get("sourcedId") or ""
        email = u.get("email") or ""
        role = u.get("role") or ""
        if sid and email:
            user_map[sid] = {"email": email, "role": role}

    # Build enrollment lookup: class sourcedId → {students: [...], teachers: [...]}
    class_enrollments: dict[str, dict] = {}
    for enr in enrollments_raw:
        if (enr.get("status") or "active") != "active":
            continue
        cls_sid = (enr.get("class") or {}).get("sourcedId") or ""
        usr_sid = (enr.get("user") or {}).get("sourcedId") or ""
        role = enr.get("role") or ""
        if not cls_sid or not usr_sid:
            continue
        if cls_sid not in class_enrollments:
            class_enrollments[cls_sid] = {"students": [], "teachers": []}
        if role == "student":
            class_enrollments[cls_sid]["students"].append(usr_sid)
        elif role == "teacher":
            class_enrollments[cls_sid]["teachers"].append(usr_sid)

    total_students_added = 0
    new_classes = 0
    new_accounts = 0

    for cls_raw in classes_raw:
        if (cls_raw.get("status") or "active") != "active":
            continue
        or_class_id = cls_raw.get("sourcedId") or ""
        class_name = cls_raw.get("title") or f"Class {or_class_id[:8]}"
        if not or_class_id:
            continue

        enr = class_enrollments.get(or_class_id, {"students": [], "teachers": []})
        teacher_email = next(
            (user_map[t]["email"] for t in enr["teachers"] if t in user_map),
            None,
        )

        # Match to existing LinkJoin class by oneroster_class_id, then by teacher+name
        lj_cls = await motor_db.classes.find_one({"oneroster_class_id": or_class_id, "org_id": org_id})

        if not lj_cls and teacher_email:
            teacher_user = await motor_db.login.find_one({"username": teacher_email, "org_id": org_id})
            if teacher_user:
                lj_cls = await motor_db.classes.find_one({
                    "teacher_id": teacher_user["user_id"],
                    "name": class_name,
                    "org_id": org_id,
                })

        if lj_cls:
            await motor_db.classes.update_one(
                {"class_id": lj_cls["class_id"]},
                {"$set": {"oneroster_class_id": or_class_id}},
            )
            class_id: str = lj_cls["class_id"]
            existing_student_ids: set[str] = set(lj_cls.get("student_ids") or [])
        else:
            class_id = secrets.token_urlsafe(16)
            teacher_user_id = ""
            if teacher_email:
                tu = await motor_db.login.find_one({"username": teacher_email, "org_id": org_id})
                if tu:
                    teacher_user_id = tu["user_id"]
            await motor_db.classes.insert_one({
                "class_id": class_id,
                "org_id": org_id,
                "name": class_name,
                "time": "08:00",
                "days": ["Mon", "Tue", "Wed", "Thu", "Fri"],
                "teacher_id": teacher_user_id,
                "student_ids": [],
                "link_ids": [],
                "oneroster_class_id": or_class_id,
            })
            existing_student_ids = set()
            new_classes += 1

        students_to_add: list[str] = []
        for usr_sid in enr["students"]:
            u = user_map.get(usr_sid)
            if not u:
                continue
            student_email = u["email"]
            user_doc = await motor_db.login.find_one({"username": student_email})
            if user_doc:
                uid = user_doc["user_id"]
            else:
                uid = secrets.token_urlsafe(16)
                await motor_db.login.insert_one({
                    "username": student_email,
                    "user_id": uid,
                    "account_type": "institutional",
                    "role": "student",
                    "org_id": org_id,
                    "confirmed": "false",
                })
                new_accounts += 1
            if uid not in existing_student_ids:
                students_to_add.append(uid)
                existing_student_ids.add(uid)

        if students_to_add:
            await motor_db.classes.update_one(
                {"class_id": class_id},
                {"$push": {"student_ids": {"$each": students_to_add}}},
            )
            total_students_added += len(students_to_add)

    stats = {
        "sections": len(classes_raw),
        "students": total_students_added,
        "new_classes": new_classes,
        "new_accounts": new_accounts,
    }
    await motor_db.integrations.update_one(
        {"org_id": org_id, "provider": "oneroster"},
        {"$set": {"last_sync_at": datetime.now(timezone.utc), "last_sync_stats": stats}},
    )
    return stats


# ── OneRoster endpoints ───────────────────────────────────────────────────────

@router.post("/oneroster/connect")
async def oneroster_connect(body: dict, user: dict = Depends(get_confirmed_user)):
    """Test credentials and store the OneRoster connection for the org."""
    require_school_admin(user)
    org_id = user.get("org_id") or ""

    base_url = (body.get("base_url") or "").strip().rstrip("/")
    client_id = (body.get("client_id") or "").strip()
    client_secret = (body.get("client_secret") or "").strip()
    if not base_url or not client_id or not client_secret:
        raise HTTPException(status_code=422, detail="base_url, client_id, and client_secret are required")

    # Verify credentials by fetching a token and making a test call
    try:
        token = await _or_get_token(base_url, client_id, client_secret)
        info = await _or_get(base_url, token, "/orgs", {"limit": 1})
        orgs = next((v for v in info.values() if isinstance(v, list)), [])
        district_name = (orgs[0].get("name") or "") if orgs else ""
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not connect to OneRoster endpoint: {str(e)}")

    await motor_db.integrations.update_one(
        {"org_id": org_id, "provider": "oneroster"},
        {"$set": {
            "org_id": org_id,
            "provider": "oneroster",
            "base_url": base_url,
            "client_id": client_id,
            "client_secret": client_secret,
            "district_name": district_name,
            "connected_at": datetime.now(timezone.utc),
            "last_sync_at": None,
            "last_sync_stats": None,
        }},
        upsert=True,
    )
    return {"connected": True, "district_name": district_name}


@router.get("/oneroster/status")
async def oneroster_status(user: dict = Depends(get_confirmed_user), org_id: str = Query(...)):
    require_school_admin(user)
    if user.get("org_id") != org_id:
        raise HTTPException(status_code=403, detail="Access denied")
    doc = await motor_db.integrations.find_one({"org_id": org_id, "provider": "oneroster"})
    if not doc or not doc.get("client_id"):
        return {"connected": False}
    return {
        "connected": True,
        "district_name": doc.get("district_name") or "",
        "base_url": doc.get("base_url") or "",
        "last_sync_at": doc.get("last_sync_at"),
        "last_sync_stats": doc.get("last_sync_stats"),
    }


@router.post("/oneroster/sync/{org_id}")
async def oneroster_sync(org_id: str, user: dict = Depends(get_confirmed_user)):
    require_school_admin(user)
    if user.get("org_id") != org_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return await _run_oneroster_sync(org_id)


@router.delete("/oneroster/disconnect/{org_id}")
async def oneroster_disconnect(org_id: str, user: dict = Depends(get_confirmed_user)):
    require_school_admin(user)
    if user.get("org_id") != org_id:
        raise HTTPException(status_code=403, detail="Access denied")
    await motor_db.integrations.delete_one({"org_id": org_id, "provider": "oneroster"})
    return {"ok": True}


# ── Canvas helpers ────────────────────────────────────────────────────────────

def _canvas_redirect_uri() -> str:
    s = get_settings()
    base = s.app_base_url if s.environment != "local" else "http://localhost:8000"
    return f"{base}/integrations/canvas/callback"


async def _get_canvas_org_config(org_id: str) -> dict | None:
    return await motor_db.integrations.find_one(
        {"org_id": org_id, "provider": "canvas_config"}, {"_id": 0}
    )


async def _get_canvas_token(user_id: str) -> dict | None:
    return await motor_db.integrations.find_one(
        {"user_id": user_id, "provider": "canvas"}, {"_id": 0}
    )


async def _canvas_get(base_url: str, token: str, path: str, params: dict | None = None) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{base_url.rstrip('/')}{path}",
            params=params,
            headers={"Authorization": f"Bearer {token}"},
        )
    resp.raise_for_status()
    return resp.json()


async def _canvas_get_all(base_url: str, token: str, path: str, params: dict | None = None) -> list:
    """Paginate Canvas responses via Link header."""
    results: list = []
    url = f"{base_url.rstrip('/')}{path}"
    p = {"per_page": 100, **(params or {})}
    async with httpx.AsyncClient(timeout=30) as client:
        while url:
            resp = await client.get(url, params=p, headers={"Authorization": f"Bearer {token}"})
            resp.raise_for_status()
            data = resp.json()
            if isinstance(data, list):
                results.extend(data)
            # Parse Link header for next page
            link_header = resp.headers.get("Link") or ""
            next_url = next(
                (part.split(";")[0].strip(" <>") for part in link_header.split(",")
                 if 'rel="next"' in part),
                None,
            )
            url = next_url
            p = {}  # params already encoded in next_url
    return results


async def _canvas_post(base_url: str, token: str, path: str, body: dict) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{base_url.rstrip('/')}{path}",
            json=body,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        )
    resp.raise_for_status()
    return resp.json()


async def _canvas_put(base_url: str, token: str, path: str, body: dict) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.put(
            f"{base_url.rstrip('/')}{path}",
            json=body,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        )
    resp.raise_for_status()
    return resp.json()


async def _run_canvas_sync(class_id: str, cls: dict, caller_user_id: str | None = None) -> dict:
    canvas_course_id = cls.get("canvas_course_id")
    if not canvas_course_id:
        return {"synced": 0, "message": "Not connected"}

    org_config = await _get_canvas_org_config(cls.get("org_id", ""))
    if not org_config:
        return {"synced": 0, "message": "Canvas not configured for this org"}
    base_url = org_config["base_url"]

    token_doc = await _get_canvas_token(cls["teacher_id"])
    if not token_doc and caller_user_id:
        token_doc = await _get_canvas_token(caller_user_id)
    if not token_doc:
        return {"synced": 0, "message": "No Canvas token"}

    access_token = token_doc["access_token"]

    # Build attendance scores
    enrolled_emails: set[str] = set()
    for uid in cls.get("student_ids") or []:
        u = await motor_db.login.find_one({"user_id": uid}, {"_id": 0, "username": 1})
        if u:
            enrolled_emails.add(u["username"])

    cutoff = datetime.now(timezone.utc) - timedelta(days=_LOOKBACK_DAYS)
    records_by_email: dict[str, list] = defaultdict(list)
    async for r in motor_db.attendance.find({"class_id": class_id, "opened_at": {"$gte": cutoff}}):
        records_by_email[r["student_email"]].append(r)

    org = await motor_db.orgs.find_one(
        {"org_id": cls.get("org_id", "")},
        {"blackout_dates": 1, "summer_start": 1, "summer_end": 1},
    )
    blackout_dates: set[str] = get_blackout_set(org or {})
    scores = _compute_scores(cls, records_by_email, enrolled_emails, blackout_dates)
    if not scores:
        return {"synced": 0, "message": "No enrolled students"}

    # Find or create "Attendance" assignment
    assignment_id = cls.get("canvas_assignment_id")
    if not assignment_id:
        assignments = await _canvas_get_all(
            base_url, access_token, f"/api/v1/courses/{canvas_course_id}/assignments",
            {"search_term": "Attendance"},
        )
        existing = next((a for a in assignments if a.get("name") == "Attendance"), None)
        if existing:
            assignment_id = str(existing["id"])
        else:
            new_assignment = await _canvas_post(
                base_url, access_token,
                f"/api/v1/courses/{canvas_course_id}/assignments",
                {"assignment": {
                    "name": "Attendance",
                    "description": "Attendance score (0–100) synced by LinkJoin.",
                    "points_possible": 100,
                    "grading_type": "percent",
                    "published": True,
                }},
            )
            assignment_id = str(new_assignment["id"])
        await motor_db.classes.update_one(
            {"class_id": class_id}, {"$set": {"canvas_assignment_id": assignment_id}}
        )

    # Get Canvas student enrollments to map email → canvas_user_id
    enrollments = await _canvas_get_all(
        base_url, access_token,
        f"/api/v1/courses/{canvas_course_id}/enrollments",
        {"type[]": "StudentEnrollment", "include[]": "email"},
    )
    email_to_canvas_id: dict[str, str] = {}
    for enr in enrollments:
        user_data = enr.get("user") or {}
        email = user_data.get("login_id") or user_data.get("email") or ""
        canvas_uid = str(enr.get("user_id") or "")
        if email and canvas_uid:
            email_to_canvas_id[email.lower()] = canvas_uid

    # Submit grades via bulk update
    grade_data: dict[str, dict] = {}
    for email, score in scores.items():
        canvas_uid = email_to_canvas_id.get(email.lower())
        if canvas_uid:
            grade_data[canvas_uid] = {"posted_grade": str(score)}

    if grade_data:
        await _canvas_post(
            base_url, access_token,
            f"/api/v1/courses/{canvas_course_id}/assignments/{assignment_id}/submissions/update_grades",
            {"grade_data": grade_data},
        )

    await motor_db.classes.update_one(
        {"class_id": class_id}, {"$set": {"canvas_last_synced": datetime.now(timezone.utc)}}
    )
    return {"synced": len(grade_data), "total": len(scores)}


# ── Canvas endpoints ──────────────────────────────────────────────────────────

@router.post("/canvas/org-config")
async def canvas_org_config(body: dict, user: dict = Depends(get_confirmed_user)):
    """Admin saves org-level Canvas credentials (base_url + developer key)."""
    require_school_admin(user)
    org_id = user.get("org_id") or ""
    base_url = (body.get("base_url") or "").strip().rstrip("/")
    client_id = (body.get("client_id") or "").strip()
    client_secret = (body.get("client_secret") or "").strip()
    if not base_url or not client_id or not client_secret:
        raise HTTPException(status_code=422, detail="base_url, client_id, and client_secret are required")
    await motor_db.integrations.update_one(
        {"org_id": org_id, "provider": "canvas_config"},
        {"$set": {"org_id": org_id, "provider": "canvas_config",
                  "base_url": base_url, "client_id": client_id, "client_secret": client_secret}},
        upsert=True,
    )
    return {"ok": True}


@router.get("/canvas/org-config")
async def get_canvas_org_config(user: dict = Depends(get_confirmed_user)):
    require_school_admin(user)
    org_id = user.get("org_id") or ""
    doc = await _get_canvas_org_config(org_id)
    if not doc:
        return {"configured": False}
    return {"configured": True, "base_url": doc.get("base_url") or ""}


@router.get("/canvas/authorize-url")
async def canvas_authorize_url(user: dict = Depends(get_confirmed_user)):
    require_teacher(user)
    org_id = user.get("org_id") or ""
    config = await _get_canvas_org_config(org_id)
    if not config:
        raise HTTPException(status_code=400, detail="Canvas not configured for this org. Ask your admin to set it up.")
    params = {
        "client_id": config["client_id"],
        "response_type": "code",
        "redirect_uri": _canvas_redirect_uri(),
        "state": user["user_id"],
    }
    url = f"{config['base_url']}/login/oauth2/auth?{urllib.parse.urlencode(params)}"
    return {"url": url}


@router.get("/canvas/callback")
async def canvas_callback(code: str = Query(...), state: str = Query(...)):
    """state = user_id. Exchanges code for access token."""
    # Look up org via user
    user_doc = await motor_db.login.find_one({"user_id": state})
    org_id = (user_doc or {}).get("org_id") or ""
    config = await _get_canvas_org_config(org_id)
    if not config:
        return HTMLResponse("<script>window.opener&&window.opener.postMessage({canvas:'error'},'*');window.close()</script>")

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{config['base_url']}/login/oauth2/token",
            data={
                "code": code,
                "client_id": config["client_id"],
                "client_secret": config["client_secret"],
                "redirect_uri": _canvas_redirect_uri(),
                "grant_type": "authorization_code",
            },
        )
    if resp.status_code != 200:
        return HTMLResponse("<script>window.opener&&window.opener.postMessage({canvas:'error'},'*');window.close()</script>")

    data = resp.json()
    access_token = data.get("access_token") or ""
    if not access_token:
        return HTMLResponse("<script>window.opener&&window.opener.postMessage({canvas:'error'},'*');window.close()</script>")

    await motor_db.integrations.update_one(
        {"user_id": state, "provider": "canvas"},
        {"$set": {
            "user_id": state,
            "provider": "canvas",
            "access_token": access_token,
            "base_url": config["base_url"],
            "connected_at": datetime.now(timezone.utc),
        }},
        upsert=True,
    )
    return HTMLResponse("<script>window.opener&&window.opener.postMessage({canvas:'connected'},'*');window.close()</script>")


@router.get("/canvas/status")
async def canvas_status(user: dict = Depends(get_confirmed_user)):
    require_teacher(user)
    doc = await _get_canvas_token(user["user_id"])
    org_config = await _get_canvas_org_config(user.get("org_id") or "")
    return {
        "connected": bool(doc and doc.get("access_token")),
        "org_configured": bool(org_config),
    }


@router.get("/canvas/courses")
async def canvas_courses(user: dict = Depends(get_confirmed_user)):
    require_teacher(user)
    doc = await _get_canvas_token(user["user_id"])
    if not doc:
        raise HTTPException(status_code=400, detail="Canvas not connected")
    config = await _get_canvas_org_config(user.get("org_id") or "")
    if not config:
        raise HTTPException(status_code=400, detail="Canvas not configured")
    base_url = config["base_url"]
    token = doc["access_token"]
    try:
        courses = await _canvas_get_all(
            base_url, token, "/api/v1/courses",
            {"enrollment_type": "teacher", "state[]": "available"},
        )
        return {"courses": [{"id": str(c["id"]), "name": c.get("name") or str(c["id"])} for c in courses]}
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Canvas API error {e.response.status_code}")


@router.post("/canvas/connect")
async def canvas_connect_class(body: dict, user: dict = Depends(get_confirmed_user)):
    require_teacher(user)
    class_id = (body.get("class_id") or "").strip()
    course_id = (body.get("canvas_course_id") or "").strip()
    course_name = (body.get("canvas_course_name") or "").strip()
    cls = await motor_db.classes.find_one({"class_id": class_id})
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")
    if user.get("role") == "teacher" and cls.get("teacher_id") != user["user_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    await motor_db.classes.update_one(
        {"class_id": class_id},
        {"$set": {"canvas_course_id": course_id, "canvas_course_name": course_name, "canvas_assignment_id": None}},
    )
    return {"ok": True}


@router.delete("/canvas/disconnect/{class_id}")
async def canvas_disconnect_class(class_id: str, user: dict = Depends(get_confirmed_user)):
    require_teacher(user)
    cls = await motor_db.classes.find_one({"class_id": class_id})
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")
    if user.get("role") == "teacher" and cls.get("teacher_id") != user["user_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    await motor_db.classes.update_one(
        {"class_id": class_id},
        {"$unset": {"canvas_course_id": "", "canvas_course_name": "", "canvas_assignment_id": ""}},
    )
    return {"ok": True}


@router.post("/canvas/sync/{class_id}")
async def canvas_sync(class_id: str, user: dict = Depends(get_confirmed_user)):
    require_teacher(user)
    cls = await motor_db.classes.find_one({"class_id": class_id})
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")
    if user.get("role") == "teacher" and cls.get("teacher_id") != user["user_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    if not cls.get("canvas_course_id"):
        raise HTTPException(status_code=400, detail="Class not connected to Canvas")
    return await _run_canvas_sync(class_id, cls, caller_user_id=user["user_id"])


# ── Schoology Integration ─────────────────────────────────────────────────────

_SG_BASE = "https://api.schoology.com/v1"
_SG_SYNC_COOLDOWN_SECONDS = 300


def _sg_auth_header(method: str, url: str, consumer_key: str, consumer_secret: str) -> str:
    """Build OAuth 1.0a HMAC-SHA1 Authorization header (2-legged, stdlib only)."""
    params = {
        "oauth_consumer_key": consumer_key,
        "oauth_nonce": secrets.token_hex(16),
        "oauth_signature_method": "HMAC-SHA1",
        "oauth_timestamp": str(int(time.time())),
        "oauth_version": "1.0",
    }
    sorted_params = urllib.parse.urlencode(sorted(params.items()))
    base_str = "&".join([
        method.upper(),
        urllib.parse.quote(url, safe=""),
        urllib.parse.quote(sorted_params, safe=""),
    ])
    signing_key = f"{urllib.parse.quote(consumer_secret, safe='')}&"
    sig = base64.b64encode(
        hmac.new(signing_key.encode(), base_str.encode(), hashlib.sha1).digest()
    ).decode()
    params["oauth_signature"] = sig
    return "OAuth " + ", ".join(
        f'{k}="{urllib.parse.quote(str(v), safe="")}"' for k, v in sorted(params.items())
    )


async def _sg_get(path: str, key: str, secret: str, params: dict | None = None) -> dict:
    url = f"{_SG_BASE}{path}"
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(
            url, params=params,
            headers={"Authorization": _sg_auth_header("GET", url, key, secret)},
        )
    r.raise_for_status()
    return r.json()


async def _sg_get_all(path: str, key: str, secret: str, result_key: str) -> list:
    """Paginate a Schoology collection using start/limit offsets."""
    results: list = []
    start, limit = 0, 200
    while True:
        data = await _sg_get(path, key, secret, params={"start": start, "limit": limit})
        page = data.get(result_key) or []
        if isinstance(page, dict):
            page = [page]
        results.extend(page)
        if len(page) < limit:
            break
        start += limit
    return results


async def _run_schoology_sync(org_id: str) -> dict:
    doc = await motor_db.integrations.find_one({"org_id": org_id, "provider": "schoology"})
    if not doc or not doc.get("consumer_key"):
        raise HTTPException(status_code=400, detail="Schoology not connected")

    last_sync = doc.get("last_sync_at")
    if last_sync:
        if last_sync.tzinfo is None:
            last_sync = last_sync.replace(tzinfo=timezone.utc)
        elapsed = (datetime.now(timezone.utc) - last_sync).total_seconds()
        if elapsed < _SG_SYNC_COOLDOWN_SECONDS:
            wait = int(_SG_SYNC_COOLDOWN_SECONDS - elapsed)
            raise HTTPException(status_code=429, detail=f"Sync cooldown. Try again in {wait}s")

    key = doc["consumer_key"]
    secret = doc["consumer_secret"]

    try:
        sections = await _sg_get_all("/sections", key, secret, "section")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Schoology API error {e.response.status_code}: {e.response.text[:200]}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Schoology API error: {type(e).__name__}: {str(e)}")

    # Cache user lookups to avoid duplicate API calls within same sync
    _user_cache: dict[str, dict] = {}

    async def _get_user(uid: str) -> dict:
        if uid not in _user_cache:
            try:
                data = await _sg_get(f"/users/{uid}", key, secret)
                _user_cache[uid] = data.get("user") or data
            except Exception:
                _user_cache[uid] = {}
        return _user_cache[uid]

    new_classes = 0
    new_accounts = 0
    total_students = 0

    for section in sections:
        sg_section_id = str(section.get("id", ""))
        if not sg_section_id:
            continue

        section_name = section.get("section_title") or section.get("course_title") or f"Section {sg_section_id[:8]}"

        try:
            enrollments = await _sg_get_all(f"/sections/{sg_section_id}/enrollments", key, secret, "enrollment")
        except Exception:
            continue

        # Separate teacher (admin==1) from students (admin==0), filter active (status==1)
        teacher_enrollments = [e for e in enrollments if e.get("admin") == 1 and e.get("status") == 1]
        student_enrollments = [e for e in enrollments if e.get("admin") == 0 and e.get("status") == 1]

        # Resolve teacher email
        teacher_user_id = ""
        if teacher_enrollments:
            teacher_data = await _get_user(str(teacher_enrollments[0]["uid"]))
            teacher_email = (teacher_data.get("primary_email") or teacher_data.get("username") or "").lower()
            if teacher_email:
                tu = await motor_db.login.find_one({"username": teacher_email})
                if tu:
                    teacher_user_id = tu["user_id"]

        # Match or create class
        cls = await motor_db.classes.find_one({"schoology_section_id": sg_section_id, "org_id": org_id})
        if not cls and teacher_user_id:
            cls = await motor_db.classes.find_one({
                "teacher_id": teacher_user_id,
                "name": section_name,
                "org_id": org_id,
            })

        if cls:
            if not cls.get("schoology_section_id"):
                await motor_db.classes.update_one(
                    {"class_id": cls["class_id"]},
                    {"$set": {"schoology_section_id": sg_section_id}},
                )
            class_id = cls["class_id"]
            existing_ids: set = set(cls.get("student_ids") or [])
        else:
            class_id = secrets.token_urlsafe(16)
            await motor_db.classes.insert_one({
                "class_id": class_id,
                "org_id": org_id,
                "name": section_name,
                "time": "08:00",
                "days": ["Mon", "Tue", "Wed", "Thu", "Fri"],
                "teacher_id": teacher_user_id,
                "student_ids": [],
                "link_ids": [],
                "schoology_section_id": sg_section_id,
            })
            existing_ids = set()
            new_classes += 1

        students_to_add: list[str] = []
        for enrollment in student_enrollments:
            uid = str(enrollment.get("uid", ""))
            if not uid:
                continue
            user_data = await _get_user(uid)
            student_email = (user_data.get("primary_email") or user_data.get("username") or "").lower()
            if not student_email:
                continue

            total_students += 1
            existing = await motor_db.login.find_one({"username": student_email})
            if existing:
                student_uid = existing["user_id"]
                if not existing.get("schoology_uid"):
                    await motor_db.login.update_one({"user_id": student_uid}, {"$set": {"schoology_uid": uid}})
            else:
                student_uid = secrets.token_urlsafe(16)
                await motor_db.login.insert_one({
                    "username": student_email,
                    "user_id": student_uid,
                    "schoology_uid": uid,
                    "account_type": "institutional",
                    "role": "student",
                    "org_id": org_id,
                    "confirmed": "false",
                })
                new_accounts += 1

            if student_uid not in existing_ids:
                students_to_add.append(student_uid)
                existing_ids.add(student_uid)

        if students_to_add:
            await motor_db.classes.update_one(
                {"class_id": class_id},
                {"$push": {"student_ids": {"$each": students_to_add}}},
            )

    stats = {
        "sections": len(sections),
        "students": total_students,
        "new_classes": new_classes,
        "new_accounts": new_accounts,
    }
    await motor_db.integrations.update_one(
        {"org_id": org_id, "provider": "schoology"},
        {"$set": {"last_sync_at": datetime.now(timezone.utc), "last_sync_stats": stats}},
    )
    return {"ok": True, **stats}


# ── Schoology endpoints ───────────────────────────────────────────────────────

@router.post("/schoology/connect")
async def schoology_connect(body: dict, user: dict = Depends(get_confirmed_user)):
    """Validate Schoology credentials and store the connection."""
    require_school_admin(user)
    org_id = user.get("org_id") or ""

    consumer_key = (body.get("consumer_key") or "").strip()
    consumer_secret = (body.get("consumer_secret") or "").strip()
    if not consumer_key or not consumer_secret:
        raise HTTPException(status_code=422, detail="consumer_key and consumer_secret are required")

    # Validate by fetching school info
    try:
        data = await _sg_get("/schools", consumer_key, consumer_secret, params={"limit": 1})
        schools = data.get("school") or []
        if isinstance(schools, dict):
            schools = [schools]
        building_name = schools[0].get("title") or schools[0].get("name") or "" if schools else ""
    except httpx.HTTPStatusError as e:
        if e.response.status_code in (401, 403):
            raise HTTPException(status_code=400, detail="Invalid credentials")
        raise HTTPException(status_code=400, detail=f"Schoology API error: {e.response.status_code}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not connect to Schoology: {str(e)}")

    await motor_db.integrations.update_one(
        {"org_id": org_id, "provider": "schoology"},
        {"$set": {
            "org_id": org_id,
            "provider": "schoology",
            "consumer_key": consumer_key,
            "consumer_secret": consumer_secret,
            "building_name": building_name,
            "connected_at": datetime.now(timezone.utc),
            "last_sync_at": None,
            "last_sync_stats": None,
        }},
        upsert=True,
    )
    return {"connected": True, "building_name": building_name}


@router.get("/schoology/status")
async def schoology_status(user: dict = Depends(get_confirmed_user), org_id: str = Query(...)):
    require_school_admin(user)
    if user.get("org_id") != org_id and user.get("admin") != "true":
        raise HTTPException(status_code=403, detail="Access denied")
    doc = await motor_db.integrations.find_one({"org_id": org_id, "provider": "schoology"})
    if not doc or not doc.get("consumer_key"):
        return {"connected": False}
    return {
        "connected": True,
        "building_name": doc.get("building_name") or "",
        "last_sync_at": doc.get("last_sync_at"),
        "last_sync_stats": doc.get("last_sync_stats"),
    }


@router.post("/schoology/sync/{org_id}")
async def schoology_sync(org_id: str, user: dict = Depends(get_confirmed_user)):
    require_school_admin(user)
    if user.get("org_id") != org_id and user.get("admin") != "true":
        raise HTTPException(status_code=403, detail="Access denied")
    return await _run_schoology_sync(org_id)


@router.delete("/schoology/disconnect/{org_id}")
async def schoology_disconnect(org_id: str, user: dict = Depends(get_confirmed_user)):
    require_school_admin(user)
    if user.get("org_id") != org_id and user.get("admin") != "true":
        raise HTTPException(status_code=403, detail="Access denied")
    await motor_db.integrations.delete_one({"org_id": org_id, "provider": "schoology"})
    await motor_db.classes.update_many({"org_id": org_id}, {"$unset": {"schoology_section_id": ""}})
    return {"ok": True}
