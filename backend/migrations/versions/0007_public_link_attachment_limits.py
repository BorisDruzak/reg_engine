"""add public link attachment upload limits

Revision ID: 0007_public_link_limits
Revises: 0006_generated_documents
Create Date: 2026-06-29
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0007_public_link_limits"
down_revision: str | None = "0006_generated_documents"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE public.card_public_links
        ADD COLUMN max_attachment_uploads INTEGER
        """
    )
    op.execute(
        """
        ALTER TABLE public.card_public_links
        ADD COLUMN attachment_upload_count INTEGER DEFAULT 0 NOT NULL
        """
    )
    op.execute(
        """
        ALTER TABLE public.card_public_links
        ADD CONSTRAINT ck_card_public_links_max_attachment_uploads_non_negative
        CHECK (max_attachment_uploads IS NULL OR max_attachment_uploads >= 0)
        """
    )
    op.execute(
        """
        ALTER TABLE public.card_public_links
        ADD CONSTRAINT ck_card_public_links_attachment_upload_count_non_negative
        CHECK (attachment_upload_count >= 0)
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE public.card_public_links
        DROP CONSTRAINT IF EXISTS ck_card_public_links_attachment_upload_count_non_negative
        """
    )
    op.execute(
        """
        ALTER TABLE public.card_public_links
        DROP CONSTRAINT IF EXISTS ck_card_public_links_max_attachment_uploads_non_negative
        """
    )
    op.execute(
        """
        ALTER TABLE public.card_public_links
        DROP COLUMN IF EXISTS attachment_upload_count
        """
    )
    op.execute(
        """
        ALTER TABLE public.card_public_links
        DROP COLUMN IF EXISTS max_attachment_uploads
        """
    )
