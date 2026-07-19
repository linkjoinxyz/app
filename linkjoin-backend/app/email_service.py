import logging
import smtplib, ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.image import MIMEImage
from pathlib import Path
from app.config import get_settings

log = logging.getLogger(__name__)
_settings = get_settings()

# smtplib inherits the global default socket timeout, which is None — a hung
# Gmail connection would block forever. These calls run on the anyio threadpool
# via BackgroundTasks, so each hang permanently leaks one of its 40 threads, and
# gunicorn's --timeout is only a worker heartbeat and never reclaims them.
_SMTP_TIMEOUT_SECONDS = 15


def _build_message(html_content: str, subject: str, to: str, images: list[dict] | None = None, from_name: str | None = None, plain_content: str | None = None, reply_to: str | None = None) -> MIMEMultipart:
    msg = MIMEMultipart("related")
    alternative = MIMEMultipart("alternative")
    msg.attach(alternative)
    if plain_content:
        alternative.attach(MIMEText(plain_content, "plain"))
    alternative.attach(MIMEText(html_content, "html"))

    for image in (images or []):
        path = Path(image["path"])
        if path.exists():
            with open(path, "rb") as f:
                img = MIMEImage(f.read(), image.get("type", "png"), name=image.get("displayName", path.name))
            img.add_header("Content-ID", f'<{image["name"]}>')
            msg.attach(img)

    msg["Subject"] = subject
    msg["From"] = f'"{from_name}" <{_settings.gmail_from}>' if from_name else _settings.gmail_from
    msg["To"] = to
    if reply_to:
        msg["Reply-To"] = reply_to
    return msg


def _connect() -> smtplib.SMTP_SSL:
    server = smtplib.SMTP_SSL(
        "smtp.gmail.com", 465,
        context=ssl.create_default_context(),
        timeout=_SMTP_TIMEOUT_SECONDS,
    )
    server.login(_settings.gmail_from, _settings.gmail_pwd)
    return server


def send_email(html_content: str, subject: str, to: str, images: list[dict] | None = None, from_name: str | None = None, plain_content: str | None = None, reply_to: str | None = None) -> None:
    msg = _build_message(html_content, subject, to, images, from_name, plain_content, reply_to)
    with _connect() as server:
        server.sendmail(_settings.gmail_from, to, msg.as_string())


def send_email_batch(messages: list[dict]) -> int:
    """Send many messages over a single authenticated connection.

    One TLS handshake plus one AUTH instead of N — Gmail throttles concurrent
    authenticated connections from one account, and the handshake dominates
    per-message cost. A failed recipient is logged and skipped rather than
    aborting the rest of the batch. Returns the number sent.

    Not durable: these run in BackgroundTasks and die with the process. That is
    an accepted tradeoff for share notifications, not an oversight.
    """
    if not messages:
        return 0
    sent = 0
    try:
        with _connect() as server:
            for m in messages:
                try:
                    msg = _build_message(
                        m["html_content"], m["subject"], m["to"],
                        m.get("images"), m.get("from_name"),
                        m.get("plain_content"), m.get("reply_to"),
                    )
                    server.sendmail(_settings.gmail_from, m["to"], msg.as_string())
                    sent += 1
                except Exception:
                    log.exception("[email] failed to send to %s", m.get("to"))
    except Exception:
        log.exception("[email] batch connection failed, %d/%d sent", sent, len(messages))
    return sent
