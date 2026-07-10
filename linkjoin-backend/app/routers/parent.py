from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from app.auth import get_confirmed_user
from app.database import motor_db

router = APIRouter(prefix="/parent", tags=["parent"])

_LOOKBACK_DAYS = 28
_DAY_TO_WEEKDAY = {'Sun': 6, 'Mon': 0, 'Tue': 1, 'Wed': 2, 'Thu': 3, 'Fri': 4, 'Sat': 5}


def _require_parent(user: dict) -> None:
    if user.get("role") != "parent":
        raise HTTPException(status_code=403, detail="Parent access required")


async def _parent_student_ids(parent_user_id: str) -> list[str]:
    links = await motor_db.parent_links.find(
        {"parent_user_id": parent_user_id}, {"student_user_id": 1}
    ).to_list(None)
    return [lnk["student_user_id"] for lnk in links]


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
    cutoff = now - timedelta(days=_LOOKBACK_DAYS)

    result = []
    async for cls in motor_db.classes.find({"student_ids": student_id}, {"_id": 0}):
        class_id = cls["class_id"]

        records = await motor_db.attendance.find(
            {"class_id": class_id, "student_email": student_email, "opened_at": {"$gte": cutoff}},
            {"_id": 0, "minutes_late": 1, "opened_at": 1},
        ).to_list(None)

        class_days = cls.get("days") or []
        scheduled_weekdays = {_DAY_TO_WEEKDAY[d] for d in class_days if d in _DAY_TO_WEEKDAY}
        expected = (
            sum(1 for i in range(_LOOKBACK_DAYS) if (cutoff + timedelta(days=i)).weekday() in scheduled_weekdays)
            if scheduled_weekdays else None
        )

        attended = len(records)
        tardy = sum(1 for r in records if (r.get("minutes_late") or 0) > 5)
        attendance_rate = round(attended / expected, 2) if expected else None

        open_iv = await motor_db.interventions.find_one(
            {"class_id": class_id, "student_email": student_email, "status": {"$ne": "resolved"}},
            {"flag_type": 1, "status": 1, "_id": 0},
        )

        result.append({
            "class_id": class_id,
            "class_name": cls.get("name", ""),
            "teacher_id": cls.get("teacher_id"),
            "days": class_days,
            "attended_last_28d": attended,
            "expected_last_28d": expected,
            "tardy_last_28d": tardy,
            "attendance_rate": attendance_rate,
            "active_flag": open_iv["flag_type"] if open_iv else None,
        })

    return result


@router.get("/children/{student_id}/attendance")
async def get_child_attendance(student_id: str, user: dict = Depends(get_confirmed_user)):
    _require_parent(user)
    linked_ids = await _parent_student_ids(user["user_id"])
    if student_id not in linked_ids:
        raise HTTPException(status_code=403, detail="Access denied")

    student = await motor_db.login.find_one({"user_id": student_id}, {"username": 1, "_id": 0})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    student_email = student["username"]

    records = []
    async for r in motor_db.attendance.find(
        {"student_email": student_email},
        {"_id": 0, "class_id": 1, "class_name": 1, "opened_at": 1, "minutes_late": 1, "excused": 1},
    ).sort("opened_at", -1).limit(100):
        ts = r.get("opened_at")
        r["opened_at"] = ts.isoformat() if hasattr(ts, "isoformat") else str(ts)
        records.append(r)
    return records
