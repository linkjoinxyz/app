from urllib.parse import urlparse
from fastapi import APIRouter, Depends, HTTPException
from app.auth import get_confirmed_user
from app.database import motor_db
from app.encryption import encrypt
from app.models.bookmark import CreateBookmarkRequest, EditBookmarkRequest
from app.utils import configure_data, async_next_link_id
from app.websocket_manager import manager

router = APIRouter(prefix="/bookmarks", tags=["bookmarks"])


def _normalize_and_validate_url(raw: str) -> str:
    url = raw if raw.lower().startswith("http") else f"https://{raw}"
    try:
        p = urlparse(url)
        if p.scheme not in ("http", "https") or not p.netloc:
            raise ValueError
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid URL")
    return url


@router.get("")
async def get_bookmarks(user: dict = Depends(get_confirmed_user)):
    email = user["username"]
    data = await configure_data(email)
    return {"bookmarks": data.get("bookmarks", []), "pending-bookmarks": data.get("pending-bookmarks", [])}


@router.post("", status_code=201)
async def create_bookmark(body: CreateBookmarkRequest, user: dict = Depends(get_confirmed_user)):
    email = user["username"]
    url = _normalize_and_validate_url(body.link)
    bookmark_id = await async_next_link_id()
    doc = {
        "username": email,
        "link": encrypt(url),
        "tags": body.tags,
        "name": body.name,
        "id": bookmark_id,
    }
    await motor_db.bookmarks.insert_one(doc)
    await manager.broadcast(await configure_data(email), email)
    return {"message": "Created", "id": bookmark_id}


@router.put("/{bookmark_id}")
async def edit_bookmark(bookmark_id: int, body: EditBookmarkRequest, user: dict = Depends(get_confirmed_user)):
    email = user["username"]
    url = _normalize_and_validate_url(body.link)
    result = await motor_db.bookmarks.update_one(
        {"id": bookmark_id, "username": email},
        {"$set": {"link": encrypt(url), "name": body.name, "tags": body.tags}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Bookmark not found")
    await manager.broadcast(await configure_data(email), email)
    return {"message": "Updated"}
