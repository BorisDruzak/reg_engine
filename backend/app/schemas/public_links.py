from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.card_template_layouts import CardTemplateFormLayoutRead


class PublicLinkCreate(BaseModel):
    expires_in_days: int = Field(default=7, ge=1, le=30)
    max_attachment_uploads: int | None = Field(default=None, ge=0)
    review_enabled: bool = True
    allowed_block_ids: list[UUID] | None = None
    allowed_field_ids: list[UUID] | None = None


class PublicLinkTokenRead(BaseModel):
    id: UUID
    card_id: UUID
    raw_token: str
    status: str
    can_edit: bool
    expires_at: datetime | None
    review_enabled: bool


class PublicLinkRead(BaseModel):
    id: UUID
    card_id: UUID
    status: str
    can_view: bool
    can_edit: bool
    expires_at: datetime | None
    max_uses: int | None
    used_count: int
    max_attachment_uploads: int | None
    attachment_upload_count: int
    disabled_at: datetime | None
    submitted_at: datetime | None
    reviewed_at: datetime | None
    reviewed_by: UUID | None
    review_comment: str | None
    review_enabled: bool
    completed_public_fields: int | None
    total_public_fields: int | None
    can_manage_change_notifications: bool
    change_notifications_enabled: bool


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
    max_attachment_uploads: int | None
    attachment_upload_count: int
    can_upload_attachments: bool


class PublicLinkPreviewOptionRead(BaseModel):
    id: UUID
    code: str
    label: str
    archived: bool = False


class PublicLinkPreviewFieldRead(BaseModel):
    field_id: UUID
    code: str
    label: str
    description: str | None
    field_type: str
    required_mode: str
    value: Any
    options_source_type: str | None
    options_source_id: UUID | None
    options_config_json: dict[str, Any] | None
    display_config_json: dict[str, Any] | None
    public_editable: bool
    options: list[PublicLinkPreviewOptionRead]


class PublicLinkPreviewBlockInstanceRead(BaseModel):
    block_instance_id: UUID | None
    ordinal: int
    fields: list[PublicLinkPreviewFieldRead]


class PublicLinkPreviewBlockRead(BaseModel):
    block_id: UUID
    code: str
    title: str
    is_repeatable: bool
    layout_columns: int
    display_config_json: dict[str, Any] | None
    instances: list[PublicLinkPreviewBlockInstanceRead]


class PublicLinkPreviewRead(BaseModel):
    card_id: UUID
    display_name: str
    organization_name: str
    card_template_name: str
    lifecycle_status: str
    expires_at: datetime | None
    can_edit: bool
    form_layout: CardTemplateFormLayoutRead
    blocks: list[PublicLinkPreviewBlockRead]


class PublicLinkEditRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    raw_token: str
    field_id: UUID
    value: Any
    block_instance_id: UUID | None = None


class PublicLinkSubmitRequest(BaseModel):
    raw_token: str = Field(min_length=1)


class PublicLinkRequestChanges(BaseModel):
    comment: str = Field(min_length=1, max_length=2000)


class PublicLinkSafeStatusRead(BaseModel):
    status: str
    can_edit: bool
    submitted_at: datetime | None
    reviewed_at: datetime | None
    review_comment: str | None
    completed_public_fields: int | None
    total_public_fields: int | None


class PublicLinkReviewFieldDiffRead(BaseModel):
    block_id: UUID
    field_id: UUID
    block_instance_id: UUID | None
    label: str
    field_type: str
    before: Any
    after: Any
    changed_at: datetime | None


class PublicLinkReviewAttachmentDiffRead(BaseModel):
    attachment_id: UUID
    title: str
    original_filename: str
    content_length_bytes: int
    change: Literal["added", "archived"]


class PublicLinkReviewRead(BaseModel):
    public_link: PublicLinkRead
    changed_field_count: int
    changed_attachment_count: int
    fields: list[PublicLinkReviewFieldDiffRead]
    attachments: list[PublicLinkReviewAttachmentDiffRead]
