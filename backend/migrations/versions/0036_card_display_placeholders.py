"""Move stored document/layout card placeholders to derived display values.

Revision ID: 0036_card_display_placeholders
Revises: 0035_card_first_activation

Stored binary DOCX files and already generated documents are immutable here.
Binary templates using the old placeholder need a replacement version.
Downgrade maps the current token back; it cannot distinguish newly authored
display_value placeholders from migrated ones.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0036_card_display_placeholders"
down_revision: str | None = "0035_card_first_activation"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _rewrite(old: str, new: str) -> None:
    # Static migration identifiers only. Word boundaries preserve similarly
    # named user text/tokens such as card.display_name_extra.
    for table, column, is_json in (
        ("document_templates", "template_body", False),
        ("document_templates", "output_filename_template", False),
        ("document_template_versions", "template_body", False),
        ("document_template_versions", "layout_json", True),
        ("card_templates", "field_schema_json", True),
    ):
        replacement = (
            f"regexp_replace(CAST({column} AS TEXT), '\\mcard\\.{old}\\M', 'card.{new}', 'g')"
        )
        if is_json:
            replacement = f"CAST({replacement} AS JSONB)"
        op.execute(
            sa.text(
                f"UPDATE public.{table} SET {column} = {replacement} "
                f"WHERE CAST({column} AS TEXT) LIKE '%card.{old}%'"
            )
        )
    op.alter_column(
        "document_templates",
        "output_filename_template",
        server_default="{{ card." + new + " }}.docx",
        schema="public",
    )


def upgrade() -> None:
    _rewrite("display_name", "display_value")


def downgrade() -> None:
    _rewrite("display_value", "display_name")
