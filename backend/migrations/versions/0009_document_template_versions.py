"""add document template versions

Revision ID: 0009_document_template_versions
Revises: 0008_file_ref_field_values
Create Date: 2026-06-30
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0009_document_template_versions"
down_revision: str | None = "0008_file_ref_field_values"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE public.document_templates
        ALTER COLUMN template_body DROP NOT NULL
        """
    )
    op.execute(
        """
        ALTER TABLE public.document_templates
        DROP CONSTRAINT IF EXISTS ck_document_templates_template_format
        """
    )
    op.execute(
        """
        ALTER TABLE public.document_templates
        ADD CONSTRAINT ck_document_templates_template_format
        CHECK (template_format in ('docx_text_v1', 'docx_binary_v1'))
        """
    )
    op.execute(
        """
        CREATE TABLE public.document_template_versions (
            template_id UUID NOT NULL,
            version_number INTEGER NOT NULL,
            template_format VARCHAR DEFAULT 'docx_text_v1' NOT NULL,
            template_body TEXT,
            stored_file_id UUID,
            original_filename VARCHAR,
            content_type VARCHAR,
            content_length_bytes BIGINT,
            created_by UUID NOT NULL,
            archived_by UUID,
            archive_reason VARCHAR,
            id UUID DEFAULT gen_random_uuid() NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
            archived_at TIMESTAMP WITH TIME ZONE,
            CONSTRAINT pk_document_template_versions PRIMARY KEY (id),
            CONSTRAINT uq_document_template_versions_template_version
                UNIQUE (template_id, version_number),
            CONSTRAINT ck_document_template_versions_version_number_positive
                CHECK (version_number > 0),
            CONSTRAINT ck_document_template_versions_template_format
                CHECK (template_format in ('docx_text_v1', 'docx_binary_v1')),
            CONSTRAINT ck_document_template_versions_storage_for_binary
                CHECK (template_format != 'docx_binary_v1' OR stored_file_id IS NOT NULL),
            CONSTRAINT ck_document_template_versions_body_for_text
                CHECK (template_format != 'docx_text_v1' OR template_body IS NOT NULL),
            CONSTRAINT fk_document_template_versions_template_id_document_templates
                FOREIGN KEY(template_id) REFERENCES public.document_templates (id),
            CONSTRAINT fk_document_template_versions_stored_file_id_stored_files
                FOREIGN KEY(stored_file_id) REFERENCES public.stored_files (id),
            CONSTRAINT fk_document_template_versions_created_by_users
                FOREIGN KEY(created_by) REFERENCES public.users (id),
            CONSTRAINT fk_document_template_versions_archived_by_users
                FOREIGN KEY(archived_by) REFERENCES public.users (id)
        )
        """
    )
    op.execute(
        """
        CREATE INDEX ix_document_template_versions_template_id
        ON public.document_template_versions (template_id)
        """
    )
    op.execute(
        """
        CREATE INDEX ix_document_template_versions_stored_file_id
        ON public.document_template_versions (stored_file_id)
        """
    )
    op.execute(
        """
        CREATE INDEX ix_document_template_versions_template_active
        ON public.document_template_versions (template_id, archived_at)
        """
    )
    op.execute(
        """
        INSERT INTO public.document_template_versions (
            template_id,
            version_number,
            template_format,
            template_body,
            created_by
        )
        SELECT
            id,
            1,
            template_format,
            template_body,
            created_by
        FROM public.document_templates
        WHERE template_body IS NOT NULL
        """
    )
    op.execute(
        """
        ALTER TABLE public.generated_documents
        ADD COLUMN template_version_id UUID
        """
    )
    op.execute(
        """
        ALTER TABLE public.generated_documents
        ADD CONSTRAINT fk_generated_documents_template_version_id_document_template_versions
        FOREIGN KEY(template_version_id) REFERENCES public.document_template_versions (id)
        """
    )
    op.execute(
        """
        CREATE INDEX ix_generated_documents_template_version_id
        ON public.generated_documents (template_version_id)
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DROP INDEX IF EXISTS public.ix_generated_documents_template_version_id
        """
    )
    op.execute(
        """
        ALTER TABLE public.generated_documents
        DROP CONSTRAINT IF EXISTS
            fk_generated_documents_template_version_id_document_template_versions
        """
    )
    op.execute(
        """
        ALTER TABLE public.generated_documents
        DROP COLUMN IF EXISTS template_version_id
        """
    )
    op.execute(
        """
        DROP TABLE IF EXISTS public.document_template_versions CASCADE
        """
    )
    op.execute(
        """
        UPDATE public.document_templates
        SET template_body = ''
        WHERE template_body IS NULL
        """
    )
    op.execute(
        """
        UPDATE public.document_templates
        SET template_format = 'docx_text_v1'
        WHERE template_format = 'docx_binary_v1'
        """
    )
    op.execute(
        """
        ALTER TABLE public.document_templates
        DROP CONSTRAINT IF EXISTS ck_document_templates_template_format
        """
    )
    op.execute(
        """
        ALTER TABLE public.document_templates
        ADD CONSTRAINT ck_document_templates_template_format
        CHECK (template_format in ('docx_text_v1'))
        """
    )
    op.execute(
        """
        ALTER TABLE public.document_templates
        ALTER COLUMN template_body SET NOT NULL
        """
    )
