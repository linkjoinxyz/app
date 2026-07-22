from pydantic import BaseModel, field_validator, model_validator
from typing import List, Literal, Optional

# Reused rather than redeclared: a class schedule and a link schedule use the
# identical wire format ("H:MM" 24-hour, Mon/Tue/... abbreviations), and the
# class schedule is now propagated onto its links, so the two must not drift.
from app.models.link import _validate_time, _validate_days


class CreateClassRequest(BaseModel):
    name: str
    time: str = ""
    days: List[str] = []

    @field_validator("name")
    @classmethod
    def validate_name(cls, v):
        if not v or not v.strip() or len(v) > 200:
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


class UpdateClassRequest(BaseModel):
    name: str | None = None
    time: str | None = None
    days: List[str] | None = None
    family_alerts: bool | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v):
        if v is None:
            return v
        if not v.strip() or len(v) > 200:
            raise ValueError("Name must be 1-200 characters")
        return v.strip()

    @field_validator("time")
    @classmethod
    def validate_time(cls, v):
        return _validate_time(v) if v is not None else v

    @field_validator("days")
    @classmethod
    def validate_days(cls, v):
        return _validate_days(v) if v is not None else v

    @model_validator(mode="after")
    def no_silent_schedule_clear(self):
        """Reject "" / [] explicitly rather than letting them through.

        update_class filters on `v is not None`, so an empty string or empty list
        is falsy-but-not-None and DOES get written. Both validators above
        short-circuit on empty input, so nothing else catches it. The effect is a
        class whose schedule is silently wiped, which disables attendance
        recording, absence alerts and parent reminders for it with no error.
        """
        if self.time == "":
            raise ValueError("time cannot be empty; omit the field to leave it unchanged")
        if self.days == []:
            raise ValueError("days cannot be empty; omit the field to leave it unchanged")
        return self


class AddStudentsRequest(BaseModel):
    student_ids: List[str]


class ScheduleOverrideBody(BaseModel):
    """A one-off exception to a class's weekly schedule for a single date."""

    date: str  # YYYY-MM-DD
    type: Literal["cancelled", "late_start"]
    time: Optional[str] = None  # required iff type == "late_start"
    reason: str = ""

    @field_validator("date")
    @classmethod
    def validate_date(cls, v):
        from datetime import date as _date

        try:
            _date.fromisoformat(v)
        except (ValueError, TypeError):
            raise ValueError("date must be YYYY-MM-DD")
        return v

    @field_validator("time")
    @classmethod
    def validate_time(cls, v):
        return _validate_time(v) if v else v

    @model_validator(mode="after")
    def check_type_time_pairing(self):
        if self.type == "late_start" and not self.time:
            raise ValueError("time is required when type is 'late_start'")
        if self.type == "cancelled":
            # A cancelled session has no start time; drop anything supplied so the
            # stored shape is unambiguous for session_time_on().
            self.time = None
        if len(self.reason) > 200:
            raise ValueError("reason must be 200 characters or fewer")
        return self
