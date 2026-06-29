from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.domain.constants import REPORT_OUTPUT_FORMATS, REPORT_RUN_STATUSES, REPORT_TYPES
from app.models.base import ArchiveMixin, Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.identity import quoted


class ReportTemplate(UUIDPrimaryKeyMixin, TimestampMixin, ArchiveMixin, Base):
    __tablename__ = "report_templates"
    __table_args__ = (
        UniqueConstraint("registry_id", "code", name="uq_report_templates_registry_id_code"),
        CheckConstraint(
            f"report_type in ({quoted(REPORT_TYPES)})",
            name="report_type",
        ),
        CheckConstraint(
            f"output_format in ({quoted(REPORT_OUTPUT_FORMATS)})",
            name="output_format",
        ),
        Index("ix_report_templates_registry_id", "registry_id"),
        Index("ix_report_templates_registry_archive", "registry_id", "archived_at"),
    )

    registry_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("registries.id"), nullable=False
    )
    code: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    report_type: Mapped[str] = mapped_column(String, nullable=False)
    parameters_schema_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    default_parameters_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    output_format: Mapped[str] = mapped_column(String, nullable=False, server_default="json")
    is_active: Mapped[bool] = mapped_column(nullable=False, server_default="true")
    created_by: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    updated_by: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))
    archived_by: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))
    archive_reason: Mapped[str | None] = mapped_column(String, nullable=True)


class ReportRun(UUIDPrimaryKeyMixin, TimestampMixin, ArchiveMixin, Base):
    __tablename__ = "report_runs"
    __table_args__ = (
        CheckConstraint(
            f"report_type in ({quoted(REPORT_TYPES)})",
            name="report_type",
        ),
        CheckConstraint(
            f"run_status in ({quoted(REPORT_RUN_STATUSES)})",
            name="status",
        ),
        CheckConstraint("row_count >= 0", name="row_count_non_negative"),
        CheckConstraint(
            "run_status != 'generated' OR stored_file_id IS NOT NULL",
            name="generated_requires_storage",
        ),
        Index("ix_report_runs_template_id", "report_template_id"),
        Index("ix_report_runs_registry_id", "registry_id"),
        Index("ix_report_runs_card_id", "card_id"),
        Index("ix_report_runs_stored_file_id", "stored_file_id"),
        Index("ix_report_runs_registry_created_at", "registry_id", "created_at"),
    )

    report_template_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("report_templates.id"), nullable=False
    )
    registry_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("registries.id"), nullable=False
    )
    card_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("cards.id"), nullable=True
    )
    stored_file_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("stored_files.id"), nullable=True
    )
    report_type: Mapped[str] = mapped_column(String, nullable=False)
    run_status: Mapped[str] = mapped_column(String, nullable=False, server_default="generated")
    parameters_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    summary_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    row_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    output_filename: Mapped[str] = mapped_column(String, nullable=False)
    output_content_type: Mapped[str] = mapped_column(String, nullable=False)
    generated_by: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    finished_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    archived_by: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))
    archive_reason: Mapped[str | None] = mapped_column(String, nullable=True)
