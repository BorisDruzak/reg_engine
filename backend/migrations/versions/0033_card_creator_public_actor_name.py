"""add card creator and public audit identity

Revision ID: 0033_card_creator_actor_name
Revises: 0032_card_change_notifications
Create Date: 2026-07-17
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0033_card_creator_actor_name"
down_revision: str | None = "0032_card_change_notifications"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "cards",
        sa.Column("public_creator_name", sa.String(length=200), nullable=True),
        schema="public",
    )
    op.add_column(
        "audit_events",
        sa.Column("actor_display_name", sa.String(length=200), nullable=True),
        schema="public",
    )


def downgrade() -> None:
    op.drop_column("audit_events", "actor_display_name", schema="public")
    op.drop_column("cards", "public_creator_name", schema="public")
