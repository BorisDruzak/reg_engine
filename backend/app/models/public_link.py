from datetime import datetime
from typing import Any
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
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.domain.constants import PUBLIC_LINK_STATUSES
from app.models.base import Base, CreatedAtMixin, UUIDPrimaryKeyMixin
from app.models.identity import _quoted


class CardPublicLink(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "card_public_links"
    __table_args__ = (
        UniqueConstraint("token_hash", name="uq_card_public_links_token_hash"),
        CheckConstraint(
            f"status in ({_quoted(PUBLIC_LINK_STATUSES)})",
            name="status",
        ),
        CheckConstraint("used_count >= 0", name="used_count_non_negative"),
        Index("ix_card_public_links_card_id", "card_id"),
        Index("ix_card_public_links_token_hash", "token_hash"),
    )

    card_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("cards.id"))
    token_hash: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, server_default="active")
    can_view: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    can_edit: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    max_uses: Mapped[int | None] = mapped_column(Integer, nullable=True)
    used_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    allowed_blocks_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    allowed_fields_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    created_by: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))
    disabled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
