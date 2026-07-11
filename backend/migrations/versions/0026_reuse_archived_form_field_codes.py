"""allow reuse of archived form-field technical codes

Revision ID: 0026_reuse_archived_field_codes
Revises: 0025_three_role_access
Create Date: 2026-07-12
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0026_reuse_archived_field_codes"
down_revision: str | None = "0025_three_role_access"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint(
        "uq_form_fields_block_id_code",
        "form_fields",
        type_="unique",
        schema="public",
    )
    op.create_index(
        "uq_form_fields_block_id_code_unarchived",
        "form_fields",
        ["block_id", "code"],
        unique=True,
        postgresql_where=sa.text("archived_at is null"),
        schema="public",
    )


def downgrade() -> None:
    op.drop_index(
        "uq_form_fields_block_id_code_unarchived",
        table_name="form_fields",
        schema="public",
    )
    op.create_unique_constraint(
        "uq_form_fields_block_id_code",
        "form_fields",
        ["block_id", "code"],
        schema="public",
    )
