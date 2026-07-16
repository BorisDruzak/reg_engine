"""add card change notification storage

Revision ID: 0032_card_change_notifications
Revises: 0031_card_audit_history
Create Date: 2026-07-16
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0032_card_change_notifications"
down_revision: str | None = "0031_card_audit_history"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "card_change_notification_subscriptions",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("card_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            postgresql.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["card_id"], ["cards.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "card_id", name="uq_card_change_notification_subscription"),
        schema="public",
    )
    op.create_index(
        "ix_card_change_notification_subscription_card",
        "card_change_notification_subscriptions",
        ["card_id"],
        schema="public",
    )
    op.create_table(
        "public_link_change_notification_subscriptions",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("public_link_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            postgresql.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["public_link_id"], ["card_public_links.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "public_link_id",
            name="uq_public_link_change_notification_subscription",
        ),
        schema="public",
    )
    op.create_index(
        "ix_public_link_change_notification_subscription_link",
        "public_link_change_notification_subscriptions",
        ["public_link_id"],
        schema="public",
    )
    op.create_table(
        "card_change_notifications",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("card_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("actor_display_name", sa.String(), nullable=False),
        sa.Column("changes_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("read_at", postgresql.TIMESTAMP(timezone=True), nullable=True),
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            postgresql.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["card_id"], ["cards.id"]),
        sa.PrimaryKeyConstraint("id"),
        schema="public",
    )
    op.create_index(
        "ix_card_change_notifications_inbox",
        "card_change_notifications",
        ["user_id", "read_at", "created_at"],
        schema="public",
    )
    op.create_index(
        "ix_card_change_notifications_retention",
        "card_change_notifications",
        ["created_at"],
        schema="public",
    )


def downgrade() -> None:
    op.drop_index(
        "ix_card_change_notifications_retention",
        table_name="card_change_notifications",
        schema="public",
    )
    op.drop_index(
        "ix_card_change_notifications_inbox",
        table_name="card_change_notifications",
        schema="public",
    )
    op.drop_table("card_change_notifications", schema="public")
    op.drop_index(
        "ix_public_link_change_notification_subscription_link",
        table_name="public_link_change_notification_subscriptions",
        schema="public",
    )
    op.drop_table("public_link_change_notification_subscriptions", schema="public")
    op.drop_index(
        "ix_card_change_notification_subscription_card",
        table_name="card_change_notification_subscriptions",
        schema="public",
    )
    op.drop_table("card_change_notification_subscriptions", schema="public")
