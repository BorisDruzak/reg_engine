"""restore audit event created_at default

Revision ID: 0015_audit_created_at_default
Revises: 0014_report_pdf_output
Create Date: 2026-07-01
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0015_audit_created_at_default"
down_revision: str | None = "0014_report_pdf_output"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "audit_events",
        "created_at",
        existing_type=sa.DateTime(timezone=True),
        existing_nullable=False,
        server_default=sa.text("now()"),
        schema="public",
    )


def downgrade() -> None:
    op.alter_column(
        "audit_events",
        "created_at",
        existing_type=sa.DateTime(timezone=True),
        existing_nullable=False,
        server_default=None,
        schema="public",
    )
