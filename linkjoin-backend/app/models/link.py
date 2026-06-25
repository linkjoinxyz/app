import re
from datetime import datetime as _dt
from pydantic import BaseModel, field_validator
from typing import Optional

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

    @field_validator("name")
    @classmethod
    def validate_name(cls, v):
        if not v or len(v.strip()) == 0 or len(v) > 200:
            raise ValueError("Name must be 1-200 characters")
        return v.strip()

    @field_validator("time")
    @classmethod
    def validate_time(cls, v):
        if not re.match(r"^\d{1,2}:\d{2}$", v):
            raise ValueError("Time must be H:MM or HH:MM")
        h, m = map(int, v.split(":"))
        if not (0 <= h <= 23 and 0 <= m <= 59):
            raise ValueError("Invalid time value")
        return v

    @field_validator("days")
    @classmethod
    def validate_days(cls, v):
        if not v:
            raise ValueError("At least one day required")
        invalid = set(v) - VALID_DAYS
        if invalid:
            raise ValueError(f"Invalid days: {invalid}")
        return v

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
    link: str
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
        if not re.match(r"^\d{1,2}:\d{2}$", v):
            raise ValueError("Time must be H:MM or HH:MM")
        h, m = map(int, v.split(":"))
        if not (0 <= h <= 23 and 0 <= m <= 59):
            raise ValueError("Invalid time value")
        return v

    @field_validator("days")
    @classmethod
    def validate_days(cls, v):
        if not v:
            raise ValueError("At least one day required")
        invalid = set(v) - VALID_DAYS
        if invalid:
            raise ValueError(f"Invalid days: {invalid}")
        return v

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


class ShareLinkRequest(BaseModel):
    link: dict
    emails: list[str]
    type: Optional[str] = "link"


class AcceptLinkRequest(BaseModel):
    link: dict
    accept: bool
    type: Optional[str] = "link"


