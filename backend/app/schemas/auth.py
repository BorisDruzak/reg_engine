from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class LoginRequest(BaseModel):
    email: str
    password: str


class CurrentUserRead(BaseModel):
    id: UUID
    email: str
    display_name: str
    status: str
    is_superuser: bool


class LoginResponse(BaseModel):
    access_token: str
    token_type: str
    expires_at: datetime
    user: CurrentUserRead


class LogoutResponse(BaseModel):
    status: str
