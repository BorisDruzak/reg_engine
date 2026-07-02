"""add editable card title label to registries

Revision ID: 0017_registry_card_title_label
Revises: 0016_default_registry_tree
Create Date: 2026-07-02
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0017_registry_card_title_label"
down_revision: str | None = "0016_default_registry_tree"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "registries",
        sa.Column(
            "card_title_label",
            sa.String(),
            server_default=(
                "\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435 "
                "\u043a\u0430\u0440\u0442\u043e\u0447\u043a\u0438"
            ),
            nullable=False,
        ),
        schema="public",
    )


def downgrade() -> None:
    op.drop_column("registries", "card_title_label", schema="public")
