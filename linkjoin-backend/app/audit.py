import hashlib
import hmac
import json
from datetime import datetime, timezone

from app.config import get_settings
from app.database import motor_db


def _entry_hash(ts: str, user: str, action: str, resource_type: str | None,
                resource_id: str | None, ip: str | None, detail: dict) -> str:
    """HMAC-SHA256 of canonical entry fields for tamper-evidence."""
    payload = json.dumps({
        "ts": ts, "user": user, "action": action,
        "resource_type": resource_type, "resource_id": resource_id,
        "ip": ip, "detail": detail,
    }, sort_keys=True, default=str)
    secret = get_settings().jwt_secret.encode()
    return hmac.new(secret, payload.encode(), hashlib.sha256).hexdigest()


async def log_audit(
    user: str,
    action: str,
    resource_type: str | None = None,
    resource_id: int | str | None = None,
    ip: str | None = None,
    detail: dict | None = None,
) -> None:
    try:
        ts = datetime.now(timezone.utc)
        ts_iso = ts.isoformat()
        detail_val = detail or {}
        doc = {
            "ts": ts,
            "user": user,
            "action": action,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "ip": ip,
            "detail": detail_val,
            "hash": _entry_hash(ts_iso, user, action, resource_type,
                                str(resource_id) if resource_id is not None else None,
                                ip, detail_val),
        }
        await motor_db.audit_logs.insert_one(doc)
    except Exception:
        pass
