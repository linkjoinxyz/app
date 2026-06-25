import secrets
from datetime import datetime
from pymongo import ReturnDocument
from app.database import sync_db, motor_db
from app.encryption import decrypt


def gen_id() -> str:
    candidate = secrets.token_urlsafe(16)
    while sync_db.login.find_one({"refer": candidate}):
        candidate = secrets.token_urlsafe(16)
    return candidate


def normalize_url(url: str) -> str:
    if url and not url.lower().startswith("http"):
        return f"https://{url}"
    return url


def next_link_id() -> int:
    doc = sync_db.id.find_one_and_update(
        {"_id": "id"}, {"$inc": {"id": 1}}, upsert=True, return_document=ReturnDocument.AFTER
    )
    return int(doc["id"])


async def async_next_link_id() -> int:
    doc = await motor_db.id.find_one_and_update(
        {"_id": "id"}, {"$inc": {"id": 1}}, upsert=True, return_document=ReturnDocument.AFTER
    )
    return int(doc["id"])


async def analytics(event: str, **kwargs) -> None:
    month = str(datetime.now().month)
    if event == "users":
        email = kwargs.get("email", "")
        await motor_db.analytics.update_one(
            {"id": event}, {"$inc": {f"{month}.{email}": 1}}, upsert=False
        )
    else:
        await motor_db.analytics.update_one(
            {"id": event}, {"$inc": {month: 1}}, upsert=False
        )


def _clean_items(items: list) -> list:
    cleaned = []
    for item in items:
        item = {k: v for k, v in item.items() if k != "_id"}
        try:
            if "link" in item:
                item["link"] = decrypt(item["link"])
        except Exception:
            item["link"] = ""
        try:
            if "share" in item:
                item["share"] = decrypt(item["share"])
        except Exception:
            item.pop("share", None)
        try:
            if "password" in item:
                item["password"] = decrypt(item["password"])
        except Exception:
            item["password"] = ""
        cleaned.append(item)
    return cleaned


async def configure_data(email: str) -> dict:
    user = await motor_db.login.find_one({"username": email})
    if not user:
        return {}

    if user.get("admin") == "true" and user.get("admin_view") == "true":
        org = user.get("org_name", "")
        raw = {
            "links": await motor_db.links.find({"org_name": org}).to_list(None),
            "pending-links": [],
            "deleted-links": await motor_db.deleted_links.find().to_list(None),
            "bookmarks": await motor_db.bookmarks.find().to_list(None),
            "pending-bookmarks": [],
            "deleted-bookmarks": await motor_db.deleted_bookmarks.find().to_list(None),
        }
    else:
        raw = {
            "links": await motor_db.links.find({"username": email}).to_list(None),
            "pending-links": await motor_db.pending_links.find({"username": email}).to_list(None),
            "deleted-links": await motor_db.deleted_links.find({"username": email}).to_list(None),
            "bookmarks": await motor_db.bookmarks.find({"username": email}).to_list(None),
            "pending-bookmarks": await motor_db.pending_bookmarks.find({"username": email}).to_list(None),
            "deleted-bookmarks": await motor_db.deleted_bookmarks.find({"username": email}).to_list(None),
        }

    return {key: _clean_items(items) for key, items in raw.items()}


def get_text_time(days: list, time: str, before: int) -> dict:
    weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    hour = int(float(time.split(":")[0]))
    minute = int(float(time.split(":")[1]))
    if before:
        minute -= before
        if minute < 0:
            hour -= 1
            minute += 60
        if hour < 0:
            hour += 24
            days = [weekdays[(weekdays.index(d) + 6) % 7] for d in days]
        if hour == 24:
            hour = 0
            days = [weekdays[(weekdays.index(d) + 1) % 7] for d in days]
    return {"hour": hour, "minute": minute, "days": days}
