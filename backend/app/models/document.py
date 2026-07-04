from uuid import UUID

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.domain.constants import DOCUMENT_TEMPLATE_FORMATS, GENERATED_DOCUMENT_STATUSES
from app.models.base import ArchiveMixin, Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.identity import quoted


class DocumentTemplate(UUIDPrimaryKeyMixin, TimestampMixin, ArchiveMixin, Base):
    __tablename__ = "document_templates"
    __table_args__ = (
        UniqueConstraint("registry_id", "code", name="uq_document_templates_registry_id_code"),
        CheckConstraint(
            f"template_format in ({quoted(DOCUMENT_TEMPLATE_FORMATS)})",
            name="template_format",
        ),
        Index("ix_document_templates_registry_id", "registry_id"),
        Index("ix_document_templates_card_template_id", "card_template_id"),
        Index("ix_document_templates_registry_archive", "registry_id", "archived_at"),
    )

    registry_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("registries.id"), nullable=False
    )
    card_template_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("card_templates.id"),
        nullable=True,
    )
    code: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    template_format: Mapped[str] = mapped_column(
        String,
        nullable=False,
        server_default="docx_text_v1",
    )
    template_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    output_filename_template: Mapped[str] = mapped_column(
        String, nullable=False, server_default="{{ card.display_name }}.docx"
    )
    output_content_type: Mapped[str] = mapped_column(
        String,
        nullable=False,
        server_default="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_by: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    updated_by: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))
    archived_by: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))
    archive_reason: Mapped[str | None] = mapped_column(String, nullable=True)


class DocumentTemplateVersion(UUIDPrimaryKeyMixin, TimestampMixin, ArchiveMixin, Base):
    __tablename__ = "document_template_versions"
    __table_args__ = (
        UniqueConstraint(
            "template_id",
            "version_number",
            name="uq_document_template_versions_template_version",
        ),
        CheckConstraint("version_number > 0", name="version_number_positive"),
        CheckConstraint(
            f"template_format in ({quoted(DOCUMENT_TEMPLATE_FORMATS)})",
            name="template_format",
        ),
        CheckConstraint(
            "template_format != 'docx_binary_v1' OR stored_file_id IS NOT NULL",
            name="storage_for_binary",
        ),
        CheckConstraint(
            "template_format != 'docx_text_v1' OR template_body IS NOT NULL",
            name="body_for_text",
        ),
        CheckConstraint(
            "template_format != 'card_print_layout_v1' OR layout_json IS NOT NULL",
            name="layout_for_card_print",
        ),
        Index("ix_document_template_versions_template_id", "template_id"),
        Index("ix_document_template_versions_stored_file_id", "stored_file_id"),
        Index("ix_document_template_versions_template_active", "template_id", "archived_at"),
    )

    template_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("document_templates.id"), nullable=False
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    template_format: Mapped[str] = mapped_column(
        String,
        nullable=False,
        server_default="docx_text_v1",
    )
    template_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    layout_json: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)
    stored_file_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("stored_files.id"), nullable=True
    )
    original_filename: Mapped[str | None] = mapped_column(String, nullable=True)
    content_type: Mapped[str | None] = mapped_column(String, nullable=True)
    content_length_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    created_by: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    archived_by: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))
    archive_reason: Mapped[str | None] = mapped_column(String, nullable=True)


class GeneratedDocument(UUIDPrimaryKeyMixin, TimestampMixin, ArchiveMixin, Base):
    __tablename__ = "generated_documents"
    __table_args__ = (
        CheckConstraint(
            f"render_status in ({quoted(GENERATED_DOCUMENT_STATUSES)})",
            name="render_status",
        ),
        Index("ix_generated_documents_card_id", "card_id"),
        Index("ix_generated_documents_template_id", "template_id"),
        Index("ix_generated_documents_template_version_id", "template_version_id"),
        Index("ix_generated_documents_stored_file_id", "stored_file_id"),
        Index("ix_generated_documents_card_archive", "card_id", "archived_at"),
    )

    card_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("cards.id"))
    template_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("document_templates.id")
    )
    template_version_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("document_template_versions.id")
    )
    stored_file_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("stored_files.id")
    )
    title: Mapped[str] = mapped_column(String, nullable=False)
    output_filename: Mapped[str] = mapped_column(String, nullable=False)
    content_type: Mapped[str] = mapped_column(String, nullable=False)
    render_status: Mapped[str] = mapped_column(String, nullable=False, server_default="generated")
    generated_by: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    archived_by: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))
    archive_reason: Mapped[str | None] = mapped_column(String, nullable=True)
