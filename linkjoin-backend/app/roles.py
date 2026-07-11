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
