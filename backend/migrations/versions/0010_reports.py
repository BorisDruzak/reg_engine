"""add report templates and runs

Revision ID: 0010_reports
Revises: 0009_document_template_versions
Create Date: 2026-06-30
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0010_reports"
down_revision: str | None = "0009_document_template_versions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE public.report_templates (
            registry_id UUID NOT NULL,
            code VARCHAR NOT NULL,
            name VARCHAR NOT NULL,
            description VARCHAR,
            report_type VARCHAR NOT NULL,
            parameters_schema_json JSONB,
            default_parameters_json JSONB,
            output_format VARCHAR DEFAULT 'json' NOT NULL,
            is_active BOOLEAN DEFAULT true NOT NULL,
            created_by UUID NOT NULL,
            updated_by UUID,
            archived_by UUID,
            archive_reason VARCHAR,
            id UUID DEFAULT gen_random_uuid() NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
            archived_at TIMESTAMP WITH TIME ZONE,
            CONSTRAINT pk_report_templates PRIMARY KEY (id),
            CONSTRAINT uq_report_templates_registry_id_code UNIQUE (registry_id, code),
            CONSTRAINT ck_report_templates_report_type
                CHECK (report_type in ('registry_cards', 'card_detail', 'period_summary')),
            CONSTRAINT ck_report_templates_output_format CHECK (output_format in ('json')),
            CONSTRAINT fk_report_templates_registry_id_registries
                FOREIGN KEY(registry_id) REFERENCES public.registries (id),
            CONSTRAINT fk_report_templates_created_by_users
                FOREIGN KEY(created_by) REFERENCES public.users (id),
            CONSTRAINT fk_report_templates_updated_by_users
                FOREIGN KEY(updated_by) REFERENCES public.users (id),
            CONSTRAINT fk_report_templates_archived_by_users
                FOREIGN KEY(archived_by) REFERENCES public.users (id)
        )
        """
    )
    op.execute(
        """
        CREATE INDEX ix_report_templates_registry_id
        ON public.report_templates (registry_id)
        """
    )
    op.execute(
        """
        CREATE INDEX ix_report_templates_registry_archive
        ON public.report_templates (registry_id, archived_at)
        """
    )
    op.execute(
        """
        CREATE TABLE public.report_runs (
            report_template_id UUID NOT NULL,
            registry_id UUID NOT NULL,
            card_id UUID,
            stored_file_id UUID,
            report_type VARCHAR NOT NULL,
            run_status VARCHAR DEFAULT 'generated' NOT NULL,
            parameters_json JSONB,
            summary_json JSONB,
            row_count INTEGER DEFAULT 0 NOT NULL,
            output_filename VARCHAR NOT NULL,
            output_content_type VARCHAR NOT NULL,
            generated_by UUID NOT NULL,
            started_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
            finished_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
            archived_by UUID,
            archive_reason VARCHAR,
            id UUID DEFAULT gen_random_uuid() NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
            archived_at TIMESTAMP WITH TIME ZONE,
            CONSTRAINT pk_report_runs PRIMARY KEY (id),
            CONSTRAINT ck_report_runs_report_type
                CHECK (report_type in ('registry_cards', 'card_detail', 'period_summary')),
            CONSTRAINT ck_report_runs_status CHECK (run_status in ('generated', 'failed')),
            CONSTRAINT ck_report_runs_row_count_non_negative CHECK (row_count >= 0),
            CONSTRAINT ck_report_runs_generated_requires_storage
                CHECK (run_status != 'generated' OR stored_file_id IS NOT NULL),
            CONSTRAINT fk_report_runs_report_template_id_report_templates
                FOREIGN KEY(report_template_id) REFERENCES public.report_templates (id),
            CONSTRAINT fk_report_runs_registry_id_registries
                FOREIGN KEY(registry_id) REFERENCES public.registries (id),
            CONSTRAINT fk_report_runs_card_id_cards
                FOREIGN KEY(card_id) REFERENCES public.cards (id),
            CONSTRAINT fk_report_runs_stored_file_id_stored_files
                FOREIGN KEY(stored_file_id) REFERENCES public.stored_files (id),
            CONSTRAINT fk_report_runs_generated_by_users
                FOREIGN KEY(generated_by) REFERENCES public.users (id),
            CONSTRAINT fk_report_runs_archived_by_users
                FOREIGN KEY(archived_by) REFERENCES public.users (id)
        )
        """
    )
    op.execute(
        """
        CREATE INDEX ix_report_runs_template_id
        ON public.report_runs (report_template_id)
        """
    )
    op.execute(
        """
        CREATE INDEX ix_report_runs_registry_id
        ON public.report_runs (registry_id)
        """
    )
    op.execute(
        """
        CREATE INDEX ix_report_runs_card_id
        ON public.report_runs (card_id)
        """
    )
    op.execute(
        """
        CREATE INDEX ix_report_runs_stored_file_id
        ON public.report_runs (stored_file_id)
        """
    )
    op.execute(
        """
        CREATE INDEX ix_report_runs_registry_created_at
        ON public.report_runs (registry_id, created_at)
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS public.report_runs CASCADE")
    op.execute("DROP TABLE IF EXISTS public.report_templates CASCADE")
