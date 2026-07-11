import time
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter
from app.database import motor_db

router = APIRouter(prefix="/status", tags=["status"])


def _serialize_incident(doc: dict) -> dict:
    doc.pop("_id", None)
    for field in ("started_at", "resolved_at"):
        if isinstance(doc.get(field), datetime):
            doc[field] = doc[field].isoformat()
    for entry in doc.get("timeline", []):
        if isinstance(entry.get("ts"), datetime):
            entry["ts"] = entry["ts"].isoformat()
    return doc


@router.get("/summary")
async def status_summary():
    """Public endpoint. Returns uptime stats, day-by-day history, and incidents."""
    now = datetime.utcnow()
    cutoff_90d = now - timedelta(days=90)
    cutoff_30d = now - timedelta(days=30)

    checks = await motor_db.status_checks.find(
        {"ts": {"$gte": cutoff_90d}}, {"_id": 0}
    ).sort("ts", -1).to_list(length=None)

    total_90 = len(checks)
    ok_90 = sum(1 for c in checks if c.get("ok"))
    checks_30 = [c for c in checks if c["ts"] >= cutoff_30d]
    total_30 = len(checks_30)
    ok_30 = sum(1 for c in checks_30 if c.get("ok"))

    uptime_90d = round(ok_90 / total_90 * 100, 2) if total_90 else None
    uptime_30d = round(ok_30 / total_30 * 100, 2) if total_30 else None

    by_day: dict = defaultdict(list)
    for c in checks:
        by_day[c["ts"].strftime("%Y-%m-%d")].append(c)

    days = []
    for i in range(89, -1, -1):
        date = (now - timedelta(days=i)).strftime("%Y-%m-%d")
        dc = by_day.get(date, [])
        if dc:
            ok_count = sum(1 for c in dc if c.get("ok"))
            pct = round(ok_count / len(dc) * 100, 1)
            days.append({"date": date, "uptime_pct": pct, "checks": len(dc)})
        else:
            days.append({"date": date, "uptime_pct": None, "checks": 0})

    current_ms = checks[0].get("mongo_ms") if checks else None

    recent_12 = checks[:12]
    if not recent_12:
        overall = "unknown"
    elif all(c.get("ok") for c in recent_12):
        overall = "operational"
    elif any(c.get("ok") for c in recent_12):
        overall = "degraded"
    else:
        overall = "outage"

    active_incidents = []
    async for doc in motor_db.incidents.find(
        {"status": {"$ne": "resolved"}, "public": True}, {"_id": 0}
    ).sort("started_at", -1).limit(5):
        active_incidents.append(_serialize_incident(doc))

    if active_incidents:
        max_sev = min(int(i["severity"][1]) for i in active_incidents)
        if max_sev <= 1:
            overall = "outage"
        elif max_sev == 2:
            overall = "degraded"

    recent_incidents = []
    async for doc in motor_db.incidents.find(
        {"status": "resolved", "public": True}, {"_id": 0}
    ).sort("resolved_at", -1).limit(10):
        recent_incidents.append(_serialize_incident(doc))

    return {
        "overall": overall,
        "uptime_30d": uptime_30d,
        "uptime_90d": uptime_90d,
        "current_response_ms": current_ms,
        "days": days,
        "active_incidents": active_incidents,
        "recent_incidents": recent_incidents,
    }
