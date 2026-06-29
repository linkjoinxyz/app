import secrets
from fastapi import APIRouter, Depends, HTTPException, Header
from app.auth import get_confirmed_user
from app.database import motor_db
from app.config import get_settings
from app.models.org import CreateOrgRequest, UpdateOrgRequest
from app.roles import require_school_admin

router = APIRouter(prefix="/orgs", tags=["orgs"])
_settings = get_settings()


def _check_token(x_admin_token: str | None = Header(default=None)) -> None:
    if not _settings.add_accounts_token or x_admin_token != _settings.add_accounts_token:
        raise HTTPException(status_code=403, detail="Invalid admin token")


@router.post("", status_code=201)
async def create_org(body: CreateOrgRequest, _: None = Depends(_check_token)):
    if body.type not in ("school", "district"):
        raise HTTPException(status_code=422, detail="type must be 'school' or 'district'")
    org_id = secrets.token_urlsafe(16)
    doc = {
        "org_id": org_id,
        "name": body.name,
        "type": body.type,
        "parent_org_id": body.parent_org_id,
    }
    await motor_db.orgs.insert_one(doc)
    return {"org_id": org_id, "name": body.name}


@router.get("/{org_id}")
async def get_org(org_id: str, user: dict = Depends(get_confirmed_user)):
    require_school_admin(user)
    if user.get("org_id") != org_id and user.get("role") != "district_admin":
        raise HTTPException(status_code=403, detail="Access denied")
    org = await motor_db.orgs.find_one({"org_id": org_id}, {"_id": 0})
    if not org:
        raise HTTPException(status_code=404, detail="Org not found")
    return org


@router.patch("/{org_id}")
async def update_org(org_id: str, body: UpdateOrgRequest, user: dict = Depends(get_confirmed_user)):
    require_school_admin(user)
    if user.get("org_id") != org_id:
        raise HTTPException(status_code=403, detail="Access denied")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        return {"message": "Nothing to update"}
    await motor_db.orgs.update_one({"org_id": org_id}, {"$set": updates})
    return {"message": "Updated"}
