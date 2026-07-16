"""add card audit history classification

Revision ID: 0031_card_audit_history
Revises: 0030_work_experience_field
Create Date: 2026-07-16
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0031_card_audit_history"
down_revision: str | None = "0030_work_experience_field"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "audit_events",
        sa.Column("card_id", postgresql.UUID(as_uuid=True), nullable=True),
        schema="public",
    )
    op.create_foreign_key(
        "fk_audit_events_card_id_cards",
        "audit_events",
        "cards",
        ["card_id"],
        ["id"],
        source_schema="public",
        referent_schema="public",
    )
    op.add_column(
        "audit_events",
        sa.Column("attributed_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        schema="public",
    )
    op.create_foreign_key(
        "fk_audit_events_attributed_user_id_users",
        "audit_events",
        "users",
        ["attributed_user_id"],
        ["id"],
        source_schema="public",
        referent_schema="public",
    )
    op.add_column(
        "audit_events",
        sa.Column(
            "retention_class",
            sa.String(),
            nullable=False,
            server_default=sa.text("'technical'"),
        ),
        schema="public",
    )
    op.execute("UPDATE public.audit_events SET retention_class = 'technical'")
    op.create_check_constraint(
        "retention_class",
        "audit_events",
        "retention_class in ('technical', 'card_history')",
        schema="public",
    )
    op.create_index(
        "ix_audit_events_card_history",
        "audit_events",
        ["retention_class", "card_id", "created_at"],
        schema="public",
    )
    op.create_index(
        "ix_audit_events_retention",
        "audit_events",
        ["retention_class", "created_at"],
        schema="public",
    )


def downgrade() -> None:
    op.drop_index("ix_audit_events_retention", table_name="audit_events", schema="public")
    op.drop_index("ix_audit_events_card_history", table_name="audit_events", schema="public")
    op.drop_constraint("retention_class", "audit_events", type_="check", schema="public")
    op.drop_column("audit_events", "retention_class", schema="public")
    op.drop_constraint(
        "fk_audit_events_attributed_user_id_users",
        "audit_events",
        type_="foreignkey",
        schema="public",
    )
    op.drop_column("audit_events", "attributed_user_id", schema="public")
    op.drop_constraint(
        "fk_audit_events_card_id_cards",
        "audit_events",
        type_="foreignkey",
        schema="public",
    )
    op.drop_column("audit_events", "card_id", schema="public")
