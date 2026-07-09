from pydantic import BaseModel
from typing import List


class CreateOrgRequest(BaseModel):
    name: str
    type: str  # "school" | "district"
    parent_org_id: str | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None
    zip_code: str | None = None
    website: str | None = None
    phone: str | None = None
    timezone: str | None = None
    grade_levels: List[str] | None = None
    school_year_start: str | None = None  # e.g. "August 15"
    school_year_end: str | None = None    # e.g. "June 10"


class UpdateOrgRequest(BaseModel):
    name: str | None = None
    brand_name: str | None = None
