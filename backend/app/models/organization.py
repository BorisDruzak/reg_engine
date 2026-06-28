from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import ArchiveMixin, Base, CreatedAtMixin, TimestampMixin, UUIDPrimaryKeyMixin


class Organization(UUIDPrimaryKeyMixin, TimestampMixin, ArchiveMixin, Base):
    __tablename__ = "organizations"
    __table_args__ = (
        UniqueConstraint("code", name="uq_organizations_code"),
        CheckConstraint("parent_id is null or parent_id <> id", name="parent_not_self"),
        Index("ix_organizations_parent_id", "parent_id"),
        Index("ix_organizations_code", "code"),
        Index("ix_organizations_is_active", "is_active"),
        Index("ix_organizations_archived_at", "archived_at"),
    )

    parent_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("organizations.id")
    )
    code: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    type: Mapped[str] = mapped_column(String, nullable=False, server_default="organization")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_by: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))


class OrganizationClosure(Base):
    __tablename__ = "organization_closure"
    __table_args__ = (
        CheckConstraint("depth >= 0", name="depth_non_negative"),
        Index("ix_organization_closure_descendant_id", "descendant_id"),
    )

    ancestor_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("organizations.id"),
        primary_key=True,
    )
    descendant_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("organizations.id"),
        primary_key=True,
    )
    depth: Mapped[int] = mapped_column(Integer, nullable=False)


class OrgUnit(UUIDPrimaryKeyMixin, TimestampMixin, ArchiveMixin, Base):
    __tablename__ = "org_units"
    __table_args__ = (
        UniqueConstraint("organization_id", "code", name="uq_org_units_organization_id_code"),
        Index("ix_org_units_organization_id", "organization_id"),
        Index("ix_org_units_parent_id", "parent_id"),
        Index("ix_org_units_is_active", "is_active"),
    )

    organization_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("organizations.id")
    )
    parent_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("org_units.id")
    )
    code: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    type: Mapped[str | None] = mapped_column(String, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_by: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))


class AccessGrant(UUIDPrimaryKeyMixin, CreatedAtMixin, ArchiveMixin, Base):
    __tablename__ = "access_grants"
    __table_args__ = (
        Index(
            "uq_access_grants_user_role_registry_organization_scope",
            "user_id",
            "role_id",
            text("coalesce(registry_id, '00000000-0000-0000-0000-000000000000'::uuid)"),
            text("coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid)"),
            unique=True,
        ),
        Index("ix_access_grants_user_id", "user_id"),
        Index("ix_access_grants_role_id", "role_id"),
        Index("ix_access_grants_registry_id", "registry_id"),
        Index("ix_access_grants_organization_id", "organization_id"),
        Index("ix_access_grants_include_descendants", "include_descendants"),
        Index("ix_access_grants_valid_range", "valid_from", "valid_to"),
    )

    user_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))
    role_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("roles.id"))
    registry_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("registries.id")
    )
    organization_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("organizations.id")
    )
    include_descendants: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="true"
    )
    valid_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    valid_to: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))
