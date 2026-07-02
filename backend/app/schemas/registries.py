from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class RegistryCreate(BaseModel):
    code: str
    name: str
    description: str | None = None
    card_title_label: str = "Название карточки"


class RegistryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    code: str
    name: str
    description: str | None
    card_title_label: str
    lifecycle_status: str
    schema_version: int
    owner_organization_id: UUID | None
    is_default_for_owner_tree: bool


class RegistryListRead(BaseModel):
    items: list[RegistryRead]


class RegistryUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    card_title_label: str | None = None
    lifecycle_status: str | None = None


class RegistrySchemaRead(BaseModel):
    registry: RegistryRead
    blocks: list["FormBlockRead"]
    fields: list["FormFieldRead"]
    templates: list["CardTemplateRead"] = Field(default_factory=list)


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


class FormBlockUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    position: int | None = None


class FormFieldCreate(BaseModel):
    code: str
    label: str
    field_type: str
    description: str | None = None
    position: int = 0
    required_mode: str = "not_required"
    options_source_type: str | None = None
    options_source_id: UUID | None = None
    options_config_json: dict[str, Any] | None = None
    is_list_display: bool = False
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
    required_mode: str
    options_source_type: str | None
    options_source_id: UUID | None
    options_config_json: dict[str, Any] | None
    is_active: bool
    is_list_display: bool
    public_visible: bool
    public_editable: bool


class FormFieldUpdate(BaseModel):
    label: str | None = None
    description: str | None = None
    position: int | None = None
    required_mode: str | None = None
    is_active: bool | None = None
    is_list_display: bool | None = None


class CardTemplateCreate(BaseModel):
    code: str
    name: str
    description: str | None = None
    position: int = 0
    field_schema_json: dict[str, Any] = Field(default_factory=dict)
    default_values_json: list[dict[str, Any]] = Field(default_factory=list)
    is_active: bool = True


class CardTemplateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    registry_id: UUID
    code: str
    name: str
    description: str | None
    position: int
    field_schema_json: dict[str, Any]
    default_values_json: list[dict[str, Any]]
    is_active: bool


class CardTemplateUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    position: int | None = None
    field_schema_json: dict[str, Any] | None = None
    default_values_json: list[dict[str, Any]] | None = None
    is_active: bool | None = None


class CardTemplateListRead(BaseModel):
    items: list[CardTemplateRead]


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


class ReferenceListUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    owner_organization_id: UUID | None = None
    inherit_to_descendants: bool | None = None
    locked_for_descendants: bool | None = None
    managed_by_system_only: bool | None = None


class ReferenceListListRead(BaseModel):
    items: list[ReferenceListRead]


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


class ReferenceItemUpdate(BaseModel):
    label: str | None = None
    description: str | None = None
    position: int | None = None


class ReferenceItemListRead(BaseModel):
    items: list[ReferenceItemRead]


class DynamicValuePayload(BaseModel):
    value: Any
    block_instance_id: UUID | None = None
