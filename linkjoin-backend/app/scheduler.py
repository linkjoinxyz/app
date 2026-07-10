import asyncio
import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.jobstores.memory import MemoryJobStore
from pytz import utc, timezone as pytz_timezone
from app.config import get_settings
from app.database import sync_db
from app.utils import get_text_time, get_blackout_set

_settings = get_settings()
scheduler = AsyncIOScheduler(timezone=utc, jobstores={"default": MemoryJobStore()})
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


async def check_absences() -> None:
    from datetime import datetime, timezone, timedelta
    from app.database import motor_db

    now_utc = datetime.now(timezone.utc)
    today_date = now_utc.strftime("%Y-%m-%d")
    day_abbrs = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    async for cls in motor_db.classes.find({"family_alerts": True}):
        class_days = cls.get("days") or []
        class_time_str = cls.get("time", "")
        if not class_days or not class_time_str:
            continue

        teacher = await motor_db.login.find_one({"user_id": cls.get("teacher_id", "")}, {"timezone": 1})
        tz_name = (teacher or {}).get("timezone") or "UTC"
        try:
            tz = pytz_timezone(tz_name)
        except Exception:
            tz = utc

        try:
            h, m = (int(x) for x in class_time_str.split(":"))
        except (ValueError, TypeError):
            continue

        now_local = now_utc.astimezone(tz)
        today_local = now_local.date()
        today_abbr = day_abbrs[today_local.weekday()]
        if today_abbr not in class_days:
            continue

        from datetime import datetime as _dt
        class_start_local = tz.localize(_dt(today_local.year, today_local.month, today_local.day, h, m, 0))
        class_start_utc = class_start_local.astimezone(utc)
        delta = now_utc.replace(tzinfo=None) - class_start_utc.replace(tzinfo=None)
        if not (timedelta(minutes=30) <= delta <= timedelta(minutes=90)):
            continue

        org = await motor_db.orgs.find_one({"org_id": cls.get("org_id", "")}, {"blackout_dates": 1, "summer_start": 1, "summer_end": 1, "brand_name": 1, "name": 1})
        if today_date in get_blackout_set(org or {}):
            continue

        brand_name = (org or {}).get("brand_name") or (org or {}).get("name") or "LinkJoin"
        hour12 = h % 12 or 12
        ampm = "AM" if h < 12 else "PM"
        class_time_display = f"{hour12}:{m:02d} {ampm}"

        for uid in cls.get("student_ids") or []:
            student = await motor_db.login.find_one(
                {"user_id": uid},
                {"username": 1, "name": 1, "parent_phone": 1, "parent_phone_country": 1, "parent_email": 1, "parent_name": 1, "_id": 0},
            )
            if not student:
                continue

            student_email = student.get("username", "")
            parent_phone = (student.get("parent_phone") or "").strip()
            parent_email = (student.get("parent_email") or "").strip()
            if not parent_phone and not parent_email:
                continue

            if await motor_db.absence_alerts.find_one({"class_id": cls["class_id"], "student_email": student_email, "date": today_date}):
                continue

            start_naive = class_start_utc.replace(tzinfo=None)
            attended = await motor_db.attendance.find_one({
                "class_id": cls["class_id"],
                "student_email": student_email,
                "opened_at": {"$gte": start_naive - timedelta(minutes=5), "$lt": start_naive + timedelta(minutes=30)},
            })
            if attended:
                continue

            student_name = student.get("name") or student_email.split("@")[0]
            parent_name = (student.get("parent_name") or "").strip() or "Parent/Guardian"
            class_name = cls.get("name", "class")
            sms_sent = email_sent = False

            if parent_phone:
                sms_body = (
                    f"{brand_name}: {student_name} did not join {class_name} today ({class_time_display}). "
                    f"Please contact their teacher if you have questions."
                )
                def _twilio_send(body=sms_body, to=parent_phone):
                    from twilio.rest import Client
                    Client(_settings.twilio_sid, _settings.twilio_token).messages.create(
                        from_=_settings.twilio_from_number, body=body, to=f"+{to}"
                    )
                try:
                    await asyncio.get_running_loop().run_in_executor(None, _twilio_send)
                    sms_sent = True
                except Exception as e:
                    log.error("[absence] SMS failed for %s: %s", student_email, e)

            if parent_email:
                html = (
                    f"<p>Dear {parent_name},</p>"
                    f"<p><strong>{student_name}</strong> did not join <strong>{class_name}</strong> today, "
                    f"which was scheduled for {class_time_display}.</p>"
                    f"<p>If you have questions, please contact their teacher directly.</p>"
                    f"<p>— {brand_name}</p>"
                )
                def _email_send(h=html, pe=parent_email, bn=brand_name, cn=class_name, sn=student_name):
                    from app.email_service import send_email
                    send_email(h, f"Absence Alert — {sn} missed {cn}", pe, from_name=bn)
                try:
                    await asyncio.get_running_loop().run_in_executor(None, _email_send)
                    email_sent = True
                except Exception as e:
                    log.error("[absence] email failed for %s: %s", student_email, e)

            await motor_db.absence_alerts.insert_one({
                "class_id": cls["class_id"],
                "student_email": student_email,
                "date": today_date,
                "sms_sent": sms_sent,
                "email_sent": email_sent,
                "sent_at": now_utc,
            })
            log.info("[absence] alert sent for student %s in class %s", student_email, cls["class_id"])


async def record_status_check() -> None:
    """Every-5-min job: ping MongoDB and record uptime for the public status page."""
    import time as _time
    from datetime import datetime, timezone, timedelta
    from app.database import motor_db
    t0 = _time.monotonic()
    ok = False
    mongo_ms = None
    try:
        await motor_db.command("ping")
        mongo_ms = round((_time.monotonic() - t0) * 1000)
        ok = True
    except Exception as exc:
        log.warning("[status-check] MongoDB ping failed: %s", exc)
    now = datetime.now(timezone.utc)
    await motor_db.status_checks.insert_one({"ts": now, "ok": ok, "mongo_ms": mongo_ms})
    cutoff = now - timedelta(days=91)
    await motor_db.status_checks.delete_many({"ts": {"$lt": cutoff}})


async def run_backup_health_check() -> None:
    """Weekly job: verify MongoDB is reachable and core collections are non-empty."""
    import time as _time
    from datetime import datetime, timezone
    from app.database import motor_db
    from app.audit import log_audit

    CORE_COLLECTIONS = ["login", "links", "orgs", "classes", "audit_logs"]
    result: dict = {"collections": {}, "errors": [], "ok": True}

    try:
        t0 = _time.monotonic()
        await motor_db.command("ping")
        result["mongo_latency_ms"] = round((_time.monotonic() - t0) * 1000, 1)
    except Exception as e:
        result["ok"] = False
        result["errors"].append(f"MongoDB ping failed: {e}")
        log.error("[backup-check] MongoDB ping failed: %s", e)

    for coll_name in CORE_COLLECTIONS:
        try:
            count = await motor_db[coll_name].estimated_document_count()
            result["collections"][coll_name] = count
            if count == 0 and coll_name in ("login", "links"):
                result["ok"] = False
                result["errors"].append(f"{coll_name}: unexpectedly empty")
        except Exception as e:
            result["ok"] = False
            result["errors"].append(f"{coll_name}: {e}")

    try:
        await log_audit(
            "system",
            "backup.health_check",
            detail={**result, "ts": datetime.now(timezone.utc).isoformat()},
        )
    except Exception as e:
        log.error("[backup-check] failed to write audit log: %s", e)

    if result["ok"]:
        log.info("[backup-check] OK: %s", result)
    else:
        log.error("[backup-check] DEGRADED: %s", result)


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

    scheduler.add_job(
        check_absences,
        "interval",
        minutes=5,
        id="absence-check",
        replace_existing=True,
        misfire_grace_time=3600,
    )
    log.info("[scheduler] added absence-check interval job (every 5 min)")

    scheduler.add_job(
        run_backup_health_check,
        "cron",
        day_of_week="sun",
        hour=2,
        minute=0,
        id="backup-health-check",
        replace_existing=True,
        misfire_grace_time=7200,
    )
    log.info("[scheduler] added backup-health-check weekly job (Sun 02:00 UTC)")

    scheduler.add_job(
        record_status_check,
        "interval",
        minutes=5,
        id="status-check",
        replace_existing=True,
        misfire_grace_time=300,
    )
    log.info("[scheduler] added status-check interval job (every 5 min)")
