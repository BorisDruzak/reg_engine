from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.card_template_layouts import CardTemplateFormLayoutRead
from app.schemas.public_links import PublicLinkPreviewBlockRead


class CardCreationLinkCreate(BaseModel):
    card_template_id: UUID
    organization_ids: list[UUID] = Field(min_length=1)


class CardCreationLinkOrganizationRead(BaseModel):
    id: UUID
    name: str


class CardCreationLinkCreatedCardRead(BaseModel):
    card_id: UUID
    display_name: str
    organization_id: UUID
    organization_name: str
    child_public_link_id: UUID
    child_raw_token: str


class CardCreationLinkRead(BaseModel):
    id: UUID
    registry_id: UUID
    card_template_id: UUID
    card_template_name: str
    raw_token: str
    created_at: datetime
    closed_at: datetime | None
    organizations: list[CardCreationLinkOrganizationRead]
    created_cards: list[CardCreationLinkCreatedCardRead]


class CardCreationLinkListRead(BaseModel):
    items: list[CardCreationLinkRead]


class CardCreationLinkCardListRead(BaseModel):
    items: list[CardCreationLinkCreatedCardRead]


class CardCreationLinkPublicPreviewRequest(BaseModel):
    raw_token: str = Field(min_length=1)
    organization_id: UUID | None = None


class CardCreationLinkPublicPreviewRead(BaseModel):
    card_template_id: UUID
    card_template_name: str
    selected_organization_id: UUID | None
    organizations: list[CardCreationLinkOrganizationRead]
    form_layout: CardTemplateFormLayoutRead
    blocks: list[PublicLinkPreviewBlockRead]


class CardCreationLinkFirstSaveRequest(BaseModel):
    raw_token: str = Field(min_length=1)
    organization_id: UUID
    field_id: UUID
    value: Any
    block_instance_id: UUID | None = None


class CardCreationLinkDraftCreateRequest(BaseModel):
    raw_token: str = Field(min_length=1)
    organization_id: UUID


class CardCreationLinkFirstSaveRead(BaseModel):
    card_id: UUID
    display_name: str
    child_raw_token: str
