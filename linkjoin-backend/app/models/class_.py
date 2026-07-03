from pydantic import BaseModel
from typing import List


class CreateClassRequest(BaseModel):
    name: str
    time: str
    days: List[str]


class UpdateClassRequest(BaseModel):
    name: str | None = None
    time: str | None = None
    days: List[str] | None = None
    family_alerts: bool | None = None


class AddStudentsRequest(BaseModel):
    student_ids: List[str]
