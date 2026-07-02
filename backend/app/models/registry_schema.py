from typing import Any
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.domain.constants import FIELD_TYPES, REGISTRY_STATUSES, REQUIRED_MODES
from app.models.base import ArchiveMixin, Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.identity import quoted

DEFAULT_CARD_TITLE_LABEL = "Название карточки"


class Registry(UUIDPrimaryKeyMixin, TimestampMixin, ArchiveMixin, Base):
    __tablename__ = "registries"
    __table_args__ = (
        UniqueConstraint("code", name="uq_registries_code"),
        CheckConstraint(f"lifecycle_status in ({quoted(REGISTRY_STATUSES)})", name="status"),
        CheckConstraint(
            "is_default_for_owner_tree = false or owner_organization_id is not null",
            name="default_owner_requires_owner",
        ),
        Index("ix_registries_code", "code"),
        Index("ix_registries_owner_organization_id", "owner_organization_id"),
        Index(
            "uq_registries_default_owner_tree_active",
            "owner_organization_id",
            unique=True,
            postgresql_where=text("is_default_for_owner_tree = true and archived_at is null"),
        ),
    )

    code: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    card_title_label: Mapped[str] = mapped_column(
        String,
        nullable=False,
        default=DEFAULT_CARD_TITLE_LABEL,
        server_default=DEFAULT_CARD_TITLE_LABEL,
    )
    lifecycle_status: Mapped[str] = mapped_column(String, nullable=False, server_default="active")
    schema_version: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    owner_organization_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=True
    )
    is_default_for_owner_tree: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    display_name_field_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey(
            "form_fields.id",
            name="fk_registries_display_name_field_id_form_fields",
            use_alter=True,
        ),
    )
    display_name_template: Mapped[str | None] = mapped_column(String, nullable=True)
    created_by: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))


class FormBlock(UUIDPrimaryKeyMixin, TimestampMixin, ArchiveMixin, Base):
    __tablename__ = "form_blocks"
    __table_args__ = (
        UniqueConstraint("registry_id", "code", name="uq_form_blocks_registry_id_code"),
        CheckConstraint("min_instances is null or min_instances >= 0", name="min_non_negative"),
        CheckConstraint("max_instances is null or max_instances >= 0", name="max_non_negative"),
        CheckConstraint("layout_columns >= 1 and layout_columns <= 3", name="layout_columns"),
        Index("ix_form_blocks_registry_id", "registry_id"),
    )

    registry_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("registries.id"))
    code: Mapped[str] = mapped_column(String, nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    is_repeatable: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    min_instances: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_instances: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    is_locked: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    is_admin_only: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    public_visible: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    public_editable: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    display_mode: Mapped[str] = mapped_column(String, nullable=False, server_default="section")
    layout_columns: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    created_by: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))


class FormField(UUIDPrimaryKeyMixin, TimestampMixin, ArchiveMixin, Base):
    __tablename__ = "form_fields"
    __table_args__ = (
        UniqueConstraint("block_id", "code", name="uq_form_fields_block_id_code"),
        CheckConstraint(f"field_type in ({quoted(FIELD_TYPES)})", name="field_type"),
        CheckConstraint(f"required_mode in ({quoted(REQUIRED_MODES)})", name="required_mode"),
        Index("ix_form_fields_block_id", "block_id"),
    )

    block_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("form_blocks.id"))
    code: Mapped[str] = mapped_column(String, nullable=False)
    label: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    field_type: Mapped[str] = mapped_column(String, nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    required_mode: Mapped[str] = mapped_column(
        String, nullable=False, server_default="not_required"
    )
    default_value_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    validation_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    options_source_type: Mapped[str | None] = mapped_column(String, nullable=True)
    options_source_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    options_config_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    display_config_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    is_locked: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    is_searchable: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    is_filterable: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    is_sortable: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    is_list_display: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    is_exportable: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    sensitivity_level: Mapped[str] = mapped_column(String, nullable=False, server_default="normal")
    public_visible: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    public_editable: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    replaces_field_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("form_fields.id")
    )
    created_by: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))


class CardTemplate(UUIDPrimaryKeyMixin, TimestampMixin, ArchiveMixin, Base):
    __tablename__ = "card_templates"
    __table_args__ = (
        UniqueConstraint("registry_id", "code", name="uq_card_templates_registry_id_code"),
        CheckConstraint("position >= 0", name="position_non_negative"),
        Index("ix_card_templates_registry_id", "registry_id"),
        Index("ix_card_templates_active_order", "registry_id", "is_active", "position"),
    )

    registry_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("registries.id"))
    code: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    field_schema_json: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
        server_default=text("'{}'::jsonb"),
    )
    default_values_json: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
        server_default=text("'[]'::jsonb"),
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_by: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))
    updated_by: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))
    archived_by: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))
    archive_reason: Mapped[str | None] = mapped_column(String, nullable=True)
