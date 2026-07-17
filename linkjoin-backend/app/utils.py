import asyncio
import secrets
from datetime import datetime, date, timedelta, timezone
from pymongo import ReturnDocument
from pytz import utc, timezone as pytz_timezone
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


async def track_event(event: str, org_id: str | None = None, user_id: str | None = None) -> None:
    try:
        now = datetime.now(timezone.utc)
        await motor_db.analytics_events.insert_one({
            "event": event,
            "ts": now,
            "ym": now.strftime("%Y-%m"),
            "org_id": org_id,
            "user_id": user_id,
        })
    except Exception:
        pass


_PLATFORM_PATTERNS = [
    ("zoom", ("zoom.us",)),
    ("meet", ("meet.google.com",)),
    ("teams", ("teams.microsoft.com", "teams.live.com")),
]


def _detect_platform(url: str) -> str:
    low = (url or "").lower()
    for name, patterns in _PLATFORM_PATTERNS:
        if any(p in low for p in patterns):
            return name
    return "other"


def _clean_items(items: list) -> list:
    # Organizational (class-linked) links never expose their raw meeting URL here —
    # only the /c/:slug redirect link is meant to be visible to teachers/students/
    # admins. Personal (non-class) links are unaffected. See attendance-integrity brief.
    cleaned = []
    for item in items:
        item = {k: v for k, v in item.items() if k != "_id"}
        is_class_linked = bool(item.get("class_id"))
        try:
            if "link" in item:
                raw_url = decrypt(item["link"])
                if is_class_linked:
                    item["platform"] = _detect_platform(raw_url)
                    item.pop("link", None)
                else:
                    item["link"] = raw_url
        except Exception:
            if is_class_linked:
                item.pop("link", None)
            else:
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


def gen_slug() -> str:
    # 128-bit entropy from token_urlsafe(16) makes collisions negligible, same
    # justification as links.py's _unique_share_id().
    return secrets.token_urlsafe(16)


async def ensure_link_slug(link: dict) -> str:
    """Lazily backfill a slug onto a pre-existing link doc that predates this field."""
    if link.get("slug"):
        return link["slug"]
    slug = gen_slug()
    await motor_db.links.update_one({"id": link["id"], "username": link["username"]}, {"$set": {"slug": slug}})
    link["slug"] = slug
    return slug


async def configure_data(email: str) -> dict:
    user = await motor_db.login.find_one({"username": email})
    if not user:
        return {}

    if user.get("admin") == "true" and user.get("admin_view") == "true":
        org = user.get("org_name", "")
        keys = ["links", "deleted-links", "bookmarks", "deleted-bookmarks"]
        results = await asyncio.gather(
            motor_db.links.find({"org_name": org}).to_list(None),
            motor_db.deleted_links.find().to_list(None),
            motor_db.bookmarks.find().to_list(None),
            motor_db.deleted_bookmarks.find().to_list(None),
        )
        raw = dict(zip(keys, results))
        raw["pending-links"] = []
        raw["pending-bookmarks"] = []
    else:
        keys = ["links", "pending-links", "deleted-links", "bookmarks", "pending-bookmarks", "deleted-bookmarks"]
        results = await asyncio.gather(
            motor_db.links.find({"username": email}).to_list(None),
            motor_db.pending_links.find({"username": email}).to_list(None),
            motor_db.deleted_links.find({"username": email}).to_list(None),
            motor_db.bookmarks.find({"username": email}).to_list(None),
            motor_db.pending_bookmarks.find({"username": email}).to_list(None),
            motor_db.deleted_bookmarks.find({"username": email}).to_list(None),
        )
        raw = dict(zip(keys, results))

    for l in raw["links"]:
        await ensure_link_slug(l)

    return {key: _clean_items(items) for key, items in raw.items()}


def compute_session_start_utc(class_time: str, class_days: list, tz_name: str, now_utc: datetime) -> datetime | None:
    """Timezone-correct instant a class session starts today, if today is scheduled.

    Port of the class-start computation in scheduler.check_absences(); reused wherever
    minutes_late/on-time status needs to be derived from a class's time+days+teacher tz.
    Returns None if class_time is unset/unparseable or today isn't a scheduled day.
    """
    if not class_time or not class_days:
        return None
    try:
        h, m = (int(x) for x in class_time.split(":"))
    except (ValueError, TypeError):
        return None
    try:
        tz = pytz_timezone(tz_name or "UTC")
    except Exception:
        tz = utc

    day_abbrs = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    now_local = now_utc.astimezone(tz)
    today_local = now_local.date()
    today_abbr = day_abbrs[today_local.weekday()]
    if today_abbr not in class_days:
        return None

    class_start_local = tz.localize(datetime(today_local.year, today_local.month, today_local.day, h, m, 0))
    return class_start_local.astimezone(utc)


def get_blackout_set(org: dict) -> set[str]:
    """Return all effective blackout dates: individual dates + expanded summer range."""
    dates: set[str] = set(org.get("blackout_dates") or [])
    start = org.get("summer_start") or ""
    end = org.get("summer_end") or ""
    if start and end and start <= end:
        cur = date.fromisoformat(start)
        stop = date.fromisoformat(end)
        while cur <= stop:
            dates.add(cur.isoformat())
            cur += timedelta(days=1)
    return dates


def get_school_year_start(org: dict, now: datetime) -> datetime:
    """Start of the current school year, for 'this school year' attendance windows.

    Uses the org's configured summer_end (when the most recent break ended) if it's
    already in the past; otherwise falls back to Aug 1, since school_year_start is a
    free-text display field (e.g. "August 15") and not reliably parseable as a date.
    """
    summer_end = org.get("summer_end") or ""
    if summer_end:
        try:
            d = date.fromisoformat(summer_end)
            candidate = datetime(d.year, d.month, d.day, tzinfo=timezone.utc)
            if candidate <= now:
                return candidate
        except ValueError:
            pass
    year = now.year if now.month >= 8 else now.year - 1
    return datetime(year, 8, 1, tzinfo=timezone.utc)


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
