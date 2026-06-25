import html as _html
import secrets
from urllib.parse import urlparse
from fastapi import APIRouter, Depends, HTTPException
from app.auth import get_confirmed_user, get_current_user
from app.database import motor_db
from app.encryption import encrypt, decrypt
from app.models.link import (
    CreateLinkRequest, UpdateLinkRequest, DeleteLinkRequest,
    RestoreLinkRequest, ToggleLinkRequest, ShareLinkRequest,
    AcceptLinkRequest,
)
from app.scheduler import create_text_job, delete_text_job
from app.utils import configure_data, analytics, async_next_link_id
from app.websocket_manager import manager
from app.email_service import send_email
from app.config import get_settings

router = APIRouter(prefix="/links", tags=["links"])
_settings = get_settings()


def _gen_share_id() -> str:
    return secrets.token_urlsafe(16)


async def _unique_share_id() -> str:
    # 128-bit entropy from token_urlsafe(16) makes collisions negligible (~1 in 2^128)
    return _gen_share_id()


def _valid_url(url: str) -> bool:
    try:
        p = urlparse(url)
        return p.scheme in ("http", "https") and bool(p.netloc)
    except Exception:
        return False


def _normalize_url(url: str) -> str:
    if not url:
        return url
    if not url.lower().startswith("http"):
        url = f"https://{url}"
    return url


@router.get("")
async def get_links(user: dict = Depends(get_current_user)):
    return await configure_data(user["username"])


@router.post("", status_code=201)
async def create_link(body: CreateLinkRequest, user: dict = Depends(get_confirmed_user)):
    email = user["username"]
    link_url = _normalize_url(body.link)
    if not _valid_url(link_url):
        raise HTTPException(status_code=422, detail="Invalid URL")
    sid = await _unique_share_id()
    share_url = f"{_settings.app_base_url}/addlink?id={sid}"

    link_id = await async_next_link_id()
    doc = {
        "username": email,
        "id": link_id,
        "time": body.time,
        "link": encrypt(link_url),
        "name": body.name,
        "active": "true",
        "share": encrypt(share_url),
        "share_token": sid,
        "repeat": body.repeats,
        "days": body.days,
        "text": body.text,
        "date": body.date or "",
        "end_date": body.end_date or "",
        "org_name": email.split("@")[1],
    }
    if body.password:
        doc["password"] = encrypt(body.password)

    await motor_db.links.insert_one(doc)
    create_text_job(doc)
    await analytics("links_made")
    await manager.broadcast(await configure_data(email), email)
    return {"message": "Created"}


@router.put("/{link_id}")
async def update_link(link_id: int, body: UpdateLinkRequest, user: dict = Depends(get_confirmed_user)):
    email = user["username"]
    existing = await motor_db.links.find_one({"username": email, "id": link_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Link not found")

    link_url = _normalize_url(body.link)
    if not _valid_url(link_url):
        raise HTTPException(status_code=422, detail="Invalid URL")
    doc = {
        "username": email,
        "id": link_id,
        "time": body.time,
        "link": encrypt(link_url),
        "name": body.name,
        "active": existing["active"],
        "share": existing.get("share"),
        "share_token": existing.get("share_token"),
        "repeat": body.repeats,
        "days": body.days,
        "text": body.text,
        "date": body.date or "",
        "end_date": body.end_date or "",
    }
    if body.password:
        doc["password"] = encrypt(body.password)
    if existing.get("share_id"):
        doc["share_id"] = existing["share_id"]

    # Propagate updates to shared copies and notify recipients
    async for shared in motor_db.links.find({"share_id": link_id}):
        upd: dict = {
            "name": body.name, "time": body.time, "days": body.days,
            "link": encrypt(link_url), "repeat": body.repeats,
            "date": body.date or "", "end_date": body.end_date or "",
            "modified": True,
        }
        if body.password:
            upd["password"] = encrypt(body.password)
        await motor_db.links.update_one(
            {"username": shared["username"], "id": shared["id"]}, {"$set": upd}
        )
        await manager.broadcast(await configure_data(shared["username"]), shared["username"])

    delete_text_job(existing)
    await motor_db.links.replace_one({"username": email, "id": link_id}, doc)
    create_text_job(doc, update=True)
    await analytics("links_edited")
    await manager.broadcast(await configure_data(email), email)
    return {"message": "Updated"}


@router.delete("/{link_id}")
async def delete_link(link_id: int, permanent: bool = False, type: str = "link", user: dict = Depends(get_confirmed_user)):
    email = user["username"]
    if type == "bookmark":
        coll, del_coll = motor_db.bookmarks, motor_db.deleted_bookmarks
    else:
        coll, del_coll = motor_db.links, motor_db.deleted_links

    if permanent:
        result = await del_coll.delete_one({"username": email, "id": link_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Not found")
    else:
        doc = await coll.find_one_and_delete({"username": email, "id": link_id})
        if not doc:
            raise HTTPException(status_code=404, detail="Not found")
        doc.pop("_id", None)
        await del_coll.insert_one(doc)
        if type != "bookmark":
            delete_text_job(doc)
            # Remove shared copies that other users received from this link
            await motor_db.links.delete_many({"share_id": link_id})

    await analytics("links_deleted")
    await manager.broadcast(await configure_data(email), email)
    return {"message": "Deleted"}


@router.post("/{link_id}/restore")
async def restore_link(link_id: int, type: str = "link", user: dict = Depends(get_confirmed_user)):
    email = user["username"]
    if type == "bookmark":
        src, dest = motor_db.deleted_bookmarks, motor_db.bookmarks
    else:
        src, dest = motor_db.deleted_links, motor_db.links

    doc = await src.find_one_and_delete({"username": email, "id": link_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    doc.pop("_id", None)
    await dest.insert_one(doc)

    if type != "bookmark" and doc.get("text") and doc.get("text") != "false":
        create_text_job(doc, update=True)

    await manager.broadcast(await configure_data(email), email)
    return {"message": "Restored"}


@router.patch("/{link_id}/toggle")
async def toggle_link(link_id: int, body: ToggleLinkRequest, user: dict = Depends(get_confirmed_user)):
    email = user["username"]
    existing = await motor_db.links.find_one({"username": email, "id": link_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Link not found")

    active = body.active or ("false" if existing["active"] == "true" else "true")
    await motor_db.links.update_one({"username": email, "id": link_id}, {"$set": {"active": active}})
    delete_text_job(existing)
    if active == "true":
        updated = {**existing, "active": "true"}
        create_text_job(updated, update=True)
    await analytics("links_edited")
    await manager.broadcast(await configure_data(email), email)
    return {"message": "Toggled", "active": active}


@router.post("/share")
async def share_link(body: ShareLinkRequest, user: dict = Depends(get_confirmed_user)):
    email = user["username"]
    link = body.link

    for recipient_email in body.emails:
        sid = await _unique_share_id()
        share_url = f"{_settings.app_base_url}/addlink?id={sid}"
        new_link_id = await async_next_link_id()

        new_doc: dict = {k: v for k, v in link.items() if k not in ("_id", "username", "share", "share_token", "link", "password")}
        new_doc["username"] = recipient_email
        new_doc["share_id"] = link["id"]
        new_doc["id"] = new_link_id
        new_doc["link"] = encrypt(link["link"])
        new_doc["share"] = encrypt(share_url)
        new_doc["share_token"] = sid
        if "password" in link:
            new_doc["password"] = encrypt(link["password"])

        if body.type == "bookmark":
            await motor_db.pending_bookmarks.insert_one(new_doc)
        else:
            await motor_db.pending_links.insert_one(new_doc)

        # Send email notification
        recipient_user = await motor_db.login.find_one({"username": recipient_email})
        template = "existing" if recipient_user else "new"
        safe_email = _html.escape(email)
        safe_name = _html.escape(link.get('name', ''))
        html = (
            f"<p>{safe_email} shared the link <strong>{safe_name}</strong> with you on LinkJoin.</p>"
            if template == "existing"
            else f"<p>{safe_email} shared a link with you on LinkJoin. <a href='{_settings.frontend_url}/signup'>Sign up</a> to see it.</p>"
        )
        try:
            send_email(html, f"LinkJoin - {link.get('name', '')} shared with you", recipient_email)
        except Exception:
            pass

        await manager.broadcast(await configure_data(recipient_email), recipient_email)

    return {"message": "Shared"}


@router.get("/addlink")
async def add_link_via_share(id: str, user: dict = Depends(get_confirmed_user)):
    email = user["username"]

    # Fast indexed lookup first; fall back to legacy O(n) scan for older docs without share_token
    target = await motor_db.links.find_one({"share_token": id})
    if target is None:
        async for doc in motor_db.links.find({"share": {"$exists": True}, "share_token": {"$exists": False}}):
            try:
                if decrypt(doc["share"]).split("?id=")[-1] == id:
                    target = doc
                    await motor_db.links.update_one({"_id": doc["_id"]}, {"$set": {"share_token": id}})
                    break
            except Exception:
                continue

    if target is None:
        raise HTTPException(status_code=404, detail="Link not found")

    existing = await motor_db.links.find_one({"username": email, "share_id": target["id"]})
    if existing:
        return {"message": "Already added"}

    new_link_id = await async_next_link_id()
    sid = await _unique_share_id()
    share_url = f"{_settings.app_base_url}/addlink?id={sid}"

    new_doc = {k: v for k, v in target.items() if k not in ("_id", "username", "share")}
    new_doc["username"] = email
    new_doc["share_id"] = target["id"]
    new_doc["id"] = new_link_id
    new_doc["share"] = encrypt(share_url)

    await motor_db.links.insert_one(new_doc)
    if new_doc.get("text") and new_doc.get("text") != "false":
        create_text_job(new_doc, update=True)

    await manager.broadcast(await configure_data(email), email)
    return {"message": "Added"}


@router.post("/accept")
async def accept_link(body: AcceptLinkRequest, user: dict = Depends(get_confirmed_user)):
    email = user["username"]
    if body.type == "bookmark":
        src, dest = motor_db.pending_bookmarks, motor_db.bookmarks
    else:
        src, dest = motor_db.pending_links, motor_db.links

    doc = await src.find_one_and_delete({"username": email, "id": body.link["id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Pending link not found")

    if body.accept:
        doc.pop("_id", None)
        await dest.insert_one(doc)
        if body.type != "bookmark" and doc.get("text") and doc.get("text") != "false":
            create_text_job(doc, update=True)

    await manager.broadcast(await configure_data(email), email)
    return {"message": "Accepted" if body.accept else "Declined"}


@router.post("/dismiss-modifications")
async def dismiss_modifications(user: dict = Depends(get_confirmed_user)):
    email = user["username"]
    await motor_db.links.update_many(
        {"username": email, "modified": True},
        {"$unset": {"modified": ""}}
    )
    return {"message": "Cleared"}
