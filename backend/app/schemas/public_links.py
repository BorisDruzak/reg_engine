from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class PublicLinkCreate(BaseModel):
    expires_in_days: int = Field(default=7, ge=1, le=30)


class PublicLinkTokenRead(BaseModel):
    id: UUID
    card_id: UUID
    raw_token: str
    status: str
    can_edit: bool
    expires_at: datetime


class PublicLinkRead(BaseModel):
    id: UUID
    card_id: UUID
    status: str
    can_view: bool
    can_edit: bool
    expires_at: datetime
    max_uses: int | None
    used_count: int
    disabled_at: datetime | None


class PublicLinkListRead(BaseModel):
    items: list[PublicLinkRead]


class PublicLinkEditRequest(BaseModel):
    raw_token: str
    field_id: UUID
    value: Any
