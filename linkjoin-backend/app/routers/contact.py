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


@router.post("/contact")
@limiter.limit("5/hour")
async def contact(request: Request, body: ContactRequest):
    settings = get_settings()
    html = f"""
    <p><strong>From:</strong> {_html.escape(body.first_name)} {_html.escape(body.last_name)} &lt;{_html.escape(str(body.email))}&gt;</p>
    <p><strong>Message:</strong></p>
    <p>{_html.escape(body.message)}</p>
    """
    send_email(
        html_content=html,
        subject=f"LinkJoin Contact: {body.first_name} {body.last_name}",
        to=settings.contact_email,
    )
    return {"ok": True}
