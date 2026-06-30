from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class ReportTemplateCreate(BaseModel):
    code: str
    name: str
    report_type: str
    description: str | None = None
    parameters_schema_json: dict[str, Any] | None = None
    default_parameters_json: dict[str, Any] | None = None
    output_format: str = "json"


class ReportTemplateUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    parameters_schema_json: dict[str, Any] | None = None
    default_parameters_json: dict[str, Any] | None = None


class ReportTemplateRead(BaseModel):
    id: UUID
    registry_id: UUID
    code: str
    name: str
    description: str | None
    report_type: str
    parameters_schema_json: dict[str, Any] | None
    default_parameters_json: dict[str, Any] | None
    output_format: str
    is_active: bool
    created_at: datetime
    archived_at: datetime | None

    model_config = ConfigDict(from_attributes=True)


class ReportTemplateListRead(BaseModel):
    items: list[ReportTemplateRead]


class ReportRunCreate(BaseModel):
    parameters: dict[str, Any] | None = None


class ReportRunRead(BaseModel):
    id: UUID
    report_template_id: UUID
    registry_id: UUID
    card_id: UUID | None
    report_type: str
    run_status: str
    parameters_json: dict[str, Any] | None
    summary_json: dict[str, Any] | None
    row_count: int
    output_filename: str
    output_content_type: str
    generated_by: UUID
    started_at: datetime
    finished_at: datetime
    created_at: datetime
    archived_at: datetime | None

    model_config = ConfigDict(from_attributes=True)


class ReportRunListRead(BaseModel):
    items: list[ReportRunRead]
