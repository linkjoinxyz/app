import asyncio
import json
import logging
import os
import secrets as _secrets
from datetime import datetime, timezone, timedelta
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.jobstores.memory import MemoryJobStore
from apscheduler.schedulers.base import STATE_STOPPED, STATE_RUNNING, STATE_PAUSED
from pymongo.errors import DuplicateKeyError
from pytz import utc, timezone as pytz_timezone
from app.config import get_settings
from app.database import sync_db, motor_db
from app.utils import get_text_time, get_blackout_set, today_session_start_utc, session_time_on

_settings = get_settings()
scheduler = AsyncIOScheduler(timezone=utc, jobstores={"default": MemoryJobStore()})
log = logging.getLogger(__name__)

# ── Cross-worker coordination ────────────────────────────────────────────────
# gunicorn runs multiple worker processes, each with its own in-memory
# AsyncIOScheduler. Without this, every interval/cron job fires once per
# worker. Only the Redis-lock holder ("leader") runs a live scheduler at all;
# other workers stay idle. Link-job registration (triggered by request
# handlers, which may run on any worker) is forwarded to the leader over
# Redis pub/sub instead of mutating a non-leader's inert scheduler.
_LEADER_LOCK_KEY = "linkjoin:scheduler:leader"
_LEADER_LOCK_TTL = 30  # seconds
_LINK_JOB_CHANNEL = "linkjoin:scheduler:link-jobs"
_LINK_JOB_FIELDS = ("id", "username", "name", "text", "active", "repeat", "days", "time", "date", "end_date")
_worker_id = f"{os.getpid()}-{_secrets.token_hex(4)}"
_is_leader = False


async def try_become_leader() -> bool:
    global _is_leader
    from app.redis_client import get_redis
    won = await get_redis().set(_LEADER_LOCK_KEY, _worker_id, nx=True, ex=_LEADER_LOCK_TTL)
    _is_leader = bool(won)
    return _is_leader


def _stand_down() -> None:
    """Give up leadership locally: quiesce the scheduler and clear the flag.

    Returning from the renewal loop without doing this was a split brain. The
    worker kept a live AsyncIOScheduler after its lock expired, so once another
    worker won the lock two schedulers fired every job. send_class_reminders is
    guarded by an atomic upsert, but _send_sms is not, so users got doubled texts.

    pause(), not shutdown(): APScheduler 3.x does not return a shut-down scheduler
    to a restartable state (state stays RUNNING and a later start() raises
    SchedulerAlreadyRunningError), so a worker that stood down could never take
    leadership again. pause() stops jobs firing and resume() is a clean inverse.
    """
    global _is_leader
    _is_leader = False
    try:
        if scheduler.state == STATE_RUNNING:
            scheduler.pause()
    except Exception:
        log.exception("[scheduler] failed to pause after losing leadership")


async def _renew_leadership() -> None:
    from app.redis_client import get_redis
    r = get_redis()
    while _is_leader:
        await asyncio.sleep(_LEADER_LOCK_TTL // 3)
        try:
            holder = await r.get(_LEADER_LOCK_KEY)
        except Exception:
            # A Redis blip is not proof we lost the lock; keep running and retry
            # on the next tick rather than tearing down every scheduled job.
            log.warning("[scheduler] could not read leadership lock, retrying")
            continue
        if holder == _worker_id:
            await r.expire(_LEADER_LOCK_KEY, _LEADER_LOCK_TTL)
        else:
            log.warning("[scheduler] lost leadership lock, standing down")
            _stand_down()
            return


_LEADER_RETRY_SECONDS = 10
_subscriber_task: asyncio.Task | None = None


async def run_leader_loop(load_jobs) -> None:
    """Contend for the scheduler lock forever, running the scheduler while held.

    Election used to be a single attempt at worker startup. If the leader died,
    its 30s lock simply expired and nothing reclaimed it: the other workers had
    already made their one attempt and never retried, so every background job
    stopped platform-wide until someone restarted the app. This retries, so a
    dead leader is replaced within _LEADER_RETRY_SECONDS.
    """
    global _subscriber_task
    while True:
        try:
            if await try_become_leader():
                log.info("[scheduler] this worker (pid %s) elected leader", os.getpid())
                await asyncio.to_thread(load_jobs)
                # First term starts it; a later term resumes the paused instance,
                # since a shut-down APScheduler cannot be restarted (see _stand_down).
                if scheduler.state == STATE_STOPPED:
                    scheduler.start()
                elif scheduler.state == STATE_PAUSED:
                    scheduler.resume()
                # Cancel any subscriber left over from a previous term, otherwise
                # regaining leadership stacks a second one and link-job changes
                # get applied twice.
                if _subscriber_task and not _subscriber_task.done():
                    _subscriber_task.cancel()
                _subscriber_task = asyncio.create_task(_subscribe_link_job_changes())
                # Returns only once this worker has stood down.
                await _renew_leadership()
                log.info("[scheduler] no longer leader, will contend again")
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("[scheduler] leader loop iteration failed")
            _stand_down()
        await asyncio.sleep(_LEADER_RETRY_SECONDS)


async def release_leadership() -> None:
    global _is_leader
    if not _is_leader:
        return
    from app.redis_client import get_redis
    r = get_redis()
    if await r.get(_LEADER_LOCK_KEY) == _worker_id:
        await r.delete(_LEADER_LOCK_KEY)
    _is_leader = False


async def publish_link_job_change(action: str, link: dict, update: bool = False) -> None:
    """Called from request handlers (any worker) instead of touching the
    scheduler directly — only the leader's scheduler is live."""
    from app.redis_client import get_redis
    payload = {"action": action, "link": {k: link.get(k) for k in _LINK_JOB_FIELDS}, "update": update}
    await get_redis().publish(_LINK_JOB_CHANNEL, json.dumps(payload))


async def _subscribe_link_job_changes() -> None:
    """Leader-only: applies link-job changes published by any worker (including
    itself) to this worker's live scheduler."""
    from app.redis_client import get_redis
    pubsub = get_redis().pubsub()
    await pubsub.subscribe(_LINK_JOB_CHANNEL)
    async for message in pubsub.listen():
        if message["type"] != "message":
            continue
        try:
            payload = json.loads(message["data"])
            if payload["action"] == "create":
                await create_text_job(payload["link"], update=payload.get("update", False))
            elif payload["action"] == "delete":
                delete_text_job(payload["link"])
        except Exception:
            log.exception("[scheduler] failed to process link job change message")

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
    if user and user.get("vacation_mode"):
        from app.roles import require_premium
        try:
            require_premium(user)
        except Exception:
            pass  # toggle set but owner not entitled — ignore, SMS still sends
        else:
            log.info("[SMS] skipping — vacation_mode enabled for user %s", link.get("username"))
            return
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

    # Claim the send atomically before making it, the way check_absences and
    # send_class_reminders already do. The Redis leader lock only deduplicates
    # schedulers that share a Redis: a stray local uvicorn (or a second deploy)
    # holds its own lock and is a second leader by construction, and this was the
    # one send path with no dedup behind it, so those users got every reminder
    # twice. One cron job fires at most once per link per day, so the UTC date is
    # the occurrence key.
    claim_key = {
        "username": link["username"],
        "link_id": link.get("id"),
        "date": datetime.now(timezone.utc).date().isoformat(),
    }
    try:
        claim = await motor_db.sms_reminder_log.update_one(
            claim_key, {"$setOnInsert": {**claim_key, "sent_at": datetime.now(timezone.utc)}}, upsert=True
        )
    except DuplicateKeyError:
        claim = None
    if claim is None or claim.upserted_id is None:
        log.info("[SMS] skipping — reminder already sent today for link %s", link.get("id"))
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


def _schedule_text_jobs(link: dict, tz_name: str) -> None:
    """Leader-only, DB-free: builds the APScheduler job(s) for one link given
    the owner's timezone. Split out from create_text_job so load_all_text_jobs
    (which runs off the event loop via asyncio.to_thread) and create_text_job
    (async, called from the leader's pub/sub subscriber) can share it."""
    text_val = link.get("text", "false")
    if text_val == "false" or link.get("active") == "false":
        return

    try:
        before = int(text_val)
    except (ValueError, TypeError):
        return

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


async def create_text_job(link: dict, update: bool = False) -> None:
    """Async, motor_db-based entry point — used by the leader's pub/sub
    subscriber so link creation/update never blocks the event loop on a
    sync PyMongo call (see _schedule_text_jobs for the shared job-building
    logic used by both this and load_all_text_jobs)."""
    user = await motor_db.login.find_one({"username": link["username"]})
    tz_name = (user.get("timezone") or "UTC") if user else "UTC"
    _schedule_text_jobs(link, tz_name)


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


async def check_absences(now_utc=None) -> None:
    from datetime import datetime, timezone, timedelta
    from app.database import motor_db

    # now_utc is injectable so tests can pin it; APScheduler calls with no args.
    now_utc = now_utc or datetime.now(timezone.utc)
    org_cache: dict = {}

    async for cls in motor_db.classes.find({"family_alerts": True}):
        try:
            class_days = cls.get("days") or []
            class_time_str = cls.get("time", "")
            if not class_days or not class_time_str:
                continue

            teacher = await motor_db.login.find_one({"user_id": cls.get("teacher_id", "")}, {"timezone": 1})
            tz_name = (teacher or {}).get("timezone") or "UTC"

            # The org load has to happen before resolving the session now, since
            # blackouts and cancellations are part of "does this class meet".
            # Cached per tick so this stays one query per org rather than per class.
            org_id = cls.get("org_id", "")
            if org_id not in org_cache:
                org_cache[org_id] = await motor_db.orgs.find_one(
                    {"org_id": org_id},
                    {"blackout_dates": 1, "summer_start": 1, "summer_end": 1, "brand_name": 1, "name": 1},
                ) or {}
            org = org_cache[org_id]

            # today_date used to be derived in UTC and compared against a local
            # session, so the blackout check was off by a day for negative-offset
            # zones. Both are local now, and the blackout/cancellation test lives
            # inside the resolver rather than as a separate check below.
            today_local, class_start_utc = today_session_start_utc(
                cls, tz_name, now_utc, get_blackout_set(org)
            )
            today_date = today_local.isoformat()
            if class_start_utc is None:
                continue
            delta = now_utc.replace(tzinfo=None) - class_start_utc.replace(tzinfo=None)
            if not (timedelta(minutes=30) <= delta <= timedelta(minutes=90)):
                continue

            brand_name = org.get("brand_name") or org.get("name") or "LinkJoin"
            # The effective time for today, so a late-start day tells the parent the
            # late bell rather than the usual one.
            effective_time = session_time_on(cls, today_local, get_blackout_set(org)) or class_time_str
            h, m = (int(x) for x in effective_time.split(":"))
            hour12 = h % 12 or 12
            ampm = "AM" if h < 12 else "PM"
            class_time_display = f"{hour12}:{m:02d} {ampm}"

            # One query for the roster rather than one per student: this job runs
            # every 5 minutes over every class with family alerts enabled.
            roster_ids = cls.get("student_ids") or []
            students_by_id = {
                s["user_id"]: s
                async for s in motor_db.login.find(
                    {"user_id": {"$in": roster_ids}},
                    {"username": 1, "name": 1, "parent_phone": 1, "parent_phone_country": 1,
                     "parent_email": 1, "parent_name": 1, "user_id": 1, "_id": 0},
                )
            } if roster_ids else {}

            for uid in roster_ids:
                student = students_by_id.get(uid)
                if not student:
                    continue

                student_email = student.get("username", "")
                parent_phone = (student.get("parent_phone") or "").strip()
                parent_email = (student.get("parent_email") or "").strip()
                if not parent_phone and not parent_email:
                    continue

                start_naive = class_start_utc.replace(tzinfo=None)
                attended = await motor_db.attendance.find_one({
                    "class_id": cls["class_id"],
                    "student_email": student_email,
                    "opened_at": {"$gte": start_naive - timedelta(minutes=5), "$lt": start_naive + timedelta(minutes=30)},
                })
                if attended:
                    continue

                # Claim the send atomically BEFORE doing it. This was a find_one
                # followed by an insert_one at the end, against a collection with a
                # unique (class_id, student_email, date) index: the job runs every
                # 5 minutes across a 60-minute eligibility window, so overlapping
                # runs both passed the check and the loser's insert raised
                # DuplicateKeyError. That exception was caught only by the outer
                # per-CLASS handler, so it aborted every remaining student in the
                # class and they got no alert at all that day.
                dedup_key = {
                    "class_id": cls["class_id"],
                    "student_email": student_email,
                    "date": today_date,
                }
                try:
                    claim = await motor_db.absence_alerts.update_one(
                        dedup_key, {"$setOnInsert": {**dedup_key, "sent_at": now_utc}}, upsert=True
                    )
                except DuplicateKeyError:
                    continue
                if claim.upserted_id is None:
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

                await motor_db.absence_alerts.update_one(
                    dedup_key, {"$set": {"sms_sent": sms_sent, "email_sent": email_sent, "sent_at": now_utc}}
                )
                log.info("[absence] alert sent for student %s in class %s", student_email, cls["class_id"])
        except Exception:
            log.exception("[absence] check_absences failed for class %s", cls.get("class_id"))


async def send_class_reminders(now_utc=None) -> None:
    """Every-5-min job: text/email parents who opted in, ~10 min before their child's class."""
    from datetime import datetime, timezone
    from app.database import motor_db

    # now_utc is injectable so tests can pin it; APScheduler calls with no args.
    now_utc = now_utc or datetime.now(timezone.utc)
    org_cache: dict = {}

    # ponytail: family_alerts is a teacher-facing absence-alert switch (see
    # AdminDashboard.jsx "Family absence alerts" toggle) — reminders are opted
    # into per-parent below, so this query only needs classes with students.
    async for cls in motor_db.classes.find({"student_ids.0": {"$exists": True}}):
        try:
            class_days = cls.get("days") or []
            class_time_str = cls.get("time", "")
            if not class_days or not class_time_str:
                continue

            teacher = await motor_db.login.find_one({"user_id": cls.get("teacher_id", "")}, {"timezone": 1})
            tz_name = (teacher or {}).get("timezone") or "UTC"

            # Org first: blackouts and cancellations are part of resolving whether
            # there is a session at all. Cached per tick, one query per org.
            org_id = cls.get("org_id", "")
            if org_id not in org_cache:
                org_cache[org_id] = await motor_db.orgs.find_one(
                    {"org_id": org_id},
                    {"blackout_dates": 1, "summer_start": 1, "summer_end": 1, "brand_name": 1, "name": 1},
                ) or {}
            org = org_cache[org_id]

            # Local day, not the UTC one the old blackout comparison used. On a
            # late-start date this fires 10 minutes before the LATE bell.
            today_local, class_start_utc = today_session_start_utc(
                cls, tz_name, now_utc, get_blackout_set(org)
            )
            today_date = today_local.isoformat()
            if class_start_utc is None:
                continue
            minutes_until = (class_start_utc.replace(tzinfo=None) - now_utc.replace(tzinfo=None)).total_seconds() / 60
            if not (8 <= minutes_until <= 13):
                continue

            brand_name = org.get("brand_name") or org.get("name") or "LinkJoin"
            class_name = cls.get("name", "class")

            # Three nested per-record queries collapsed into three bulk ones: the
            # roster, every parent_link for that roster, and every parent account.
            # This job runs every 5 minutes over every class that has students, so
            # the old shape was (students + students*parents) round trips per class
            # per tick across the whole platform.
            roster_ids = cls.get("student_ids") or []
            if not roster_ids:
                continue

            students_by_id = {
                s["user_id"]: s
                async for s in motor_db.login.find(
                    {"user_id": {"$in": roster_ids}}, {"username": 1, "name": 1, "user_id": 1, "_id": 0}
                )
            }

            links_by_student: dict[str, list[str]] = {}
            async for plink in motor_db.parent_links.find(
                {"student_user_id": {"$in": roster_ids}}, {"parent_user_id": 1, "student_user_id": 1, "_id": 0}
            ):
                links_by_student.setdefault(plink["student_user_id"], []).append(plink["parent_user_id"])

            parent_ids = sorted({pid for pids in links_by_student.values() for pid in pids})
            parents_by_id = {
                p["user_id"]: p
                async for p in motor_db.login.find(
                    {"user_id": {"$in": parent_ids}},
                    {"username": 1, "number": 1, "parent_reminders_sms": 1,
                     "parent_reminders_email": 1, "user_id": 1, "_id": 0},
                )
            } if parent_ids else {}

            for uid in roster_ids:
                student = students_by_id.get(uid)
                if not student:
                    continue
                student_name = student.get("name") or student.get("username", "").split("@")[0]

                for parent_id in links_by_student.get(uid, []):
                    parent = parents_by_id.get(parent_id)
                    if not parent:
                        continue
                    sms_on = bool(parent.get("parent_reminders_sms")) and bool(parent.get("number"))
                    email_on = bool(parent.get("parent_reminders_email")) and bool(parent.get("username"))
                    if not sms_on and not email_on:
                        continue

                    dedup_key = {"class_id": cls["class_id"], "student_user_id": uid, "parent_user_id": parent_id, "date": today_date}
                    dedup_result = await motor_db.parent_reminder_log.update_one(
                        dedup_key, {"$setOnInsert": dedup_key}, upsert=True
                    )
                    if dedup_result.upserted_id is None:
                        continue

                    sms_sent = email_sent = False

                    if sms_on:
                        sms_body = f"{brand_name}: {class_name} for {student_name} starts in 10 minutes."
                        def _twilio_send(body=sms_body, to=parent["number"]):
                            from twilio.rest import Client
                            Client(_settings.twilio_sid, _settings.twilio_token).messages.create(
                                from_=_settings.twilio_from_number, body=body, to=f"+{to}"
                            )
                        try:
                            await asyncio.get_running_loop().run_in_executor(None, _twilio_send)
                            sms_sent = True
                        except Exception as e:
                            log.error("[class-reminder] SMS failed for parent %s: %s", parent_id, e)

                    if email_on:
                        html = (
                            f"<p><strong>{class_name}</strong> for {student_name} starts in 10 minutes.</p>"
                            f"<p>— {brand_name}</p>"
                        )
                        def _email_send(h=html, pe=parent["username"], bn=brand_name, cn=class_name):
                            from app.email_service import send_email
                            send_email(h, f"{cn} starts in 10 minutes", pe, from_name=bn)
                        try:
                            await asyncio.get_running_loop().run_in_executor(None, _email_send)
                            email_sent = True
                        except Exception as e:
                            log.error("[class-reminder] email failed for parent %s: %s", parent_id, e)

                    await motor_db.parent_reminder_log.update_one(
                        dedup_key, {"$set": {"sms_sent": sms_sent, "email_sent": email_sent, "sent_at": now_utc}}
                    )
                    log.info("[class-reminder] sent to parent %s for student %s in class %s", parent_id, uid, cls["class_id"])
        except Exception:
            log.exception("[class-reminder] send_class_reminders failed for class %s", cls.get("class_id"))


async def record_status_check() -> None:
    """Every-5-min job: ping MongoDB and Redis, record uptime for the public status page."""
    import time as _time
    from datetime import datetime, timezone, timedelta
    from app.database import motor_db
    from app.redis_client import get_redis

    t0 = _time.monotonic()
    mongo_ok = False
    mongo_ms = None
    try:
        await motor_db.command("ping")
        mongo_ms = round((_time.monotonic() - t0) * 1000)
        mongo_ok = True
    except Exception as exc:
        log.warning("[status-check] MongoDB ping failed: %s", exc)

    redis_ok = False
    try:
        await get_redis().ping()
        redis_ok = True
    except Exception as exc:
        log.warning("[status-check] Redis ping failed: %s", exc)

    now = datetime.now(timezone.utc)
    await motor_db.status_checks.insert_one({
        "ts": now, "ok": mongo_ok and redis_ok,
        "mongo_ms": mongo_ms, "mongo_ok": mongo_ok, "redis_ok": redis_ok,
    })
    cutoff = now - timedelta(days=91)
    await motor_db.status_checks.delete_many({"ts": {"$lt": cutoff}})


async def purge_old_audit_logs() -> None:
    """Monthly job: delete audit_logs older than 24 months per DPA §6 retention policy."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=730)
    result = await motor_db.audit_logs.delete_many({"ts": {"$lt": cutoff}})
    log.info("[scheduler] audit-log-purge: deleted %d entries older than %s", result.deleted_count, cutoff.date())


async def auto_delete_past_links() -> None:
    """Daily job: delete one-off ('never'-repeat) links whose single occurrence has
    passed, for premium-entitled owners with auto_delete_past enabled."""
    from app.roles import require_premium

    now_utc = datetime.now(timezone.utc)
    deleted = 0
    async for link in motor_db.links.find({"repeat": "never"}):
        date_str = link.get("date", "")
        time_str = link.get("time", "0:00")
        if not date_str:
            continue
        try:
            mo, dy, yr = (int(x) for x in date_str.split("/"))
            h, m = (int(x) for x in time_str.split(":"))
        except (ValueError, TypeError):
            continue

        owner = await motor_db.login.find_one({"username": link["username"]})
        if not owner or not owner.get("auto_delete_past"):
            continue
        try:
            require_premium(owner)
        except Exception:
            continue  # toggle set but owner not entitled — no-op

        tz_name = owner.get("timezone") or "UTC"
        try:
            tz = pytz_timezone(tz_name)
        except Exception:
            tz = utc
        try:
            occurrence_utc = tz.localize(datetime(yr, mo, dy, h, m, 0)).astimezone(utc)
        except ValueError:
            continue

        # 6-hour grace window so this never races useAutoOpen.js's client-side
        # delete-on-open, which already handles the "tab was open at the right
        # moment" case — this job only cleans up what that path misses.
        if now_utc - occurrence_utc < timedelta(hours=6):
            continue

        await motor_db.links.delete_one({"username": link["username"], "id": link["id"]})
        deleted += 1
    log.info("[scheduler] auto-delete-past-links: deleted %d one-off links", deleted)


async def run_backup_health_check() -> None:
    """Weekly job: verify MongoDB is reachable and core collections are non-empty.

    Despite the name, this does NOT verify that backups exist or are
    restorable — it only checks the live database. Restorability must be
    verified separately (e.g. a periodic restore-to-scratch drill)."""
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
        log.error("[collection-liveness-check] MongoDB ping failed: %s", e)

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
            "system.collection_liveness_check",
            detail={**result, "ts": datetime.now(timezone.utc).isoformat()},
        )
    except Exception as e:
        log.error("[collection-liveness-check] failed to write audit log: %s", e)

    if result["ok"]:
        log.info("[collection-liveness-check] OK: %s", result)
    else:
        log.error("[collection-liveness-check] DEGRADED: %s", result)


def load_all_text_jobs() -> None:
    # Wipe all persisted jobs first so stale/mismatched jobs never fire
    for job in scheduler.get_jobs():
        scheduler.remove_job(job.id)
    log.info("[scheduler] cleared all persisted jobs, repopulating from DB")

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
        send_class_reminders,
        "interval",
        minutes=5,
        id="parent-reminder-check",
        replace_existing=True,
        misfire_grace_time=3600,
    )
    log.info("[scheduler] added parent-reminder-check interval job (every 5 min)")

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

    scheduler.add_job(
        purge_old_audit_logs,
        "cron",
        day=1,
        hour=3,
        minute=0,
        id="audit-log-purge",
        replace_existing=True,
        misfire_grace_time=86400,
    )
    log.info("[scheduler] added audit-log-purge monthly job (1st of month 03:00 UTC)")

    scheduler.add_job(
        auto_delete_past_links,
        "cron",
        hour=4,
        minute=0,
        id="auto-delete-past-links",
        replace_existing=True,
        misfire_grace_time=3600,
    )
    log.info("[scheduler] added auto-delete-past-links daily job (04:00 UTC)")

    # Per-link SMS jobs come LAST, and each one is isolated.
    #
    # These are built from user-controlled `time`/`days` values, and get_text_time
    # parses them with bare int()/list.index(), so one malformed row raises. When
    # this loop ran first and unguarded, that exception escaped load_all_text_jobs,
    # propagated through the asyncio.to_thread in main._init_scheduler, and was
    # swallowed by a bare create_task — so scheduler.start() never ran and EVERY
    # background job (absence checks, parent reminders, status checks, audit purge)
    # silently stopped platform-wide because of a single bad link.
    query: dict = {"active": "true", "text": {"$ne": "false"}}
    if _settings.scheduler_email_filter:
        query["username"] = _settings.scheduler_email_filter

    scheduled = failed = 0
    for link in sync_db.links.find(query):
        try:
            user = sync_db.login.find_one({"username": link["username"]})
            if user and user.get("number"):
                _schedule_text_jobs(link, user.get("timezone") or "UTC")
                scheduled += 1
        except Exception:
            failed += 1
            log.exception(
                "[scheduler] skipping SMS job for link id=%s user=%s (malformed schedule)",
                link.get("id"), link.get("username"),
            )
    log.info("[scheduler] scheduled SMS jobs for %d links (%d skipped)", scheduled, failed)
