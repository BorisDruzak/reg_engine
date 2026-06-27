from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class RegistryCreateRequest(BaseModel):
    code: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=255)


class FormBlockCreateRequest(BaseModel):
    code: str = Field(min_length=1, max_length=120)
    title: str = Field(min_length=1, max_length=255)


class FormFieldCreateRequest(BaseModel):
    code: str = Field(min_length=1, max_length=120)
    label: str = Field(min_length=1, max_length=255)
    field_type: str
    required_mode: str = "not_required"


class CreatedIdResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
