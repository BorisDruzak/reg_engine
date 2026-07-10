"""add public link review lifecycle

Revision ID: 0023_public_link_review
Revises: 0022_card_print_layout_templates
Create Date: 2026-07-10
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0023_public_link_review"
down_revision: str | None = "0022_card_print_layout_templates"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint(
        op.f("ck_card_public_links_status"),
        "card_public_links",
        schema="public",
        type_="check",
    )
    op.add_column(
        "card_public_links",
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        schema="public",
    )
    op.add_column(
        "card_public_links",
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        schema="public",
    )
    op.add_column(
        "card_public_links",
        sa.Column("reviewed_by", postgresql.UUID(as_uuid=True), nullable=True),
        schema="public",
    )
    op.add_column(
        "card_public_links",
        sa.Column("review_comment", sa.Text(), nullable=True),
        schema="public",
    )
    op.add_column(
        "card_public_links",
        sa.Column(
            "baseline_snapshot_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        schema="public",
    )
    op.add_column(
        "card_public_links",
        sa.Column(
            "submission_summary_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        schema="public",
    )
    op.add_column(
        "card_public_links",
        sa.Column(
            "review_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        schema="public",
    )
    op.create_foreign_key(
        op.f("fk_card_public_links_reviewed_by_users"),
        "card_public_links",
        "users",
        ["reviewed_by"],
        ["id"],
        source_schema="public",
        referent_schema="public",
    )
    op.create_check_constraint(
        op.f("ck_card_public_links_status"),
        "card_public_links",
        "status in ('active', 'submitted', 'changes_requested', 'approved', 'disabled', 'expired')",
        schema="public",
    )
    op.create_index(
        "ix_card_public_links_card_status_submitted",
        "card_public_links",
        ["card_id", "status", "submitted_at"],
        schema="public",
    )


def downgrade() -> None:
    op.execute(
        "UPDATE public.card_public_links "
        "SET status = 'disabled' "
        "WHERE status IN ('submitted', 'changes_requested', 'approved')"
    )
    op.drop_index(
        "ix_card_public_links_card_status_submitted",
        table_name="card_public_links",
        schema="public",
    )
    op.drop_constraint(
        op.f("fk_card_public_links_reviewed_by_users"),
        "card_public_links",
        schema="public",
        type_="foreignkey",
    )
    op.drop_constraint(
        op.f("ck_card_public_links_status"),
        "card_public_links",
        schema="public",
        type_="check",
    )
    op.create_check_constraint(
        op.f("ck_card_public_links_status"),
        "card_public_links",
        "status in ('active', 'disabled', 'expired')",
        schema="public",
    )
    for column_name in (
        "review_enabled",
        "submission_summary_json",
        "baseline_snapshot_json",
        "review_comment",
        "reviewed_by",
        "reviewed_at",
        "submitted_at",
    ):
        op.drop_column("card_public_links", column_name, schema="public")
