from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ReferenceListCreateRequest(BaseModel):
    code: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=255)
    registry_id: UUID | None = None
    owner_organization_id: UUID | None = None
    locked_for_descendants: bool = True
    inherit_to_descendants: bool = True


class ReferenceItemCreateRequest(BaseModel):
    code: str = Field(min_length=1, max_length=120)
    label: str = Field(min_length=1, max_length=255)


class CreatedIdResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
