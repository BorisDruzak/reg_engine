from typing import Any, Literal

from pydantic import BaseModel


class CardImportPreviewRequest(BaseModel):
    csv_content: str


class CardImportPreviewSummaryRead(BaseModel):
    total_rows: int
    valid_rows: int
    invalid_rows: int
    would_create_rows: int
    would_update_rows: int


class CardImportPreviewRowRead(BaseModel):
    row_number: int
    status: Literal["valid", "invalid"]
    action: Literal["create", "update"]
    card_id: str | None
    organization_id: str | None
    display_name: str | None
    field_path: str
    field_type: str | None
    raw_value: str
    parsed_value: Any
    errors: list[str]


class CardImportPreviewRead(BaseModel):
    format_version: str
    registry_id: str
    summary: CardImportPreviewSummaryRead
    rows: list[CardImportPreviewRowRead]
