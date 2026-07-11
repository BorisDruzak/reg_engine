from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedAtMixin, UUIDPrimaryKeyMixin


class CardCreationLink(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "card_creation_links"
    __table_args__ = (
        UniqueConstraint("token_hash", name="uq_card_creation_links_token_hash"),
        Index("ix_card_creation_links_registry_id", "registry_id"),
        Index("ix_card_creation_links_template_id", "card_template_id"),
        Index("ix_card_creation_links_token_hash", "token_hash"),
        Index("ix_card_creation_links_closed_at", "closed_at"),
    )

    registry_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("registries.id"))
    card_template_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("card_templates.id")
    )
    token_hash: Mapped[str] = mapped_column(String, nullable=False)
    token_ciphertext: Mapped[str] = mapped_column(Text, nullable=False)
    created_by: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_by: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class CardCreationLinkOrganization(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "card_creation_link_organizations"
    __table_args__ = (
        UniqueConstraint(
            "creation_link_id",
            "organization_id",
            name="uq_card_creation_link_organizations_link_org",
        ),
        Index("ix_card_creation_link_organizations_link_id", "creation_link_id"),
        Index("ix_card_creation_link_organizations_organization_id", "organization_id"),
    )

    creation_link_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("card_creation_links.id")
    )
    organization_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("organizations.id")
    )


class CardCreationLinkCard(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "card_creation_link_cards"
    __table_args__ = (
        UniqueConstraint(
            "creation_link_id",
            "card_id",
            name="uq_card_creation_link_cards_link_card",
        ),
        UniqueConstraint("card_id", name="uq_card_creation_link_cards_card_id"),
        UniqueConstraint("child_public_link_id", name="uq_card_creation_link_cards_child_link_id"),
        Index("ix_card_creation_link_cards_link_id", "creation_link_id"),
        Index("ix_card_creation_link_cards_card_id", "card_id"),
    )

    creation_link_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("card_creation_links.id")
    )
    card_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("cards.id"))
    child_public_link_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("card_public_links.id")
    )
    child_token_ciphertext: Mapped[str] = mapped_column(Text, nullable=False)
