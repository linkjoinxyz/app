import json
import re
import zoneinfo
from datetime import date as _date, datetime as _dt, timedelta as _td, timezone as _tz
import anthropic
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from app.auth import get_confirmed_user
from app.limiter import limiter
from app.config import get_settings
from app.roles import require_premium

_VALID_TIMEZONES = zoneinfo.available_timezones()

router = APIRouter(prefix="/ai", tags=["ai"])


class MeetingExtractRequest(BaseModel):
    subject: str
    body: str
    user_timezone: str = "UTC"


@router.post("/extract-meeting")
@limiter.limit("20/minute")
async def extract_meeting(
    request: Request,
    body: MeetingExtractRequest,
    user: dict = Depends(get_confirmed_user),
):
    require_premium(user)
    settings = get_settings()
    if not settings.anthropic_api_key:
        raise HTTPException(status_code=503, detail="AI not configured")

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    d = _date.today()
    today = f"{d.strftime('%A, %B')} {d.day}, {d.year}"
    safe_tz = body.user_timezone if body.user_timezone in _VALID_TIMEZONES else "UTC"
    # Extraction only — no timezone arithmetic. The model is unreliable at converting
    # times between timezones in its head; that's done exactly in Python below instead.
    prompt = (
        f'Today is {today}. '
        f'Extract meeting details from this email. Return only fields you can find; '
        f'use null for anything not stated. '
        f'"days": array of Sun/Mon/Tue/Wed/Thu/Fri/Sat — derive from explicit day names OR '
        f'convert a specific date to its day of week. '
        f'"time": the meeting time exactly as stated in the email, in 24h "H:MM" format. '
        f'Do NOT convert timezones yourself. '
        f'"time_timezone": if the email states a timezone or abbreviation for that time '
        f'(e.g. "3pm EST", "10:00 Pacific", "15:00 UTC"), return it as an IANA timezone name '
        f'(e.g. "America/New_York") or a UTC offset like "-05:00". Return null if the email '
        f'states no timezone for the time. '
        f'"repeat": ONLY one of: "never" (ONLY for a single one-time event with zero recurrence), "week" (weekly), "month" (use for ALL monthly recurring events — whether the email says "monthly", "every month on the 3rd", "day 1 of each month", "2nd Tuesday", or any other monthly pattern; this is the default for anything monthly), "2 times" (every 2 weeks), "3 times" (every 3 weeks), "4 times" (every 4 weeks) — ignore occurrence counts like "11 times". '
        f'"date": return as "MM/DD/YYYY" in any of these cases: (1) a one-time "never" event — use the event date, (2) a "month" repeat — use the first/next occurrence so the system knows which week of the month, (3) ANY repeat type where the email states an explicit start date such as "starting June 29", "beginning July 1", "first meeting on March 5", etc. — always capture that. Return null only when no specific start date is mentioned for a recurring meeting.\n'
        f'Subject: {body.subject[:200]}\n'
        f'Body: {body.body[:6000]}'
    )

    schema = {
        "type": "object",
        "properties": {
            "name": {"type": ["string", "null"]},
            "link": {"type": ["string", "null"]},
            "days": {"type": ["array", "null"], "items": {"type": "string"}},
            "time": {"type": ["string", "null"]},
            "time_timezone": {"type": ["string", "null"]},
            "repeat": {"type": ["string", "null"]},
            "date": {"type": ["string", "null"]},
        },
        "required": ["name", "link", "days", "time", "time_timezone", "repeat", "date"],
        "additionalProperties": False,
    }

    try:
        msg = client.messages.create(
            model=settings.anthropic_model,
            max_tokens=500,
            output_config={"format": {"type": "json_schema", "schema": schema}},
            messages=[{"role": "user", "content": prompt}],
        )
    except anthropic.APIStatusError as e:
        raise HTTPException(status_code=502, detail=f"AI service error: {e.message}")
    except Exception:
        raise HTTPException(status_code=503, detail="AI service unavailable")

    try:
        raw = msg.content[0].text
        data = json.loads(raw)
    except (json.JSONDecodeError, IndexError, AttributeError):
        raise HTTPException(status_code=422, detail="Could not parse meeting details")

    repeat = data.get("repeat") or "never"
    date_str = data.get("date") or ""
    days = data.get("days") or []

    # Convert the extracted time into the user's local timezone ourselves —
    # exact arithmetic instead of trusting the model's mental timezone math.
    time_str = data.get("time")
    time_tz = data.get("time_timezone")
    if time_str and time_tz:
        try:
            hh, mm = time_str.split(":")
            offset_match = re.fullmatch(r"([+-])(\d{2}):?(\d{2})", time_tz)
            if time_tz in _VALID_TIMEZONES:
                src_tz = zoneinfo.ZoneInfo(time_tz)
            elif offset_match:
                sign, oh, om = offset_match.groups()
                delta = _td(hours=int(oh), minutes=int(om))
                src_tz = _tz(delta if sign == "+" else -delta)
            else:
                src_tz = None
            if src_tz:
                # ponytail: DST offset is computed against today, not the meeting's actual
                # date — wrong only if a DST transition falls between now and then (rare,
                # off by 1h). Use date_str's parsed date here if that ever matters.
                naive = _dt(d.year, d.month, d.day, int(hh), int(mm), tzinfo=src_tz)
                converted = naive.astimezone(zoneinfo.ZoneInfo(safe_tz))
                time_str = f"{converted.hour}:{converted.minute:02d}"
        except Exception:
            pass

    # For month repeat, date is authoritative — always derive weekday from it
    # so AI guesses at the day of week can't override the actual occurrence date.
    if date_str:
        try:
            _DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
            mo, dy, yr = date_str.split("/")
            parsed = _dt(int(yr), int(mo), int(dy))
            derived = [_DOW[parsed.isoweekday() % 7]]
            if repeat == "month" or not days:
                days = derived
        except Exception:
            pass

    return {
        "name": data.get("name"),
        "link": data.get("link"),
        "days": days,
        "time": time_str,
        "repeat": repeat,
        "date": date_str,
    }
