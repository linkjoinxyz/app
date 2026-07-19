import re
from datetime import datetime as _dt
from pydantic import BaseModel, EmailStr, field_validator, model_validator
from typing import Literal, Optional

VALID_DAYS = {"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"}
VALID_REPEATS = {"never", "week", "month", "2 times", "3 times", "4 times", "same_weekday"}


def _validate_date_str(v: Optional[str]) -> Optional[str]:
    if not v:
        return v
    try:
        parsed = _dt.strptime(v, "%m/%d/%Y")
    except ValueError:
        raise ValueError("Date must be MM/DD/YYYY with a valid calendar date")
    if parsed.year < 2000:
        raise ValueError("Year must be 2000 or later")
    return v


def _validate_time(v: str) -> str:
    if not v:
        return v
    if not re.match(r"^\d{1,2}:\d{2}$", v):
        raise ValueError("Time must be H:MM or HH:MM")
    h, m = map(int, v.split(":"))
    if not (0 <= h <= 23 and 0 <= m <= 59):
        raise ValueError("Invalid time value")
    return v


def _validate_days(v: list) -> list:
    if not v:
        return v
    invalid = set(v) - VALID_DAYS
    if invalid:
        raise ValueError(f"Invalid days: {invalid}")
    return v


class CreateLinkRequest(BaseModel):
    name: str
    link: str
    time: str
    days: list[str]
    repeats: str
    date: Optional[str] = None
    end_date: Optional[str] = None
    text: Optional[str] = "false"
    password: Optional[str] = None
    active: Optional[str] = "true"

    @field_validator("name")
    @classmethod
    def validate_name(cls, v):
        if not v or len(v.strip()) == 0 or len(v) > 200:
            raise ValueError("Name must be 1-200 characters")
        return v.strip()

    @field_validator("time")
    @classmethod
    def validate_time(cls, v):
        return _validate_time(v)

    @field_validator("days")
    @classmethod
    def validate_days(cls, v):
        return _validate_days(v)

    @field_validator("repeats")
    @classmethod
    def validate_repeats(cls, v):
        if v not in VALID_REPEATS and not re.match(r'^day \d+$', v):
            raise ValueError("Invalid repeat value")
        return v

    @field_validator("date", "end_date")
    @classmethod
    def validate_date(cls, v):
        return _validate_date_str(v)


class UpdateLinkRequest(BaseModel):
    id: int
    name: str
    # Optional: class-linked edits may omit this entirely, since the raw meeting
    # URL is redacted client-side for organizational links (attendance-integrity
    # brief). Omitted means "keep the existing meeting link".
    link: Optional[str] = None
    time: str
    days: list[str]
    repeats: str
    date: Optional[str] = None
    end_date: Optional[str] = None
    text: Optional[str] = "false"
    password: Optional[str] = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v):
        if not v or len(v.strip()) == 0 or len(v) > 200:
            raise ValueError("Name must be 1-200 characters")
        return v.strip()

    @field_validator("time")
    @classmethod
    def validate_time(cls, v):
        return _validate_time(v)

    @field_validator("days")
    @classmethod
    def validate_days(cls, v):
        return _validate_days(v)

    @field_validator("repeats")
    @classmethod
    def validate_repeats(cls, v):
        if v not in VALID_REPEATS and not re.match(r'^day \d+$', v):
            raise ValueError("Invalid repeat value")
        return v

    @field_validator("date", "end_date")
    @classmethod
    def validate_date(cls, v):
        return _validate_date_str(v)


class DeleteLinkRequest(BaseModel):
    id: int
    type: Optional[str] = "link"
    permanent: Optional[bool] = False


class RestoreLinkRequest(BaseModel):
    id: int
    type: Optional[str] = "link"


class ToggleLinkRequest(BaseModel):
    id: int
    active: Optional[str] = None


MAX_SHARE_RECIPIENTS = 10


class ShareLinkRequest(BaseModel):
    """Only the link *id* is ever taken from the client.

    This used to accept the whole link document and trust it wholesale, which let
    a caller share links they did not own and hand-craft the row inserted into the
    recipient's account. `link` is retained so an older frontend bundle keeps
    working, but the validator strips it down to its id and blanks it, so the
    handler physically cannot regress into trusting the payload.
    """
    link_id: Optional[int] = None
    link: Optional[dict] = None  # deprecated, id only
    emails: list[EmailStr]
    type: Literal["link", "bookmark"] = "link"

    @field_validator("emails")
    @classmethod
    def dedupe_and_cap(cls, v):
        # Dedupe before the cap so the limit counts distinct recipients.
        seen = list(dict.fromkeys(e.lower().strip() for e in v))
        if not seen:
            raise ValueError("at least one recipient required")
        if len(seen) > MAX_SHARE_RECIPIENTS:
            raise ValueError(f"at most {MAX_SHARE_RECIPIENTS} recipients per share")
        return seen

    @model_validator(mode="after")
    def resolve_link_id(self):
        if self.link_id is None:
            if isinstance(self.link, dict) and isinstance(self.link.get("id"), int):
                self.link_id = self.link["id"]
            else:
                raise ValueError("link_id is required")
        self.link = None
        return self


class AcceptLinkRequest(BaseModel):
    link: dict
    accept: bool
    type: Optional[str] = "link"
