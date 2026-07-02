"""add schema layout and static text field

Revision ID: 0020_schema_layout_static_text
Revises: 0019_base_card_templates
Create Date: 2026-07-02
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0020_schema_layout_static_text"
down_revision: str | None = "0019_base_card_templates"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_PREVIOUS_FIELD_TYPES = (
    "text",
    "number",
    "date",
    "datetime",
    "bool",
    "json",
    "select",
    "multi_select",
    "card_ref",
    "user_ref",
    "organization_ref",
    "org_unit_ref",
    "registry_ref",
    "file_ref",
)

_FIELD_TYPES = (*_PREVIOUS_FIELD_TYPES, "static_text")


def _quoted(values: tuple[str, ...]) -> str:
    return ", ".join(f"'{value}'" for value in values)


def upgrade() -> None:
    op.add_column(
        "form_blocks",
        sa.Column("layout_columns", sa.Integer(), server_default="1", nullable=False),
        schema="public",
    )
    op.create_check_constraint(
        "ck_form_blocks_layout_columns",
        "form_blocks",
        "layout_columns >= 1 and layout_columns <= 3",
        schema="public",
    )
    op.add_column(
        "form_fields",
        sa.Column(
            "display_config_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        schema="public",
    )
    op.execute("ALTER TABLE public.form_fields DROP CONSTRAINT IF EXISTS ck_form_fields_field_type")
    op.create_check_constraint(
        "ck_form_fields_field_type",
        "form_fields",
        f"field_type in ({_quoted(_FIELD_TYPES)})",
        schema="public",
    )


def downgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM public.form_fields WHERE field_type = 'static_text'
            ) THEN
                RAISE EXCEPTION
                    'Cannot downgrade while static_text form fields exist';
            END IF;
        END $$;
        """
    )
    op.execute("ALTER TABLE public.form_fields DROP CONSTRAINT IF EXISTS ck_form_fields_field_type")
    op.create_check_constraint(
        "ck_form_fields_field_type",
        "form_fields",
        f"field_type in ({_quoted(_PREVIOUS_FIELD_TYPES)})",
        schema="public",
    )
    op.drop_column("form_fields", "display_config_json", schema="public")
    op.drop_constraint(
        "ck_form_blocks_layout_columns",
        "form_blocks",
        schema="public",
        type_="check",
    )
    op.drop_column("form_blocks", "layout_columns", schema="public")
