from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CreatedIdResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID


class PublicLinkCreateRequest(BaseModel):
    card_id: UUID
    can_view: bool = True
    can_edit: bool = True
    expires_at: datetime | None = None
    max_uses: int | None = Field(default=None, ge=1)


class PublicLinkCreatedResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    link_id: UUID
    raw_token: str
    expires_at: datetime


class PublicLinkReadResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    card_id: UUID
    status: str
    can_view: bool
    can_edit: bool
    expires_at: datetime
    max_uses: int | None
    used_count: int


class PublicLinkCardAccessResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    card_id: UUID
    can_view: bool
    can_edit: bool
    expires_at: datetime


class PublicFieldValueWriteRequest(BaseModel):
    block_instance_id: UUID
    field_id: UUID
    value: Any
