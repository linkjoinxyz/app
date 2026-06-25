import json
import zoneinfo
from datetime import date as _date
import anthropic
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from app.auth import get_confirmed_user
from app.limiter import limiter
from app.config import get_settings

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
    settings = get_settings()
    if not settings.anthropic_api_key:
        raise HTTPException(status_code=503, detail="AI not configured")

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    d = _date.today()
    today = f"{d.strftime('%A, %B')} {d.day}, {d.year}"
    safe_tz = body.user_timezone if body.user_timezone in _VALID_TIMEZONES else "UTC"
    prompt = (
        f'Today is {today}. User\'s local timezone: {safe_tz}. '
        f'Return ONLY a raw JSON object (no markdown) with keys: '
        f'"name" (string|null), '
        f'"link" (meeting URL|null), '
        f'"days" (array of Sun/Mon/Tue/Wed/Thu/Fri/Sat — derive from explicit day names OR convert specific dates to day of week|null), '
        f'"time" (24h "H:MM" in the user\'s local timezone — convert from the email\'s timezone if one is specified|null), '
        f'"repeat": ONLY one of: "never" (ONLY for a single one-time event with zero recurrence), "week" (weekly), "month" (use for ALL monthly recurring events — whether the email says "monthly", "every month on the 3rd", "day 1 of each month", "2nd Tuesday", or any other monthly pattern; this is the default for anything monthly), "2 times" (every 2 weeks), "3 times" (every 3 weeks), "4 times" (every 4 weeks) — ignore occurrence counts like "11 times", '
        f'"date": for "never" or "month", return the next upcoming occurrence as "MM/DD/YYYY" — this is required for "month" so the system can determine which week of the month; for weekly or multi-week repeats with no explicit start date return null.\n'
        f'Subject: {body.subject[:200]}\n'
        f'Body: {body.body[:800]}'
    )

    msg = client.messages.create(
        model=settings.anthropic_model,
        max_tokens=150,
        messages=[{"role": "user", "content": prompt}],
    )
    try:
        raw = msg.content[0].text.strip()
        raw = raw.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        data = json.loads(raw)
    except (json.JSONDecodeError, IndexError, AttributeError):
        raise HTTPException(status_code=422, detail="Could not parse meeting details")

    repeat = data.get("repeat") or "never"
    date_str = data.get("date") or ""
    days = data.get("days") or []

    # For month repeat, date is authoritative — always derive weekday from it
    # so AI guesses at the day of week can't override the actual occurrence date.
    if date_str:
        try:
            from datetime import datetime as _dt
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
        "time": data.get("time"),
        "repeat": repeat,
        "date": date_str,
    }
