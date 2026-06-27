from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.domain.constants import CARD_LIFECYCLE_STATUSES, CARD_RELATION_TYPES
from app.models.base import ArchiveMixin, Base, CreatedAtMixin, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.identity import quoted


class Card(UUIDPrimaryKeyMixin, TimestampMixin, ArchiveMixin, Base):
    __tablename__ = "cards"
    __table_args__ = (
        CheckConstraint(
            f"lifecycle_status in ({quoted(CARD_LIFECYCLE_STATUSES)})",
            name="lifecycle_status",
        ),
        Index("ix_cards_registry_id", "registry_id"),
        Index("ix_cards_organization_id", "organization_id"),
        Index("ix_cards_org_unit_id", "org_unit_id"),
        Index("ix_cards_lifecycle_status", "lifecycle_status"),
        Index(
            "ix_cards_registry_organization_status",
            "registry_id",
            "organization_id",
            "lifecycle_status",
        ),
        Index("ix_cards_display_name_lower", text("lower(display_name)")),
    )

    registry_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("registries.id"))
    organization_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("organizations.id")
    )
    org_unit_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("org_units.id")
    )
    display_name: Mapped[str] = mapped_column(String, nullable=False)
    lifecycle_status: Mapped[str] = mapped_column(String, nullable=False, server_default="draft")
    public_view_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    public_edit_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    created_by: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))
    updated_by: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))
    archived_by: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))
    archive_reason: Mapped[str | None] = mapped_column(String, nullable=True)


class CardBlockInstance(UUIDPrimaryKeyMixin, TimestampMixin, ArchiveMixin, Base):
    __tablename__ = "card_block_instances"
    __table_args__ = (
        UniqueConstraint("card_id", "block_id", name="uq_card_block_instances_card_id_block_id"),
        Index("ix_card_block_instances_card_id", "card_id"),
        Index("ix_card_block_instances_block_id", "block_id"),
        Index("ix_card_block_instances_card_block", "card_id", "block_id"),
    )

    card_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("cards.id"))
    block_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("form_blocks.id"))
    ordinal: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    created_by: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))


class FieldValue(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "field_values"
    __table_args__ = (
        UniqueConstraint(
            "card_id", "block_instance_id", "field_id", name="uq_field_values_card_block_field"
        ),
        Index("ix_field_values_card_id", "card_id"),
        Index("ix_field_values_block_instance_id", "block_instance_id"),
        Index("ix_field_values_field_id", "field_id"),
        Index("ix_field_values_field_text", "field_id", "value_text"),
        Index("ix_field_values_field_number", "field_id", "value_number"),
        Index("ix_field_values_field_date", "field_id", "value_date"),
        Index("ix_field_values_field_datetime", "field_id", "value_datetime"),
        Index("ix_field_values_field_bool", "field_id", "value_bool"),
        Index("ix_field_values_field_reference_item", "field_id", "value_reference_item_id"),
        Index("ix_field_values_field_card", "field_id", "value_card_id"),
        Index("ix_field_values_field_user", "field_id", "value_user_id"),
        Index("ix_field_values_field_organization", "field_id", "value_organization_id"),
        Index("ix_field_values_field_org_unit", "field_id", "value_org_unit_id"),
    )

    card_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("cards.id"))
    block_instance_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("card_block_instances.id")
    )
    field_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("form_fields.id"))
    value_text: Mapped[str | None] = mapped_column(String, nullable=True)
    value_number: Mapped[Decimal | None] = mapped_column(Numeric, nullable=True)
    value_date: Mapped[date | None] = mapped_column(nullable=True)
    value_datetime: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    value_bool: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    value_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    value_reference_item_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("reference_items.id")
    )
    value_card_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("cards.id")
    )
    value_user_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id")
    )
    value_organization_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("organizations.id")
    )
    value_org_unit_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("org_units.id")
    )
    value_registry_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("registries.id")
    )
    created_by: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))
    updated_by: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))


class FieldValueItem(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "field_value_items"
    __table_args__ = (
        UniqueConstraint(
            "field_value_id", "reference_item_id", name="uq_field_value_items_value_item"
        ),
        Index("ix_field_value_items_field_value_id", "field_value_id"),
        Index("ix_field_value_items_reference_item_id", "reference_item_id"),
    )

    field_value_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("field_values.id")
    )
    reference_item_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("reference_items.id")
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")


class CardRelation(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "card_relations"
    __table_args__ = (
        UniqueConstraint(
            "source_card_id",
            "target_card_id",
            "relation_type",
            name="uq_card_relations_source_target_type",
        ),
        CheckConstraint(f"relation_type in ({quoted(CARD_RELATION_TYPES)})", name="relation_type"),
        Index("ix_card_relations_source_card_id", "source_card_id"),
        Index("ix_card_relations_target_card_id", "target_card_id"),
    )

    source_card_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("cards.id"))
    target_card_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("cards.id"))
    relation_type: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    created_by: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))
