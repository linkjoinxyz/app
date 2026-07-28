from collections import defaultdict
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.auth import get_confirmed_user
from app.database import motor_db
from app.routers.attendance import (
    _rate_stats_from_records,
    _class_expected_dates,
    _LOOKBACK_DAYS as _RATE_LOOKBACK_DAYS,
    _TARDY_THRESHOLD_MINUTES,
    _record_date_str,
)
from app.utils import get_blackout_set, expected_session_dates, lookback_cutoff

router = APIRouter(prefix="/parent", tags=["parent"])

_LOOKBACK_DAYS = 365

def formatDate(date_str: str) -> str:
    try:
        from datetime import date as _date
        y, mo, d = map(int, date_str.split("-"))
        return _date(y, mo, d).strftime("%b %-d, %Y")
    except Exception:
        return date_str


def _require_parent(user: dict) -> None:
    if user.get("role") != "parent":
        raise HTTPException(status_code=403, detail="Parent access required")


async def _parent_student_ids(parent_user_id: str) -> list[str]:
    links = await motor_db.parent_links.find(
        {"parent_user_id": parent_user_id}, {"student_user_id": 1}
    ).to_list(None)
    return [lnk["student_user_id"] for lnk in links]


class ReminderSettingsRequest(BaseModel):
    sms_enabled: bool
    email_enabled: bool


@router.get("/settings")
async def get_reminder_settings(user: dict = Depends(get_confirmed_user)):
    _require_parent(user)
    doc = await motor_db.login.find_one(
        {"username": user["username"]},
        {"number": 1, "parent_reminders_sms": 1, "parent_reminders_email": 1, "_id": 0},
    )
    return {
        "sms_enabled": bool((doc or {}).get("parent_reminders_sms")),
        "email_enabled": bool((doc or {}).get("parent_reminders_email")),
        "has_phone": bool((doc or {}).get("number")),
    }


@router.patch("/settings")
async def update_reminder_settings(body: ReminderSettingsRequest, user: dict = Depends(get_confirmed_user)):
    _require_parent(user)
    if body.sms_enabled:
        doc = await motor_db.login.find_one({"username": user["username"]}, {"number": 1, "_id": 0})
        if not (doc or {}).get("number"):
            raise HTTPException(status_code=422, detail="Add a phone number before enabling text reminders")
    await motor_db.login.update_one(
        {"username": user["username"]},
        {"$set": {"parent_reminders_sms": body.sms_enabled, "parent_reminders_email": body.email_enabled}},
    )
    return {"message": "Updated"}


@router.get("/children")
async def list_children(user: dict = Depends(get_confirmed_user)):
    _require_parent(user)
    student_ids = await _parent_student_ids(user["user_id"])
    if not student_ids:
        return []

    children = []
    for uid in student_ids:
        student = await motor_db.login.find_one(
            {"user_id": uid},
            {"_id": 0, "username": 1, "user_id": 1, "name": 1, "first_name": 1, "last_name": 1, "org_id": 1},
        )
        if student:
            student.pop("_id", None)
            children.append(student)
    return children


@router.get("/children/{student_id}/classes")
async def get_child_classes(student_id: str, user: dict = Depends(get_confirmed_user)):
    _require_parent(user)
    linked_ids = await _parent_student_ids(user["user_id"])
    if student_id not in linked_ids:
        raise HTTPException(status_code=403, detail="Access denied")

    student = await motor_db.login.find_one({"user_id": student_id}, {"username": 1, "_id": 0})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    student_email = student["username"]

    now = datetime.now(timezone.utc)
    cutoff = lookback_cutoff(now, _RATE_LOOKBACK_DAYS)

    result = []
    classes = await motor_db.classes.find({"student_ids": student_id}, {"_id": 0}).to_list(None)
    if not classes:
        return result

    # Batch what the old loop fetched one class at a time (an N+1 per class:
    # org, this student's attendance rows, open interventions, teacher). A
    # student's classes usually share one org, so the deduped org $in alone
    # collapses several identical round-trips.
    class_ids = [c["class_id"] for c in classes]
    org_ids = list({c.get("org_id", "") for c in classes})
    orgs = {
        o["org_id"]: o
        async for o in motor_db.orgs.find(
            {"org_id": {"$in": org_ids}},
            {"org_id": 1, "attendance_settings": 1, "blackout_dates": 1, "summer_start": 1, "summer_end": 1, "_id": 0},
        )
    }
    recs_by_class: dict[str, list] = defaultdict(list)
    async for r in motor_db.attendance.find({
        "class_id": {"$in": class_ids},
        "student_email": student_email,
        "$or": [{"opened_at": {"$gte": cutoff}}, {"recorded_at": {"$gte": cutoff}}],
    }):
        recs_by_class[r["class_id"]].append(r)
    iv_by_class: dict[str, dict] = {}
    async for iv in motor_db.interventions.find(
        {"class_id": {"$in": class_ids}, "student_email": student_email, "status": {"$ne": "resolved"}},
        {"flag_type": 1, "class_id": 1, "_id": 0},
    ):
        iv_by_class.setdefault(iv["class_id"], iv)  # first open flag per class, matching the old find_one
    # teacher_id is stored as a user_id on some classes and an email on legacy
    # ones, so look up both and index by whichever key each class carries.
    teacher_ids = list({c.get("teacher_id") for c in classes if c.get("teacher_id")})
    teacher_email_by_key: dict[str, str] = {}
    if teacher_ids:
        async for t in motor_db.login.find(
            {"$or": [{"user_id": {"$in": teacher_ids}}, {"username": {"$in": teacher_ids}}]},
            {"user_id": 1, "username": 1, "_id": 0},
        ):
            uname = t.get("username", "")
            if t.get("user_id"):
                teacher_email_by_key[t["user_id"]] = uname
            if uname:
                teacher_email_by_key.setdefault(uname, uname)

    now = datetime.now(timezone.utc)
    for cls in classes:
        class_id = cls["class_id"]
        class_days = cls.get("days") or []
        org = orgs.get(cls.get("org_id", "")) or {}
        tardy_threshold = int(org.get("attendance_settings", {}).get("tardy_threshold_minutes", _TARDY_THRESHOLD_MINUTES))
        expected_dates = _class_expected_dates(cls, cutoff, _RATE_LOOKBACK_DAYS, get_blackout_set(org), now)
        stats = _rate_stats_from_records(
            recs_by_class.get(class_id, []), cls, student_email,
            set(expected_dates), len(expected_dates), tardy_threshold,
        )
        attended = stats["sessions"]
        tardy = stats["tardy"]
        expected = stats["effective_expected"] if class_days else None
        attendance_rate = stats["attendance_rate"] if class_days else None

        open_iv = iv_by_class.get(class_id)
        teacher_email = teacher_email_by_key.get(cls.get("teacher_id"), "")

        result.append({
            "class_id": class_id,
            "class_name": cls.get("name", ""),
            "teacher_name": cls.get("teacher_name", ""),
            "teacher_email": teacher_email,
            "time": cls.get("time", ""),
            "days": class_days,
            "attended_last_28d": attended,
            "expected_last_28d": expected,
            "tardy_last_28d": tardy,
            "attendance_rate": attendance_rate,
            "active_flag": open_iv["flag_type"] if open_iv else None,
        })

    return result


@router.get("/children/{student_id}/attendance")
async def get_child_attendance(student_id: str, limit: int = 20, offset: int = 0, q: str = "", user: dict = Depends(get_confirmed_user)):
    _require_parent(user)
    linked_ids = await _parent_student_ids(user["user_id"])
    if student_id not in linked_ids:
        raise HTTPException(status_code=403, detail="Access denied")

    student = await motor_db.login.find_one({"user_id": student_id}, {"username": 1, "_id": 0})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    student_email = student["username"]

    now = datetime.now(timezone.utc)
    cutoff = lookback_cutoff(now, _LOOKBACK_DAYS)

    def _ts(r: dict):
        t = r.get("recorded_at") or r.get("opened_at")
        if isinstance(t, datetime) and t.tzinfo is None:
            t = t.replace(tzinfo=timezone.utc)
        return t

    # Index attendance records by (class_id, date), keeping the most-recently
    # recorded row per key so a teacher override supersedes a stale/original
    # row instead of an arbitrary cursor-order pick — same tie-break rule as
    # attendance.py's _resolve_latest_records, keyed across classes here since
    # this endpoint spans every class the student is in.
    records_map: dict = {}
    async for r in motor_db.attendance.find(
        {"student_email": student_email, "$or": [{"opened_at": {"$gte": cutoff}}, {"recorded_at": {"$gte": cutoff}}]},
        {"class_id": 1, "class_name": 1, "opened_at": 1, "minutes_late": 1, "recorded_at": 1, "record_date": 1},
    ):
        oid = str(r.pop("_id"))
        date_str = _record_date_str(r)
        r["record_id"] = oid
        r["date"] = date_str
        opened_at = r["opened_at"]
        r["opened_at"] = opened_at.isoformat() if hasattr(opened_at, "isoformat") else opened_at
        key = (r["class_id"], date_str)
        existing = records_map.get(key)
        if existing is None or (_ts(r) and (not _ts(existing) or _ts(r) >= _ts(existing))):
            records_map[key] = r

    # Build per-class scheduled dates within the lookback window up to today,
    # excluding org blackout/summer dates and per-date cancellations, and using
    # the org's configured tardy threshold instead of a hardcoded value. This now
    # shares expected_session_dates with every teacher-facing surface, so the
    # numbers a parent sees cannot drift from the ones the teacher sees.
    class_info: dict = {}
    org_cache: dict = {}
    async for cls in motor_db.classes.find(
        {"student_ids": student_id},
        # time and schedule_overrides are needed by the resolver.
        {"class_id": 1, "name": 1, "days": 1, "time": 1, "schedule_overrides": 1, "org_id": 1, "_id": 0},
    ):
        if not (cls.get("days") or []):
            continue

        org_id = cls.get("org_id", "")
        if org_id not in org_cache:
            org_cache[org_id] = await motor_db.orgs.find_one(
                {"org_id": org_id}, {"blackout_dates": 1, "summer_start": 1, "summer_end": 1, "attendance_settings": 1}
            ) or {}
        org = org_cache[org_id]
        blackout_dates = get_blackout_set(org)
        tardy_threshold = int((org.get("attendance_settings") or {}).get("tardy_threshold_minutes", _TARDY_THRESHOLD_MINUTES))

        scheduled_dates = set(expected_session_dates(
            cls, cutoff.date(), (cutoff + timedelta(days=_LOOKBACK_DAYS)).date(),
            blackout_dates, through=now.date(),
        ))
        class_info[cls["class_id"]] = {
            "class_name": cls["name"], "scheduled_dates": scheduled_dates, "tardy_threshold": tardy_threshold,
        }

    # Index parent notes by (class_id, date)
    notes_map: dict = {}
    async for n in motor_db.parent_notes.find({"student_user_id": student_id}):
        n.pop("_id", None)
        ts = n.get("submitted_at")
        n["submitted_at"] = ts.isoformat() if hasattr(ts, "isoformat") else str(ts)
        notes_map[(n["class_id"], n["date"])] = n

    events = []

    # Attended sessions (on_time or tardy); a record whose latest version is an
    # absent/excused override (opened_at None) falls through to "absent" below.
    for (class_id, date_str), rec in records_map.items():
        if not rec.get("opened_at"):
            continue
        ml = rec.get("minutes_late") or 0
        tardy_threshold = class_info.get(class_id, {}).get("tardy_threshold", _TARDY_THRESHOLD_MINUTES)
        events.append({
            "type": "tardy" if ml > tardy_threshold else "on_time",
            "date": date_str,
            "class_id": class_id,
            "class_name": rec.get("class_name") or class_info.get(class_id, {}).get("class_name", ""),
            "record_id": rec["record_id"],
            "minutes_late": ml,
            "parent_note": notes_map.get((class_id, date_str)),
        })

    # Absent sessions: scheduled but no record, or the latest record for that
    # date is an absent/excused override.
    for class_id, info in class_info.items():
        for date_str in info["scheduled_dates"]:
            key = (class_id, date_str)
            rec = records_map.get(key)
            if rec and rec.get("opened_at"):
                continue
            events.append({
                "type": "absent",
                "date": date_str,
                "class_id": class_id,
                "class_name": info["class_name"],
                "record_id": rec["record_id"] if rec else None,
                "minutes_late": None,
                "parent_note": notes_map.get(key),
            })

    events.sort(key=lambda e: e["date"], reverse=True)
    if q:
        ql = q.lower()
        events = [e for e in events if ql in e["date"].lower() or ql in formatDate(e["date"]).lower()]
    total = len(events)
    return {"events": events[offset:offset + limit], "total": total, "offset": offset, "limit": limit}


class ParentNoteBody(BaseModel):
    student_user_id: str
    class_id: str
    class_name: str
    date: str  # YYYY-MM-DD
    note: str
    is_excuse: bool = False


@router.post("/notes")
async def submit_parent_note(body: ParentNoteBody, user: dict = Depends(get_confirmed_user)):
    _require_parent(user)
    linked_ids = await _parent_student_ids(user["user_id"])
    if body.student_user_id not in linked_ids:
        raise HTTPException(status_code=403, detail="Access denied")

    student = await motor_db.login.find_one({"user_id": body.student_user_id}, {"username": 1, "_id": 0})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    doc = {
        "student_email": student["username"],
        "student_user_id": body.student_user_id,
        "parent_user_id": user["user_id"],
        "class_id": body.class_id,
        "class_name": body.class_name,
        "date": body.date,
        "note": body.note.strip(),
        "is_excuse": body.is_excuse,
        "submitted_at": datetime.now(timezone.utc),
    }
    await motor_db.parent_notes.update_one(
        {"student_user_id": body.student_user_id, "class_id": body.class_id, "date": body.date},
        {"$set": doc},
        upsert=True,
    )
    return {"ok": True}


@router.get("/children/{student_id}/notes")
async def list_student_notes(student_id: str, user: dict = Depends(get_confirmed_user)):
    """Accessible by the linked parent or school staff."""
    role = user.get("role")
    if role == "parent":
        linked = await _parent_student_ids(user["user_id"])
        if student_id not in linked:
            raise HTTPException(status_code=403, detail="Access denied")
    elif role in ("school_admin", "district_admin", "teacher"):
        stu = await motor_db.login.find_one({"user_id": student_id}, {"org_id": 1, "_id": 0})
        if not stu:
            raise HTTPException(status_code=404, detail="Student not found")
        if role == "teacher":
            teacher_classes = await motor_db.classes.find(
                {"teacher_id": user["user_id"]}, {"student_ids": 1}
            ).to_list(None)
            allowed_ids = {uid for cls in teacher_classes for uid in (cls.get("student_ids") or [])}
            if student_id not in allowed_ids:
                raise HTTPException(status_code=403, detail="Student not in your classes")
        elif not user.get("org_id") or stu.get("org_id") != user.get("org_id"):
            raise HTTPException(status_code=403, detail="Access denied")
    else:
        raise HTTPException(status_code=403, detail="Access denied")

    notes = []
    async for n in motor_db.parent_notes.find({"student_user_id": student_id}).sort("submitted_at", -1):
        n["id"] = str(n.pop("_id"))
        ts = n.get("submitted_at")
        n["submitted_at"] = ts.isoformat() if hasattr(ts, "isoformat") else str(ts)
        notes.append(n)
    return notes
