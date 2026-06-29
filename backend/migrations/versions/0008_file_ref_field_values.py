"""add file_ref field value support

Revision ID: 0008_file_ref_field_values
Revises: 0007_public_link_limits
Create Date: 2026-06-30
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0008_file_ref_field_values"
down_revision: str | None = "0007_public_link_limits"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_FIELD_TYPE_VALUES = (
    "'text'",
    "'number'",
    "'date'",
    "'datetime'",
    "'bool'",
    "'json'",
    "'select'",
    "'multi_select'",
    "'card_ref'",
    "'user_ref'",
    "'organization_ref'",
    "'org_unit_ref'",
    "'registry_ref'",
    "'file_ref'",
)

_PREVIOUS_FIELD_TYPE_VALUES = _FIELD_TYPE_VALUES[:-1]


def _field_type_check(values: tuple[str, ...]) -> str:
    return f"field_type in ({', '.join(values)})"


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE public.field_values
        ADD COLUMN value_attachment_id UUID
        """
    )
    op.execute(
        """
        ALTER TABLE public.field_values
        ADD CONSTRAINT fk_field_values_value_attachment_id_card_attachments
        FOREIGN KEY(value_attachment_id) REFERENCES public.card_attachments (id)
        """
    )
    op.execute(
        """
        CREATE INDEX ix_field_values_field_attachment
        ON public.field_values (field_id, value_attachment_id)
        """
    )
    op.execute(
        """
        ALTER TABLE public.form_fields
        DROP CONSTRAINT IF EXISTS ck_form_fields_field_type
        """
    )
    op.execute(
        f"""
        ALTER TABLE public.form_fields
        ADD CONSTRAINT ck_form_fields_field_type
        CHECK ({_field_type_check(_FIELD_TYPE_VALUES)})
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE public.form_fields
        DROP CONSTRAINT IF EXISTS ck_form_fields_field_type
        """
    )
    op.execute(
        f"""
        ALTER TABLE public.form_fields
        ADD CONSTRAINT ck_form_fields_field_type
        CHECK ({_field_type_check(_PREVIOUS_FIELD_TYPE_VALUES)})
        """
    )
    op.execute(
        """
        DROP INDEX IF EXISTS public.ix_field_values_field_attachment
        """
    )
    op.execute(
        """
        ALTER TABLE public.field_values
        DROP CONSTRAINT IF EXISTS fk_field_values_value_attachment_id_card_attachments
        """
    )
    op.execute(
        """
        ALTER TABLE public.field_values
        DROP COLUMN IF EXISTS value_attachment_id
        """
    )
