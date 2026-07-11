import secrets
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from app.database import motor_db
from app.auth import get_confirmed_user
from app.audit import log_audit

router = APIRouter(prefix="/incidents", tags=["incidents"])

VALID_SEVERITIES = {"P0", "P1", "P2", "P3"}
VALID_STATUSES = {"investigating", "identified", "monitoring", "resolved"}
VALID_COMPONENTS = {"API", "WebSocket", "Attendance", "Auth", "Email", "Links", "Admin", "Extension"}


class CreateIncidentRequest(BaseModel):
    title: str
    severity: str
    affected_components: list[str]
    public: bool = True


class UpdateIncidentRequest(BaseModel):
    title: Optional[str] = None
    severity: Optional[str] = None
    status: Optional[str] = None
    affected_components: Optional[list[str]] = None
    timeline_message: Optional[str] = None
    public: Optional[bool] = None


def _require_platform_admin(user: dict) -> dict:
    if user.get("admin") != "true":
        raise HTTPException(status_code=403, detail="Platform admin required")
    return user


def _serialize(doc: dict) -> dict:
    doc.pop("_id", None)
    for field in ("started_at", "resolved_at"):
        if isinstance(doc.get(field), datetime):
            doc[field] = doc[field].isoformat()
    for entry in doc.get("timeline", []):
        if isinstance(entry.get("ts"), datetime):
            entry["ts"] = entry["ts"].isoformat()
    return doc


@router.post("")
async def create_incident(body: CreateIncidentRequest, user: dict = Depends(get_confirmed_user)):
    _require_platform_admin(user)
    if body.severity not in VALID_SEVERITIES:
        raise HTTPException(status_code=422, detail=f"severity must be one of {sorted(VALID_SEVERITIES)}")
    now = datetime.now(timezone.utc)
    incident_id = f"inc_{secrets.token_hex(6)}"
    doc = {
        "incident_id": incident_id,
        "title": body.title.strip(),
        "severity": body.severity,
        "status": "investigating",
        "affected_components": body.affected_components,
        "started_at": now,
        "resolved_at": None,
        "timeline": [{"ts": now, "message": "Incident opened.", "author": user["username"]}],
        "created_by": user["username"],
        "public": body.public,
    }
    await motor_db.incidents.insert_one(doc)
    await log_audit(user["username"], "incident.created", detail={"incident_id": incident_id, "severity": body.severity})
    return _serialize(doc)


@router.patch("/{incident_id}")
async def update_incident(incident_id: str, body: UpdateIncidentRequest, user: dict = Depends(get_confirmed_user)):
    _require_platform_admin(user)
    inc = await motor_db.incidents.find_one({"incident_id": incident_id})
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")
    if inc.get("status") == "resolved":
        raise HTTPException(status_code=409, detail="Cannot update a resolved incident")

    updates: dict = {}
    if body.title is not None:
        updates["title"] = body.title.strip()
    if body.severity is not None:
        if body.severity not in VALID_SEVERITIES:
            raise HTTPException(status_code=422, detail=f"severity must be one of {sorted(VALID_SEVERITIES)}")
        updates["severity"] = body.severity
    if body.status is not None:
        if body.status not in VALID_STATUSES:
            raise HTTPException(status_code=422, detail=f"status must be one of {sorted(VALID_STATUSES)}")
        if body.status == "resolved":
            raise HTTPException(status_code=422, detail="Use POST /incidents/{id}/resolve to resolve an incident")
        updates["status"] = body.status
    if body.affected_components is not None:
        updates["affected_components"] = body.affected_components
    if body.public is not None:
        updates["public"] = body.public

    now = datetime.now(timezone.utc)
    push_ops: dict = {}
    if body.timeline_message:
        push_ops["timeline"] = {"ts": now, "message": body.timeline_message.strip(), "author": user["username"]}

    mongo_op: dict = {}
    if updates:
        mongo_op["$set"] = updates
    if push_ops:
        mongo_op["$push"] = push_ops

    if mongo_op:
        await motor_db.incidents.update_one({"incident_id": incident_id}, mongo_op)

    await log_audit(user["username"], "incident.updated", detail={"incident_id": incident_id})
    updated = await motor_db.incidents.find_one({"incident_id": incident_id})
    return _serialize(updated)


@router.post("/{incident_id}/resolve")
async def resolve_incident(incident_id: str, user: dict = Depends(get_confirmed_user)):
    _require_platform_admin(user)
    inc = await motor_db.incidents.find_one({"incident_id": incident_id})
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")
    if inc.get("status") == "resolved":
        raise HTTPException(status_code=409, detail="Incident already resolved")
    now = datetime.now(timezone.utc)
    await motor_db.incidents.update_one(
        {"incident_id": incident_id},
        {
            "$set": {"status": "resolved", "resolved_at": now},
            "$push": {"timeline": {"ts": now, "message": "Incident resolved.", "author": user["username"]}},
        },
    )
    await log_audit(user["username"], "incident.resolved", detail={"incident_id": incident_id})
    updated = await motor_db.incidents.find_one({"incident_id": incident_id})
    return _serialize(updated)


@router.get("/active")
async def get_active_incidents():
    """Public endpoint -- no auth required. Returns active public incidents for the frontend banner."""
    cursor = motor_db.incidents.find(
        {"status": {"$ne": "resolved"}, "public": True},
        {"_id": 0},
    ).sort("started_at", -1).limit(10)
    docs = []
    async for doc in cursor:
        docs.append(_serialize(doc))
    return docs


@router.get("")
async def list_incidents(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    status: Optional[str] = Query(None),
    user: dict = Depends(get_confirmed_user),
):
    _require_platform_admin(user)
    query: dict = {}
    if status:
        if status not in VALID_STATUSES:
            raise HTTPException(status_code=422, detail=f"status must be one of {sorted(VALID_STATUSES)}")
        query["status"] = status
    skip = (page - 1) * limit
    cursor = motor_db.incidents.find(query, {"_id": 0}).sort("started_at", -1).skip(skip).limit(limit)
    total = await motor_db.incidents.count_documents(query)
    docs = []
    async for doc in cursor:
        docs.append(_serialize(doc))
    return {"incidents": docs, "total": total, "page": page, "limit": limit}
