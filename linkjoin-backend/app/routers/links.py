import asyncio
import html as _html
import logging
import secrets
from datetime import datetime, timezone
from urllib.parse import urlparse
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from app.auth import get_confirmed_user, get_current_user
from app.audit import log_audit
from app.database import motor_db
from app.encryption import encrypt, decrypt
from app.models.link import (
    CreateLinkRequest, UpdateLinkRequest, DeleteLinkRequest,
    RestoreLinkRequest, ToggleLinkRequest, ShareLinkRequest,
    AcceptLinkRequest,
)
from app.limiter import limiter
from app.roles import SCHOOL_ADMIN_ROLES
from app.scheduler import create_text_job, delete_text_job
from app.utils import configure_data, track_event, async_next_link_id, gen_slug, compute_session_start_utc
from app.websocket_manager import manager
from app.email_service import send_email_batch
from app.config import get_settings

log = logging.getLogger(__name__)
router = APIRouter(prefix="/links", tags=["links"])
_settings = get_settings()


def _gen_share_id() -> str:
    return secrets.token_urlsafe(16)


async def _unique_share_id() -> str:
    # 128-bit entropy from token_urlsafe(16) makes collisions negligible (~1 in 2^128)
    return _gen_share_id()


async def _unique_slug() -> str:
    # Same 128-bit-entropy justification as _unique_share_id() above.
    return gen_slug()


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


@router.get("/c/{slug}")
async def resolve_class_link(slug: str, background_tasks: BackgroundTasks, user: dict = Depends(get_confirmed_user)):
    """Log a linkjoin_click (when eligible) and hand back the meeting URL for the frontend
    to open. For class-linked meetings, only the rostered student, the class's own
    teacher, or an org admin may receive the URL — everyone else is denied before it's
    ever decrypted, matching the redaction _clean_items applies everywhere links are
    listed. Personal (non-class) links are unaffected."""
    link = await motor_db.links.find_one({"slug": slug})
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")

    logged = False
    class_id = link.get("class_id")
    cls = None
    is_rostered = False
    if class_id:
        cls = await motor_db.classes.find_one({"class_id": class_id})
        role = user.get("role")
        is_rostered = bool(cls) and role == "student" and user.get("user_id") in (cls.get("student_ids") or [])
        is_owning_teacher = bool(cls) and role == "teacher" and cls.get("teacher_id") == user.get("user_id")
        is_org_admin = bool(cls) and role in SCHOOL_ADMIN_ROLES and user.get("org_id") == cls.get("org_id")
        if not (is_rostered or is_owning_teacher or is_org_admin):
            if role == "student":
                await log_audit(user["username"], "attendance.roster_miss", "class", class_id)
            raise HTTPException(status_code=403, detail="Not authorized for this class link")

    try:
        if is_rostered:
            teacher = await motor_db.login.find_one({"user_id": cls.get("teacher_id", "")}, {"timezone": 1})
            tz_name = (teacher or {}).get("timezone") or "UTC"
            now_utc = datetime.now(timezone.utc)
            session_start = compute_session_start_utc(cls.get("time", ""), cls.get("days") or [], tz_name, now_utc)
            if session_start is not None:
                # Match on record_date (the class's local calendar day), not a UTC
                # timestamp range — session_start's local evening can fall on the
                # *next* UTC day for negative-offset timezones, which would make a
                # UTC-midnight-aligned window miss the very row it just inserted.
                record_date = session_start.strftime("%Y-%m-%d")
                existing = await motor_db.attendance.find_one({
                    "class_id": class_id,
                    "student_email": user["username"],
                    "source": "linkjoin_click",
                    "record_date": record_date,
                })
                if existing:
                    logged = True
                else:
                    minutes_late = round((now_utc - session_start).total_seconds() / 60)
                    await motor_db.attendance.insert_one({
                        "student_email": user["username"],
                        "link_id": link.get("id"),
                        "class_id": class_id,
                        "class_name": link.get("class_name") or cls.get("name", ""),
                        "share_id": link.get("share_id"),
                        "opened_at": now_utc,
                        "minutes_late": minutes_late,
                        "source": "linkjoin_click",
                        "recorded_by_user_id": None,
                        "reason_code": None,
                        "note": "",
                        "recorded_at": now_utc,
                        "record_date": record_date,
                        "previous_record": None,
                    })
                    logged = True
                    from app.routers.attendance import _gc_sync_if_due
                    background_tasks.add_task(_gc_sync_if_due, class_id)
    except Exception:
        log.exception("class link resolve failed for slug=%s", slug)

    try:
        url = decrypt(link["link"])
    except Exception:
        url = ""
    password = ""
    if link.get("password"):
        try:
            password = decrypt(link["password"])
        except Exception:
            password = ""

    return {
        "url": url,
        "name": link.get("name", ""),
        "class_name": link.get("class_name", ""),
        "password": password,
        "logged": logged,
    }


@router.get("/history")
async def get_link_history(
    limit: int = Query(default=50, ge=1, le=100),
    link_id: int | None = None,
    before: str | None = None,
    user: dict = Depends(get_confirmed_user),
):
    email = user["username"]
    role = user.get("role", "")
    org_id = user.get("org_id")

    before_dt = None
    if before:
        try:
            before_dt = datetime.fromisoformat(before.replace("Z", "+00:00"))
        except (ValueError, TypeError):
            pass

    # Admins see the full org feed; everyone else sees only their own
    is_admin = role in ("school_admin", "district_admin") and org_id
    if is_admin:
        org_members = await motor_db.login.find(
            {"org_id": org_id}, {"username": 1, "_id": 0}
        ).to_list(None)
        org_emails = [m["username"] for m in org_members] or [email]
        opens_query: dict = {"username": {"$in": org_emails}}
        audits_query: dict = {"user": {"$in": org_emails}, "resource_type": "link"}
    else:
        opens_query: dict = {"username": email}
        audits_query: dict = {"user": email, "resource_type": "link"}
    if link_id is not None:
        opens_query["link_id"] = link_id
        audits_query["resource_id"] = link_id
    if before_dt:
        opens_query["opened_at"] = {"$lt": before_dt}
        audits_query["ts"] = {"$lt": before_dt}

    fetch = limit + 1
    opens_raw, audits_raw = await asyncio.gather(
        motor_db.open_log.find(opens_query, {"_id": 0}).sort("opened_at", -1).limit(fetch).to_list(None),
        motor_db.audit_logs.find(audits_query, {"_id": 0}).sort("ts", -1).limit(fetch).to_list(None),
    )

    action_map = {"create": "create", "update": "edit", "delete": "delete", "toggle": "toggle", "restore": "restore"}
    events = []
    for o in opens_raw:
        ts = o["opened_at"]
        events.append({
            "type": "open",
            "link_id": o["link_id"],
            "link_name": o.get("link_name", ""),
            "actor": o.get("username", ""),
            "ts": ts.strftime("%Y-%m-%dT%H:%M:%S.000Z") if isinstance(ts, datetime) else str(ts),
            "_ts": ts,
        })
    for a in audits_raw:
        action_key = (a.get("action") or "").split(".")[-1]
        detail = a.get("detail") or {}
        ts = a["ts"]
        events.append({
            "type": action_map.get(action_key, "edit"),
            "link_id": a.get("resource_id"),
            "link_name": detail.get("name", ""),
            "actor": a.get("user", ""),
            "ts": ts.strftime("%Y-%m-%dT%H:%M:%S.000Z") if isinstance(ts, datetime) else str(ts),
            "_ts": ts,
        })

    events.sort(key=lambda e: e["_ts"], reverse=True)
    for e in events:
        del e["_ts"]

    has_more = len(events) > limit
    events = events[:limit]
    next_before = events[-1]["ts"] if has_more and events else None
    return {"events": events, "has_more": has_more, "next_before": next_before}


@router.post("/{link_id}/open", status_code=200)
async def log_link_open(link_id: int, user: dict = Depends(get_confirmed_user)):
    email = user["username"]
    link = await motor_db.links.find_one({"username": email, "id": link_id}, {"name": 1, "time": 1})
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    await motor_db.open_log.insert_one({
        "username": email,
        "link_id": link_id,
        "link_name": link.get("name", ""),
        "link_time": link.get("time", ""),
        "opened_at": datetime.now(timezone.utc),
    })
    await track_event("link_open", org_id=user.get("org_id"), user_id=user.get("user_id"))
    return {"ok": True}


@router.post("", status_code=201)
async def create_link(request: Request, body: CreateLinkRequest, user: dict = Depends(get_confirmed_user)):
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
        "active": body.active if body.active in ("true", "false") else "true",
        "share": encrypt(share_url),
        "share_token": sid,
        "slug": await _unique_slug(),
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
    await track_event("link_create", org_id=user.get("org_id"), user_id=user.get("user_id"))
    await log_audit(email, "link.create", "link", link_id, ip=request.client.host if request.client else None, detail={"name": body.name})
    await manager.broadcast(await configure_data(email), email)
    return {"message": "Created", "id": link_id}


@router.put("/{link_id}")
async def update_link(link_id: int, request: Request, body: UpdateLinkRequest, user: dict = Depends(get_confirmed_user)):
    email = user["username"]
    existing = await motor_db.links.find_one({"username": email, "id": link_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Link not found")

    if body.link:
        link_url = _normalize_url(body.link)
        if not _valid_url(link_url):
            raise HTTPException(status_code=422, detail="Invalid URL")
        encrypted_link = encrypt(link_url)
    else:
        # Class-linked edits may omit `link` — the raw URL is redacted client-side
        # for organizational links, so no value means "keep the existing link".
        link_url = None
        encrypted_link = existing["link"]

    doc = {
        "username": email,
        "id": link_id,
        "time": body.time,
        "link": encrypted_link,
        "name": body.name,
        "active": existing["active"],
        "share": existing.get("share"),
        "share_token": existing.get("share_token"),
        "slug": existing.get("slug"),
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
    if existing.get("class_id"):
        doc["class_id"] = existing["class_id"]
        doc["class_name"] = existing.get("class_name", "")
        doc["link_type"] = existing.get("link_type", "")

    # Propagate updates to shared copies and notify recipients
    async for shared in motor_db.links.find({"share_id": link_id}):
        upd: dict = {
            "name": body.name, "time": body.time, "days": body.days,
            "repeat": body.repeats,
            "date": body.date or "", "end_date": body.end_date or "",
            "modified": True,
        }
        if link_url:
            upd["link"] = encrypt(link_url)
        if body.password:
            upd["password"] = encrypt(body.password)
        await motor_db.links.update_one(
            {"username": shared["username"], "id": shared["id"]}, {"$set": upd}
        )
        await manager.broadcast(await configure_data(shared["username"]), shared["username"])

    delete_text_job(existing)
    await motor_db.links.replace_one({"username": email, "id": link_id}, doc)
    create_text_job(doc, update=True)
    await track_event("link_edit", org_id=user.get("org_id"), user_id=user.get("user_id"))
    await log_audit(email, "link.update", "link", link_id, ip=request.client.host if request.client else None, detail={"name": body.name})
    await manager.broadcast(await configure_data(email), email)
    return {"message": "Updated"}


@router.delete("/{link_id}")
async def delete_link(link_id: int, request: Request, permanent: bool = False, type: str = "link", user: dict = Depends(get_confirmed_user)):
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

    await track_event("link_delete", org_id=user.get("org_id"), user_id=user.get("user_id"))
    link_name = doc.get("name", "") if not permanent else ""
    await log_audit(email, "link.delete", type, link_id, ip=request.client.host if request.client else None, detail={"name": link_name})
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

    if type != "bookmark":
        await log_audit(email, "link.restore", "link", link_id, detail={"name": doc.get("name", "")})
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
    await track_event("link_edit", org_id=user.get("org_id"), user_id=user.get("user_id"))
    await log_audit(email, "link.toggle", "link", link_id, detail={"active": active, "name": existing.get("name", "")})
    await manager.broadcast(await configure_data(email), email)
    return {"message": "Toggled", "active": active}


@router.post("/share")
@limiter.limit("5/hour")
async def share_link(
    request: Request,
    body: ShareLinkRequest,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_confirmed_user),
):
    email = user["username"]
    coll = motor_db.bookmarks if body.type == "bookmark" else motor_db.links

    # Load the row server-side, scoped to the caller. The client only ever supplies
    # an integer id — everything else about the shared document comes from the DB.
    link = await coll.find_one({"username": email, "id": body.link_id})
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")

    # Class links carry the org's meeting URL, which _clean_items() deliberately
    # redacts from every read path so students/teachers only ever get the /c/:slug
    # redirect. Sharing one would hand the raw URL to an arbitrary recipient and
    # defeat the attendance-integrity guarantee.
    if link.get("class_id"):
        raise HTTPException(status_code=403, detail="Class links cannot be shared")

    recipients = [e for e in body.emails if e != email.lower()]
    if not recipients:
        raise HTTPException(status_code=422, detail="Cannot share a link only with yourself")

    safe_sender = _html.escape(email)
    safe_name = _html.escape(link.get("name", ""))
    messages: list[dict] = []

    for recipient_email in recipients:
        sid = await _unique_share_id()
        share_url = f"{_settings.app_base_url}/addlink?id={sid}"
        new_link_id = await async_next_link_id()

        new_doc: dict = {k: v for k, v in link.items() if k not in ("_id", "username", "share", "share_token", "slug", "id")}
        new_doc["username"] = recipient_email
        new_doc["share_id"] = link["id"]
        new_doc["id"] = new_link_id
        new_doc["share"] = encrypt(share_url)
        new_doc["share_token"] = sid
        # `link` and `password` are already encrypted at rest — copy the ciphertext
        # straight across rather than decrypting and re-encrypting.

        if body.type == "bookmark":
            await motor_db.pending_bookmarks.insert_one(new_doc)
        else:
            await motor_db.pending_links.insert_one(new_doc)

        recipient_user = await motor_db.login.find_one({"username": recipient_email}, {"_id": 1})
        html = (
            f"<p>{safe_sender} shared the link <strong>{safe_name}</strong> with you on LinkJoin.</p>"
            if recipient_user
            else f"<p>{safe_sender} shared a link with you on LinkJoin. <a href='{_settings.frontend_url}/signup'>Sign up</a> to see it.</p>"
        )
        messages.append({
            "html_content": html,
            "subject": f"LinkJoin - {link.get('name', '')} shared with you",
            "to": recipient_email,
        })
        # configure_data is a 6-collection gather, so broadcasting per recipient
        # inside this loop was ~6 extra queries each. Still per-recipient because
        # each one gets their own payload, but the sends are now batched below.
        await manager.broadcast(await configure_data(recipient_email), recipient_email)

    background_tasks.add_task(send_email_batch, messages)
    await track_event("link_share", org_id=user.get("org_id"), user_id=user.get("user_id"))
    await log_audit(email, "link.share", "link", body.link_id, detail={"recipients": len(recipients)})
    return {"message": "Shared", "recipients": len(recipients)}


@router.get("/addlink")
@limiter.limit("20/minute")
async def add_link_via_share(request: Request, id: str, user: dict = Depends(get_confirmed_user)):
    email = user["username"]

    # Indexed lookup only. This used to fall back to scanning every link with a
    # `share` field and Fernet-decrypting each one, which made a miss O(n) in both
    # queries and crypto — a trivial way to saturate the workers. Pre-existing docs
    # are backfilled by scripts/backfill_share_tokens.py instead.
    target = await motor_db.links.find_one({"share_token": id})

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
