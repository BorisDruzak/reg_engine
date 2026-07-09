from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.documents import GeneratedDocumentRead
from app.schemas.registries import FormBlockRead, FormFieldRead


def _default_a4_margin() -> dict[str, float]:
    return {"top": 12.0, "right": 12.0, "bottom": 12.0, "left": 12.0}


def _default_export_formats() -> list[Literal["docx", "pdf"]]:
    return ["docx", "pdf"]


class CardTemplateStructureRead(BaseModel):
    blocks: list[FormBlockRead]
    fields: list[FormFieldRead]


class CardTemplateFormLayoutItemRead(BaseModel):
    id: str
    kind: str = "field"
    field_id: UUID | None = None
    row: int = Field(default=1, ge=1)
    column: int = Field(default=1, ge=1, le=12)
    row_span: int = Field(default=1, ge=1, le=4)
    column_span: int = Field(default=12, ge=1, le=12)
    text: str | None = None


class CardTemplateFormLayoutSectionRead(BaseModel):
    id: str
    block_id: UUID | None = None
    row: int = Field(default=1, ge=1)
    column: int = Field(default=1, ge=1, le=12)
    row_span: int = Field(default=1, ge=1, le=4)
    column_span: int = Field(default=12, ge=1, le=12)
    items: list[CardTemplateFormLayoutItemRead] = Field(default_factory=list)


class CardTemplateFormLayoutRead(BaseModel):
    columns: int = 12
    sections: list[CardTemplateFormLayoutSectionRead] = Field(default_factory=list)


class CardTemplatePrintPageRead(BaseModel):
    format: Literal["A4"] = "A4"
    width_mm: float = 210
    height_mm: float = 297
    margin_mm: dict[str, float] = Field(default_factory=_default_a4_margin)


class CardTemplatePrintViewItemRead(BaseModel):
    id: str
    source_item_id: str | None = None
    kind: str = "field"
    card_template_id: UUID | None = None
    block_id: UUID | None = None
    field_id: UUID | None = None
    page: int = 1
    x_mm: float = 0
    y_mm: float = 0
    width_mm: float = 0
    height_mm: float = 0
    override: bool = False
    sync_status: str = "synced"
    text: str | None = None


class CardTemplatePrintViewRead(BaseModel):
    id: str
    name: str
    is_default: bool
    document_template_id: UUID | None = None
    current_version_id: UUID | None = None
    source: Literal["form_layout"] = "form_layout"
    page: CardTemplatePrintPageRead
    items: list[CardTemplatePrintViewItemRead] = Field(default_factory=list)
    layout_json: dict[str, Any] = Field(default_factory=dict)
    output_filename_template: str = "{{ card.display_name }}.docx"


class CardTemplateLayoutSyncStatusRead(BaseModel):
    has_errors: bool
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    mapping: dict[str, list[str]] = Field(default_factory=dict)


class CardTemplateExportSettingsRead(BaseModel):
    default_print_view_id: str | None = None
    output_filename_template: str = "{{ card.display_name }}.docx"
    formats: list[Literal["docx", "pdf"]] = Field(default_factory=_default_export_formats)


class CardTemplateLayoutRead(BaseModel):
    version: Literal["card_template_layout_v1"] = "card_template_layout_v1"
    revision: str
    card_template_id: UUID
    registry_id: UUID
    structure: CardTemplateStructureRead
    form_layout: CardTemplateFormLayoutRead
    print_views: list[CardTemplatePrintViewRead]
    export_settings: CardTemplateExportSettingsRead
    sync_status: CardTemplateLayoutSyncStatusRead


class CardTemplateLayoutUpdate(BaseModel):
    expected_revision: str
    form_layout: dict[str, Any]


class CardTemplatePrintViewUpdate(BaseModel):
    name: str | None = None
    is_default: bool = True
    layout_json: dict[str, Any]
    output_filename_template: str = "{{ card.display_name }}.docx"


class CardTemplateLayoutProjectionResult(BaseModel):
    print_view: CardTemplatePrintViewRead
    sync_status: CardTemplateLayoutSyncStatusRead


class CardTemplateLayoutGeneratePayload(BaseModel):
    print_view_id: str | None = None
    title: str | None = None


class CardTemplateLayoutGeneratedDocumentRead(BaseModel):
    document: GeneratedDocumentRead
    print_view: CardTemplatePrintViewRead
