"""add card events and export template persistence

Revision ID: 0034_card_events_exports_fio
Revises: 0033_card_creator_actor_name
Create Date: 2026-09-09
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0034_card_events_exports_fio"
down_revision: str | None = "0033_card_creator_actor_name"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "card_events",
        sa.Column("card_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_type", sa.String(), nullable=False),
        sa.Column("occurred_on", sa.Date(), nullable=False),
        sa.Column("basis_text", sa.String(), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
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
        sa.CheckConstraint("event_type in ('change', 'dismissal')", name="event_type"),
        sa.ForeignKeyConstraint(["card_id"], ["cards.id"]),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        schema="public",
    )
    op.create_index(
        "ix_card_events_card_occurred_on",
        "card_events",
        ["card_id", "occurred_on"],
        schema="public",
    )
    op.create_index("ix_card_events_created_by", "card_events", ["created_by"], schema="public")

    op.create_table(
        "card_event_changes",
        sa.Column("card_event_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("field_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("old_value_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("new_value_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["card_event_id"], ["card_events.id"]),
        sa.ForeignKeyConstraint(["field_id"], ["form_fields.id"]),
        sa.PrimaryKeyConstraint("id"),
        schema="public",
    )
    op.create_index(
        "ix_card_event_changes_card_event_id",
        "card_event_changes",
        ["card_event_id"],
        schema="public",
    )
    op.create_index(
        "ix_card_event_changes_field_id", "card_event_changes", ["field_id"], schema="public"
    )

    op.create_table(
        "card_export_templates",
        sa.Column("registry_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("code", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("export_kind", sa.String(), nullable=False),
        sa.Column(
            "configuration_json",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("archived_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("archive_reason", sa.String(), nullable=True),
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
        sa.Column(
            "updated_at",
            postgresql.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("archived_at", postgresql.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["registry_id"], ["registries.id"]),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["archived_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "registry_id", "code", name="uq_card_export_templates_registry_id_code"
        ),
        schema="public",
    )
    op.create_index(
        "ix_card_export_templates_registry_id",
        "card_export_templates",
        ["registry_id"],
        schema="public",
    )
    op.create_index(
        "ix_card_export_templates_registry_archive",
        "card_export_templates",
        ["registry_id", "archived_at"],
        schema="public",
    )

    op.execute("ALTER TABLE public.cards DROP CONSTRAINT IF EXISTS ck_cards_lifecycle_status")
    op.create_check_constraint(
        "lifecycle_status",
        "cards",
        "lifecycle_status in ('draft', 'active', 'dismissed', 'archived', 'superseded')",
        schema="public",
    )
    op.drop_index("ix_cards_display_name_lower", table_name="cards", schema="public")
    op.drop_column("cards", "display_name", schema="public")
    op.drop_column("registries", "card_title_label", schema="public")
    op.execute(
        "UPDATE public.audit_events "
        "SET old_data_json = old_data_json - 'display_name', "
        "new_data_json = new_data_json - 'display_name'"
    )


def downgrade() -> None:
    op.add_column(
        "registries",
        sa.Column(
            "card_title_label",
            sa.String(),
            server_default="Название карточки",
            nullable=False,
        ),
        schema="public",
    )
    op.add_column(
        "cards",
        sa.Column("display_name", sa.String(), server_default="", nullable=False),
        schema="public",
    )
    op.create_index(
        "ix_cards_display_name_lower",
        "cards",
        [sa.text("lower(display_name)")],
        schema="public",
    )
    op.execute("ALTER TABLE public.cards DROP CONSTRAINT IF EXISTS ck_cards_lifecycle_status")
    op.create_check_constraint(
        "lifecycle_status",
        "cards",
        "lifecycle_status in ('draft', 'active', 'archived', 'superseded')",
        schema="public",
    )

    op.drop_index(
        "ix_card_export_templates_registry_archive",
        table_name="card_export_templates",
        schema="public",
    )
    op.drop_index(
        "ix_card_export_templates_registry_id",
        table_name="card_export_templates",
        schema="public",
    )
    op.drop_table("card_export_templates", schema="public")
    op.drop_index(
        "ix_card_event_changes_field_id", table_name="card_event_changes", schema="public"
    )
    op.drop_index(
        "ix_card_event_changes_card_event_id", table_name="card_event_changes", schema="public"
    )
    op.drop_table("card_event_changes", schema="public")
    op.drop_index("ix_card_events_created_by", table_name="card_events", schema="public")
    op.drop_index("ix_card_events_card_occurred_on", table_name="card_events", schema="public")
    op.drop_table("card_events", schema="public")
