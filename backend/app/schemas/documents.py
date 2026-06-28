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
    created_at: datetime
    archived_at: datetime | None

    model_config = ConfigDict(from_attributes=True)


class DocumentTemplateListRead(BaseModel):
    items: list[DocumentTemplateRead]


class GeneratedDocumentCreate(BaseModel):
    template_id: UUID
    title: str | None = None


class GeneratedDocumentRead(BaseModel):
    id: UUID
    card_id: UUID
    template_id: UUID
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
