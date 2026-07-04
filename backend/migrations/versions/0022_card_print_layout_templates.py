"""add card print layout document templates

Revision ID: 0022_card_print_layout_templates
Revises: 0021_block_display_config
Create Date: 2026-07-04
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0022_card_print_layout_templates"
down_revision: str | None = "0021_block_display_config"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "document_templates",
        sa.Column("card_template_id", postgresql.UUID(as_uuid=True), nullable=True),
        schema="public",
    )
    op.create_index(
        "ix_document_templates_card_template_id",
        "document_templates",
        ["card_template_id"],
        schema="public",
    )
    op.create_foreign_key(
        "fk_document_templates_card_template_id_card_templates",
        "document_templates",
        "card_templates",
        ["card_template_id"],
        ["id"],
        source_schema="public",
        referent_schema="public",
    )
    op.add_column(
        "document_template_versions",
        sa.Column("layout_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        schema="public",
    )
    op.drop_constraint(
        "ck_document_templates_template_format",
        "document_templates",
        schema="public",
        type_="check",
    )
    op.create_check_constraint(
        "ck_document_templates_template_format",
        "document_templates",
        "template_format in ('docx_text_v1', 'docx_binary_v1', 'card_print_layout_v1')",
        schema="public",
    )
    op.drop_constraint(
        "ck_document_template_versions_template_format",
        "document_template_versions",
        schema="public",
        type_="check",
    )
    op.create_check_constraint(
        "ck_document_template_versions_template_format",
        "document_template_versions",
        "template_format in ('docx_text_v1', 'docx_binary_v1', 'card_print_layout_v1')",
        schema="public",
    )
    op.create_check_constraint(
        "ck_document_template_versions_layout_for_card_print",
        "document_template_versions",
        "template_format != 'card_print_layout_v1' OR layout_json IS NOT NULL",
        schema="public",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_document_template_versions_layout_for_card_print",
        "document_template_versions",
        schema="public",
        type_="check",
    )
    op.drop_constraint(
        "ck_document_template_versions_template_format",
        "document_template_versions",
        schema="public",
        type_="check",
    )
    op.create_check_constraint(
        "ck_document_template_versions_template_format",
        "document_template_versions",
        "template_format in ('docx_text_v1', 'docx_binary_v1')",
        schema="public",
    )
    op.drop_constraint(
        "ck_document_templates_template_format",
        "document_templates",
        schema="public",
        type_="check",
    )
    op.create_check_constraint(
        "ck_document_templates_template_format",
        "document_templates",
        "template_format in ('docx_text_v1', 'docx_binary_v1')",
        schema="public",
    )
    op.drop_column("document_template_versions", "layout_json", schema="public")
    op.drop_constraint(
        "fk_document_templates_card_template_id_card_templates",
        "document_templates",
        schema="public",
        type_="foreignkey",
    )
    op.drop_index(
        "ix_document_templates_card_template_id",
        table_name="document_templates",
        schema="public",
    )
    op.drop_column("document_templates", "card_template_id", schema="public")
