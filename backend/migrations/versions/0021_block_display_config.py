"""add block display config

Revision ID: 0021_block_display_config
Revises: 0020_schema_layout_static_text
Create Date: 2026-07-03
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0021_block_display_config"
down_revision: str | None = "0020_schema_layout_static_text"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "form_blocks",
        sa.Column(
            "display_config_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        schema="public",
    )


def downgrade() -> None:
    op.drop_column("form_blocks", "display_config_json", schema="public")
