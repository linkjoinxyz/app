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


@router.post("/contact")
@limiter.limit("5/hour")
async def contact(request: Request, body: ContactRequest):
    settings = get_settings()
    rows = [
        f"<p><strong>From:</strong> {_html.escape(body.first_name)} {_html.escape(body.last_name)} &lt;{_html.escape(str(body.email))}&gt;</p>",
    ]
    if body.school:
        rows.append(f"<p><strong>School / District:</strong> {_html.escape(body.school)}</p>")
    if body.role:
        rows.append(f"<p><strong>Role:</strong> {_html.escape(body.role)}</p>")
    if body.message:
        rows.append(f"<p><strong>Message:</strong></p><p>{_html.escape(body.message)}</p>")
    subject = f"LinkJoin Demo Request: {body.first_name} {body.last_name}" if body.school else f"LinkJoin Contact: {body.first_name} {body.last_name}"
    send_email(html_content="\n".join(rows), subject=subject, to=settings.contact_email)
    return {"ok": True}
