"""create core schema v1

Revision ID: 0002_core_schema_v1
Revises: 0001_database_foundation
Create Date: 2026-06-27
"""

from collections.abc import Sequence

from alembic import op

from app.models import Base

revision: str = "0002_core_schema_v1"
down_revision: str | None = "0001_database_foundation"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind())
