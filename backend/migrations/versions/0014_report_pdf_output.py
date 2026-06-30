"""allow pdf report output format

Revision ID: 0014_report_pdf_output
Revises: 0013_report_xlsx_output
Create Date: 2026-06-30
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0014_report_pdf_output"
down_revision: str | None = "0013_report_xlsx_output"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE public.report_templates DROP CONSTRAINT ck_report_templates_output_format"
    )
    op.execute(
        """
        ALTER TABLE public.report_templates
        ADD CONSTRAINT ck_report_templates_output_format
        CHECK (output_format in ('json', 'csv', 'xlsx', 'pdf'))
        """
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE public.report_templates DROP CONSTRAINT ck_report_templates_output_format"
    )
    op.execute(
        """
        ALTER TABLE public.report_templates
        ADD CONSTRAINT ck_report_templates_output_format
        CHECK (output_format in ('json', 'csv', 'xlsx'))
        """
    )
