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


class CardImportCommitRequest(BaseModel):
    csv_content: str


class CardImportCommitSummaryRead(BaseModel):
    total_rows: int
    committed_rows: int
    created_cards: int
    updated_cards: int
    field_values_written: int


class CardImportCommitCardRead(BaseModel):
    card_id: str
    action: Literal["create", "update"]
    import_key: str | None


class CardImportCommitRead(BaseModel):
    format_version: str
    registry_id: str
    summary: CardImportCommitSummaryRead
    cards: list[CardImportCommitCardRead]
