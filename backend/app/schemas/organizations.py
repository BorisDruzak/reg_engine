from uuid import UUID

from pydantic import BaseModel, ConfigDict


class OrganizationCreate(BaseModel):
    code: str
    name: str
    parent_id: UUID | None = None
    organization_type: str = "organization"


class OrganizationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    parent_id: UUID | None
    code: str
    name: str
    type: str
    is_active: bool
