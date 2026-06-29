from datetime import datetime, timezone
from app.database import motor_db


async def log_audit(
    user: str,
    action: str,
    resource_type: str | None = None,
    resource_id: int | str | None = None,
    ip: str | None = None,
    detail: dict | None = None,
) -> None:
    try:
        await motor_db.audit_logs.insert_one({
            "ts": datetime.now(timezone.utc),
            "user": user,
            "action": action,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "ip": ip,
            "detail": detail or {},
        })
    except Exception:
        pass
