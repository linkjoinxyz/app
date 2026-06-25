import asyncio
import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.jobstores.mongodb import MongoDBJobStore
from pytz import utc, timezone as pytz_timezone
from app.config import get_settings
from app.database import sync_db, _get_sync_client
from app.utils import get_text_time

_settings = get_settings()
_jobstores = {
    "default": MongoDBJobStore(
        database="zoom_opener",
        collection="apscheduler_jobs",
        client=_get_sync_client(),
    )
}
scheduler = AsyncIOScheduler(timezone=utc, jobstores=_jobstores)
log = logging.getLogger(__name__)

_text_messages = [
    "LinkJoin Reminder: Your link, {name}, will open in {text} minutes. "
    "Log into your LinkJoin account to change your reminder settings.",
]


async def _send_sms(job_data: dict) -> None:
    from app.database import motor_db

    link = job_data["link"]
    job_id = job_data["job_id"]
    repeat = job_data["repeat"]

    log.info("[SMS] job fired: link=%s user=%s", link.get("id"), link.get("username"))

    end_date = link.get("end_date", "")
    if end_date:
        from datetime import date as _date
        try:
            m, d, y = (int(x) for x in end_date.split("/"))
            if _date.today() > _date(y, m, d):
                log.info("[SMS] skipping — past end_date %s for link %s", end_date, link.get("id"))
                return
        except Exception:
            pass

    user = await motor_db.login.find_one({"username": link["username"]})
    number = user.get("number") if user else None
    if not number:
        log.warning("[SMS] no phone number for user %s - skipping", link.get("username"))
        return

    log.info("[SMS] sending to +%s for link %s", number, link.get("id"))

    if repeat == "never":
        scheduler.remove_job(job_id)

    if repeat == "same_weekday":
        from datetime import date as _date
        today = _date.today()
        dow = _date(today.year, today.month, 1).weekday()  # 0=Mon, 5=Sat, 6=Sun
        first_biz = 3 if dow == 5 else (2 if dow == 6 else 1)
        if today.day != first_biz:
            return

    import re as _re
    if _re.match(r'^day \d+$', repeat):
        from datetime import date as _date, timedelta as _td
        today = _date.today()
        day_num = int(repeat.split(' ')[1])
        try:
            d = _date(today.year, today.month, day_num)
        except ValueError:
            return
        if d.weekday() == 5: d += _td(days=2)
        if d.weekday() == 6: d += _td(days=1)
        if today != d:
            return

    body = _text_messages[0].format(
        name=link.get("name", ""), text=link.get("text", ""), id=link.get("id", "")
    )

    def _twilio_send():
        from twilio.rest import Client
        Client(_settings.twilio_sid, _settings.twilio_token).messages.create(
            from_=_settings.twilio_from_number, body=body, to=f"+{number}"
        )

    try:
        await asyncio.get_running_loop().run_in_executor(None, _twilio_send)
        log.info("[SMS] sent successfully to +%s", number)
    except Exception as e:
        log.error("[SMS] Twilio error for link %s: %s", link.get("id"), e)


def create_text_job(link: dict, update: bool = False) -> None:
    text_val = link.get("text", "false")
    if text_val == "false" or link.get("active") == "false":
        return

    try:
        before = int(text_val)
    except (ValueError, TypeError):
        return

    user = sync_db.login.find_one({"username": link["username"]})
    tz_name = (user.get("timezone") or "UTC") if user else "UTC"
    try:
        tz = pytz_timezone(tz_name)
    except Exception:
        tz = utc

    repeat = link.get("repeat", "week")
    # "2 times" / "3 times" / "4 times" mean every N weeks
    week_interval = None
    if repeat not in ("week", "month", "never", "same_weekday") and repeat[0].isdigit():
        week_interval = int(repeat.split()[0])

    import re as _re
    if _re.match(r'^day \d+$', repeat):
        day_num = int(repeat.split(' ')[1])
        job_id = f"{link['id']}-dom"
        info = get_text_time([], link.get("time", "0:00"), before)
        scheduler.add_job(
            func=_send_sms,
            trigger="cron",
            id=job_id,
            args=[{"link": link, "job_id": job_id, "repeat": repeat}],
            hour=info["hour"],
            minute=info["minute"],
            day=f"{day_num}-{min(day_num + 2, 31)}",
            day_of_week="mon-fri",
            timezone=tz,
            replace_existing=True,
            misfire_grace_time=3600,
        )
        log.info("[scheduler] added day-of-month job %s (day=%s %02d:%02d %s)", job_id, day_num, info["hour"], info["minute"], tz_name)
        return

    if repeat == "same_weekday":
        job_id = f"{link['id']}-fbm"
        info = get_text_time([], link.get("time", "0:00"), before)
        scheduler.add_job(
            func=_send_sms,
            trigger="cron",
            id=job_id,
            args=[{"link": link, "job_id": job_id, "repeat": repeat}],
            hour=info["hour"],
            minute=info["minute"],
            day="1-3",
            day_of_week="mon-fri",
            timezone=tz,
            replace_existing=True,
            misfire_grace_time=3600,
        )
        log.info("[scheduler] added same_weekday job %s (%02d:%02d %s)", job_id, info["hour"], info["minute"], tz_name)
        return

    info = get_text_time(list(link.get("days", [])), link.get("time", "0:00"), before)
    log.info(
        "[scheduler] scheduling SMS for link %s: days=%s time=%02d:%02d local tz=%s (remind %d min before %s, every %s)",
        link.get("id"), info["days"], info["hour"], info["minute"], tz_name, before, link.get("time"), repeat
    )
    for day in info["days"]:
        job_id = f"{link['id']}-{day}"
        kwargs = dict(
            func=_send_sms,
            trigger="cron",
            id=job_id,
            args=[{"link": link, "job_id": job_id, "repeat": repeat}],
            hour=info["hour"],
            minute=info["minute"],
            day_of_week=day.lower(),
            timezone=tz,
            replace_existing=True,
            misfire_grace_time=3600,
        )
        if week_interval:
            kwargs["week"] = f"*/{week_interval}"
        if link.get("date"):
            kwargs["start_date"] = link["date"]
        scheduler.add_job(**kwargs)
        log.info("[scheduler] added job %s (day=%s %02d:%02d %s, week=%s)", job_id, day, info["hour"], info["minute"], tz_name, kwargs.get("week", "*"))


def delete_text_job(link: dict) -> None:
    if not link:
        return
    text_val = link.get("text", "false")
    if text_val == "false":
        return
    if link.get("repeat") == "same_weekday":
        job_id = f"{link['id']}-fbm"
        if scheduler.get_job(job_id):
            scheduler.remove_job(job_id)
        return
    import re as _re
    if _re.match(r'^day \d+$', link.get("repeat", "")):
        job_id = f"{link['id']}-dom"
        if scheduler.get_job(job_id):
            scheduler.remove_job(job_id)
        return
    for day in link.get("days", []):
        job_id = f"{link['id']}-{day}"
        if scheduler.get_job(job_id):
            scheduler.remove_job(job_id)


def load_all_text_jobs() -> None:
    # Wipe all persisted jobs first so stale/mismatched jobs never fire
    for job in scheduler.get_jobs():
        scheduler.remove_job(job.id)
    log.info("[scheduler] cleared all persisted jobs, repopulating from DB")

    query: dict = {"active": "true", "text": {"$ne": "false"}}
    if _settings.scheduler_email_filter:
        query["username"] = _settings.scheduler_email_filter

    for link in sync_db.links.find(query):
        user = sync_db.login.find_one({"username": link["username"]})
        if user and user.get("number"):
            create_text_job(link)
