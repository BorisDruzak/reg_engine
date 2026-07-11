"""add card public field settings

Revision ID: 0024_card_public_access
Revises: 0023_public_link_review
Create Date: 2026-07-11
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0024_card_public_access"
down_revision: str | None = "0023_public_link_review"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "card_public_field_settings",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("card_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("field_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("public_visible", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("public_editable", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["card_id"],
            ["cards.id"],
            name=op.f("fk_card_public_field_settings_card_id_cards"),
        ),
        sa.ForeignKeyConstraint(
            ["field_id"],
            ["form_fields.id"],
            name=op.f("fk_card_public_field_settings_field_id_form_fields"),
        ),
        sa.ForeignKeyConstraint(
            ["updated_by"],
            ["users.id"],
            name=op.f("fk_card_public_field_settings_updated_by_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_card_public_field_settings")),
        sa.UniqueConstraint("card_id", "field_id", name="uq_card_public_field_settings_card_field"),
        schema="public",
    )
    op.create_index(
        "ix_card_public_field_settings_card_id",
        "card_public_field_settings",
        ["card_id"],
        schema="public",
    )
    op.create_index(
        "ix_card_public_field_settings_field_id",
        "card_public_field_settings",
        ["field_id"],
        schema="public",
    )


def downgrade() -> None:
    op.drop_index(
        "ix_card_public_field_settings_field_id",
        table_name="card_public_field_settings",
        schema="public",
    )
    op.drop_index(
        "ix_card_public_field_settings_card_id",
        table_name="card_public_field_settings",
        schema="public",
    )
    op.drop_table("card_public_field_settings", schema="public")
