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
    max_attachment_uploads: int | None
    attachment_upload_count: int
    disabled_at: datetime | None


class PublicLinkListRead(BaseModel):
    items: list[PublicLinkRead]


class PublicLinkPreviewRequest(BaseModel):
    raw_token: str


class PublicLinkAttachmentRequest(BaseModel):
    raw_token: str


class PublicLinkAttachmentRead(BaseModel):
    id: UUID
    card_id: UUID
    title: str
    description: str | None
    position: int
    original_filename: str
    content_type: str
    content_length_bytes: int
    scanner_status: str
    created_at: datetime
    archived_at: datetime | None


class PublicLinkAttachmentListRead(BaseModel):
    items: list[PublicLinkAttachmentRead]


class PublicLinkPreviewOptionRead(BaseModel):
    id: UUID
    code: str
    label: str


class PublicLinkPreviewFieldRead(BaseModel):
    field_id: UUID
    code: str
    label: str
    field_type: str
    value: Any
    options_source_type: str | None
    options_source_id: UUID | None
    options: list[PublicLinkPreviewOptionRead]


class PublicLinkPreviewBlockInstanceRead(BaseModel):
    block_instance_id: UUID | None
    ordinal: int
    fields: list[PublicLinkPreviewFieldRead]


class PublicLinkPreviewBlockRead(BaseModel):
    block_id: UUID
    code: str
    title: str
    instances: list[PublicLinkPreviewBlockInstanceRead]


class PublicLinkPreviewRead(BaseModel):
    card_id: UUID
    display_name: str
    expires_at: datetime
    can_edit: bool
    blocks: list[PublicLinkPreviewBlockRead]


class PublicLinkEditRequest(BaseModel):
    raw_token: str
    field_id: UUID
    value: Any
    block_instance_id: UUID | None = None
