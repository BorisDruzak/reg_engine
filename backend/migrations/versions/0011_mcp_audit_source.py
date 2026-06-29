"""allow mcp audit source

Revision ID: 0011_mcp_audit_source
Revises: 0010_reports
Create Date: 2026-06-30
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0011_mcp_audit_source"
down_revision: str | None = "0010_reports"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE public.audit_events DROP CONSTRAINT ck_audit_events_source")
    op.execute(
        """
        ALTER TABLE public.audit_events
        ADD CONSTRAINT ck_audit_events_source
        CHECK (source in ('api', 'public_link', 'system', 'mcp'))
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE public.audit_events DROP CONSTRAINT ck_audit_events_source")
    op.execute(
        """
        ALTER TABLE public.audit_events
        ADD CONSTRAINT ck_audit_events_source
        CHECK (source in ('api', 'public_link', 'system'))
        """
    )
