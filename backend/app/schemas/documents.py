from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class DocumentTemplateCreate(BaseModel):
    code: str
    name: str
    template_body: str
    description: str | None = None
    output_filename_template: str = "{{ card.display_name }}.docx"


class DocumentTemplateRead(BaseModel):
    id: UUID
    registry_id: UUID
    code: str
    name: str
    description: str | None
    template_format: str
    output_filename_template: str
    output_content_type: str
    is_active: bool
    current_version_id: UUID | None = None
    current_version_number: int | None = None
    created_at: datetime
    archived_at: datetime | None

    model_config = ConfigDict(from_attributes=True)


class DocumentTemplateListRead(BaseModel):
    items: list[DocumentTemplateRead]


class DocumentTemplateVersionRead(BaseModel):
    id: UUID
    template_id: UUID
    version_number: int
    template_format: str
    original_filename: str | None
    content_type: str | None
    content_length_bytes: int | None
    created_at: datetime
    archived_at: datetime | None

    model_config = ConfigDict(from_attributes=True)


class DocumentTemplateVersionListRead(BaseModel):
    items: list[DocumentTemplateVersionRead]


class GeneratedDocumentCreate(BaseModel):
    template_id: UUID
    title: str | None = None


class GeneratedDocumentRead(BaseModel):
    id: UUID
    card_id: UUID
    template_id: UUID
    template_version_id: UUID | None
    stored_file_id: UUID
    title: str
    output_filename: str
    content_type: str
    render_status: str
    created_at: datetime
    archived_at: datetime | None

    model_config = ConfigDict(from_attributes=True)


class GeneratedDocumentListRead(BaseModel):
    items: list[GeneratedDocumentRead]
