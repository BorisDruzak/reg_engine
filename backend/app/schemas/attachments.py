from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class AttachmentRead(BaseModel):
    id: UUID
    card_id: UUID
    stored_file_id: UUID
    title: str
    description: str | None
    position: int
    original_filename: str
    content_type: str
    content_length_bytes: int
    checksum_sha256: str
    scanner_status: str
    created_at: datetime
    archived_at: datetime | None

    model_config = ConfigDict(from_attributes=True)


class AttachmentListRead(BaseModel):
    items: list[AttachmentRead]
