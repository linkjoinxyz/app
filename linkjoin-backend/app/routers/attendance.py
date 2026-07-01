import csv
import io
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from app.auth import get_confirmed_user
from app.database import motor_db
from app.roles import require_teacher

_DAY_TO_WEEKDAY = {'Sun': 6, 'Mon': 0, 'Tue': 1, 'Wed': 2, 'Thu': 3, 'Fri': 4, 'Sat': 5}
_LOOKBACK_DAYS = 28
_TARDY_THRESHOLD_MINUTES = 5
_TARDY_RATE_FLAG = 0.33
_ATTENDANCE_RATE_FLAG = 0.5
_MIN_SESSIONS_TO_FLAG = 3

router = APIRouter(prefix="/attendance", tags=["attendance"])


@router.post("", status_code=201)
async def log_attendance(body: dict, user: dict = Depends(get_confirmed_user)):
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
    return {"message": "Logged"}


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
        r.pop("_id", None)
        r["opened_at"] = r["opened_at"].isoformat() if isinstance(r.get("opened_at"), datetime) else r.get("opened_at")
        records.append(r)
    return {"records": records}


@router.get("/class/{class_id}/patterns")
async def get_class_patterns(class_id: str, user: dict = Depends(get_confirmed_user)):
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
        {"attendance_settings": 1, "blackout_dates": 1}
    )
    org_settings = (org or {}).get("attendance_settings") or {}
    blackout_dates = set((org or {}).get("blackout_dates") or [])
    tardy_threshold = int(org_settings.get("tardy_threshold_minutes", _TARDY_THRESHOLD_MINUTES))
    tardy_rate_flag = float(org_settings.get("tardy_rate_flag", _TARDY_RATE_FLAG))
    attendance_rate_flag = float(org_settings.get("attendance_rate_flag", _ATTENDANCE_RATE_FLAG))
    min_sessions = int(org_settings.get("min_sessions_to_flag", _MIN_SESSIONS_TO_FLAG))

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=_LOOKBACK_DAYS)

    # Count how many times the class should have met in the lookback window
    class_days = cls.get("days") or []
    scheduled_weekdays = {_DAY_TO_WEEKDAY[d] for d in class_days if d in _DAY_TO_WEEKDAY}
    expected_count = sum(
        1 for i in range(_LOOKBACK_DAYS)
        if (cutoff + timedelta(days=i)).weekday() in scheduled_weekdays
        and (cutoff + timedelta(days=i)).strftime("%Y-%m-%d") not in blackout_dates
    )

    # Fetch all attendance records within the window
    by_student: dict[str, list] = defaultdict(list)
    async for r in motor_db.attendance.find({"class_id": class_id, "opened_at": {"$gte": cutoff}}):
        by_student[r["student_email"]].append(r)

    # Resolve enrolled students from roster
    enrolled_emails: set[str] = set()
    for uid in cls.get("student_ids") or []:
        u = await motor_db.login.find_one({"user_id": uid}, {"_id": 0, "username": 1})
        if u:
            enrolled_emails.add(u["username"])
            # Ensure zero-record students appear in by_student
            by_student.setdefault(u["username"], [])

    results = []
    for email, records in by_student.items():
        total = len(records)
        tardy = sum(1 for r in records if r.get("minutes_late", 0) > tardy_threshold)
        on_time = total - tardy
        tardy_rate = tardy / total if total > 0 else 0.0
        attendance_rate = total / expected_count if expected_count > 0 else 1.0

        flags = []
        if total >= min_sessions and tardy_rate >= tardy_rate_flag:
            flags.append("repeat_tardy")
        if expected_count >= min_sessions and attendance_rate < attendance_rate_flag:
            flags.append("low_attendance")

        results.append({
            "student_email": email,
            "enrolled": email in enrolled_emails,
            "sessions": total,
            "on_time": on_time,
            "tardy": tardy,
            "tardy_rate": round(tardy_rate, 2),
            "attendance_rate": round(min(attendance_rate, 1.0), 2),
            "flags": flags,
        })

    # Flagged students first, then by attendance rate ascending (most absent first)
    results.sort(key=lambda x: (not bool(x["flags"]), x["attendance_rate"]))

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
        {"blackout_dates": 1, "attendance_settings": 1}
    )
    blackout_dates = set((org or {}).get("blackout_dates") or [])
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

    class_name = cls.get("name", class_id)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["student_email", "student_name", "class_name", "date", "day", "status", "minutes_late"])

    for date_str, day_name in session_dates:
        for email, name in enrolled.items():
            rec = by_date_student.get((date_str, email))
            if rec:
                ml = rec.get("minutes_late", 0)
                status = "Tardy" if ml > tardy_threshold else "Present"
                writer.writerow([email, name, class_name, date_str, day_name, status, ml if status == "Tardy" else ""])
            else:
                writer.writerow([email, name, class_name, date_str, day_name, "Absent", ""])

    safe_name = "".join(c if c.isalnum() or c in " -_" else "_" for c in class_name)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}-attendance.csv"'},
    )
