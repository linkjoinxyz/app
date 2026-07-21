import asyncio
import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from app.auth import get_confirmed_user
from app.database import motor_db, sync_db
from app.config import get_settings
from app.limiter import limiter
from app.utils import configure_data
from app.websocket_manager import manager

log = logging.getLogger(__name__)
router = APIRouter(prefix="/messaging", tags=["messaging"])
_settings = get_settings()

_messages = [
    "LinkJoin Reminder: Your link, {name}, will open in {text} minutes. "
    "Text {id} to stop receiving reminders for this link, or log into your LinkJoin account.",
]


@router.post("/receive")
async def receive_vonage(request: Request):
    form_data = await request.form()
    form_dict = dict(form_data)

    # Fail CLOSED. This used to be `if _settings.twilio_token:`, so an unset or
    # misconfigured token silently turned an unauthenticated endpoint loose:
    # anyone could POST a spoofed `From` matching a victim's stored number and
    # switch off that victim's reminders. Missing configuration must never be the
    # thing that removes an authentication check.
    if not _settings.twilio_token:
        log.error("[messaging] inbound webhook rejected: TWILIO_TOKEN is not configured")
        raise HTTPException(status_code=503, detail="Inbound messaging is not configured")

    from twilio.request_validator import RequestValidator
    validator = RequestValidator(_settings.twilio_token)
    sig = request.headers.get("X-Twilio-Signature", "")
    # Use the canonical public URL so validation works behind a reverse proxy
    canonical_url = f"{_settings.app_base_url}/messaging/receive"
    if not validator.validate(canonical_url, form_dict, sig):
        raise HTTPException(status_code=403, detail="Invalid signature")

    text = form_dict.get("Body", "")
    from_number = form_dict.get("From", "")
    if not from_number:
        return {"message": "ok"}

    try:
        number_int = int(from_number)
    except ValueError:
        return {"message": "ok"}

    # motor, not sync_db: a blocking PyMongo call inside an async handler stalls
    # the whole worker's event loop, and the Twilio send below is a synchronous
    # HTTP round trip that did the same. scheduler.py already offloads this call.
    user = await motor_db.login.find_one({"number": number_int})
    if text.isdigit() and user:
        await motor_db.links.update_one(
            {"id": int(text), "username": user["username"]}, {"$set": {"text": "false"}}
        )

        def _twilio_send():
            from twilio.rest import Client
            Client(_settings.twilio_sid, _settings.twilio_token).messages.create(
                from_=_settings.twilio_from_number,
                body="Ok, we won't remind you about this link again.",
                to=from_number,
            )

        try:
            await asyncio.get_running_loop().run_in_executor(None, _twilio_send)
        except Exception:
            log.exception("[messaging] failed to send unsubscribe confirmation")
    return {"message": "ok"}


@router.post("/send")
@limiter.limit("5/minute")
async def send_message(request: Request, body: dict, user: dict = Depends(get_confirmed_user)):
    if body.get("key") != _settings.text_key:
        raise HTTPException(status_code=403, detail="Invalid key")

    from twilio.rest import Client
    twilio = Client(_settings.twilio_sid, _settings.twilio_token)
    msg_body = _messages[0].format(
        name=body.get("name", ""),
        text=body.get("text", ""),
        id=body.get("id", ""),
    )
    twilio.messages.create(from_=_settings.twilio_from_number, body=msg_body, to=body.get("number", ""))
    return {"message": "Sent"}


@router.post("/unsubscribe/{link_id}")
async def unsubscribe(link_id: int, user: dict = Depends(get_confirmed_user)):
    email = user["username"]
    result = await motor_db.links.update_one(
        {"id": link_id, "username": email}, {"$set": {"text": "false"}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Link not found")
    await manager.broadcast(await configure_data(email), email)
    return {"message": "Unsubscribed"}
