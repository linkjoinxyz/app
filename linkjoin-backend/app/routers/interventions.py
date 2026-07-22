import secrets
from datetime import datetime, timezone
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from app.auth import get_confirmed_user
from app.audit import log_audit
from app.config import get_settings
from app.database import motor_db
from app.email_service import send_email
from app.utils import lookback_cutoff
from app.roles import require_teacher, TEACHER_ROLES, get_accessible_org_ids

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
        if intervention.get("org_id") not in await get_accessible_org_ids(user):
            raise HTTPException(status_code=403, detail="Access denied")
    elif role == "teacher":
        cls = await motor_db.classes.find_one({"class_id": intervention.get("class_id")})
        is_owner = bool(cls) and cls.get("teacher_id") == user.get("user_id")
        is_assignee = intervention.get("assigned_to") == user.get("username")
        if not (is_owner or is_assignee):
            raise HTTPException(status_code=403, detail="Access denied")
    else:
        raise HTTPException(status_code=403, detail="Access denied")


_LOOKBACK_DAYS = 28


@router.get("/at-risk")
async def get_at_risk_students(user: dict = Depends(get_confirmed_user)):
    """Students with attendance flags who have no open intervention case yet.
    Flag math is delegated to attendance.compute_class_flag_metrics — the same
    org-config-aware, excused/blackout-aware, dedup-aware calculation /patterns
    uses, so the two views can't silently disagree on who needs intervention."""
    require_teacher(user)
    role = user.get("role")

    from app.routers.attendance import compute_class_flag_metrics, resolve_org_thresholds

    if role in ("school_admin", "district_admin"):
        class_docs = await motor_db.classes.find({"org_id": {"$in": list(await get_accessible_org_ids(user))}}).to_list(None)
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
    cutoff = lookback_cutoff(now, _LOOKBACK_DAYS)

    # Classes can span multiple orgs (district_admin, or a teacher assigned
    # across schools), so thresholds are resolved per-class's own org_id —
    # a single global lookup would silently apply the wrong school's policy.
    org_ids = {c.get("org_id", "") for c in class_docs}
    orgs_by_id: dict[str, dict] = {}
    async for org in motor_db.orgs.find({"org_id": {"$in": list(org_ids)}}):
        orgs_by_id[org["org_id"]] = org

    results = []
    for class_id, cls in class_map.items():
        thresholds = resolve_org_thresholds(orgs_by_id.get(cls.get("org_id", "")))
        _, metrics_by_email = await compute_class_flag_metrics(class_id, cls, thresholds, cutoff)

        for student_email, m in metrics_by_email.items():
            total = m["sessions"]
            if total < thresholds["min_sessions"]:
                continue

            if (m["tardy_rate"] >= thresholds["tardy_rate_flag"]
                    and (class_id, student_email, "repeat_tardy") not in open_keys):
                results.append({
                    "class_id": class_id,
                    "class_name": cls.get("name", ""),
                    "student_email": student_email,
                    "flag_type": "repeat_tardy",
                    "sessions": total,
                    "tardy_count": m["tardy"],
                    "rate": m["tardy_rate"],
                })

            if (m["effective_expected"] >= thresholds["min_sessions"]
                    and m["attendance_rate"] < thresholds["attendance_rate_flag"]
                    and (class_id, student_email, "low_attendance") not in open_keys):
                results.append({
                    "class_id": class_id,
                    "class_name": cls.get("name", ""),
                    "student_email": student_email,
                    "flag_type": "low_attendance",
                    "sessions": total,
                    "expected": m["effective_expected"],
                    "rate": m["attendance_rate"],
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
            filt["org_id"] = {"$in": list(await get_accessible_org_ids(user))}
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
    if role in ("school_admin", "district_admin") and cls.get("org_id") not in await get_accessible_org_ids(user):
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
    await log_audit(
        user["username"], "intervention.create",
        detail={"intervention_id": doc["intervention_id"], "class_id": class_id,
                "student_email": student_email, "flag_type": flag_type},
    )
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
        new_assignee = body["assigned_to"] or None
        if new_assignee:
            assignee = await motor_db.login.find_one(
                {"username": new_assignee, "org_id": doc.get("org_id")},
                {"role": 1, "account_type": 1, "username": 1},
            )
            if (
                not assignee
                or assignee.get("account_type") != "institutional"
                or assignee.get("role") not in TEACHER_ROLES
            ):
                raise HTTPException(status_code=422, detail="assigned_to must be a teacher/admin in this org")
        updates["assigned_to"] = new_assignee

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
    await log_audit(
        user["username"], "intervention.update",
        detail={
            "intervention_id": intervention_id,
            **{k: v for k, v in updates.items() if k in ("status", "assigned_to")},
        },
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
    await log_audit(
        user["username"], "intervention.note_add",
        detail={"intervention_id": intervention_id, "note_id": note["note_id"]},
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
    await log_audit(
        user["username"], "intervention.note_delete",
        detail={"intervention_id": intervention_id, "note_id": note_id},
    )
