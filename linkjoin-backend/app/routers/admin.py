from fastapi import APIRouter, Depends, HTTPException
from app.auth import get_confirmed_user
from app.database import motor_db
from app.utils import configure_data
from app.websocket_manager import manager

router = APIRouter(prefix="/admin", tags=["admin"])


def _require_admin(user: dict) -> None:
    if user.get("admin") != "true" or user.get("org_name") == "gmail.com":
        raise HTTPException(status_code=403, detail="Admin access required")


@router.post("/disable-all")
async def disable_all(body: dict, user: dict = Depends(get_confirmed_user)):
    _require_admin(user)
    disable = str(body.get("disable", "true")).lower()
    org = user["org_name"]

    async for org_user in motor_db.login.find({"org_name": org}):
        await motor_db.login.update_one(
            {"username": org_user["username"]}, {"$set": {"org_disabled": disable}}
        )
        await manager.broadcast(await configure_data(org_user["username"]), org_user["username"])

    return {"message": "Updated"}


@router.get("/org-disabled")
async def org_disabled(user: dict = Depends(get_confirmed_user)):
    return {"disabled": user.get("org_disabled")}


@router.post("/view")
async def toggle_admin_view(body: dict, user: dict = Depends(get_confirmed_user)):
    _require_admin(user)
    value = str(body.get("admin_view", "false")).lower()
    await motor_db.login.update_one({"username": user["username"]}, {"$set": {"admin_view": value}})
    return {"message": "Updated"}
