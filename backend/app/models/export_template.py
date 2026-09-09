from typing import Any
from uuid import UUID

from sqlalchemy import ForeignKey, Index, String, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import ArchiveMixin, Base, TimestampMixin, UUIDPrimaryKeyMixin


class CardExportTemplate(UUIDPrimaryKeyMixin, TimestampMixin, ArchiveMixin, Base):
    __tablename__ = "card_export_templates"
    __table_args__ = (
        UniqueConstraint("registry_id", "code", name="uq_card_export_templates_registry_id_code"),
        Index("ix_card_export_templates_registry_id", "registry_id"),
        Index("ix_card_export_templates_registry_archive", "registry_id", "archived_at"),
    )

    registry_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("registries.id"), nullable=False
    )
    code: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    export_kind: Mapped[str] = mapped_column(String, nullable=False)
    configuration_json: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
        server_default=text("'{}'::jsonb"),
    )
    created_by: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))
    updated_by: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))
    archived_by: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))
    archive_reason: Mapped[str | None] = mapped_column(String, nullable=True)
