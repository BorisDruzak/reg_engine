from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, Index, Integer, String, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import ArchiveMixin, Base, TimestampMixin, UUIDPrimaryKeyMixin


class ReferenceList(UUIDPrimaryKeyMixin, TimestampMixin, ArchiveMixin, Base):
    __tablename__ = "reference_lists"
    __table_args__ = (
        UniqueConstraint(
            "registry_id",
            "owner_organization_id",
            "code",
            name="uq_reference_lists_registry_owner_code",
        ),
        Index(
            "uq_reference_lists_registry_owner_code_scope",
            text("coalesce(registry_id, '00000000-0000-0000-0000-000000000000'::uuid)"),
            text("coalesce(owner_organization_id, '00000000-0000-0000-0000-000000000000'::uuid)"),
            "code",
            unique=True,
        ),
        Index("ix_reference_lists_registry_id", "registry_id"),
        Index("ix_reference_lists_owner_organization_id", "owner_organization_id"),
    )

    registry_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("registries.id")
    )
    owner_organization_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("organizations.id")
    )
    code: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    scope_mode: Mapped[str] = mapped_column(String, nullable=False, server_default="global")
    inherit_to_descendants: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="true"
    )
    locked_for_descendants: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="true"
    )
    managed_by_system_only: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_by: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))
    created_via_reference_edit_link_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("reference_edit_links.id")
    )


class ReferenceItem(UUIDPrimaryKeyMixin, TimestampMixin, ArchiveMixin, Base):
    __tablename__ = "reference_items"
    __table_args__ = (
        UniqueConstraint("list_id", "code", name="uq_reference_items_list_id_code"),
        Index("ix_reference_items_list_id", "list_id"),
        Index("ix_reference_items_parent_id", "parent_id"),
    )

    list_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("reference_lists.id"))
    parent_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("reference_items.id")
    )
    code: Mapped[str] = mapped_column(String, nullable=False)
    label: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_by: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))
