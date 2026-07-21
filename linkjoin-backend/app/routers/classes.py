import secrets
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.auth import get_confirmed_user
from app.database import motor_db
from app.models.class_ import CreateClassRequest, UpdateClassRequest, AddStudentsRequest
from app.roles import require_teacher, require_school_admin, TEACHER_ROLES, get_accessible_org_ids
from app.utils import async_next_link_id, ensure_link_slug, _clean_items
from app.websocket_manager import manager
from app.utils import configure_data


class ExcuseAbsenceBody(BaseModel):
    student_email: str
    date: str

router = APIRouter(prefix="/classes", tags=["classes"])


def _unique_share_id() -> str:
    return secrets.token_urlsafe(16)


async def _push_link_to_student(link: dict, student_email: str, class_id: str) -> None:
    existing = await motor_db.links.find_one({"share_id": link["id"], "username": student_email})
    if existing:
        return
    new_id = await async_next_link_id()
    sid = _unique_share_id()
    new_doc = {k: v for k, v in link.items() if k not in ("_id", "username", "share", "share_token", "slug")}
    new_doc["username"] = student_email
    new_doc["id"] = new_id
    new_doc["share_id"] = link["id"]
    new_doc["share_token"] = sid
    new_doc["class_id"] = class_id
    new_doc["slug"] = _unique_share_id()  # each copy gets its own redirect slug
    new_doc["link"] = link["link"]  # already encrypted in MongoDB
    await motor_db.links.insert_one(new_doc)
    await manager.broadcast(await configure_data(student_email), student_email)


async def _remove_link_from_student(link_id: int, student_email: str) -> None:
    await motor_db.links.delete_one({"share_id": link_id, "username": student_email})
    await manager.broadcast(await configure_data(student_email), student_email)


async def _resolve_students(student_ids: list[str]) -> list[dict]:
    """One query for the whole roster, not one per student.

    This is called from the attendance reads, the org dashboards and the override
    path, several of which sit inside a loop over classes -- so a per-student
    find_one here multiplied out to thousands of sequential round trips on a
    single request for a large org.
    """
    if not student_ids:
        return []
    found = {
        u["user_id"]: u
        async for u in motor_db.login.find(
            {"user_id": {"$in": student_ids}}, {"_id": 0, "username": 1, "user_id": 1}
        )
    }
    # Preserve roster order, and skip ids with no surviving account.
    return [found[uid] for uid in student_ids if uid in found]


async def _cascade_delete_class_data(class_ids: list[str]) -> None:
    """Deletes the records that reference a class by class_id, so removing a
    class (or the org it belongs to) doesn't leave attendance/interventions/
    parent_notes/absence_alerts pointing at nothing."""
    if not class_ids:
        return
    await motor_db.attendance.delete_many({"class_id": {"$in": class_ids}})
    await motor_db.interventions.delete_many({"class_id": {"$in": class_ids}})
    await motor_db.parent_notes.delete_many({"class_id": {"$in": class_ids}})
    await motor_db.absence_alerts.delete_many({"class_id": {"$in": class_ids}})


async def get_authorized_class(class_id: str, user: dict = Depends(get_confirmed_user)) -> dict:
    """Single source of truth for class access: role gate, then ownership
    (teacher) or org-membership (school_admin/district_admin) check.
    Reused by every handler below instead of each repeating the pair inline."""
    require_teacher(user)
    cls = await motor_db.classes.find_one({"class_id": class_id}, {"_id": 0})
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")
    if user.get("role") == "teacher" and cls["teacher_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    if user.get("role") in ("school_admin", "district_admin") and cls.get("org_id") not in await get_accessible_org_ids(user):
        raise HTTPException(status_code=403, detail="Access denied")
    return cls


@router.get("")
async def list_classes(user: dict = Depends(get_confirmed_user)):
    require_teacher(user)
    is_admin = user.get("role") in ("school_admin", "district_admin")
    if is_admin:
        query = {"org_id": {"$in": list(await get_accessible_org_ids(user))}}
    else:
        query = {"teacher_id": user["user_id"]}
    classes = await motor_db.classes.find(query, {"_id": 0}).to_list(None)
    if is_admin:
        # Two bulk queries instead of up to two per teacher. teacher_id is
        # normally a user_id, but legacy rows store an email, so both are matched
        # in one pass with $or.
        teacher_ids = sorted({c["teacher_id"] for c in classes if c.get("teacher_id")})
        teacher_map = {}
        if teacher_ids:
            async for t in motor_db.login.find(
                {"$or": [{"user_id": {"$in": teacher_ids}}, {"username": {"$in": teacher_ids}}]},
                {"username": 1, "name": 1, "avatar": 1, "user_id": 1, "_id": 0},
            ):
                info = {"email": t["username"], "name": t.get("name") or "", "avatar": t.get("avatar") or ""}
                # Key under whichever identifier the class rows actually use.
                if t.get("user_id") in teacher_ids:
                    teacher_map[t["user_id"]] = info
                if t["username"] in teacher_ids:
                    teacher_map[t["username"]] = info
        for c in classes:
            info = teacher_map.get(c["teacher_id"]) or {}
            c["teacher_email"] = info.get("email")
            c["teacher_name"] = info.get("name") or ""
            c["teacher_avatar"] = info.get("avatar") or ""
    return classes


@router.post("", status_code=201)
async def create_class(body: CreateClassRequest, user: dict = Depends(get_confirmed_user)):
    require_teacher(user)
    class_id = secrets.token_urlsafe(16)
    doc = {
        "class_id": class_id,
        "org_id": user.get("org_id", ""),
        "name": body.name,
        "time": body.time,
        "days": body.days,
        "teacher_id": user["user_id"],
        "student_ids": [],
        "link_ids": [],
    }
    await motor_db.classes.insert_one(doc)
    return {"class_id": class_id, "name": body.name}


@router.get("/{class_id}")
async def get_class(cls: dict = Depends(get_authorized_class)):
    cls["students"] = await _resolve_students(cls.get("student_ids", []))
    return cls


@router.get("/{class_id}/links")
async def get_class_links(cls: dict = Depends(get_authorized_class)):
    link_ids = cls.get("link_ids") or []
    if not link_ids:
        return {"links": []}
    links = await motor_db.links.find({"id": {"$in": link_ids}}).to_list(None)
    for l in links:
        await ensure_link_slug(l)
    return {"links": _clean_items(links)}


@router.put("/{class_id}")
async def update_class(body: UpdateClassRequest, cls: dict = Depends(get_authorized_class)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if updates:
        await motor_db.classes.update_one({"class_id": cls["class_id"]}, {"$set": updates})
    return {"message": "Updated"}


@router.delete("/{class_id}")
async def delete_class(class_id: str, user: dict = Depends(get_confirmed_user)):
    require_school_admin(user)
    cls = await motor_db.classes.find_one({"class_id": class_id})
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")
    if cls["org_id"] not in await get_accessible_org_ids(user):
        raise HTTPException(status_code=403, detail="Access denied")
    students = await _resolve_students(cls.get("student_ids", []))
    for link_id in cls.get("link_ids", []):
        for s in students:
            await _remove_link_from_student(link_id, s["username"])
        await motor_db.links.update_many({"id": link_id}, {"$unset": {"class_id": ""}})
    await _cascade_delete_class_data([class_id])
    await motor_db.classes.delete_one({"class_id": class_id})
    return {"message": "Deleted"}


@router.post("/{class_id}/students")
async def add_students(body: AddStudentsRequest, cls: dict = Depends(get_authorized_class)):
    class_id = cls["class_id"]
    org_id = cls.get("org_id")

    existing_ids = set(cls.get("student_ids", []))
    new_ids = []
    for entry in body.student_ids:
        u = await motor_db.login.find_one({"user_id": entry}, {"user_id": 1, "org_id": 1})
        if not u:
            u = await motor_db.login.find_one({"username": entry.lower().strip()}, {"user_id": 1, "org_id": 1})
        if u and u.get("org_id") == org_id and u["user_id"] not in existing_ids:
            new_ids.append(u["user_id"])
    if not new_ids:
        raise HTTPException(status_code=404, detail="No matching students found")

    await motor_db.classes.update_one({"class_id": class_id}, {"$push": {"student_ids": {"$each": new_ids}}})

    class_links = []
    for link_id in cls.get("link_ids", []):
        link = await motor_db.links.find_one({"id": link_id})
        if link:
            class_links.append(link)

    for uid in new_ids:
        student = await motor_db.login.find_one({"user_id": uid}, {"username": 1})
        if not student:
            continue
        for link in class_links:
            await _push_link_to_student(link, student["username"], class_id)

    return {"message": "Students added"}


@router.delete("/{class_id}/students/{user_id}")
async def remove_student(user_id: str, cls: dict = Depends(get_authorized_class)):
    class_id = cls["class_id"]
    await motor_db.classes.update_one({"class_id": class_id}, {"$pull": {"student_ids": user_id}})

    student = await motor_db.login.find_one({"user_id": user_id}, {"username": 1})
    if student:
        for link_id in cls.get("link_ids", []):
            await _remove_link_from_student(link_id, student["username"])

    return {"message": "Student removed"}


@router.post("/{class_id}/links/{link_id}")
async def add_class_link(link_id: int, user: dict = Depends(get_confirmed_user), cls: dict = Depends(get_authorized_class)):
    class_id = cls["class_id"]
    link = await motor_db.links.find_one({"id": link_id, "username": user["username"]})
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    await ensure_link_slug(link)

    if link_id in cls.get("link_ids", []):
        return {"message": "Link already in class"}

    await motor_db.classes.update_one({"class_id": class_id}, {"$push": {"link_ids": link_id}})
    await motor_db.links.update_one(
        {"id": link_id, "username": user["username"]},
        {"$set": {"class_id": class_id, "class_name": cls["name"], "link_type": "supplemental"}},
    )
    link["class_id"] = class_id
    link["class_name"] = cls["name"]
    link["link_type"] = "supplemental"

    students = await _resolve_students(cls.get("student_ids", []))
    for s in students:
        await _push_link_to_student(link, s["username"], class_id)

    return {"message": "Link added to class"}


@router.delete("/{class_id}/links/{link_id}")
async def remove_class_link(link_id: int, cls: dict = Depends(get_authorized_class)):
    class_id = cls["class_id"]
    await motor_db.classes.update_one({"class_id": class_id}, {"$pull": {"link_ids": link_id}})
    await motor_db.links.update_many({"id": link_id}, {"$unset": {"class_id": ""}})

    students = await _resolve_students(cls.get("student_ids", []))
    for s in students:
        await _remove_link_from_student(link_id, s["username"])

    return {"message": "Link removed from class"}


@router.post("/{class_id}/excuse-absence", status_code=200)
async def add_excused_absence(body: ExcuseAbsenceBody, cls: dict = Depends(get_authorized_class)):
    # Only students actually on this roster. An arbitrary string here grew the
    # class document unboundedly and silently skewed effective_expected in the
    # attendance rate math for a student who was never enrolled.
    roster_emails = {s["username"] for s in await _resolve_students(cls.get("student_ids", []))}
    if body.student_email not in roster_emails:
        raise HTTPException(status_code=404, detail="Student is not on this class roster")
    entry = {"student_email": body.student_email, "date": body.date}
    await motor_db.classes.update_one(
        {"class_id": cls["class_id"]},
        {"$addToSet": {"excused_absences": entry}}
    )
    return {"ok": True}


@router.delete("/{class_id}/excuse-absence", status_code=200)
async def remove_excused_absence(body: ExcuseAbsenceBody, cls: dict = Depends(get_authorized_class)):
    entry = {"student_email": body.student_email, "date": body.date}
    await motor_db.classes.update_one(
        {"class_id": cls["class_id"]},
        {"$pull": {"excused_absences": entry}}
    )
    return {"ok": True}
