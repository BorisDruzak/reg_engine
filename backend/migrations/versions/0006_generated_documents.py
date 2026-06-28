"""add generated document metadata

Revision ID: 0006_generated_documents
Revises: 0005_attachments
Create Date: 2026-06-28
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0006_generated_documents"
down_revision: str | None = "0005_attachments"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


TABLE_DDL: tuple[str, ...] = (
    """
    CREATE TABLE document_templates (
        registry_id UUID NOT NULL,
        code VARCHAR NOT NULL,
        name VARCHAR NOT NULL,
        description VARCHAR,
        template_format VARCHAR DEFAULT 'docx_text_v1' NOT NULL,
        template_body TEXT NOT NULL,
        output_filename_template VARCHAR DEFAULT '{{ card.display_name }}.docx' NOT NULL,
        output_content_type VARCHAR DEFAULT
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document' NOT NULL,
        is_active BOOLEAN DEFAULT true NOT NULL,
        created_by UUID NOT NULL,
        updated_by UUID,
        archived_by UUID,
        archive_reason VARCHAR,
        id UUID DEFAULT gen_random_uuid() NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
        archived_at TIMESTAMP WITH TIME ZONE,
        CONSTRAINT pk_document_templates PRIMARY KEY (id),
        CONSTRAINT uq_document_templates_registry_id_code UNIQUE (registry_id, code),
        CONSTRAINT ck_document_templates_template_format
            CHECK (template_format in ('docx_text_v1')),
        CONSTRAINT fk_document_templates_registry_id_registries
            FOREIGN KEY(registry_id) REFERENCES registries (id),
        CONSTRAINT fk_document_templates_created_by_users
            FOREIGN KEY(created_by) REFERENCES users (id),
        CONSTRAINT fk_document_templates_updated_by_users
            FOREIGN KEY(updated_by) REFERENCES users (id),
        CONSTRAINT fk_document_templates_archived_by_users
            FOREIGN KEY(archived_by) REFERENCES users (id)
    )
    """,
    """
    CREATE TABLE generated_documents (
        card_id UUID NOT NULL,
        template_id UUID NOT NULL,
        stored_file_id UUID NOT NULL,
        title VARCHAR NOT NULL,
        output_filename VARCHAR NOT NULL,
        content_type VARCHAR NOT NULL,
        render_status VARCHAR DEFAULT 'generated' NOT NULL,
        generated_by UUID NOT NULL,
        archived_by UUID,
        archive_reason VARCHAR,
        id UUID DEFAULT gen_random_uuid() NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
        archived_at TIMESTAMP WITH TIME ZONE,
        CONSTRAINT pk_generated_documents PRIMARY KEY (id),
        CONSTRAINT ck_generated_documents_render_status CHECK (render_status in ('generated')),
        CONSTRAINT fk_generated_documents_card_id_cards FOREIGN KEY(card_id) REFERENCES cards (id),
        CONSTRAINT fk_generated_documents_template_id_document_templates
            FOREIGN KEY(template_id) REFERENCES document_templates (id),
        CONSTRAINT fk_generated_documents_stored_file_id_stored_files
            FOREIGN KEY(stored_file_id) REFERENCES stored_files (id),
        CONSTRAINT fk_generated_documents_generated_by_users
            FOREIGN KEY(generated_by) REFERENCES users (id),
        CONSTRAINT fk_generated_documents_archived_by_users
            FOREIGN KEY(archived_by) REFERENCES users (id)
    )
    """,
)


INDEX_DDL: tuple[str, ...] = (
    "CREATE INDEX ix_document_templates_registry_id ON document_templates (registry_id)",
    """
    CREATE INDEX ix_document_templates_registry_archive
        ON document_templates (registry_id, archived_at)
    """,
    "CREATE INDEX ix_generated_documents_card_id ON generated_documents (card_id)",
    "CREATE INDEX ix_generated_documents_template_id ON generated_documents (template_id)",
    "CREATE INDEX ix_generated_documents_stored_file_id ON generated_documents (stored_file_id)",
    """
    CREATE INDEX ix_generated_documents_card_archive
        ON generated_documents (card_id, archived_at)
    """,
)


DROP_DDL: tuple[str, ...] = (
    "DROP TABLE IF EXISTS public.generated_documents CASCADE",
    "DROP TABLE IF EXISTS public.document_templates CASCADE",
)


def upgrade() -> None:
    for statement in TABLE_DDL:
        op.execute(statement)
    for statement in INDEX_DDL:
        op.execute(statement)


def downgrade() -> None:
    for statement in DROP_DDL:
        op.execute(statement)
