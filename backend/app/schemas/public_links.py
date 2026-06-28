from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel


class PublicLinkCreate(BaseModel):
    expires_in_days: int = 7


class PublicLinkTokenRead(BaseModel):
    id: UUID
    card_id: UUID
    raw_token: str
    status: str
    can_edit: bool
    expires_at: datetime


class PublicLinkEditRequest(BaseModel):
    raw_token: str
    field_id: UUID
    value: Any
