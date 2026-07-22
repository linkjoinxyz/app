import asyncio
import ipaddress
import logging
import secrets
import socket
from datetime import datetime, date, timedelta, timezone
from urllib.parse import urlparse
from pymongo import ReturnDocument
from pytz import utc, timezone as pytz_timezone
from app.database import sync_db, motor_db
from app.encryption import decrypt

log = logging.getLogger(__name__)

# Ceiling for the platform-admin cross-org view. Large enough to be useful, small
# enough that one connect cannot exhaust a worker.
_ADMIN_VIEW_LIMIT = 2000


class UnsafeURLError(ValueError):
    """A user-supplied URL that the server must not fetch."""


def assert_public_url(url: str) -> None:
    """Reject a URL the server should never make an outbound request to.

    Anything user-supplied that gets fetched server-side is an SSRF primitive:
    the app runs inside a cloud network with an instance-metadata endpoint on
    169.254.169.254 and its own Redis/Mongo reachable on private addresses.
    Call this on the initial URL *and* on every redirect hop, since a permitted
    host can 302 to a forbidden one.

    Raises UnsafeURLError, which the caller should surface as a fixed message.
    """
    parsed = urlparse(url)
    if parsed.scheme != "https":
        raise UnsafeURLError("URL must use https")
    host = parsed.hostname
    if not host:
        raise UnsafeURLError("URL has no host")

    try:
        # Every A/AAAA record, not just the first: a DNS name may resolve to a
        # mix of public and private addresses.
        infos = socket.getaddrinfo(host, parsed.port or 443, proto=socket.IPPROTO_TCP)
    except socket.gaierror:
        raise UnsafeURLError("Could not resolve host")

    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if not ip.is_global or ip.is_multicast:
            raise UnsafeURLError("URL resolves to a non-public address")


# Projection for `login` docs returned to staff (school/district/platform admins)
# viewing OTHER users' records. Excludes fields that are either secrets (consent
# grant token, MFA phone) or private to the account owner (billing id, notes).
STAFF_HIDDEN_FIELDS = {
    "password": 0,
    "_id": 0,
    "parental_consent.token": 0,
    "stripe_customer_id": 0,
    "mfa_phone": 0,
    "refer": 0,
    "notes": 0,
}


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
    except Exception as exc:
        log.error("[analytics] failed to record event=%s: %s", event, exc)


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
        # All four are scoped by org_name and capped. Three of them used to run
        # with NO filter and to_list(None), pulling every document in those
        # collections for every user on the platform into one worker's memory --
        # on a path that runs on WebSocket connect and after most link mutations.
        results = await asyncio.gather(
            motor_db.links.find({"org_name": org}).limit(_ADMIN_VIEW_LIMIT).to_list(None),
            motor_db.deleted_links.find({"org_name": org}).limit(_ADMIN_VIEW_LIMIT).to_list(None),
            motor_db.bookmarks.find({"org_name": org}).limit(_ADMIN_VIEW_LIMIT).to_list(None),
            motor_db.deleted_bookmarks.find({"org_name": org}).limit(_ADMIN_VIEW_LIMIT).to_list(None),
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


# ── Class schedule resolution ────────────────────────────────────────────────
# The single place that answers "does this class meet on date D" and "when does
# its session start". Previously this logic existed as compute_session_start_utc
# plus six copy-pasted expected-dates comprehensions that disagreed with each
# other about blackout dates, range inclusivity and future clamping.
#
# NOTE the Mon=0 convention here matches date.weekday() and the class/attendance
# code. It is deliberately NOT the Sun=0 family used by get_text_time below,
# users.daylight_savings and ai.py for link/SMS scheduling. Do not merge them.
DAY_TO_WEEKDAY = {"Mon": 0, "Tue": 1, "Wed": 2, "Thu": 3, "Fri": 4, "Sat": 5, "Sun": 6}
_WEEKDAY_TO_DAY = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")  # index == date.weekday()


def _override_map(cls: dict) -> dict[str, dict]:
    """Latest override per date. Last entry wins, so a duplicate left by a legacy
    write or a racing pull-then-push resolves deterministically rather than
    depending on array order."""
    return {o["date"]: o for o in (cls.get("schedule_overrides") or []) if o.get("date")}


def class_meets_on(cls: dict, day: date, blackout_dates=frozenset(), _ov: dict | None = None) -> bool:
    """Does this class hold a session on `day`?

    Keys on `days` only, deliberately NOT on `time`. Every expected-dates caller
    counts sessions for classes that have days configured but no time, so making
    membership depend on time would silently zero those attendance rates.

    Precedence: a per-date `cancelled` override, then an org blackout, then
    weekday membership. A blackout beats a `late_start` (the school is closed; a
    later bell does not help). An override on a date the class does not normally
    meet is inert: overrides modify sessions, they never create them.
    """
    class_days = cls.get("days") or []
    if not class_days:
        return False
    ds = day.isoformat()
    ov = (_ov if _ov is not None else _override_map(cls)).get(ds)
    if ov and ov.get("type") == "cancelled":
        return False
    if ds in blackout_dates:
        return False
    return _WEEKDAY_TO_DAY[day.weekday()] in class_days


def session_time_on(cls: dict, day: date, blackout_dates=frozenset()) -> str | None:
    """Effective local start time "H:MM" for `day`, or None when there is no
    session or the class has no configured time."""
    ov_map = _override_map(cls)
    if not class_meets_on(cls, day, blackout_dates, _ov=ov_map):
        return None
    ov = ov_map.get(day.isoformat())
    if ov and ov.get("type") == "late_start" and ov.get("time"):
        return ov["time"]
    return cls.get("time") or None


def session_start_utc(cls: dict, day: date, tz_name: str, blackout_dates=frozenset()) -> datetime | None:
    """The UTC instant this class's session on `day` starts, or None.

    Takes a real date, so callers no longer need the midday-local probe that
    previously worked around compute_session_start_utc only understanding "today".
    """
    t = session_time_on(cls, day, blackout_dates)
    if not t:
        return None
    try:
        h, m = (int(x) for x in t.split(":"))
    except (ValueError, TypeError):
        return None
    try:
        tz = pytz_timezone(tz_name or "UTC")
    except Exception:
        tz = utc
    return tz.localize(datetime(day.year, day.month, day.day, h, m, 0)).astimezone(utc)


def today_session_start_utc(
    cls: dict, tz_name: str, now_utc: datetime, blackout_dates=frozenset()
) -> tuple[date, datetime | None]:
    """(local calendar day, session start UTC or None) for "today" in the class's
    timezone.

    The local day is returned because callers need it, and getting it from the
    UTC instant is wrong: for a negative-offset zone an evening session's UTC
    timestamp lands on the next calendar day, which is how record_date drifted
    out of alignment with the expected-dates builders.
    """
    try:
        tz = pytz_timezone(tz_name or "UTC")
    except Exception:
        tz = utc
    local_day = now_utc.astimezone(tz).date()
    return local_day, session_start_utc(cls, local_day, tz_name, blackout_dates)


def expected_session_dates(
    cls: dict, start: date, end: date, blackout_dates=frozenset(), through: date | None = None
) -> list[str]:
    """Sorted ISO dates in the INCLUSIVE range [start, end] on which this class
    holds a session, minus org blackouts and per-date cancellations.

    `through` clamps the tail; pass today to exclude sessions that have not
    happened yet. Inclusive on both ends so the off-by-one between the old
    range(28) and range(29) callers is visible at the call site instead of hidden
    in a loop bound.
    """
    out: list[str] = []
    if end < start:
        return out
    stop = min(end, through) if through is not None else end
    ov_map = _override_map(cls)
    d = start
    while d <= stop:
        if class_meets_on(cls, d, blackout_dates, _ov=ov_map):
            out.append(d.isoformat())
        d += timedelta(days=1)
    return out


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


_CSV_DANGEROUS_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def csv_safe(value) -> str:
    """Prefix a leading formula-trigger character with a single quote before
    writing to CSV — the standard mitigation for Excel/Sheets formula
    injection (OWASP CSV Injection). Apply to every user-controlled cell."""
    s = str(value) if value is not None else ""
    if s.startswith(_CSV_DANGEROUS_PREFIXES):
        return "'" + s
    return s


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
