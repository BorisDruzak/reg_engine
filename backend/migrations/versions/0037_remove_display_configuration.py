"""Remove obsolete configurable card display settings.

Revision ID: 0037_remove_display_config
Revises: 0036_card_display_placeholders

FIO is the only display source. Downgrade recreates nullable settings but does
not restore discarded configuration; production upgrade requires a backup.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0037_remove_display_config"
down_revision: str | None = "0036_card_display_placeholders"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint(
        "fk_registries_display_name_field_id_form_fields",
        "registries",
        type_="foreignkey",
        schema="public",
    )
    op.drop_column("registries", "display_name_field_id", schema="public")
    op.drop_column("registries", "display_name_template", schema="public")


def downgrade() -> None:
    op.add_column(
        "registries", sa.Column("display_name_field_id", sa.UUID(), nullable=True), schema="public"
    )
    op.add_column(
        "registries",
        sa.Column("display_name_template", sa.String(), nullable=True),
        schema="public",
    )
    op.create_foreign_key(
        "fk_registries_display_name_field_id_form_fields",
        "registries",
        "form_fields",
        ["display_name_field_id"],
        ["id"],
        source_schema="public",
        referent_schema="public",
    )
