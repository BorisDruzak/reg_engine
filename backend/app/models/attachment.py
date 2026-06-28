from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.domain.constants import MALWARE_SCANNER_STATUSES
from app.models.base import ArchiveMixin, Base, CreatedAtMixin, UUIDPrimaryKeyMixin
from app.models.identity import quoted


class StoredFile(UUIDPrimaryKeyMixin, CreatedAtMixin, ArchiveMixin, Base):
    __tablename__ = "stored_files"
    __table_args__ = (
        CheckConstraint("content_length_bytes > 0", name="content_length_positive"),
        CheckConstraint(
            f"scanner_status in ({quoted(MALWARE_SCANNER_STATUSES)})",
            name="scanner_status",
        ),
        Index("ix_stored_files_checksum_sha256", "checksum_sha256"),
        Index("ix_stored_files_created_by", "created_by"),
    )

    storage_backend: Mapped[str] = mapped_column(
        String, nullable=False, server_default="local_filesystem"
    )
    storage_key: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    original_filename: Mapped[str] = mapped_column(String, nullable=False)
    content_type: Mapped[str] = mapped_column(String, nullable=False)
    content_length_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    checksum_sha256: Mapped[str] = mapped_column(String, nullable=False)
    scanner_status: Mapped[str] = mapped_column(String, nullable=False, server_default="deferred")
    scanner_checked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    scanner_details_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    created_by: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    archived_by: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))
    archive_reason: Mapped[str | None] = mapped_column(String, nullable=True)


class CardAttachment(UUIDPrimaryKeyMixin, CreatedAtMixin, ArchiveMixin, Base):
    __tablename__ = "card_attachments"
    __table_args__ = (
        CheckConstraint("position >= 0", name="position_non_negative"),
        Index("ix_card_attachments_card_id", "card_id"),
        Index("ix_card_attachments_stored_file_id", "stored_file_id"),
        Index("ix_card_attachments_card_archive", "card_id", "archived_at"),
    )

    card_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("cards.id"), nullable=False
    )
    stored_file_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("stored_files.id"), nullable=False
    )
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    created_by: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    archived_by: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))
    archive_reason: Mapped[str | None] = mapped_column(String, nullable=True)
