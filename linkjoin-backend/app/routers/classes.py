import secrets
from fastapi import APIRouter, Depends, HTTPException
from app.auth import get_confirmed_user
from app.database import motor_db
from app.models.class_ import CreateClassRequest, UpdateClassRequest, AddStudentsRequest
from app.roles import require_teacher, require_school_admin, TEACHER_ROLES
from app.utils import async_next_link_id
from app.websocket_manager import manager
from app.utils import configure_data

router = APIRouter(prefix="/classes", tags=["classes"])


def _unique_share_id() -> str:
    return secrets.token_urlsafe(16)


async def _push_link_to_student(link: dict, student_email: str, class_id: str) -> None:
    existing = await motor_db.links.find_one({"share_id": link["id"], "username": student_email})
    if existing:
        return
    new_id = await async_next_link_id()
    sid = _unique_share_id()
    new_doc = {k: v for k, v in link.items() if k not in ("_id", "username", "share", "share_token")}
    new_doc["username"] = student_email
    new_doc["id"] = new_id
    new_doc["share_id"] = link["id"]
    new_doc["share_token"] = sid
    new_doc["class_id"] = class_id
    new_doc["link"] = link["link"]  # already encrypted in MongoDB
    await motor_db.links.insert_one(new_doc)
    await manager.broadcast(await configure_data(student_email), student_email)


async def _remove_link_from_student(link_id: int, student_email: str) -> None:
    await motor_db.links.delete_one({"share_id": link_id, "username": student_email})
    await manager.broadcast(await configure_data(student_email), student_email)


async def _resolve_students(student_ids: list[str]) -> list[dict]:
    result = []
    for uid in student_ids:
        u = await motor_db.login.find_one({"user_id": uid}, {"_id": 0, "username": 1, "user_id": 1})
        if u:
            result.append(u)
    return result


@router.get("")
async def list_classes(user: dict = Depends(get_confirmed_user)):
    require_teacher(user)
    is_admin = user.get("role") in ("school_admin", "district_admin")
    if is_admin:
        query = {"org_id": user.get("org_id")}
    else:
        query = {"teacher_id": user["user_id"]}
    classes = await motor_db.classes.find(query, {"_id": 0}).to_list(None)
    if is_admin:
        teacher_ids = {c["teacher_id"] for c in classes}
        teacher_map = {}
        for tid in teacher_ids:
            t = await motor_db.login.find_one({"user_id": tid}, {"username": 1, "name": 1})
            if not t:
                t = await motor_db.login.find_one({"username": tid}, {"username": 1, "name": 1})
            if t:
                teacher_map[tid] = {"email": t["username"], "name": t.get("name") or ""}
        for c in classes:
            info = teacher_map.get(c["teacher_id"]) or {}
            c["teacher_email"] = info.get("email")
            c["teacher_name"] = info.get("name") or ""
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
async def get_class(class_id: str, user: dict = Depends(get_confirmed_user)):
    require_teacher(user)
    cls = await motor_db.classes.find_one({"class_id": class_id}, {"_id": 0})
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")
    if user.get("role") == "teacher" and cls["teacher_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    if user.get("role") in ("school_admin", "district_admin") and cls["org_id"] != user.get("org_id"):
        raise HTTPException(status_code=403, detail="Access denied")
    cls["students"] = await _resolve_students(cls.get("student_ids", []))
    return cls


@router.put("/{class_id}")
async def update_class(class_id: str, body: UpdateClassRequest, user: dict = Depends(get_confirmed_user)):
    require_teacher(user)
    cls = await motor_db.classes.find_one({"class_id": class_id})
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")
    if user.get("role") == "teacher" and cls["teacher_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if updates:
        await motor_db.classes.update_one({"class_id": class_id}, {"$set": updates})
    return {"message": "Updated"}


@router.delete("/{class_id}")
async def delete_class(class_id: str, user: dict = Depends(get_confirmed_user)):
    require_school_admin(user)
    cls = await motor_db.classes.find_one({"class_id": class_id})
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")
    if cls["org_id"] != user.get("org_id"):
        raise HTTPException(status_code=403, detail="Access denied")
    students = await _resolve_students(cls.get("student_ids", []))
    for link_id in cls.get("link_ids", []):
        for s in students:
            await _remove_link_from_student(link_id, s["username"])
        await motor_db.links.update_many({"id": link_id}, {"$unset": {"class_id": ""}})
    await motor_db.classes.delete_one({"class_id": class_id})
    return {"message": "Deleted"}


@router.post("/{class_id}/students")
async def add_students(class_id: str, body: AddStudentsRequest, user: dict = Depends(get_confirmed_user)):
    require_teacher(user)
    cls = await motor_db.classes.find_one({"class_id": class_id})
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")
    if user.get("role") == "teacher" and cls["teacher_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Access denied")

    existing_ids = set(cls.get("student_ids", []))
    new_ids = []
    for entry in body.student_ids:
        u = await motor_db.login.find_one({"user_id": entry}, {"user_id": 1})
        if not u:
            u = await motor_db.login.find_one({"username": entry.lower().strip()}, {"user_id": 1})
        if u and u["user_id"] not in existing_ids:
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
async def remove_student(class_id: str, user_id: str, user: dict = Depends(get_confirmed_user)):
    require_teacher(user)
    cls = await motor_db.classes.find_one({"class_id": class_id})
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")
    if user.get("role") == "teacher" and cls["teacher_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Access denied")

    await motor_db.classes.update_one({"class_id": class_id}, {"$pull": {"student_ids": user_id}})

    student = await motor_db.login.find_one({"user_id": user_id}, {"username": 1})
    if student:
        for link_id in cls.get("link_ids", []):
            await _remove_link_from_student(link_id, student["username"])

    return {"message": "Student removed"}


@router.post("/{class_id}/links/{link_id}")
async def add_class_link(class_id: str, link_id: int, user: dict = Depends(get_confirmed_user)):
    require_teacher(user)
    cls = await motor_db.classes.find_one({"class_id": class_id})
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")
    if user.get("role") == "teacher" and cls["teacher_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Access denied")

    link = await motor_db.links.find_one({"id": link_id, "username": user["username"]})
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")

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
async def remove_class_link(class_id: str, link_id: int, user: dict = Depends(get_confirmed_user)):
    require_teacher(user)
    cls = await motor_db.classes.find_one({"class_id": class_id})
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")
    if user.get("role") == "teacher" and cls["teacher_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Access denied")

    await motor_db.classes.update_one({"class_id": class_id}, {"$pull": {"link_ids": link_id}})
    await motor_db.links.update_many({"id": link_id}, {"$unset": {"class_id": ""}})

    students = await _resolve_students(cls.get("student_ids", []))
    for s in students:
        await _remove_link_from_student(link_id, s["username"])

    return {"message": "Link removed from class"}
