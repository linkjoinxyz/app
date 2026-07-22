from datetime import datetime, timedelta, timezone
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


async def get_accessible_org_ids(user: dict) -> set[str]:
    """Org ids this user may read data for. district_admin gets their own org
    plus every org whose parent_org_id points at it (one level - no
    district-of-districts nesting exists in the data model). Everyone else
    gets just their own org."""
    org_id = user.get("org_id")
    if not org_id:
        return set()
    if user.get("role") != "district_admin":
        return {org_id}
    from app.database import motor_db
    children = await motor_db.orgs.find({"parent_org_id": org_id}, {"org_id": 1}).to_list(None)
    return {org_id} | {c["org_id"] for c in children}


def require_platform_admin(user: dict) -> None:
    if user.get("admin") != "true":
        raise HTTPException(status_code=403, detail="Platform admin access required")


def is_admin_role(user: dict) -> bool:
    """School/district admins and platform admins — the accounts MFA is meant
    to protect, since they're the ones with reach into student PII."""
    return user.get("role") in SCHOOL_ADMIN_ROLES or user.get("admin") == "true"


def is_premium(user: dict) -> bool:
    """Entitlement predicate. Mirrors isPremium in the frontend AuthContext."""
    if user.get("account_type") == "institutional":
        return True  # School plan bundles "Everything in Individual" — always entitled
    status = user.get("premium_status", "expired")
    if status in ("active", "grandfathered"):
        return True
    if status == "trial":
        trial_end = user.get("trial_end")
        if trial_end and datetime.now(timezone.utc) < trial_end.replace(tzinfo=timezone.utc):
            return True
    return False


def require_premium(user: dict) -> None:
    if not is_premium(user):
        raise HTTPException(status_code=403, detail="Premium required")


TRIAL_DAYS = 14


async def ensure_trial_started(user: dict) -> dict:
    """Start a 14-day Premium trial for a pre-launch account on its next sign-in.

    Personal accounts created before Premium existed carry no premium_status at
    all, so is_premium above reads them as expired and every Premium feature
    403s. Rather than backfilling them to a permanent grant, the trial starts
    when each person actually signs in, so the clock reflects their real first
    exposure to the features rather than the date a migration happened to run.

    No expiry job is needed: is_premium checks trial_end on every call, so access
    lapses on its own 14 days later.

    Mutates and returns the passed dict so the caller's copy stays accurate.
    """
    if user.get("account_type") == "institutional":
        return user  # school plans are entitled outright
    if user.get("premium_status"):
        return user  # already trialing, active, grandfathered or expired

    from app.database import motor_db

    now = datetime.now(timezone.utc)
    fields = {
        "premium_status": "trial",
        "trial_start": now,
        "trial_end": now + timedelta(days=TRIAL_DAYS),
        # Drives the existing "Your 14-day free trial has started" modal.
        "trial_welcome_seen": False,
    }
    # Matches missing OR null, and re-asserting it means two concurrent logins
    # cannot both start a trial and reset the clock.
    await motor_db.login.update_one(
        {"username": user["username"], "premium_status": None},
        {"$set": fields},
    )
    user.update(fields)
    return user
