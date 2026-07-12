import html as _html
from fastapi import APIRouter, Request
from pydantic import BaseModel, EmailStr
from app.email_service import send_email
from app.limiter import limiter
from app.config import get_settings

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
async def contact(request: Request, body: ContactRequest):
    settings = get_settings()
    is_demo = bool(body.school)
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

    send_email(
        html_content=html_content,
        plain_content=plain,
        subject=subject,
        to=settings.contact_email,
        reply_to=str(body.email),
    )
    return {"ok": True}
