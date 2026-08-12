import html as _html
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, BackgroundTasks, Request
from pydantic import BaseModel, EmailStr
from app.database import motor_db
from app.email_service import send_email
from app.limiter import limiter
from app.config import get_settings
from app.utils import track_event

log = logging.getLogger(__name__)

router = APIRouter()


class ContactRequest(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    message: str
    school: str | None = None
    role: str | None = None


def _row(label: str, value: str) -> str:
    return (
        f'<tr><td style="padding:6px 12px 6px 0;color:#888;white-space:nowrap;vertical-align:top">'
        f'<strong>{label}</strong></td>'
        f'<td style="padding:6px 0">{value}</td></tr>'
    )


@router.post("/contact")
@limiter.limit("5/hour")
async def contact(request: Request, body: ContactRequest, background_tasks: BackgroundTasks):
    settings = get_settings()
    is_demo = bool(body.school)

    # Persist BEFORE attempting delivery. This used to exist only as an email to
    # one inbox: an SMTP failure 500'd the form and the lead was gone with no
    # record anywhere, and a spam filter did the same thing silently. For demo
    # requests that is the entire inbound org pipeline, so it has to be durable
    # before anything that can fail.
    lead = {
        "first_name": body.first_name,
        "last_name": body.last_name,
        "email": str(body.email),
        "message": body.message,
        "school": body.school,
        "role": body.role,
        "kind": "demo" if is_demo else "contact",
        "created_at": datetime.now(timezone.utc),
        "emailed": False,
    }
    lead_id = None
    try:
        result = await motor_db.leads.insert_one(dict(lead))
        lead_id = result.inserted_id
    except Exception:
        # A DB failure must not also lose the lead — fall through and still try
        # to email, which is strictly better than dropping it entirely.
        log.exception("[contact] failed to persist lead from %s", body.email)
    subject = (
        f"Demo request: {body.first_name} {body.last_name}"
        if is_demo else
        f"Contact: {body.first_name} {body.last_name}"
    )

    e = _html.escape
    rows = [_row("Name", f"{e(body.first_name)} {e(body.last_name)}")]
    rows.append(_row("Email", f'<a href="mailto:{e(str(body.email))}">{e(str(body.email))}</a>'))
    if body.school:
        rows.append(_row("School / District", e(body.school)))
    if body.role:
        rows.append(_row("Role", e(body.role)))
    if body.message:
        rows.append(_row("Message", e(body.message).replace("\n", "<br>")))

    html_content = f"""
<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:560px">
  <h2 style="margin:0 0 16px;font-size:16px">{'Demo request' if is_demo else 'Contact form submission'}</h2>
  <table style="border-collapse:collapse;width:100%">{''.join(rows)}</table>
  <p style="margin:20px 0 0;font-size:12px;color:#aaa">Sent via linkjoin.xyz</p>
</div>"""

    plain = (
        f"Name: {body.first_name} {body.last_name}\n"
        f"Email: {body.email}\n"
        + (f"School / District: {body.school}\n" if body.school else "")
        + (f"Role: {body.role}\n" if body.role else "")
        + (f"\nMessage:\n{body.message}\n" if body.message else "")
    )

    async def _deliver() -> None:
        # Background: a 15s SMTP timeout used to block the response, so a slow
        # Gmail made the form look broken to someone who had already submitted.
        try:
            send_email(
                html_content=html_content,
                plain_content=plain,
                subject=subject,
                to=settings.contact_email,
                reply_to=str(body.email),
            )
            if lead_id is not None:
                await motor_db.leads.update_one({"_id": lead_id}, {"$set": {"emailed": True}})
        except Exception:
            # The lead is already stored, so this is a notification failure, not
            # a lost lead. It stays emailed:false so the Leads view can show it.
            log.exception("[contact] notification email failed for lead %s", lead_id)

    background_tasks.add_task(_deliver)
    await track_event("demo_request" if is_demo else "contact_request")
    return {"ok": True}
