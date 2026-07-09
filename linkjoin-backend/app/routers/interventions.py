import secrets
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from app.auth import get_confirmed_user
from app.database import motor_db
from app.roles import require_teacher

router = APIRouter(prefix="/interventions", tags=["interventions"])


def _now():
    return datetime.now(timezone.utc)


def _clean(doc):
    doc.pop("_id", None)
    for note in doc.get("notes") or []:
        if isinstance(note.get("created_at"), datetime):
            note["created_at"] = note["created_at"].isoformat()
    if isinstance(doc.get("created_at"), datetime):
        doc["created_at"] = doc["created_at"].isoformat()
    if isinstance(doc.get("updated_at"), datetime):
        doc["updated_at"] = doc["updated_at"].isoformat()
    return doc


async def _assert_access(intervention, user):
    role = user.get("role")
    if role in ("school_admin", "district_admin"):
        if intervention.get("org_id") != user.get("org_id"):
            raise HTTPException(status_code=403, detail="Access denied")
    elif role == "teacher":
        cls = await motor_db.classes.find_one({"class_id": intervention.get("class_id")})
        if not cls or cls.get("teacher_id") != user.get("user_id"):
            raise HTTPException(status_code=403, detail="Access denied")
    else:
        raise HTTPException(status_code=403, detail="Access denied")


@router.get("")
async def list_interventions(
    class_id: str | None = Query(default=None),
    status: str | None = Query(default=None),
    user: dict = Depends(get_confirmed_user),
):
    require_teacher(user)
    role = user.get("role")

    filt: dict = {}
    if role in ("school_admin", "district_admin"):
        filt["org_id"] = user.get("org_id")
    else:
        # teacher — scope to their classes
        teacher_classes = await motor_db.classes.find(
            {"teacher_id": user.get("user_id")}, {"class_id": 1}
        ).to_list(None)
        class_ids = [c["class_id"] for c in teacher_classes]
        filt["class_id"] = {"$in": class_ids}

    if class_id:
        filt["class_id"] = class_id
    if status and status != "all":
        filt["status"] = status
    elif not status:
        filt["status"] = {"$ne": "resolved"}

    docs = await motor_db.interventions.find(filt).sort("updated_at", -1).limit(200).to_list(None)
    return [_clean(d) for d in docs]


@router.post("", status_code=201)
async def create_intervention(body: dict, user: dict = Depends(get_confirmed_user)):
    require_teacher(user)

    class_id = body.get("class_id")
    student_email = (body.get("student_email") or "").strip().lower()
    flag_type = body.get("flag_type")

    if not class_id or not student_email or flag_type not in ("low_attendance", "repeat_tardy"):
        raise HTTPException(status_code=422, detail="class_id, student_email, and valid flag_type required")

    cls = await motor_db.classes.find_one({"class_id": class_id})
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")

    role = user.get("role")
    if role == "teacher" and cls.get("teacher_id") != user.get("user_id"):
        raise HTTPException(status_code=403, detail="Access denied")
    if role in ("school_admin", "district_admin") and cls.get("org_id") != user.get("org_id"):
        raise HTTPException(status_code=403, detail="Access denied")

    # One active intervention per student+class+flag_type
    existing = await motor_db.interventions.find_one({
        "class_id": class_id,
        "student_email": student_email,
        "flag_type": flag_type,
        "status": {"$ne": "resolved"},
    })
    if existing:
        existing.pop("_id", None)
        return _clean(existing)

    student = await motor_db.login.find_one({"username": student_email}, {"name": 1})

    doc = {
        "intervention_id": secrets.token_urlsafe(16),
        "org_id": cls.get("org_id"),
        "class_id": class_id,
        "class_name": cls.get("name", ""),
        "student_email": student_email,
        "student_name": (student or {}).get("name") or "",
        "flag_type": flag_type,
        "status": "open",
        "assigned_to": None,
        "notes": [],
        "created_at": _now(),
        "updated_at": _now(),
    }
    await motor_db.interventions.insert_one(doc)
    return _clean(doc)


@router.get("/{intervention_id}")
async def get_intervention(intervention_id: str, user: dict = Depends(get_confirmed_user)):
    require_teacher(user)
    doc = await motor_db.interventions.find_one({"intervention_id": intervention_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    await _assert_access(doc, user)
    return _clean(doc)


@router.patch("/{intervention_id}")
async def update_intervention(intervention_id: str, body: dict, user: dict = Depends(get_confirmed_user)):
    require_teacher(user)
    doc = await motor_db.interventions.find_one({"intervention_id": intervention_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    await _assert_access(doc, user)

    allowed_statuses = {"open", "in_progress", "resolved"}
    updates = {}
    if "status" in body:
        if body["status"] not in allowed_statuses:
            raise HTTPException(status_code=422, detail=f"status must be one of {allowed_statuses}")
        updates["status"] = body["status"]
    if "assigned_to" in body:
        updates["assigned_to"] = body["assigned_to"] or None

    if not updates:
        return _clean(doc)

    updates["updated_at"] = _now()
    if updates.get("status") == "resolved":
        updates["resolved_at"] = updates["updated_at"]
    await motor_db.interventions.update_one(
        {"intervention_id": intervention_id}, {"$set": updates}
    )
    doc.update(updates)
    return _clean(doc)


@router.post("/{intervention_id}/notes", status_code=201)
async def add_note(intervention_id: str, body: dict, user: dict = Depends(get_confirmed_user)):
    require_teacher(user)
    doc = await motor_db.interventions.find_one({"intervention_id": intervention_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    await _assert_access(doc, user)

    text = (body.get("text") or "").strip()
    if not text:
        raise HTTPException(status_code=422, detail="text required")

    note = {
        "note_id": secrets.token_urlsafe(12),
        "author_email": user["username"],
        "text": text,
        "created_at": _now(),
    }
    now = _now()
    await motor_db.interventions.update_one(
        {"intervention_id": intervention_id},
        {"$push": {"notes": note}, "$set": {"updated_at": now}},
    )
    note["created_at"] = note["created_at"].isoformat()
    return note


@router.delete("/{intervention_id}/notes/{note_id}", status_code=204)
async def delete_note(intervention_id: str, note_id: str, user: dict = Depends(get_confirmed_user)):
    require_teacher(user)
    doc = await motor_db.interventions.find_one({"intervention_id": intervention_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    await _assert_access(doc, user)

    note = next((n for n in doc.get("notes") or [] if n["note_id"] == note_id), None)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    if note["author_email"] != user["username"]:
        raise HTTPException(status_code=403, detail="Can only delete your own notes")

    await motor_db.interventions.update_one(
        {"intervention_id": intervention_id},
        {"$pull": {"notes": {"note_id": note_id}}, "$set": {"updated_at": _now()}},
    )
