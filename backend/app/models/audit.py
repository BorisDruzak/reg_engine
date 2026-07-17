from typing import Any
from uuid import UUID

from sqlalchemy import CheckConstraint, ForeignKey, Index, String, text
from sqlalchemy.dialects.postgresql import INET, JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.domain.constants import AUDIT_ACTOR_TYPES, AUDIT_RETENTION_CLASSES, AUDIT_SOURCES
from app.models.base import Base, CreatedAtMixin, UUIDPrimaryKeyMixin
from app.models.identity import quoted


class AuditEvent(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "audit_events"
    __table_args__ = (
        CheckConstraint(f"actor_type in ({quoted(AUDIT_ACTOR_TYPES)})", name="actor_type"),
        CheckConstraint(
            f"retention_class in ({quoted(AUDIT_RETENTION_CLASSES)})",
            name="retention_class",
        ),
        CheckConstraint(f"source in ({quoted(AUDIT_SOURCES)})", name="source"),
        Index("ix_audit_events_actor_user_id", "actor_user_id"),
        Index("ix_audit_events_actor_public_link_id", "actor_public_link_id"),
        Index("ix_audit_events_actor_reference_edit_link_id", "actor_reference_edit_link_id"),
        Index("ix_audit_events_object", "object_type", "object_id"),
        Index("ix_audit_events_action", "action"),
        Index("ix_audit_events_source", "source"),
        Index("ix_audit_events_created_at", "created_at"),
        Index("ix_audit_events_card_history", "retention_class", "card_id", "created_at"),
        Index("ix_audit_events_retention", "retention_class", "created_at"),
        Index("ix_audit_events_request_id", "request_id"),
    )

    actor_type: Mapped[str] = mapped_column(String, nullable=False)
    actor_user_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id")
    )
    actor_public_link_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("card_public_links.id")
    )
    actor_reference_edit_link_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("reference_edit_links.id")
    )
    actor_display_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    action: Mapped[str] = mapped_column(String, nullable=False)
    object_type: Mapped[str] = mapped_column(String, nullable=False)
    object_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    card_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("cards.id"))
    attributed_user_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id")
    )
    retention_class: Mapped[str] = mapped_column(
        String,
        nullable=False,
        default="technical",
        server_default=text("'technical'"),
    )
    old_data_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    new_data_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    source: Mapped[str] = mapped_column(String, nullable=False)
    ip_address: Mapped[str | None] = mapped_column(INET, nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String, nullable=True)
    request_id: Mapped[str | None] = mapped_column(String, nullable=True)
