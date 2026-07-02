"""add card templates

Revision ID: 0018_card_templates
Revises: 0017_registry_card_title_label
Create Date: 2026-07-02
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0018_card_templates"
down_revision: str | None = "0017_registry_card_title_label"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "card_templates",
        sa.Column(
            "registry_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("public.registries.id"),
            nullable=False,
        ),
        sa.Column("code", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("position", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "field_schema_json",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "default_values_json",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("public.users.id"),
            nullable=True,
        ),
        sa.Column(
            "updated_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("public.users.id"),
            nullable=True,
        ),
        sa.Column(
            "archived_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("public.users.id"),
            nullable=True,
        ),
        sa.Column("archive_reason", sa.String(), nullable=True),
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
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("position >= 0", name="position_non_negative"),
        sa.PrimaryKeyConstraint("id", name="pk_card_templates"),
        sa.UniqueConstraint(
            "registry_id",
            "code",
            name="uq_card_templates_registry_id_code",
        ),
        schema="public",
    )
    op.create_index(
        "ix_card_templates_registry_id",
        "card_templates",
        ["registry_id"],
        schema="public",
    )
    op.create_index(
        "ix_card_templates_active_order",
        "card_templates",
        ["registry_id", "is_active", "position"],
        schema="public",
    )
    op.add_column(
        "cards",
        sa.Column(
            "card_template_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("public.card_templates.id"),
            nullable=True,
        ),
        schema="public",
    )
    op.create_index(
        "ix_cards_card_template_id",
        "cards",
        ["card_template_id"],
        schema="public",
    )


def downgrade() -> None:
    op.drop_index("ix_cards_card_template_id", table_name="cards", schema="public")
    op.drop_column("cards", "card_template_id", schema="public")
    op.drop_index(
        "ix_card_templates_active_order",
        table_name="card_templates",
        schema="public",
    )
    op.drop_index(
        "ix_card_templates_registry_id",
        table_name="card_templates",
        schema="public",
    )
    op.drop_table("card_templates", schema="public")
