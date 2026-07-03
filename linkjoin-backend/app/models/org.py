from pydantic import BaseModel


class CreateOrgRequest(BaseModel):
    name: str
    type: str  # "school" | "district"
    parent_org_id: str | None = None


class UpdateOrgRequest(BaseModel):
    name: str | None = None
    brand_name: str | None = None
