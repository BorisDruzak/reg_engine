from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ReferenceEditLinkCreate(BaseModel):
    owner_organization_id: UUID | None = None
    expires_in_days: int | None = Field(default=None, ge=1, le=365)


class ReferenceEditLinkRead(BaseModel):
    id: UUID
    registry_id: UUID
    owner_organization_id: UUID | None
    status: str
    expires_at: datetime | None
    closed_at: datetime | None
    created_at: datetime


class ReferenceEditLinkTokenRead(ReferenceEditLinkRead):
    raw_token: str


class ReferenceEditLinkListRead(BaseModel):
    items: list[ReferenceEditLinkRead]


class PublicReferenceEditTokenRequest(BaseModel):
    raw_token: str = Field(min_length=1)


class PublicReferenceListRead(BaseModel):
    id: UUID
    name: str
    description: str | None
    archived_at: datetime | None


class PublicReferenceItemRead(BaseModel):
    id: UUID
    list_id: UUID
    parent_id: UUID | None
    label: str
    description: str | None
    position: int
    archived_at: datetime | None


class PublicReferenceWorkspaceRead(BaseModel):
    status: str
    can_edit: bool
    registry_id: UUID
    owner_organization_id: UUID | None
    lists: list[PublicReferenceListRead]
    items: list[PublicReferenceItemRead]


class PublicReferenceListCreate(BaseModel):
    raw_token: str = Field(min_length=1)
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=1000)


class PublicReferenceListUpdate(BaseModel):
    raw_token: str = Field(min_length=1)
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=1000)


class PublicReferenceItemCreate(BaseModel):
    raw_token: str = Field(min_length=1)
    label: str = Field(min_length=1, max_length=255)
    parent_id: UUID | None = None
    description: str | None = Field(default=None, max_length=1000)
    position: int = Field(default=0, ge=0)


class PublicReferenceItemUpdate(BaseModel):
    raw_token: str = Field(min_length=1)
    label: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=1000)
    position: int | None = Field(default=None, ge=0)
