from datetime import date
from typing import Any
from uuid import UUID

from sqlalchemy import CheckConstraint, Date, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.domain.constants import CARD_EVENT_TYPES
from app.models.base import Base, CreatedAtMixin, UUIDPrimaryKeyMixin
from app.models.identity import quoted


class CardEvent(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "card_events"
    __table_args__ = (
        CheckConstraint(f"event_type in ({quoted(CARD_EVENT_TYPES)})", name="event_type"),
        Index("ix_card_events_card_occurred_on", "card_id", "occurred_on"),
        Index("ix_card_events_created_by", "created_by"),
    )

    card_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("cards.id"))
    event_type: Mapped[str] = mapped_column(String, nullable=False)
    occurred_on: Mapped[date] = mapped_column(Date, nullable=False)
    basis_text: Mapped[str] = mapped_column(String, nullable=False)
    created_by: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))


class CardEventChange(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "card_event_changes"
    __table_args__ = (
        Index("ix_card_event_changes_card_event_id", "card_event_id"),
        Index("ix_card_event_changes_field_id", "field_id"),
    )

    card_event_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("card_events.id"))
    field_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("form_fields.id"))
    old_value_json: Mapped[Any | None] = mapped_column(JSONB, nullable=True)
    new_value_json: Mapped[Any | None] = mapped_column(JSONB, nullable=True)
