from datetime import datetime, timezone
from fastapi import HTTPException

TEACHER_ROLES = {"teacher", "school_admin", "district_admin"}
SCHOOL_ADMIN_ROLES = {"school_admin", "district_admin"}


def require_teacher(user: dict) -> None:
    if user.get("account_type") != "institutional" or user.get("role") not in TEACHER_ROLES:
        raise HTTPException(status_code=403, detail="Teacher access required")


def require_school_admin(user: dict) -> None:
    if user.get("account_type") != "institutional" or user.get("role") not in SCHOOL_ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="School admin access required")


def require_district_admin(user: dict) -> None:
    if user.get("account_type") != "institutional" or user.get("role") != "district_admin":
        raise HTTPException(status_code=403, detail="District admin access required")


def require_premium(user: dict) -> None:
    if user.get("account_type") == "institutional":
        return  # School plan bundles "Everything in Individual" — always entitled
    status = user.get("premium_status", "expired")
    if status in ("active", "grandfathered"):
        return
    if status == "trial":
        trial_end = user.get("trial_end")
        if trial_end and datetime.now(timezone.utc) < trial_end.replace(tzinfo=timezone.utc):
            return
    raise HTTPException(status_code=403, detail="Premium required")
