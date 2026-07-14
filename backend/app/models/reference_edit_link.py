from datetime import datetime
from uuid import UUID

from sqlalchemy import ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class ReferenceEditLink(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "reference_edit_links"
    __table_args__ = (
        Index("ix_reference_edit_links_registry_id", "registry_id"),
        Index("ix_reference_edit_links_owner_organization_id", "owner_organization_id"),
        Index("ix_reference_edit_links_creator_id", "created_by"),
    )

    registry_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("registries.id"))
    owner_organization_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("organizations.id")
    )
    token_hash: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    expires_at: Mapped[datetime | None] = mapped_column(nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(nullable=True)
    created_by: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))
