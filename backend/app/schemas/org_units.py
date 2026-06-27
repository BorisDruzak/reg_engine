from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class OrgUnitCreateRequest(BaseModel):
    organization_id: UUID
    code: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=255)
    parent_id: UUID | None = None


class OrgUnitResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    code: str
    name: str
    parent_id: UUID | None
    archived: bool = False


class OrgUnitCreateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
