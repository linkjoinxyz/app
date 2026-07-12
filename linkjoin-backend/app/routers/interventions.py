import secrets
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from app.auth import get_confirmed_user
from app.config import get_settings
from app.database import motor_db
from app.email_service import send_email
from app.roles import require_teacher

router = APIRouter(prefix="/interventions", tags=["interventions"])

_settings = get_settings()


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
    if isinstance(doc.get("resolved_at"), datetime):
        doc["resolved_at"] = doc["resolved_at"].isoformat()
    return doc


def _flag_label(flag_type: str) -> str:
    return "Repeat tardy" if flag_type == "repeat_tardy" else "Low attendance"


def _assignment_email_html(iv: dict, assigner_email: str) -> str:
    student = iv.get("student_name") or iv.get("student_email", "")
    flag = _flag_label(iv.get("flag_type", ""))
    class_name = iv.get("class_name", "")
    dashboard_url = f"{_settings.app_base_url}/admin"
    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#060F1A;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#060F1A;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#0d1a2a;border-radius:12px;border:1px solid rgba(255,255,255,0.08);overflow:hidden;">
        <tr>
          <td style="background:#2b8fd8;padding:20px 32px;">
            <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.3px;">LinkJoin</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="color:#e8edf2;font-size:16px;margin:0 0 8px;">You have been assigned an intervention case.</p>
            <p style="color:rgba(255,255,255,0.5);font-size:13px;margin:0 0 28px;">Assigned by {assigner_email}</p>

            <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.04);border-radius:8px;border:1px solid rgba(255,255,255,0.08);margin-bottom:28px;">
              <tr>
                <td style="padding:20px 24px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding-bottom:12px;">
                        <span style="color:rgba(255,255,255,0.4);font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">Student</span><br>
                        <span style="color:#e8edf2;font-size:14px;font-weight:600;">{student}</span>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding-bottom:12px;">
                        <span style="color:rgba(255,255,255,0.4);font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">Class</span><br>
                        <span style="color:#e8edf2;font-size:14px;">{class_name}</span>
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <span style="color:rgba(255,255,255,0.4);font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">Flag</span><br>
                        <span style="color:#f0c040;font-size:13px;font-weight:600;">{flag}</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <a href="{dashboard_url}" style="display:inline-block;background:#2b8fd8;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;">View case</a>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;border-top:1px solid rgba(255,255,255,0.06);">
            <p style="color:rgba(255,255,255,0.3);font-size:12px;margin:0;">You are receiving this because you were assigned to this case in LinkJoin.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


def _reassignment_email_html(iv: dict) -> str:
    student = iv.get("student_name") or iv.get("student_email", "")
    flag = _flag_label(iv.get("flag_type", ""))
    class_name = iv.get("class_name", "")
    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#060F1A;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#060F1A;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#0d1a2a;border-radius:12px;border:1px solid rgba(255,255,255,0.08);overflow:hidden;">
        <tr>
          <td style="background:#2b8fd8;padding:20px 32px;">
            <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.3px;">LinkJoin</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="color:#e8edf2;font-size:16px;margin:0 0 8px;">An intervention case has been reassigned.</p>
            <p style="color:rgba(255,255,255,0.5);font-size:13px;margin:0 0 28px;">You are no longer assigned to the following case.</p>

            <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.04);border-radius:8px;border:1px solid rgba(255,255,255,0.08);margin-bottom:28px;">
              <tr>
                <td style="padding:20px 24px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding-bottom:12px;">
                        <span style="color:rgba(255,255,255,0.4);font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">Student</span><br>
                        <span style="color:#e8edf2;font-size:14px;font-weight:600;">{student}</span>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding-bottom:12px;">
                        <span style="color:rgba(255,255,255,0.4);font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">Class</span><br>
                        <span style="color:#e8edf2;font-size:14px;">{class_name}</span>
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <span style="color:rgba(255,255,255,0.4);font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">Flag</span><br>
                        <span style="color:#f0c040;font-size:13px;font-weight:600;">{flag}</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;border-top:1px solid rgba(255,255,255,0.06);">
            <p style="color:rgba(255,255,255,0.3);font-size:12px;margin:0;">No action is needed. This is a notification only.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


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


_DAY_TO_WEEKDAY = {'Sun': 6, 'Mon': 0, 'Tue': 1, 'Wed': 2, 'Thu': 3, 'Fri': 4, 'Sat': 5}
_LOOKBACK_DAYS = 28
_TARDY_THRESHOLD_MINUTES = 5
_TARDY_RATE_FLAG = 0.33
_ATTENDANCE_RATE_FLAG = 0.5
_MIN_SESSIONS_TO_FLAG = 3


@router.get("/at-risk")
async def get_at_risk_students(user: dict = Depends(get_confirmed_user)):
    """Students with attendance flags who have no open intervention case yet."""
    require_teacher(user)
    role = user.get("role")

    if role in ("school_admin", "district_admin"):
        class_docs = await motor_db.classes.find({"org_id": user.get("org_id")}).to_list(None)
    else:
        class_docs = await motor_db.classes.find({"teacher_id": user.get("user_id")}).to_list(None)

    if not class_docs:
        return []

    class_map = {c["class_id"]: c for c in class_docs}
    class_ids = list(class_map.keys())

    open_ivs = await motor_db.interventions.find(
        {"class_id": {"$in": class_ids}, "status": {"$ne": "resolved"}},
        {"class_id": 1, "student_email": 1, "flag_type": 1},
    ).to_list(None)
    open_keys = {(iv["class_id"], iv["student_email"], iv["flag_type"]) for iv in open_ivs}

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=_LOOKBACK_DAYS)

    pipeline = [
        {"$match": {"class_id": {"$in": class_ids}, "opened_at": {"$gte": cutoff}}},
        {"$group": {
            "_id": {"class_id": "$class_id", "student_email": "$student_email"},
            "total": {"$sum": 1},
            "tardy": {"$sum": {"$cond": [{"$gt": ["$minutes_late", _TARDY_THRESHOLD_MINUTES]}, 1, 0]}},
        }},
    ]

    results = []
    async for doc in motor_db.attendance.aggregate(pipeline):
        class_id = doc["_id"]["class_id"]
        student_email = doc["_id"]["student_email"]
        total = doc["total"]
        tardy = doc["tardy"]

        if total < _MIN_SESSIONS_TO_FLAG:
            continue

        cls = class_map.get(class_id)
        if not cls:
            continue

        tardy_rate = tardy / total if total > 0 else 0
        if tardy_rate >= _TARDY_RATE_FLAG and (class_id, student_email, "repeat_tardy") not in open_keys:
            results.append({
                "class_id": class_id,
                "class_name": cls.get("name", ""),
                "student_email": student_email,
                "flag_type": "repeat_tardy",
                "sessions": total,
                "tardy_count": tardy,
                "rate": round(tardy_rate, 2),
            })

        class_days = cls.get("days") or []
        scheduled_weekdays = {_DAY_TO_WEEKDAY[d] for d in class_days if d in _DAY_TO_WEEKDAY}
        if scheduled_weekdays:
            expected = sum(
                1 for i in range(_LOOKBACK_DAYS)
                if (cutoff + timedelta(days=i)).weekday() in scheduled_weekdays
            )
            if expected >= _MIN_SESSIONS_TO_FLAG and total / expected < _ATTENDANCE_RATE_FLAG:
                if (class_id, student_email, "low_attendance") not in open_keys:
                    results.append({
                        "class_id": class_id,
                        "class_name": cls.get("name", ""),
                        "student_email": student_email,
                        "flag_type": "low_attendance",
                        "sessions": total,
                        "expected": expected,
                        "rate": round(total / expected, 2),
                    })

    results.sort(key=lambda r: r["rate"])
    return results[:50]


@router.get("")
async def list_interventions(
    class_id: str | None = Query(default=None),
    status: str | None = Query(default=None),
    mine: bool = Query(default=False),
    unseen: bool = Query(default=False),
    user: dict = Depends(get_confirmed_user),
):
    require_teacher(user)
    role = user.get("role")

    filt: dict = {}

    if mine:
        filt["assigned_to"] = user["username"]
        filt["status"] = {"$ne": "resolved"}
        if unseen:
            filt["assignee_notified"] = False
    else:
        if role in ("school_admin", "district_admin"):
            filt["org_id"] = user.get("org_id")
        else:
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

    # Backfill student_user_id for legacy docs that predate the field
    for doc in docs:
        if not doc.get("student_user_id") and doc.get("student_email"):
            student = await motor_db.login.find_one(
                {"username": doc["student_email"]}, {"user_id": 1}
            )
            if student and student.get("user_id"):
                doc["student_user_id"] = student["user_id"]
                await motor_db.interventions.update_one(
                    {"intervention_id": doc["intervention_id"]},
                    {"$set": {"student_user_id": student["user_id"]}},
                )

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

    student = await motor_db.login.find_one({"username": student_email}, {"name": 1, "user_id": 1})

    doc = {
        "intervention_id": secrets.token_urlsafe(16),
        "org_id": cls.get("org_id"),
        "class_id": class_id,
        "class_name": cls.get("name", ""),
        "student_email": student_email,
        "student_name": (student or {}).get("name") or "",
        "student_user_id": (student or {}).get("user_id") or "",
        "flag_type": flag_type,
        "status": "open",
        "assigned_to": None,
        "assignee_notified": None,
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
async def update_intervention(
    intervention_id: str,
    body: dict,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_confirmed_user),
):
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

    # Handle assignment change notifications
    if "assigned_to" in updates:
        old_assignee = doc.get("assigned_to")
        new_assignee = updates["assigned_to"]
        if new_assignee != old_assignee:
            # Notify old assignee they've been removed (if there was one)
            if old_assignee and old_assignee != new_assignee:
                background_tasks.add_task(
                    send_email,
                    _reassignment_email_html(doc),
                    "LinkJoin - An intervention has been reassigned",
                    old_assignee,
                )
            # Notify new assignee
            if new_assignee:
                updates["assignee_notified"] = False
                background_tasks.add_task(
                    send_email,
                    _assignment_email_html(doc, user["username"]),
                    "LinkJoin - You've been assigned an intervention",
                    new_assignee,
                )
            else:
                updates["assignee_notified"] = None

    await motor_db.interventions.update_one(
        {"intervention_id": intervention_id}, {"$set": updates}
    )
    doc.update(updates)
    return _clean(doc)


@router.post("/{intervention_id}/acknowledge")
async def acknowledge_intervention(intervention_id: str, user: dict = Depends(get_confirmed_user)):
    require_teacher(user)
    doc = await motor_db.interventions.find_one({"intervention_id": intervention_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    if doc.get("assigned_to") != user["username"]:
        raise HTTPException(status_code=403, detail="Not assigned to you")
    await motor_db.interventions.update_one(
        {"intervention_id": intervention_id},
        {"$set": {"assignee_notified": True}},
    )
    return {"ok": True}


@router.post("/acknowledge-mine")
async def acknowledge_all_mine(user: dict = Depends(get_confirmed_user)):
    require_teacher(user)
    await motor_db.interventions.update_many(
        {"assigned_to": user["username"], "assignee_notified": False},
        {"$set": {"assignee_notified": True}},
    )
    return {"ok": True}


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
