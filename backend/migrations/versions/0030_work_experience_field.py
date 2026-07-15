"""add work experience field type

Revision ID: 0030_work_experience_field
Revises: 0029_public_reference_edit_links
Create Date: 2026-07-15
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0030_work_experience_field"
down_revision: str | None = "0029_public_reference_edit_links"
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
    "static_text",
)
_FIELD_TYPES = (*_PREVIOUS_FIELD_TYPES, "work_experience")


def _quoted(values: tuple[str, ...]) -> str:
    return ", ".join(f"'{value}'" for value in values)


def upgrade() -> None:
    op.execute("ALTER TABLE public.form_fields DROP CONSTRAINT IF EXISTS ck_form_fields_field_type")
    op.create_check_constraint(
        op.f("ck_form_fields_field_type"),
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
                SELECT 1 FROM public.form_fields WHERE field_type = 'work_experience'
            ) THEN
                RAISE EXCEPTION
                    'Cannot downgrade while work_experience form fields exist';
            END IF;
        END $$;
        """
    )
    op.execute("ALTER TABLE public.form_fields DROP CONSTRAINT IF EXISTS ck_form_fields_field_type")
    op.create_check_constraint(
        op.f("ck_form_fields_field_type"),
        "form_fields",
        f"field_type in ({_quoted(_PREVIOUS_FIELD_TYPES)})",
        schema="public",
    )
