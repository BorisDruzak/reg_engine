"""Remember first activation even when a card becomes incomplete again.

Revision ID: 0035_card_first_activation
Revises: 0034_card_events_exports_fio
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0035_card_first_activation"
down_revision: str | None = "0034_card_events_exports_fio"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "cards",
        sa.Column("activated_at", sa.DateTime(timezone=True), nullable=True),
        schema="public",
    )
    # Existing active/terminal records are known to have crossed activation by
    # migration time. Retained evidence gives a more precise historical date.
    # A legacy draft with already-purged history cannot be inferred safely.
    op.execute(
        sa.text("""
        UPDATE public.cards SET activated_at = COALESCE(
            (SELECT MIN(created_at) FROM public.audit_events
             WHERE card_id = cards.id AND new_data_json ->> 'lifecycle_status' = 'active'),
            (SELECT MIN(created_at) FROM public.card_events WHERE card_id = cards.id),
            CASE WHEN lifecycle_status IN ('active', 'dismissed', 'archived', 'superseded')
                 THEN CURRENT_TIMESTAMP END
        )
    """)
    )


def downgrade() -> None:
    op.drop_column("cards", "activated_at", schema="public")
