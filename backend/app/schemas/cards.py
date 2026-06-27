from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CreatedIdResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID


class CardCreateRequest(BaseModel):
    registry_id: UUID
    organization_id: UUID
    org_unit_id: UUID | None = None
    display_name: str = Field(min_length=1, max_length=255)


class CardBlockInstanceCreateRequest(BaseModel):
    block_id: UUID
    ordinal: int = Field(default=0, ge=0)


class CardSystemUpdateRequest(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=255)
    org_unit_id: UUID | None = None
    public_view_enabled: bool | None = None
    public_edit_enabled: bool | None = None


class FieldValueWriteRequest(BaseModel):
    card_id: UUID
    block_instance_id: UUID
    field_id: UUID
    value: Any


class CardArchiveRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


class CardTransferRequest(BaseModel):
    target_organization_id: UUID
    target_org_unit_id: UUID | None = None
    display_name: str | None = Field(default=None, min_length=1, max_length=255)


class CardTransferResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    target_card_id: UUID
    relation_id: UUID


class CardSystemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    registry_id: UUID
    organization_id: UUID
    org_unit_id: UUID | None
    display_name: str
    lifecycle_status: str
    public_view_enabled: bool
    public_edit_enabled: bool


class CardRelationCreateRequest(BaseModel):
    target_card_id: UUID
    relation_type: str


class CardRelationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    source_card_id: UUID
    target_card_id: UUID
    relation_type: str


class CardFieldResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    code: str
    field_type: str
    value: Any


class CardBlockResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    code: str
    title: str
    fields: tuple[CardFieldResponse, ...]


class CardReadResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    registry_id: UUID
    organization_id: UUID
    org_unit_id: UUID | None
    display_name: str
    lifecycle_status: str
    blocks: tuple[CardBlockResponse, ...]


class CardListItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    registry_id: UUID
    organization_id: UUID
    org_unit_id: UUID | None
    display_name: str
    lifecycle_status: str
