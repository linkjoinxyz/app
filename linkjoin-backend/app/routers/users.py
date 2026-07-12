import nh3
import mistune
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.auth import get_confirmed_user, get_current_user
from app.database import motor_db
from app.models.user import (
    UpdateTimezoneRequest, AddNumberRequest,
    SortRequest, OpenEarlyRequest, NoteRequest, AutoDeleteRequest, VacationModeRequest,
)


class ParentContactBody(BaseModel):
    parent_phone: str = ""
    parent_phone_country: str = "1"
    parent_email: str = ""
    parent_name: str = ""
    student_user_id: str | None = None

router = APIRouter(prefix="/users", tags=["users"])

_ALLOWED_TAGS = {
    "p", "b", "i", "em", "strong", "a", "ul", "ol", "li",
    "code", "pre", "blockquote", "h1", "h2", "h3",
}


@router.get("/me")
async def get_me(user: dict = Depends(get_current_user)):
    user.pop("_id", None)
    user.pop("password", None)
    user.pop("_jti", None)
    user.pop("_exp", None)
    return user


@router.patch("/name")
async def update_name(body: dict, user: dict = Depends(get_confirmed_user)):
    name = (body.get("name") or "").strip()[:100]
    await motor_db.login.update_one({"username": user["username"]}, {"$set": {"name": name}})
    return {"name": name}


@router.patch("/avatar")
async def update_avatar(body: dict, user: dict = Depends(get_confirmed_user)):
    avatar = body.get("avatar") or ""
    if avatar and not avatar.startswith("data:image/"):
        raise HTTPException(status_code=422, detail="Invalid avatar format")
    if len(avatar) > 300_000:
        raise HTTPException(status_code=422, detail="Avatar too large (max ~200KB)")
    await motor_db.login.update_one({"username": user["username"]}, {"$set": {"avatar": avatar}})
    return {"avatar": avatar}


@router.patch("/timezone")
async def update_timezone(body: UpdateTimezoneRequest, user: dict = Depends(get_confirmed_user)):
    update: dict = {"timezone": body.timezone}
    if body.offset is not None:
        update["offset"] = body.offset
    await motor_db.login.update_one({"username": user["username"]}, {"$set": update})
    return {"message": "Updated"}


@router.patch("/offset")
async def set_offset(body: dict, user: dict = Depends(get_confirmed_user)):
    offset = body.get("offset")
    if offset is None:
        raise HTTPException(status_code=422, detail="offset required")
    await motor_db.login.update_one({"username": user["username"]}, {"$set": {"offset": offset}})
    return {"message": "Updated"}


@router.patch("/daylight-savings")
async def daylight_savings(body: dict, user: dict = Depends(get_confirmed_user)):
    shift = int(body.get("shift", 0))
    days_to_nums = {"Sun": 0, "Mon": 1, "Tue": 2, "Wed": 3, "Thu": 4, "Fri": 5, "Sat": 6}
    nums_to_days = {v: k for k, v in days_to_nums.items()}

    async for link in motor_db.links.find({"username": user["username"], "share_id": {"$exists": False}}):
        try:
            parts = link["time"].split(":")
            hour = int(parts[0]) - shift
            minute = int(parts[1])
        except (IndexError, ValueError, KeyError):
            continue
        days = list(link.get("days", []))
        if hour < 0:
            hour += 24
            days = [nums_to_days[(days_to_nums[d] - 1) % 7] for d in days]
        elif hour >= 24:
            hour -= 24
            days = [nums_to_days[(days_to_nums[d] + 1) % 7] for d in days]
        time_str = f"{hour}:{str(minute).zfill(2)}"
        await motor_db.links.update_one(
            {"username": user["username"], "id": link["id"]},
            {"$set": {"time": time_str, "days": days}},
        )
    return {"message": "Updated"}


@router.patch("/number")
async def add_number(body: AddNumberRequest, user: dict = Depends(get_confirmed_user)):
    digits = "".join(c for c in body.number if c.isdigit())
    if not digits:
        raise HTTPException(status_code=422, detail="Invalid phone number")
    if len(digits) < 11:
        digits = body.countrycode.lstrip("+") + digits
    await motor_db.login.update_one({"username": user["username"]}, {"$set": {"number": int(digits)}})
    return {"message": "Updated"}


@router.patch("/sort")
async def sort_links(body: SortRequest, user: dict = Depends(get_confirmed_user)):
    await motor_db.login.update_one({"username": user["username"]}, {"$set": {"sort": body.sort}})
    return {"message": "Updated"}


@router.patch("/open-early")
async def open_early(body: OpenEarlyRequest, user: dict = Depends(get_confirmed_user)):
    await motor_db.login.update_one({"username": user["username"]}, {"$set": {"open_early": body.open}})
    return {"message": "Updated"}


@router.patch("/auto-delete")
async def set_auto_delete(body: AutoDeleteRequest, user: dict = Depends(get_confirmed_user)):
    await motor_db.login.update_one({"username": user["username"]}, {"$set": {"auto_delete_past": body.enabled}})
    return {"message": "Updated"}


@router.patch("/vacation-mode")
async def set_vacation_mode(body: VacationModeRequest, user: dict = Depends(get_confirmed_user)):
    await motor_db.login.update_one({"username": user["username"]}, {"$set": {"vacation_mode": body.enabled}})
    return {"message": "Updated"}


@router.patch("/show-calendar")
async def set_show_calendar(body: dict, user: dict = Depends(get_confirmed_user)):
    enabled = body.get("enabled", False)
    await motor_db.login.update_one({"username": user["username"]}, {"$set": {"show_calendar": enabled}})
    return {"message": "Updated"}


@router.patch("/popup-check")
async def popup_check(user: dict = Depends(get_current_user)):
    await motor_db.login.update_one({"username": user["username"]}, {"$set": {"popup_check_done": True}})
    return {"message": "Updated"}


@router.patch("/onboarding")
async def complete_onboarding(user: dict = Depends(get_confirmed_user)):
    await motor_db.login.update_one({"username": user["username"]}, {"$set": {"onboarding_done": True}})
    return {"message": "Updated"}


@router.get("/notes")
async def get_notes(user: dict = Depends(get_confirmed_user)):
    doc = await motor_db.login.find_one({"username": user["username"]})
    return list((doc or {}).get("notes", {}).values())


@router.post("/notes")
async def save_note(body: NoteRequest, user: dict = Depends(get_confirmed_user)):
    doc = await motor_db.login.find_one({"username": user["username"]})
    notes = (doc or {}).get("notes", {})
    notes[str(body.id)] = {"id": body.id, "name": body.name, "markdown": body.markdown, "date": body.date}
    await motor_db.login.update_one({"username": user["username"]}, {"$set": {"notes": notes}})
    return notes


@router.patch("/whats-new-seen")
async def mark_whats_new_seen(user: dict = Depends(get_current_user)):
    await motor_db.login.update_one(
        {"username": user["username"]},
        {"$set": {"whats_new_seen": "v2"}},
    )
    return {"message": "Updated"}


@router.post("/markdown")
async def markdown_to_html(body: dict, user: dict = Depends(get_confirmed_user)):
    md = body.get("markdown", "")
    raw_html = mistune.html(md)
    safe_html = nh3.clean(raw_html, tags=_ALLOWED_TAGS)
    return {"html": safe_html}


@router.patch("/parent-contact")
async def update_parent_contact(body: ParentContactBody, user: dict = Depends(get_confirmed_user)):
    role = user.get("role", "")
    if body.student_user_id and role in ("school_admin", "district_admin"):
        student = await motor_db.login.find_one({"user_id": body.student_user_id})
        if not student:
            raise HTTPException(status_code=404, detail="Student not found")
        if student.get("org_id") != user.get("org_id"):
            raise HTTPException(status_code=403, detail="Student not in your organization")
        target = {"user_id": body.student_user_id}
    elif body.student_user_id:
        raise HTTPException(status_code=403, detail="Only school admins can update other users")
    else:
        target = {"username": user["username"]}

    updates = {
        "parent_phone": body.parent_phone.strip(),
        "parent_phone_country": body.parent_phone_country.strip(),
        "parent_email": body.parent_email.strip().lower(),
        "parent_name": body.parent_name.strip(),
    }
    await motor_db.login.update_one(target, {"$set": updates})
    return {"ok": True}


@router.get("/parent-contact/{student_user_id}")
async def get_parent_contact(student_user_id: str, user: dict = Depends(get_confirmed_user)):
    role = user.get("role", "")
    if role not in ("school_admin", "district_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    student = await motor_db.login.find_one(
        {"user_id": student_user_id},
        {"parent_phone": 1, "parent_phone_country": 1, "parent_email": 1, "parent_name": 1, "org_id": 1, "_id": 0},
    )
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    if student.get("org_id") != user.get("org_id"):
        raise HTTPException(status_code=403, detail="Student not in your organization")
    result = {k: v for k, v in student.items() if k != "org_id"}
    linked_parents = []
    async for link in motor_db.parent_links.find({"student_user_id": student_user_id}, {"parent_user_id": 1, "_id": 0}):
        parent = await motor_db.login.find_one({"user_id": link["parent_user_id"]}, {"name": 1, "username": 1, "_id": 0})
        if parent:
            linked_parents.append({"user_id": link["parent_user_id"], "name": parent.get("name", ""), "email": parent.get("username", "")})
    result["linked_parents"] = linked_parents
    result["parent_user_id"] = linked_parents[0]["user_id"] if linked_parents else None
    return result


@router.get("/student/{user_id}")
async def get_student_profile(user_id: str, user: dict = Depends(get_confirmed_user)):
    role = user.get("role", "")
    if role not in ("teacher", "school_admin", "district_admin"):
        raise HTTPException(status_code=403, detail="Access denied")

    student = await motor_db.login.find_one(
        {"user_id": user_id},
        {"_id": 0, "user_id": 1, "username": 1, "name": 1, "role": 1, "org_id": 1,
         "confirmed": 1, "avatar": 1, "parent_phone": 1, "parent_phone_country": 1,
         "parent_email": 1, "parent_name": 1, "created_at": 1},
    )
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # Teachers may only view students in their own classes
    if role == "teacher":
        teacher_classes = await motor_db.classes.find(
            {"teacher_id": user["user_id"]}, {"student_ids": 1}
        ).to_list(None)
        allowed_ids = {uid for cls in teacher_classes for uid in (cls.get("student_ids") or [])}
        if user_id not in allowed_ids:
            raise HTTPException(status_code=403, detail="Student not in your classes")
    else:
        if student.get("org_id") != user.get("org_id"):
            raise HTTPException(status_code=403, detail="Student not in your organization")

    email = student["username"]

    # Enrolled classes
    enrolled_classes = await motor_db.classes.find(
        {"student_ids": user_id},
        {"_id": 0, "class_id": 1, "name": 1, "days": 1, "time": 1, "teacher_id": 1},
    ).to_list(None)

    # Resolve teacher names
    teacher_ids = list({c["teacher_id"] for c in enrolled_classes if c.get("teacher_id")})
    teacher_map = {}
    for tid in teacher_ids:
        t = await motor_db.login.find_one({"user_id": tid}, {"name": 1, "username": 1})
        if t:
            teacher_map[tid] = t.get("name") or t.get("username", "")

    for c in enrolled_classes:
        c["teacher_name"] = teacher_map.get(c.get("teacher_id"), "")

    # Attendance records (last 90 days)
    cutoff = datetime.now(timezone.utc) - timedelta(days=90)
    records = []
    async for r in motor_db.attendance.find(
        {"student_email": email, "opened_at": {"$gte": cutoff}},
        {"_id": 0, "class_id": 1, "class_name": 1, "opened_at": 1, "minutes_late": 1, "excused": 1, "excuse_reason": 1}
    ).sort("opened_at", -1).limit(100):
        if isinstance(r.get("opened_at"), datetime):
            r["opened_at"] = r["opened_at"].isoformat()
        records.append(r)

    # Per-class attendance summary
    tardy_threshold = 5
    by_class: dict[str, list] = defaultdict(list)
    for r in records:
        by_class[r["class_id"]].append(r)

    class_summaries = []
    for c in enrolled_classes:
        cid = c["class_id"]
        recs = by_class.get(cid, [])
        total = len(recs)
        tardy = sum(1 for r in recs if r.get("minutes_late", 0) > tardy_threshold and not r.get("excused"))
        class_summaries.append({
            "class_id": cid,
            "class_name": c["name"],
            "teacher_name": c.get("teacher_name", ""),
            "days": c.get("days", []),
            "time": c.get("time", ""),
            "sessions": total,
            "on_time": total - tardy,
            "tardy": tardy,
        })

    # Active interventions
    interventions = await motor_db.interventions.find(
        {"student_email": email, "status": {"$ne": "resolved"}},
        {"_id": 0, "intervention_id": 1, "class_id": 1, "class_name": 1, "flag_type": 1,
         "status": 1, "created_at": 1, "updated_at": 1, "notes": 1, "assigned_to": 1},
    ).to_list(None)
    for iv in interventions:
        for field in ("created_at", "updated_at"):
            if isinstance(iv.get(field), datetime):
                iv[field] = iv[field].isoformat()
        for note in iv.get("notes") or []:
            if isinstance(note.get("created_at"), datetime):
                note["created_at"] = note["created_at"].isoformat()

    created_at = student.get("created_at")
    if isinstance(created_at, datetime):
        created_at = created_at.isoformat()

    # Linked parent accounts via parent_links
    linked_parents = []
    async for link in motor_db.parent_links.find({"student_user_id": user_id}, {"parent_user_id": 1}):
        parent_doc = await motor_db.login.find_one(
            {"user_id": link["parent_user_id"]},
            {"_id": 0, "user_id": 1, "username": 1, "name": 1},
        )
        if parent_doc:
            linked_parents.append({
                "user_id": parent_doc["user_id"],
                "email": parent_doc["username"],
                "name": parent_doc.get("name") or "",
            })

    return {
        "user_id": student["user_id"],
        "email": email,
        "name": student.get("name") or "",
        "avatar": student.get("avatar") or "",
        "confirmed": student.get("confirmed", False),
        "joined_at": created_at,
        "parent": {
            "name": student.get("parent_name") or "",
            "email": student.get("parent_email") or "",
            "phone": student.get("parent_phone") or "",
            "phone_country": student.get("parent_phone_country") or "1",
            "linked_accounts": linked_parents,
        },
        "classes": class_summaries,
        "recent_attendance": records[:30],
        "interventions": interventions,
    }


@router.get("/parent/{user_id}")
async def get_parent_profile(user_id: str, user: dict = Depends(get_confirmed_user)):
    role = user.get("role", "")
    if role not in ("teacher", "school_admin", "district_admin"):
        raise HTTPException(status_code=403, detail="Access denied")

    parent = await motor_db.login.find_one(
        {"user_id": user_id, "role": "parent"},
        {"_id": 0, "user_id": 1, "username": 1, "name": 1, "avatar": 1, "created_at": 1},
    )
    if not parent:
        raise HTTPException(status_code=404, detail="Parent account not found")

    # Linked students
    linked_students = []
    async for link in motor_db.parent_links.find({"parent_user_id": user_id}, {"student_user_id": 1}):
        student = await motor_db.login.find_one(
            {"user_id": link["student_user_id"]},
            {"_id": 0, "user_id": 1, "username": 1, "name": 1, "avatar": 1, "org_id": 1},
        )
        if student:
            # Only expose students within the requester's org (teachers see their own classes)
            if role == "teacher":
                teacher_classes = await motor_db.classes.find(
                    {"teacher_id": user["user_id"]}, {"student_ids": 1}
                ).to_list(None)
                allowed = {uid for c in teacher_classes for uid in (c.get("student_ids") or [])}
                if student["user_id"] not in allowed:
                    continue
            elif student.get("org_id") != user.get("org_id"):
                continue
            linked_students.append({
                "user_id": student["user_id"],
                "email": student["username"],
                "name": student.get("name") or "",
                "avatar": student.get("avatar") or "",
            })

    created_at = parent.get("created_at")
    if isinstance(created_at, datetime):
        created_at = created_at.isoformat()

    return {
        "user_id": parent["user_id"],
        "email": parent["username"],
        "name": parent.get("name") or "",
        "avatar": parent.get("avatar") or "",
        "joined_at": created_at,
        "linked_students": linked_students,
    }


@router.delete("/me")
async def delete_account(user: dict = Depends(get_current_user)):
    from app.audit import log_audit
    email = user["username"]
    await log_audit(email, "user.delete_account")
    await motor_db.links.delete_many({"username": email})
    await motor_db.bookmarks.delete_many({"username": email})
    await motor_db.deleted_links.delete_many({"username": email})
    await motor_db.deleted_bookmarks.delete_many({"username": email})
    await motor_db.pending_links.delete_many({"username": email})
    await motor_db.pending_bookmarks.delete_many({"username": email})
    await motor_db.login.delete_one({"username": email})
    return {"message": "Account deleted"}


@router.patch("/mfa")
async def update_mfa(body: dict, user: dict = Depends(get_confirmed_user)):
    from app.routers.mfa import _send_mfa_code
    enabled = body.get("enabled")
    if enabled is None:
        raise HTTPException(status_code=422, detail="enabled required")

    if enabled:
        phone = (body.get("phone") or "").strip().lstrip("+")
        if not phone or not phone.isdigit():
            raise HTTPException(status_code=422, detail="Valid phone number required to enable MFA")
        await motor_db.login.update_one(
            {"username": user["username"]},
            {"$set": {"mfa_phone": phone}},
        )
        updated_user = await motor_db.login.find_one({"username": user["username"]})
        await _send_mfa_code(updated_user)
        return {"message": "Verification code sent. Call /auth/mfa/setup-verify with the code to confirm."}
    else:
        from app.audit import log_audit
        await motor_db.login.update_one(
            {"username": user["username"]},
            {"$set": {"mfa_enabled": False}},
        )
        await log_audit(user["username"], "auth.mfa_disabled")
        return {"message": "MFA disabled"}
