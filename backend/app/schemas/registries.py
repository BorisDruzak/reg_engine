from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class RegistryCreate(BaseModel):
    code: str
    name: str
    description: str | None = None


class RegistryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    code: str
    name: str
    description: str | None
    lifecycle_status: str
    schema_version: int


class FormBlockCreate(BaseModel):
    code: str
    title: str
    description: str | None = None
    position: int = 0
    is_repeatable: bool = False
    public_visible: bool = True
    public_editable: bool = False


class FormBlockRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    registry_id: UUID
    code: str
    title: str
    description: str | None
    position: int
    is_repeatable: bool
    is_active: bool
    public_visible: bool
    public_editable: bool


class FormFieldCreate(BaseModel):
    code: str
    label: str
    field_type: str
    description: str | None = None
    position: int = 0
    options_source_type: str | None = None
    options_source_id: UUID | None = None
    public_visible: bool = True
    public_editable: bool = False


class FormFieldRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    block_id: UUID
    code: str
    label: str
    description: str | None
    field_type: str
    position: int
    options_source_type: str | None
    options_source_id: UUID | None
    is_active: bool
    public_visible: bool
    public_editable: bool


class ReferenceListCreate(BaseModel):
    code: str
    name: str
    owner_organization_id: UUID | None = None
    description: str | None = None
    inherit_to_descendants: bool = True
    locked_for_descendants: bool = True
    managed_by_system_only: bool = False


class ReferenceListRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    registry_id: UUID | None
    owner_organization_id: UUID | None
    code: str
    name: str
    description: str | None
    inherit_to_descendants: bool
    locked_for_descendants: bool
    managed_by_system_only: bool
    is_active: bool


class ReferenceItemCreate(BaseModel):
    code: str
    label: str
    parent_id: UUID | None = None
    description: str | None = None
    position: int = 0


class ReferenceItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    list_id: UUID
    parent_id: UUID | None
    code: str
    label: str
    description: str | None
    position: int
    is_active: bool


class DynamicValuePayload(BaseModel):
    value: Any
    block_instance_id: UUID | None = None
