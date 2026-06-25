import smtplib, ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.image import MIMEImage
from pathlib import Path
from app.config import get_settings

_settings = get_settings()


def send_email(html_content: str, subject: str, to: str, images: list[dict] | None = None) -> None:
    msg = MIMEMultipart("related")
    alternative = MIMEMultipart("alternative")
    msg.attach(alternative)
    alternative.attach(MIMEText(html_content, "html"))

    for image in (images or []):
        path = Path(image["path"])
        if path.exists():
            with open(path, "rb") as f:
                img = MIMEImage(f.read(), image.get("type", "png"), name=image.get("displayName", path.name))
            img.add_header("Content-ID", f'<{image["name"]}>')
            msg.attach(img)

    msg["Subject"] = subject
    msg["From"] = _settings.gmail_from
    msg["To"] = to

    with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=ssl.create_default_context()) as server:
        server.login(_settings.gmail_from, _settings.gmail_pwd)
        server.sendmail(_settings.gmail_from, to, msg.as_string())
