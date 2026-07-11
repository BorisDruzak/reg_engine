from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class CardCreate(BaseModel):
    organization_id: UUID
    display_name: str | None = None
    card_template_id: UUID | None = None
    org_unit_id: UUID | None = None
    public_view_enabled: bool = False
    public_edit_enabled: bool = False


class OrganizationCardCreate(BaseModel):
    display_name: str | None = None
    card_template_id: UUID | None = None
    public_view_enabled: bool = False
    public_edit_enabled: bool = False


class CardListFieldValueRead(BaseModel):
    field_id: UUID
    code: str
    label: str
    field_type: str
    value: Any


class CardSummaryRead(BaseModel):
    id: UUID
    registry_id: UUID
    card_template_id: UUID
    card_template_name: str | None = None
    organization_id: UUID
    org_unit_id: UUID | None
    display_name: str
    lifecycle_status: str
    public_view_enabled: bool
    public_edit_enabled: bool
    list_fields: list[CardListFieldValueRead] = Field(default_factory=list)


class CardListRead(BaseModel):
    items: list[CardSummaryRead]


class CardUpdate(BaseModel):
    display_name: str | None = None
    org_unit_id: UUID | None = None
    lifecycle_status: str | None = None
    public_view_enabled: bool | None = None
    public_edit_enabled: bool | None = None


class CardPublicFieldSettingUpdate(BaseModel):
    field_id: UUID
    public_visible: bool
    public_editable: bool


class CardPublicAccessUpdate(BaseModel):
    public_view_enabled: bool | None = None
    public_edit_enabled: bool | None = None
    fields: list[CardPublicFieldSettingUpdate] = Field(default_factory=list)


class CardPublicFieldSettingRead(BaseModel):
    field_id: UUID
    public_visible: bool
    public_editable: bool


class CardPublicAccessRead(BaseModel):
    card_id: UUID
    public_view_enabled: bool
    public_edit_enabled: bool
    fields: list[CardPublicFieldSettingRead] = Field(default_factory=list)


class FieldValueUpdate(BaseModel):
    value: Any
    block_instance_id: UUID | None = None


class FieldValueBulkItemUpdate(BaseModel):
    field_id: UUID
    value: Any
    block_instance_id: UUID | None = None


class FieldValuesBulkUpdate(BaseModel):
    values: list[FieldValueBulkItemUpdate]


class FieldValueRead(BaseModel):
    id: UUID
    card_id: UUID
    block_instance_id: UUID
    field_id: UUID
    value: Any


class FieldValueListRead(BaseModel):
    items: list[FieldValueRead]


class CardFieldRead(BaseModel):
    field_id: UUID
    code: str
    field_type: str
    value: Any


class CardBlockInstanceRead(BaseModel):
    block_instance_id: UUID | None
    ordinal: int
    fields: dict[str, CardFieldRead]


class CardBlockInstanceSummaryRead(BaseModel):
    id: UUID
    card_id: UUID
    block_id: UUID
    ordinal: int


class CardBlockRead(BaseModel):
    block_id: UUID
    code: str
    instances: list[CardBlockInstanceRead]


class CardRead(BaseModel):
    id: UUID
    registry_id: UUID
    card_template_id: UUID
    card_template_name: str | None = None
    organization_id: UUID
    display_name: str
    can_manage: bool
    blocks: dict[str, CardBlockRead]
    fields: dict[str, CardFieldRead]


class CardTransferRequest(BaseModel):
    target_organization_id: UUID
