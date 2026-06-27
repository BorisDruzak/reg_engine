"""database foundation

Revision ID: 0001_database_foundation
Revises:
Create Date: 2026-06-27
"""

from collections.abc import Sequence

revision: str = "0001_database_foundation"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Initial foundation revision without business tables."""


def downgrade() -> None:
    """Downgrade foundation revision."""
