from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ReferenceListCreateRequest(BaseModel):
    code: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=255)
    registry_id: UUID | None = None
    owner_organization_id: UUID | None = None
    locked_for_descendants: bool = True
    inherit_to_descendants: bool = True


class ReferenceListUpdateRequest(BaseModel):
    code: str | None = Field(default=None, min_length=1, max_length=120)
    name: str | None = Field(default=None, min_length=1, max_length=255)


class ReferenceItemCreateRequest(BaseModel):
    code: str = Field(min_length=1, max_length=120)
    label: str = Field(min_length=1, max_length=255)


class ReferenceItemUpdateRequest(BaseModel):
    code: str | None = Field(default=None, min_length=1, max_length=120)
    label: str | None = Field(default=None, min_length=1, max_length=255)


class CreatedIdResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID


class ReferenceListResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    registry_id: UUID | None
    owner_organization_id: UUID | None
    code: str
    name: str
    locked_for_descendants: bool
    inherit_to_descendants: bool
    archived: bool = False


class ReferenceItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    list_id: UUID
    code: str
    label: str
    archived: bool = False
