from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class RegistryCreateRequest(BaseModel):
    code: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=255)


class RegistryUpdateRequest(BaseModel):
    code: str | None = Field(default=None, min_length=1, max_length=120)
    name: str | None = Field(default=None, min_length=1, max_length=255)


class FormBlockCreateRequest(BaseModel):
    code: str = Field(min_length=1, max_length=120)
    title: str = Field(min_length=1, max_length=255)


class FormBlockUpdateRequest(BaseModel):
    code: str | None = Field(default=None, min_length=1, max_length=120)
    title: str | None = Field(default=None, min_length=1, max_length=255)


class FormFieldCreateRequest(BaseModel):
    code: str = Field(min_length=1, max_length=120)
    label: str = Field(min_length=1, max_length=255)
    field_type: str
    required_mode: str = "not_required"


class FormFieldUpdateRequest(BaseModel):
    code: str | None = Field(default=None, min_length=1, max_length=120)
    label: str | None = Field(default=None, min_length=1, max_length=255)
    required_mode: str | None = None


class CreatedIdResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID


class FormFieldResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    block_id: UUID
    code: str
    label: str
    field_type: str
    required_mode: str
    archived: bool = False


class FormBlockResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    registry_id: UUID
    code: str
    title: str
    archived: bool = False
    fields: list[FormFieldResponse] = Field(default_factory=list)


class RegistrySchemaResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    code: str
    name: str
    archived: bool = False
    blocks: list[FormBlockResponse] = Field(default_factory=list)
