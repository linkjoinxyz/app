from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional


class RegisterRequest(BaseModel):
    email: EmailStr
    password: Optional[str] = None
    jwt: Optional[str] = None
    number: Optional[str] = None
    countrycode: Optional[str] = None
    offset: Optional[float] = 0.0
    timezone: Optional[str] = ""
    keep: Optional[bool] = False

    @field_validator("password")
    @classmethod
    def password_length(cls, v):
        if v is not None and len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class LoginRequest(BaseModel):
    email: Optional[EmailStr] = None
    password: Optional[str] = None
    jwt: Optional[str] = None
    keep: Optional[bool] = False


class ResetPasswordRequest(BaseModel):
    password: str

    @field_validator("password")
    @classmethod
    def password_length(cls, v):
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    email: str


class UpdateTimezoneRequest(BaseModel):
    timezone: str
    offset: Optional[float] = None


class AddNumberRequest(BaseModel):
    number: str
    countrycode: Optional[str] = "1"


class TutorialRequest(BaseModel):
    step: int


class SortRequest(BaseModel):
    sort: str


class OpenEarlyRequest(BaseModel):
    open: int


class AutoDeleteRequest(BaseModel):
    enabled: bool


class VacationModeRequest(BaseModel):
    enabled: bool


class NoteRequest(BaseModel):
    id: int
    name: str
    markdown: str
    date: str
