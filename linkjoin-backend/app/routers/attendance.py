import csv
import io
import logging
import re
from bson import ObjectId
from collections import defaultdict
from datetime import datetime, date as date_type, timezone, timedelta
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from app.auth import get_confirmed_user
from app.database import motor_db
from app.roles import require_teacher, require_premium
from app.utils import get_blackout_set, compute_session_start_utc
from app.audit import log_audit

log = logging.getLogger(__name__)

_GC_SYNC_COOLDOWN_SECONDS = 120


class ExcuseBody(BaseModel):
    excused: bool
    excuse_reason: str = ""

_OVERRIDE_REASON_CODES = {
    "joined_outside_linkjoin", "device_failure", "connectivity_outage",
    "excused", "late_enrollment", "other",
}
_OVERRIDE_STATUSES = {"present", "absent", "excused"}


class OverrideBody(BaseModel):
    date: str
    student_emails: list[str] = []
    status: str
    reason_code: str
    note: str | None = None
    join_time: str | None = None  # optional "H:MM"/"HH:MM", applied to the whole selection

_DAY_TO_WEEKDAY = {'Sun': 6, 'Mon': 0, 'Tue': 1, 'Wed': 2, 'Thu': 3, 'Fri': 4, 'Sat': 5}
_LOOKBACK_DAYS = 28
_TARDY_THRESHOLD_MINUTES = 5
_TARDY_RATE_FLAG = 0.33
_ATTENDANCE_RATE_FLAG = 0.5
_MIN_SESSIONS_TO_FLAG = 3
_LEAK_RATE_FLAG = 0.15

router = APIRouter(prefix="/attendance", tags=["attendance"])


def _record_date_str(r: dict) -> str:
    if r.get("record_date"):
        return r["record_date"]
    opened = r.get("opened_at")
    return opened.strftime("%Y-%m-%d") if isinstance(opened, datetime) else str(opened or "")[:10]


def _resolve_latest_records(records: list[dict]) -> dict[tuple[str, str], dict]:
    """Group attendance rows by (student_email, date) and keep the most recently
    recorded one. Overrides are append-only — nothing is ever deleted — so reads
    must resolve to whichever row was written last, not the most flattering one."""
    def ts(r: dict):
        t = r.get("recorded_at") or r.get("opened_at")
        if isinstance(t, datetime) and t.tzinfo is None:
            t = t.replace(tzinfo=timezone.utc)
        return t

    latest: dict[tuple[str, str], dict] = {}
    for r in records:
        key = (r["student_email"], _record_date_str(r))
        existing = latest.get(key)
        if existing is None or (ts(r) and (not ts(existing) or ts(r) >= ts(existing))):
            latest[key] = r
    return latest


async def compute_leak_rate(class_id: str, cutoff: datetime) -> tuple[float, int]:
    """Share of a class's attendance events in the lookback window whose
    reason_code is joined_outside_linkjoin — the leak signal from brief §D."""
    pipeline = [
        {"$match": {
            "class_id": class_id,
            "$or": [{"opened_at": {"$gte": cutoff}}, {"recorded_at": {"$gte": cutoff}}],
        }},
        {"$group": {
            "_id": None,
            "total": {"$sum": 1},
            "leaks": {"$sum": {"$cond": [{"$eq": ["$reason_code", "joined_outside_linkjoin"]}, 1, 0]}},
        }},
    ]
    async for row in motor_db.attendance.aggregate(pipeline):
        total = row.get("total", 0)
        leaks = row.get("leaks", 0)
        return (leaks / total if total else 0.0, total)
    return (0.0, 0)


async def _gc_sync_if_due(class_id: str) -> None:
    try:
        cls = await motor_db.classes.find_one({"class_id": class_id})
        if not cls or not cls.get("gc_course_id"):
            return
        last = cls.get("gc_last_synced")
        if last:
            if last.tzinfo is None:
                last = last.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) - last < timedelta(seconds=_GC_SYNC_COOLDOWN_SECONDS):
                return
        from app.routers.integrations import _run_sync
        await _run_sync(class_id, cls)
    except Exception:
        log.exception("GC auto-sync failed for class %s", class_id)


@router.post("", status_code=201)
async def log_attendance(body: dict, background_tasks: BackgroundTasks, user: dict = Depends(get_confirmed_user)):
    email = user["username"]
    link_id = body.get("link_id")
    class_id = body.get("class_id")

    if not isinstance(link_id, int) or not class_id:
        raise HTTPException(status_code=422, detail="link_id and class_id required")

    link = await motor_db.links.find_one({"username": email, "id": link_id})
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")

    await motor_db.attendance.insert_one({
        "student_email": email,
        "link_id": link_id,
        "class_id": class_id,
        "class_name": body.get("class_name") or link.get("class_name", ""),
        "share_id": link.get("share_id"),
        "opened_at": datetime.now(timezone.utc),
        "minutes_late": int(body.get("minutes_late", 0)),
    })
    background_tasks.add_task(_gc_sync_if_due, class_id)
    return {"message": "Logged"}


@router.get("/me/rewards")
async def get_my_rewards(user: dict = Depends(get_confirmed_user)):
    require_premium(user)
    email = user["username"]

    org_id = user.get("org_id")
    tardy_threshold = _TARDY_THRESHOLD_MINUTES
    if org_id:
        org = await motor_db.orgs.find_one({"org_id": org_id}, {"attendance_settings": 1})
        org_settings = (org or {}).get("attendance_settings") or {}
        tardy_threshold = int(org_settings.get("tardy_threshold_minutes", _TARDY_THRESHOLD_MINUTES))

    records = []
    async for r in motor_db.attendance.find(
        # opened_at can be null on an absent/excused manual_override — those
        # aren't "sessions" for streak purposes, exclude them at the query level.
        {"student_email": email, "opened_at": {"$ne": None}},
        {"opened_at": 1, "minutes_late": 1}
    ).sort("opened_at", 1):
        records.append(r)

    if not records:
        return {"current_streak": 0, "longest_streak": 0, "total_sessions": 0,
                "on_time_sessions": 0, "awards": []}

    by_date: dict[str, list[int]] = defaultdict(list)
    for r in records:
        opened = r["opened_at"]
        if not opened.tzinfo:
            opened = opened.replace(tzinfo=timezone.utc)
        by_date[opened.strftime("%Y-%m-%d")].append(r.get("minutes_late") or 0)

    dates = sorted(by_date.keys())
    date_on_time = {d: any(ml <= tardy_threshold for ml in by_date[d]) for d in dates}

    total_sessions = len(records)
    on_time_sessions = sum(1 for r in records if (r.get("minutes_late") or 0) <= tardy_threshold)

    # Streaks: consecutive session-dates where student was on time
    all_streaks: list[int] = []
    run = 0
    for d in dates:
        if date_on_time[d]:
            run += 1
        else:
            if run:
                all_streaks.append(run)
            run = 0
    if run:
        all_streaks.append(run)
    longest_streak = max(all_streaks, default=0)

    current_streak = 0
    for d in reversed(dates):
        if date_on_time[d]:
            current_streak += 1
        else:
            break

    # Perfect week: any Mon-Fri span with >= 3 session days all on time
    def has_perfect_week() -> bool:
        by_week: dict[date_type, list[str]] = defaultdict(list)
        for d in dates:
            dt = date_type.fromisoformat(d)
            week_start = dt - timedelta(days=dt.weekday())
            by_week[week_start].append(d)
        return any(
            len(week_dates) >= 3 and all(date_on_time[d] for d in week_dates)
            for week_dates in by_week.values()
        )

    awards: list[str] = []
    if total_sessions > 0:
        awards.append("first_steps")
    if on_time_sessions > 0:
        awards.append("on_point")
    if longest_streak >= 5:
        awards.append("streak_5")
    if longest_streak >= 10:
        awards.append("streak_10")
    if longest_streak >= 20:
        awards.append("monthly_champion")
    if has_perfect_week():
        awards.append("perfect_week")

    return {
        "current_streak": current_streak,
        "longest_streak": longest_streak,
        "total_sessions": total_sessions,
        "on_time_sessions": on_time_sessions,
        "awards": awards,
    }


@router.get("/class/{class_id}")
async def get_class_attendance(class_id: str, user: dict = Depends(get_confirmed_user)):
    require_teacher(user)

    cls = await motor_db.classes.find_one({"class_id": class_id})
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")
    if user.get("role") == "teacher" and cls["teacher_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    if user.get("role") in ("school_admin", "district_admin") and cls["org_id"] != user.get("org_id"):
        raise HTTPException(status_code=403, detail="Access denied")

    records = []
    present_combos: set[tuple[str, str]] = set()
    raw_records = await motor_db.attendance.find({"class_id": class_id}).sort("opened_at", -1).limit(200).to_list(None)
    latest_by_key = _resolve_latest_records(raw_records)
    for r in raw_records:
        r.setdefault("manual", False)
        r.setdefault("source", "manual_override" if r.get("manual") else "linkjoin_click")
        r.setdefault("recorded_by_user_id", None)
        r.setdefault("reason_code", "other" if r.get("manual") else None)
        r.setdefault("note", "")
        r.setdefault("excused", False)
        r.setdefault("excuse_reason", "")
        r.setdefault("absent", False)
        date_str = _record_date_str(r)
        r.setdefault("record_date", date_str)
        r["is_current"] = latest_by_key.get((r["student_email"], date_str)) is r
        r["record_id"] = str(r.pop("_id"))
        opened = r.get("opened_at")
        recorded = r.get("recorded_at")
        r["opened_at"] = opened.isoformat() if isinstance(opened, datetime) else opened
        r["recorded_at"] = recorded.isoformat() if isinstance(recorded, datetime) else recorded
        records.append(r)
        present_combos.add((r["student_email"], date_str))

    # Fill in absences: for every scheduled class day in the recent lookback
    # window, any roster student with no record at all gets a synthetic
    # "absent" row instead of just being missing from the table.
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=_LOOKBACK_DAYS)
    class_days = cls.get("days") or []
    scheduled_weekdays = {_DAY_TO_WEEKDAY[d] for d in class_days if d in _DAY_TO_WEEKDAY}
    expected_dates = [
        (cutoff + timedelta(days=i)).strftime("%Y-%m-%d")
        for i in range(_LOOKBACK_DAYS)
        if (cutoff + timedelta(days=i)).weekday() in scheduled_weekdays
    ]

    org = await motor_db.orgs.find_one({"org_id": cls.get("org_id", "")}, {"blackout_dates": 1, "summer_start": 1, "summer_end": 1})
    blackout_dates = get_blackout_set(org or {})
    excused_by_email: dict[str, set] = defaultdict(set)
    for e in cls.get("excused_absences") or []:
        excused_by_email[e.get("student_email")].add(e.get("date"))

    from app.routers.classes import _resolve_students
    roster = await _resolve_students(cls.get("student_ids", []))

    for date_str in expected_dates:
        if date_str in blackout_dates:
            continue
        for s in roster:
            email = s["username"]
            if (email, date_str) in present_combos:
                continue
            records.append({
                "record_id": None,
                "student_email": email,
                "class_id": class_id,
                "class_name": cls.get("name", ""),
                "share_id": None,
                "opened_at": f"{date_str}T00:00:00",
                "minutes_late": None,
                "excused": date_str in excused_by_email.get(email, set()),
                "excuse_reason": "",
                "manual": False,
                "absent": True,
                "source": None,
                "reason_code": None,
                "note": "",
                "recorded_by_user_id": None,
                "recorded_at": None,
                "record_date": date_str,
                "is_current": True,
            })

    records.sort(key=lambda r: r["opened_at"], reverse=True)
    return {"records": records}


@router.post("/class/{class_id}/override")
async def override_class_attendance(class_id: str, body: OverrideBody, user: dict = Depends(get_confirmed_user)):
    require_teacher(user)

    cls = await motor_db.classes.find_one({"class_id": class_id})
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")
    if user.get("role") == "teacher" and cls["teacher_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    if user.get("role") in ("school_admin", "district_admin") and cls["org_id"] != user.get("org_id"):
        raise HTTPException(status_code=403, detail="Access denied")

    try:
        day = date_type.fromisoformat(body.date)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid date")

    if body.status not in _OVERRIDE_STATUSES:
        raise HTTPException(status_code=422, detail=f"status must be one of {sorted(_OVERRIDE_STATUSES)}")
    if body.reason_code not in _OVERRIDE_REASON_CODES:
        raise HTTPException(status_code=422, detail=f"reason_code must be one of {sorted(_OVERRIDE_REASON_CODES)}")
    if body.reason_code == "other" and not (body.note or "").strip():
        raise HTTPException(status_code=422, detail="note is required when reason_code is 'other'")

    join_time_str = (body.join_time or "").strip()
    opened_at = None
    minutes_late = None
    if join_time_str:
        if not re.match(r"^\d{1,2}:\d{2}$", join_time_str):
            raise HTTPException(status_code=422, detail="join_time must be H:MM or HH:MM")
        h, m = (int(x) for x in join_time_str.split(":"))
        if not (0 <= h <= 23 and 0 <= m <= 59):
            raise HTTPException(status_code=422, detail="Invalid join_time value")
        opened_at = datetime(day.year, day.month, day.day, h, m, tzinfo=timezone.utc)
        teacher = await motor_db.login.find_one({"user_id": cls.get("teacher_id", "")}, {"timezone": 1})
        tz_name = (teacher or {}).get("timezone") or "UTC"
        day_start_probe = datetime(day.year, day.month, day.day, tzinfo=timezone.utc)
        session_start = compute_session_start_utc(cls.get("time", ""), cls.get("days") or [], tz_name, day_start_probe)
        if session_start is not None:
            session_start_on_day = session_start.replace(year=day.year, month=day.month, day=day.day)
            minutes_late = round((opened_at - session_start_on_day).total_seconds() / 60)
        else:
            # The override's date isn't a day this class is scheduled to meet
            # (e.g. a correction entered against the wrong weekday) — a real
            # timestamp exists but lateness can't be computed against a
            # session start, so treat as on-time rather than leaving minutes_late
            # null with a non-null opened_at (breaks every "minutes_late > X" read).
            minutes_late = 0
    elif body.status == "present":
        # No explicit join time given — same "on time, at day start" default as
        # the old checkbox flow, just now reason-coded and append-only.
        opened_at = datetime(day.year, day.month, day.day, tzinfo=timezone.utc)
        minutes_late = 0

    absent = body.status in ("absent", "excused")
    excused = body.status == "excused"
    if absent:
        opened_at = None
        minutes_late = None

    from app.routers.classes import _resolve_students
    roster_emails = {s["username"] for s in await _resolve_students(cls.get("student_ids", []))}

    # Widened by a day on each side: a legacy (pre-record_date) linkjoin_click's
    # opened_at is a real UTC instant that can fall on the adjacent UTC calendar
    # day for negative-offset timezones. _resolve_latest_records re-derives each
    # row's own date below, so the extra candidates are harmless — this is just
    # candidate gathering, not the final bucketing.
    day_start = datetime(day.year, day.month, day.day, tzinfo=timezone.utc) - timedelta(days=1)
    day_end = datetime(day.year, day.month, day.day, tzinfo=timezone.utc) + timedelta(days=2)
    existing_records = await motor_db.attendance.find(
        {"class_id": class_id, "$or": [
            {"opened_at": {"$gte": day_start, "$lt": day_end}},
            {"record_date": body.date},
        ]},
    ).to_list(None)
    latest_by_key = _resolve_latest_records(existing_records)

    requested = list(dict.fromkeys(body.student_emails))
    selected = [e for e in requested if e in roster_emails]
    skipped = len(requested) - len(selected)

    now = datetime.now(timezone.utc)
    to_insert = []
    for email in selected:
        prev = latest_by_key.get((email, body.date))
        previous_record = None
        if prev:
            prev_opened = prev.get("opened_at")
            previous_record = {
                "source": prev.get("source") or ("manual_override" if prev.get("manual") else "linkjoin_click"),
                "opened_at": prev_opened.isoformat() if isinstance(prev_opened, datetime) else prev_opened,
                "minutes_late": prev.get("minutes_late"),
                "reason_code": prev.get("reason_code"),
            }
        to_insert.append({
            "student_email": email,
            "link_id": None,
            "class_id": class_id,
            "class_name": cls.get("name", ""),
            "share_id": None,
            "opened_at": opened_at,
            "minutes_late": minutes_late,
            "excused": excused,
            "excuse_reason": (body.note or "").strip() if excused else "",
            "absent": absent,
            "manual": True,
            "entered_by": user["username"],
            "source": "manual_override",
            "recorded_by_user_id": user.get("user_id"),
            "reason_code": body.reason_code,
            "note": (body.note or "").strip(),
            "recorded_at": now,
            "record_date": body.date,
            "previous_record": previous_record,
        })

    if to_insert:
        await motor_db.attendance.insert_many(to_insert)

    await log_audit(
        user["username"], "data.attendance_override",
        detail={"class_id": class_id, "date": body.date, "reason_code": body.reason_code,
                "status": body.status, "written": len(to_insert), "skipped": skipped},
    )
    return {"written": len(to_insert), "skipped": skipped}


@router.patch("/{record_id}")
async def excuse_attendance_record(record_id: str, body: ExcuseBody, user: dict = Depends(get_confirmed_user)):
    require_teacher(user)
    try:
        oid = ObjectId(record_id)
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid record_id")
    rec = await motor_db.attendance.find_one({"_id": oid}, {"class_id": 1})
    if not rec:
        raise HTTPException(status_code=404, detail="Record not found")
    cls = await motor_db.classes.find_one({"class_id": rec["class_id"]})
    if cls:
        if user.get("role") == "teacher" and cls.get("teacher_id") != user["user_id"]:
            raise HTTPException(status_code=403, detail="Access denied")
        if user.get("role") in ("school_admin", "district_admin") and cls.get("org_id") != user.get("org_id"):
            raise HTTPException(status_code=403, detail="Access denied")
    await motor_db.attendance.update_one(
        {"_id": oid},
        {"$set": {"excused": body.excused, "excuse_reason": body.excuse_reason}}
    )
    return {"ok": True}


@router.get("/class/{class_id}/patterns")
async def get_class_patterns(class_id: str, student_email: str | None = Query(default=None), user: dict = Depends(get_confirmed_user)):
    require_teacher(user)

    cls = await motor_db.classes.find_one({"class_id": class_id})
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")
    if user.get("role") == "teacher" and cls["teacher_id"] != user["user_id"]:
        # Also allow teachers who have an active intervention assigned to them for this class
        assigned = await motor_db.interventions.find_one({
            "class_id": class_id,
            "assigned_to": user["username"],
            "status": {"$ne": "resolved"},
        })
        if not assigned:
            raise HTTPException(status_code=403, detail="Access denied")
    if user.get("role") in ("school_admin", "district_admin") and cls["org_id"] != user.get("org_id"):
        raise HTTPException(status_code=403, detail="Access denied")

    # Load org-level settings (thresholds + blackout dates)
    org = await motor_db.orgs.find_one(
        {"org_id": cls.get("org_id", "")},
        {"attendance_settings": 1, "blackout_dates": 1, "summer_start": 1, "summer_end": 1}
    )
    org_settings = (org or {}).get("attendance_settings") or {}
    blackout_dates = get_blackout_set(org or {})
    tardy_threshold = int(org_settings.get("tardy_threshold_minutes", _TARDY_THRESHOLD_MINUTES))
    tardy_rate_flag = float(org_settings.get("tardy_rate_flag", _TARDY_RATE_FLAG))
    attendance_rate_flag = float(org_settings.get("attendance_rate_flag", _ATTENDANCE_RATE_FLAG))
    min_sessions = int(org_settings.get("min_sessions_to_flag", _MIN_SESSIONS_TO_FLAG))
    leak_rate_flag = float(org_settings.get("leak_rate_flag", _LEAK_RATE_FLAG))

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=_LOOKBACK_DAYS)

    leak_rate, leak_total_events = await compute_leak_rate(class_id, cutoff)
    data_quality_flagged = leak_total_events >= min_sessions and leak_rate >= leak_rate_flag

    # Build ordered list of scheduled class dates in the lookback window.
    # All scheduled days count toward expected_count; blackout dates are excluded
    # from the missed-days list but do not reduce expected_count.
    class_days = cls.get("days") or []
    scheduled_weekdays = {_DAY_TO_WEEKDAY[d] for d in class_days if d in _DAY_TO_WEEKDAY}
    expected_dates: list[str] = [
        (cutoff + timedelta(days=i)).strftime("%Y-%m-%d")
        for i in range(_LOOKBACK_DAYS)
        if (cutoff + timedelta(days=i)).weekday() in scheduled_weekdays
    ]
    expected_count = len(expected_dates)
    expected_dates_set = set(expected_dates)

    # Load per-student excused absences stored on the class document
    class_excused_absences: list[dict] = cls.get("excused_absences") or []

    # Fetch all attendance records within the window. Match on opened_at OR
    # recorded_at — a manual_override for an absence has a null opened_at.
    by_student: dict[str, list] = defaultdict(list)
    async for r in motor_db.attendance.find({
        "class_id": class_id,
        "$or": [{"opened_at": {"$gte": cutoff}}, {"recorded_at": {"$gte": cutoff}}],
    }):
        by_student[r["student_email"]].append(r)

    # Resolve enrolled students from roster
    enrolled_emails: set[str] = set()
    email_to_user_id: dict[str, str] = {}
    for uid in cls.get("student_ids") or []:
        u = await motor_db.login.find_one({"user_id": uid}, {"_id": 0, "username": 1, "user_id": 1})
        if u:
            enrolled_emails.add(u["username"])
            email_to_user_id[u["username"]] = u["user_id"]
            by_student.setdefault(u["username"], [])

    # Build intervention state per (student_email, flag_type):
    #   active_iv_keys  — has an open/in_progress intervention → use normal flag logic
    #   resolved_iv_ts  — most recent resolved_at timestamp → use post-resolution logic
    active_iv_keys: set[tuple[str, str]] = set()
    resolved_iv_ts: dict[tuple[str, str], datetime] = {}
    async for iv in motor_db.interventions.find(
        {"class_id": class_id},
        {"student_email": 1, "flag_type": 1, "status": 1, "resolved_at": 1, "updated_at": 1},
    ):
        key = (iv["student_email"], iv["flag_type"])
        if iv["status"] != "resolved":
            active_iv_keys.add(key)
        else:
            ts = iv.get("resolved_at") or iv.get("updated_at")
            if ts and (key not in resolved_iv_ts or ts > resolved_iv_ts[key]):
                resolved_iv_ts[key] = ts

    results = []
    for email, records in by_student.items():
        if student_email and email != student_email:
            continue
        # Resolve one record per calendar date: the most recently *recorded*
        # row wins (append-only overrides supersede earlier joins/overrides,
        # rather than whichever happens to look best).
        latest_by_key = _resolve_latest_records(records)
        current_records = list(latest_by_key.values())

        # Only rows with a real join timestamp count as an attended session —
        # an absent/excused override has no timestamp by design.
        attended = [r for r in current_records if isinstance(r.get("opened_at"), datetime)]
        joined_dates = {_record_date_str(r) for r in attended}
        deduped = attended  # kept for downstream post-resolution intervention logic

        total = len(deduped)
        tardy = sum(
            1 for r in deduped
            if (r.get("minutes_late") or 0) > tardy_threshold and not r.get("excused")
        )
        on_time = total - tardy
        tardy_rate = tardy / total if total > 0 else 0.0

        # An absent override explicitly marked "excused" resolves that date —
        # it's not a silent gap — so fold it in alongside the class-level
        # excused-absences list rather than letting it show as a missed date.
        override_excused_dates = {
            _record_date_str(r) for r in current_records
            if not isinstance(r.get("opened_at"), datetime) and r.get("excused")
        }

        # Compute per-student excused absence dates that fall on expected session days
        student_excused_dates = ({
            e["date"] for e in class_excused_absences
            if e.get("student_email") == email and e.get("date") in expected_dates_set
        } | (override_excused_dates & expected_dates_set))
        effective_expected = max(expected_count - len(student_excused_dates), 0)
        attendance_rate = min(total / effective_expected, 1.0) if effective_expected > 0 else 1.0

        # Compute which expected dates the student has no record for (exclude blackouts)
        missed_dates = sorted(expected_dates_set - joined_dates - student_excused_dates - blackout_dates)
        excused_absence_dates = sorted(student_excused_dates)

        flags = []
        reopen_flags = []
        for flag_type in ("repeat_tardy", "low_attendance"):
            key = (email, flag_type)
            if key in active_iv_keys:
                # Active intervention: flag normally so frontend can show status pill
                if flag_type == "repeat_tardy":
                    if total >= min_sessions and tardy_rate >= tardy_rate_flag:
                        flags.append(flag_type)
                else:
                    if effective_expected >= min_sessions and attendance_rate < attendance_rate_flag:
                        flags.append(flag_type)
            elif (resolved_at := resolved_iv_ts.get(key)):
                # Resolved intervention: suppress normal flag; check post-resolution stats
                post = [r for r in deduped
                        if isinstance(r.get("opened_at"), datetime) and r["opened_at"] > resolved_at]
                post_total = len(post)
                if flag_type == "repeat_tardy":
                    post_tardy = sum(1 for r in post
                                     if (r.get("minutes_late") or 0) > tardy_threshold and not r.get("excused"))
                    post_tardy_rate = post_tardy / post_total if post_total > 0 else 0.0
                    if post_total >= min_sessions and post_tardy_rate >= tardy_rate_flag:
                        reopen_flags.append(flag_type)
                else:
                    resolved_date = resolved_at.strftime("%Y-%m-%d")
                    post_expected = sum(1 for d in expected_dates if d > resolved_date)
                    post_rate = min(post_total / post_expected, 1.0) if post_expected > 0 else 1.0
                    if post_expected >= min_sessions and post_rate < attendance_rate_flag:
                        reopen_flags.append(flag_type)
            else:
                # No intervention: normal flagging
                if flag_type == "repeat_tardy":
                    if total >= min_sessions and tardy_rate >= tardy_rate_flag:
                        flags.append(flag_type)
                else:
                    if effective_expected >= min_sessions and attendance_rate < attendance_rate_flag:
                        flags.append(flag_type)

        results.append({
            "student_email": email,
            "student_user_id": email_to_user_id.get(email),
            "enrolled": email in enrolled_emails,
            "sessions": total,
            "on_time": on_time,
            "tardy": tardy,
            "tardy_rate": round(tardy_rate, 2),
            "effective_expected": effective_expected,
            "attendance_rate": round(attendance_rate, 2),
            "missed_dates": missed_dates,
            "excused_absence_dates": excused_absence_dates,
            "flags": flags,
            "reopen_flags": reopen_flags,
            # Leaked joins have no timestamps, so a class over the leak threshold
            # can't be confidently pattern-matched — annotate rather than hide.
            "suppressed": data_quality_flagged,
        })

    # Flagged students first, then by attendance rate ascending (most absent first)
    results.sort(key=lambda x: (not bool(x["flags"] or x["reopen_flags"]), x["attendance_rate"]))

    return {
        "expected_count": expected_count,
        "lookback_days": _LOOKBACK_DAYS,
        "thresholds": {
            "tardy_threshold_minutes": tardy_threshold,
            "tardy_rate_flag": tardy_rate_flag,
            "attendance_rate_flag": attendance_rate_flag,
            "min_sessions_to_flag": min_sessions,
            "leak_rate_flag": leak_rate_flag,
        },
        "data_quality": {"leak_rate": round(leak_rate, 2), "flagged": data_quality_flagged},
        "students": results,
    }


@router.get("/class/{class_id}/export")
async def export_class_attendance(
    class_id: str,
    start: str | None = Query(default=None),
    end: str | None = Query(default=None),
    user: dict = Depends(get_confirmed_user),
):
    require_teacher(user)

    cls = await motor_db.classes.find_one({"class_id": class_id})
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")
    if user.get("role") == "teacher" and cls["teacher_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    if user.get("role") in ("school_admin", "district_admin") and cls["org_id"] != user.get("org_id"):
        raise HTTPException(status_code=403, detail="Access denied")

    now = datetime.now(timezone.utc)
    end_dt = datetime.strptime(end, "%Y-%m-%d").replace(tzinfo=timezone.utc) if end else now
    start_dt = datetime.strptime(start, "%Y-%m-%d").replace(tzinfo=timezone.utc) if start else end_dt - timedelta(days=_LOOKBACK_DAYS)

    org = await motor_db.orgs.find_one(
        {"org_id": cls.get("org_id", "")},
        {"blackout_dates": 1, "attendance_settings": 1, "summer_start": 1, "summer_end": 1}
    )
    blackout_dates = get_blackout_set(org or {})
    org_settings = (org or {}).get("attendance_settings") or {}
    tardy_threshold = int(org_settings.get("tardy_threshold_minutes", _TARDY_THRESHOLD_MINUTES))

    # Enrolled students
    enrolled: dict[str, str] = {}  # email → name
    for uid in cls.get("student_ids") or []:
        u = await motor_db.login.find_one({"user_id": uid}, {"username": 1, "name": 1})
        if u:
            enrolled[u["username"]] = u.get("name") or u["username"]

    # Attendance records indexed by (date_str, email) — resolve to the latest
    # recorded row per date (append-only overrides supersede earlier records)
    # rather than whichever the cursor happened to visit last. Match on
    # opened_at OR recorded_at since an absent/excused override has no join time.
    raw_export_records = await motor_db.attendance.find({
        "class_id": class_id,
        "$or": [{"opened_at": {"$gte": start_dt, "$lte": end_dt}}, {"recorded_at": {"$gte": start_dt, "$lte": end_dt}}],
    }).to_list(None)
    by_date_student: dict[tuple, dict] = {
        (date_str, email): r for (email, date_str), r in _resolve_latest_records(raw_export_records).items()
    }

    # Expected session dates (class days minus blackouts)
    class_days = cls.get("days") or []
    scheduled_weekdays = {_DAY_TO_WEEKDAY[d] for d in class_days if d in _DAY_TO_WEEKDAY}
    days_total = (end_dt.date() - start_dt.date()).days + 1
    session_dates: list[tuple[str, str]] = []
    for i in range(days_total):
        d = start_dt + timedelta(days=i)
        ds = d.strftime("%Y-%m-%d")
        if d.weekday() in scheduled_weekdays and ds not in blackout_dates:
            session_dates.append((ds, d.strftime("%a")))

    # Build per-student excused absence date sets for CSV status labels
    class_excused_absences: list[dict] = cls.get("excused_absences") or []
    excused_by_student: dict[str, set] = defaultdict(set)
    for e in class_excused_absences:
        if e.get("student_email") and e.get("date"):
            excused_by_student[e["student_email"]].add(e["date"])

    class_name = cls.get("name", class_id)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["student_email", "student_name", "class_name", "date", "day", "status", "minutes_late", "excused", "excuse_reason"])

    for date_str, day_name in session_dates:
        for email, name in enrolled.items():
            rec = by_date_student.get((date_str, email))
            if rec and rec.get("absent"):
                is_excused = rec.get("excused", False)
                excuse_reason = rec.get("excuse_reason", "") or rec.get("note", "")
                status = "Excused Absent" if is_excused else "Absent"
                writer.writerow([email, name, class_name, date_str, day_name, status, "", is_excused, excuse_reason])
            elif rec:
                ml = rec.get("minutes_late") or 0
                is_excused = rec.get("excused", False)
                excuse_reason = rec.get("excuse_reason", "")
                if is_excused and ml > tardy_threshold:
                    status = "Excused Tardy"
                elif ml > tardy_threshold:
                    status = "Tardy"
                else:
                    status = "Present"
                writer.writerow([email, name, class_name, date_str, day_name, status,
                                 ml if ml > tardy_threshold else "", is_excused, excuse_reason])
            else:
                is_excused_absent = date_str in excused_by_student.get(email, set())
                status = "Excused Absent" if is_excused_absent else "Absent"
                writer.writerow([email, name, class_name, date_str, day_name, status, "", is_excused_absent, ""])

    await log_audit(user["username"], "data.attendance_export", detail={"class_id": class_id})
    safe_name = "".join(c if c.isalnum() or c in " -_" else "_" for c in class_name)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}-attendance.csv"'},
    )
