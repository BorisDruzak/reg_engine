from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedAtMixin, UUIDPrimaryKeyMixin


class CardChangeNotificationSubscription(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "card_change_notification_subscriptions"
    __table_args__ = (
        UniqueConstraint("user_id", "card_id", name="uq_card_change_notification_subscription"),
        Index("ix_card_change_notification_subscription_card", "card_id"),
    )

    user_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))
    card_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("cards.id"))


class PublicLinkChangeNotificationSubscription(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "public_link_change_notification_subscriptions"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "public_link_id",
            name="uq_public_link_change_notification_subscription",
        ),
        Index("ix_public_link_change_notification_subscription_link", "public_link_id"),
    )

    user_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))
    public_link_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("card_public_links.id")
    )


class CardChangeNotification(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "card_change_notifications"
    __table_args__ = (
        Index("ix_card_change_notifications_inbox", "user_id", "read_at", "created_at"),
        Index("ix_card_change_notifications_retention", "created_at"),
    )

    user_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))
    card_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("cards.id"))
    actor_display_name: Mapped[str] = mapped_column(String, nullable=False)
    changes_json: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
