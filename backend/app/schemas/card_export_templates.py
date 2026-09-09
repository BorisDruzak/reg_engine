from datetime import date, datetime
from typing import Any, Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

ExportKind = Literal["card_list", "personnel_changes"]


class OrganizationScopedExportConfiguration(BaseModel):
    model_config = ConfigDict(extra="forbid")
    organization_ids: list[UUID] = Field(min_length=1, max_length=512)

    @model_validator(mode="after")
    def reject_duplicate_organizations(self) -> Self:
        if len(set(self.organization_ids)) != len(self.organization_ids):
            raise ValueError("Организации шаблона выгрузки не должны повторяться.")
        return self


class CardListExportConfiguration(OrganizationScopedExportConfiguration):
    field_ids: list[UUID] = Field(min_length=1, max_length=256)


class PersonnelChangesExportConfiguration(OrganizationScopedExportConfiguration):
    position_field_id: UUID
    structural_unit_field_id: UUID
    appointment_date_field_id: UUID
    appointment_basis_field_id: UUID


class CardExportTemplateCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    code: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=255)
    export_kind: ExportKind
    card_template_id: UUID
    configuration_json: dict[str, Any]


class CardExportTemplateUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    code: str | None = Field(default=None, min_length=1, max_length=100)
    name: str | None = Field(default=None, min_length=1, max_length=255)
    export_kind: ExportKind | None = None
    card_template_id: UUID | None = None
    configuration_json: dict[str, Any] | None = None

    @model_validator(mode="after")
    def reject_explicit_null(self) -> Self:
        if any(getattr(self, key) is None for key in self.model_fields_set):
            raise ValueError("Параметры шаблона не могут быть пустыми.")
        return self


class CardExportTemplateRead(CardExportTemplateCreate):
    id: UUID
    registry_id: UUID
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None


class CardExportTemplateListRead(BaseModel):
    items: list[CardExportTemplateRead]


class CardExportDownloadRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    organization_id: UUID | None = None
    period_from: date | None = None
    period_to: date | None = None
