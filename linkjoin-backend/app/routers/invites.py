import secrets
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException
from app.auth import create_token, get_confirmed_user, get_current_user
from app.config import get_settings
from app.database import motor_db
from app.email_service import send_email
from app.roles import TEACHER_ROLES, require_school_admin
from app.audit import log_audit

router = APIRouter(prefix="/invites", tags=["invites"])
_settings = get_settings()

_ADMIN_EXPIRY_DAYS = 7
_CLASS_EXPIRY_DAYS = 60


def _invite_email_html(invite: dict, inviter_email: str, org_name: str) -> str:
    invite_url = f"{_settings.app_base_url}/join/{invite['token']}"
    role_labels = {"school_admin": "School Administrator", "teacher": "Teacher", "student": "Student"}
    role_label = role_labels.get(invite["role"], invite["role"].title())
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
            <p style="color:#e8edf2;font-size:16px;margin:0 0 8px;">You have been invited to join LinkJoin as a {role_label}.</p>
            <p style="color:rgba(255,255,255,0.5);font-size:13px;margin:0 0 28px;">Invited by {inviter_email} from {org_name}</p>
            <a href="{invite_url}" style="display:inline-block;background:#2b8fd8;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;">Accept invitation</a>
            <p style="color:rgba(255,255,255,0.3);font-size:12px;margin:28px 0 0;">This invitation expires in {_ADMIN_EXPIRY_DAYS} days. If you did not expect this, you can ignore this email.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;border-top:1px solid rgba(255,255,255,0.06);">
            <p style="color:rgba(255,255,255,0.3);font-size:12px;margin:0;">LinkJoin - School meeting management</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


def _serialize(inv: dict) -> dict:
    inv = {k: v for k, v in inv.items() if k != "_id"}
    for f in ("created_at", "expires_at", "accepted_at"):
        if inv.get(f) and hasattr(inv[f], "isoformat"):
            inv[f] = inv[f].isoformat()
    return inv


@router.post("", status_code=201)
async def create_invite(
    body: dict,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_confirmed_user),
    x_admin_token: str | None = Header(default=None),
):
    invite_type = body.get("type")
    if invite_type not in ("school_admin", "teacher", "student_class"):
        raise HTTPException(status_code=422, detail="type must be 'school_admin', 'teacher', or 'student_class'")

    now = datetime.now(timezone.utc)
    email = None
    class_id = None
    class_name = None

    if invite_type == "school_admin":
        if not _settings.add_accounts_token or x_admin_token != _settings.add_accounts_token:
            raise HTTPException(status_code=403, detail="Admin token required for school_admin invites")
        org_id = body.get("org_id")
        if not org_id:
            raise HTTPException(status_code=422, detail="org_id required")
        org = await motor_db.orgs.find_one({"org_id": org_id}, {"name": 1})
        if not org:
            raise HTTPException(status_code=404, detail="Org not found")
        email = (body.get("email") or "").lower().strip() or None
        reusable = False
        role = "school_admin"

    elif invite_type == "teacher":
        require_school_admin(user)
        org_id = user.get("org_id")
        if not org_id:
            raise HTTPException(status_code=422, detail="No org_id on your account")
        org = await motor_db.orgs.find_one({"org_id": org_id}, {"name": 1})
        email = (body.get("email") or "").lower().strip()
        if not email:
            raise HTTPException(status_code=422, detail="email required for teacher invites")
        reusable = False
        role = "teacher"

    else:  # student_class
        if user.get("account_type") != "institutional" or user.get("role") not in TEACHER_ROLES:
            raise HTTPException(status_code=403, detail="Teacher access required")
        class_id = body.get("class_id")
        if not class_id:
            raise HTTPException(status_code=422, detail="class_id required for student join codes")
        cls = await motor_db.classes.find_one({"class_id": class_id, "teacher_id": user["user_id"]})
        if not cls:
            raise HTTPException(status_code=404, detail="Class not found")
        org_id = cls.get("org_id") or user.get("org_id")
        org = await motor_db.orgs.find_one({"org_id": org_id}, {"name": 1}) if org_id else None
        class_name = cls.get("name", "")
        reusable = True
        role = "student"
        # Revoke existing active join codes for this class
        await motor_db.invites.update_many(
            {"class_id": class_id, "type": "student_class", "status": "pending"},
            {"$set": {"status": "revoked"}},
        )

    expiry_days = _CLASS_EXPIRY_DAYS if invite_type == "student_class" else _ADMIN_EXPIRY_DAYS
    invite = {
        "token": secrets.token_urlsafe(24),
        "type": invite_type,
        "email": email,
        "org_id": org_id,
        "class_id": class_id,
        "class_name": class_name,
        "role": role,
        "invited_by": user["username"],
        "created_at": now,
        "expires_at": now + timedelta(days=expiry_days),
        "reusable": reusable,
        "accepted_at": None,
        "accepted_by": None,
        "status": "pending",
    }
    await motor_db.invites.insert_one(invite)

    if email and invite_type != "student_class":
        org_name = org.get("name", org_id) if org else (org_id or "")
        background_tasks.add_task(
            send_email,
            _invite_email_html(invite, user["username"], org_name),
            "You have been invited to LinkJoin",
            email,
        )

    await log_audit(user["username"], f"invite.create.{invite_type}", detail={"email": email, "org_id": org_id})
    return _serialize(invite)


@router.get("")
async def list_invites(user: dict = Depends(get_confirmed_user)):
    from app.roles import SCHOOL_ADMIN_ROLES
    is_platform_admin = user.get("admin") == "true"
    is_school_admin = user.get("account_type") == "institutional" and user.get("role") in SCHOOL_ADMIN_ROLES
    is_teacher = user.get("account_type") == "institutional" and user.get("role") in TEACHER_ROLES

    if not is_platform_admin and not is_school_admin and not is_teacher:
        raise HTTPException(status_code=403, detail="Access required")

    now = datetime.now(timezone.utc)
    out = []

    if is_teacher and not is_school_admin and not is_platform_admin:
        # Teachers can only see join codes for their own classes
        teacher_classes = await motor_db.classes.find(
            {"teacher_id": user.get("user_id")}, {"class_id": 1}
        ).to_list(None)
        class_ids = [c["class_id"] for c in teacher_classes]
        if not class_ids:
            return []
        query: dict = {"type": "student_class", "class_id": {"$in": class_ids}, "status": "pending"}
    else:
        query = {}
        if not is_platform_admin:
            org_id = user.get("org_id")
            if not org_id:
                return []
            query = {"org_id": org_id}

    async for inv in motor_db.invites.find(query, {"_id": 0}).sort("created_at", -1).limit(200):
        expires = inv.get("expires_at")
        if expires:
            if expires.tzinfo is None:
                expires = expires.replace(tzinfo=timezone.utc)
            if inv.get("status") == "pending" and now > expires:
                inv["status"] = "expired"
        out.append(_serialize(inv))
    return out


@router.get("/{token}")
async def get_invite(token: str):
    invite = await motor_db.invites.find_one({"token": token}, {"_id": 0})
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")

    now = datetime.now(timezone.utc)
    expires = invite.get("expires_at")
    if expires:
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if now > expires:
            await motor_db.invites.update_one({"token": token}, {"$set": {"status": "expired"}})
            raise HTTPException(status_code=410, detail="Invite has expired")

    if invite.get("status") != "pending":
        raise HTTPException(status_code=410, detail=f"Invite is {invite.get('status', 'invalid')}")

    org_name = None
    if invite.get("org_id"):
        org = await motor_db.orgs.find_one({"org_id": invite["org_id"]}, {"name": 1})
        org_name = org.get("name") if org else None

    return {
        "token": token,
        "type": invite["type"],
        "role": invite["role"],
        "email": invite.get("email"),
        "org_name": org_name,
        "class_name": invite.get("class_name"),
        "reusable": invite.get("reusable", False),
        "status": invite["status"],
    }


@router.post("/{token}/accept")
async def accept_invite(token: str, body: dict, user: dict = Depends(get_current_user)):
    invite = await motor_db.invites.find_one({"token": token})
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")

    now = datetime.now(timezone.utc)
    expires = invite.get("expires_at")
    if expires:
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if now > expires:
            await motor_db.invites.update_one({"token": token}, {"$set": {"status": "expired"}})
            raise HTTPException(status_code=410, detail="Invite has expired")

    if invite.get("status") != "pending":
        raise HTTPException(status_code=410, detail=f"Invite is {invite.get('status', 'invalid')}")

    if not invite.get("reusable") and invite.get("accepted_at"):
        raise HTTPException(status_code=410, detail="Invite already accepted")

    if invite.get("email") and invite["email"] != user["username"]:
        raise HTTPException(status_code=403, detail="This invite was sent to a different email address")

    await motor_db.login.update_one(
        {"username": user["username"]},
        {"$set": {"account_type": "institutional", "role": invite["role"], "org_id": invite["org_id"], "confirmed": "true"}},
    )

    if invite.get("class_id"):
        await motor_db.classes.update_one(
            {"class_id": invite["class_id"]},
            {"$addToSet": {"student_ids": user["user_id"]}},
        )

    if invite.get("reusable"):
        await motor_db.invites.update_one(
            {"token": token},
            {"$push": {"acceptances": {"user": user["username"], "at": now.isoformat()}}},
        )
    else:
        await motor_db.invites.update_one(
            {"token": token},
            {"$set": {"status": "accepted", "accepted_at": now, "accepted_by": user["username"]}},
        )

    await log_audit(user["username"], f"invite.accept.{invite['type']}", detail={"token": token})

    new_token = create_token(user["username"])
    return {
        "access_token": new_token,
        "token_type": "bearer",
        "email": user["username"],
        "confirmed": True,
        "account_type": "institutional",
        "role": invite["role"],
        "org_id": invite["org_id"],
    }


@router.delete("/{token}", status_code=204)
async def revoke_invite(token: str, user: dict = Depends(get_confirmed_user)):
    require_school_admin(user)
    invite = await motor_db.invites.find_one({"token": token})
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")
    if invite.get("org_id") != user.get("org_id") and user.get("admin") != "true":
        raise HTTPException(status_code=403, detail="Access denied")
    await motor_db.invites.update_one({"token": token}, {"$set": {"status": "revoked"}})
    await log_audit(user["username"], "invite.revoke", detail={"token": token})
