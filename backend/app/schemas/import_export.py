from typing import Literal
from uuid import UUID

from pydantic import BaseModel


class TabularCardWorkbookRequest(BaseModel):
    card_template_id: UUID
    field_ids: list[UUID]
    organization_ids: list[UUID]
    include_organization_column: bool = False
    fixed_organization_id: UUID | None = None


class TabularCardExchangeFieldRead(BaseModel):
    id: str
    label: str
    block_title: str
    field_type: str
    supported: bool
    unsupported_reason: str | None = None


class TabularCardExchangeTemplateRead(BaseModel):
    id: str
    name: str
    fields: list[TabularCardExchangeFieldRead]


class TabularCardExchangeOrganizationRead(BaseModel):
    id: str
    name: str
    label: str


class TabularCardExchangeOptionsRead(BaseModel):
    registry_id: str
    organizations: list[TabularCardExchangeOrganizationRead]
    templates: list[TabularCardExchangeTemplateRead]


class TabularCardImportPreviewSummaryRead(BaseModel):
    total_rows: int
    valid_rows: int
    invalid_rows: int
    would_create_cards: int


class TabularCardImportPreviewRowRead(BaseModel):
    row_number: int
    status: Literal["valid", "invalid"]
    organization_label: str | None
    errors: list[str]


class TabularCardImportPreviewRead(BaseModel):
    format_version: str
    registry_id: str
    summary: TabularCardImportPreviewSummaryRead
    rows: list[TabularCardImportPreviewRowRead]


class TabularCardImportCommitSummaryRead(BaseModel):
    created_cards: int
    field_values_written: int


class TabularCardImportCommitRead(BaseModel):
    format_version: str
    registry_id: str
    summary: TabularCardImportCommitSummaryRead
