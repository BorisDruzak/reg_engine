from typing import Any
from uuid import UUID

from pydantic import BaseModel


class CardCreate(BaseModel):
    organization_id: UUID
    display_name: str
    org_unit_id: UUID | None = None
    public_view_enabled: bool = False
    public_edit_enabled: bool = False


class CardSummaryRead(BaseModel):
    id: UUID
    registry_id: UUID
    organization_id: UUID
    org_unit_id: UUID | None
    display_name: str
    lifecycle_status: str
    public_view_enabled: bool
    public_edit_enabled: bool


class CardListRead(BaseModel):
    items: list[CardSummaryRead]


class CardUpdate(BaseModel):
    display_name: str | None = None
    public_view_enabled: bool | None = None
    public_edit_enabled: bool | None = None


class FieldValueUpdate(BaseModel):
    value: Any
    block_instance_id: UUID | None = None


class FieldValueRead(BaseModel):
    id: UUID
    card_id: UUID
    block_instance_id: UUID
    field_id: UUID
    value: Any


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
    organization_id: UUID
    display_name: str
    blocks: dict[str, CardBlockRead]
    fields: dict[str, CardFieldRead]


class CardTransferRequest(BaseModel):
    target_organization_id: UUID
