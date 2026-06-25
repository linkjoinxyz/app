from fastapi import APIRouter, Depends
from app.auth import get_current_user
from app.utils import analytics

router = APIRouter(prefix="/analytics", tags=["analytics"])

_VALID_FIELDS = {
    "links_opened", "links_made", "links_edited", "links_deleted",
    "logins", "signups", "users",
}


@router.post("")
async def track(body: dict, user: dict = Depends(get_current_user)):
    field = body.get("field")
    if field in _VALID_FIELDS:
        await analytics(field)
    return {"message": "ok"}
