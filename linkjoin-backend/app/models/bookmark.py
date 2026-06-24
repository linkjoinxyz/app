from pydantic import BaseModel
from typing import Optional


class CreateBookmarkRequest(BaseModel):
    name: str
    link: str
    tags: Optional[list[str]] = []


class EditBookmarkRequest(BaseModel):
    name: str
    link: str
    tags: Optional[list[str]] = []
