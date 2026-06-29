from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


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


class OrganizationUpdate(BaseModel):
    name: str | None = None
    organization_type: str | None = None


class OrganizationListRead(BaseModel):
    items: list[OrganizationRead]


class OrganizationTreeNodeRead(OrganizationRead):
    children: list["OrganizationTreeNodeRead"] = Field(default_factory=list)


class OrganizationTreeRead(BaseModel):
    items: list[OrganizationTreeNodeRead]


class OrgUnitCreate(BaseModel):
    code: str
    name: str
    parent_id: UUID | None = None
    unit_type: str | None = None


class OrgUnitRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    parent_id: UUID | None
    code: str
    name: str
    type: str | None
    is_active: bool


class OrgUnitUpdate(BaseModel):
    name: str | None = None
    unit_type: str | None = None


class OrgUnitListRead(BaseModel):
    items: list[OrgUnitRead]
