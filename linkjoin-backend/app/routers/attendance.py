import csv
import io
import logging
from bson import ObjectId
from collections import defaultdict
from datetime import datetime, date as date_type, timezone, timedelta
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from app.auth import get_confirmed_user
from app.database import motor_db
from app.roles import require_teacher
from app.utils import get_blackout_set

log = logging.getLogger(__name__)

_GC_SYNC_COOLDOWN_SECONDS = 120


class ExcuseBody(BaseModel):
    excused: bool
    excuse_reason: str = ""

_DAY_TO_WEEKDAY = {'Sun': 6, 'Mon': 0, 'Tue': 1, 'Wed': 2, 'Thu': 3, 'Fri': 4, 'Sat': 5}
_LOOKBACK_DAYS = 28
_TARDY_THRESHOLD_MINUTES = 5
_TARDY_RATE_FLAG = 0.33
_ATTENDANCE_RATE_FLAG = 0.5
_MIN_SESSIONS_TO_FLAG = 3

router = APIRouter(prefix="/attendance", tags=["attendance"])


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
    email = user["username"]

    org_id = user.get("org_id")
    tardy_threshold = _TARDY_THRESHOLD_MINUTES
    if org_id:
        org = await motor_db.orgs.find_one({"org_id": org_id}, {"attendance_settings": 1})
        org_settings = (org or {}).get("attendance_settings") or {}
        tardy_threshold = int(org_settings.get("tardy_threshold_minutes", _TARDY_THRESHOLD_MINUTES))

    records = []
    async for r in motor_db.attendance.find(
        {"student_email": email},
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
        by_date[opened.strftime("%Y-%m-%d")].append(r.get("minutes_late", 0))

    dates = sorted(by_date.keys())
    date_on_time = {d: any(ml <= tardy_threshold for ml in by_date[d]) for d in dates}

    total_sessions = len(records)
    on_time_sessions = sum(1 for r in records if r.get("minutes_late", 0) <= tardy_threshold)

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
    async for r in motor_db.attendance.find({"class_id": class_id}).sort("opened_at", -1).limit(200):
        r["record_id"] = str(r.pop("_id"))
        r.setdefault("excused", False)
        r.setdefault("excuse_reason", "")
        r["opened_at"] = r["opened_at"].isoformat() if isinstance(r.get("opened_at"), datetime) else r.get("opened_at")
        records.append(r)
    return {"records": records}


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

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=_LOOKBACK_DAYS)

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

    # Fetch all attendance records within the window
    by_student: dict[str, list] = defaultdict(list)
    async for r in motor_db.attendance.find({"class_id": class_id, "opened_at": {"$gte": cutoff}}):
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
        # Deduplicate: one record per calendar date, keeping the best (least late) open
        best_by_date: dict[str, dict] = {}
        for r in records:
            date_str = (
                r["opened_at"].strftime("%Y-%m-%d") if isinstance(r.get("opened_at"), datetime)
                else str(r.get("opened_at", ""))[:10]
            )
            existing = best_by_date.get(date_str)
            if existing is None or r.get("minutes_late", 0) < existing.get("minutes_late", 0):
                best_by_date[date_str] = r
        joined_dates = set(best_by_date.keys())
        deduped = list(best_by_date.values())

        total = len(deduped)
        tardy = sum(
            1 for r in deduped
            if r.get("minutes_late", 0) > tardy_threshold and not r.get("excused")
        )
        on_time = total - tardy
        tardy_rate = tardy / total if total > 0 else 0.0

        # Compute per-student excused absence dates that fall on expected session days
        student_excused_dates = {
            e["date"] for e in class_excused_absences
            if e.get("student_email") == email and e.get("date") in expected_dates_set
        }
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
                                     if r.get("minutes_late", 0) > tardy_threshold and not r.get("excused"))
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
        },
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

    # Attendance records indexed by (date_str, email)
    by_date_student: dict[tuple, dict] = {}
    async for r in motor_db.attendance.find({
        "class_id": class_id,
        "opened_at": {"$gte": start_dt, "$lte": end_dt},
    }):
        opened = r["opened_at"]
        if not opened.tzinfo:
            opened = opened.replace(tzinfo=timezone.utc)
        key = (opened.strftime("%Y-%m-%d"), r["student_email"])
        by_date_student[key] = r

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
            if rec:
                ml = rec.get("minutes_late", 0)
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

    safe_name = "".join(c if c.isalnum() or c in " -_" else "_" for c in class_name)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}-attendance.csv"'},
    )
