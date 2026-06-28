"""add attachment backend metadata

Revision ID: 0005_attachments
Revises: 0004_core_service_hardening
Create Date: 2026-06-28
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0005_attachments"
down_revision: str | None = "0004_core_service_hardening"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


TABLE_DDL: tuple[str, ...] = (
    """
    CREATE TABLE stored_files (
        storage_backend VARCHAR DEFAULT 'local_filesystem' NOT NULL,
        storage_key VARCHAR NOT NULL,
        original_filename VARCHAR NOT NULL,
        content_type VARCHAR NOT NULL,
        content_length_bytes BIGINT NOT NULL,
        checksum_sha256 VARCHAR NOT NULL,
        scanner_status VARCHAR DEFAULT 'deferred' NOT NULL,
        scanner_checked_at TIMESTAMP WITH TIME ZONE,
        scanner_details_json JSONB,
        created_by UUID NOT NULL,
        archived_by UUID,
        archive_reason VARCHAR,
        id UUID DEFAULT gen_random_uuid() NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
        archived_at TIMESTAMP WITH TIME ZONE,
        CONSTRAINT pk_stored_files PRIMARY KEY (id),
        CONSTRAINT uq_stored_files_storage_key UNIQUE (storage_key),
        CONSTRAINT ck_stored_files_content_length_positive CHECK (content_length_bytes > 0),
        CONSTRAINT ck_stored_files_scanner_status
            CHECK (scanner_status in ('deferred', 'pending', 'clean', 'blocked', 'error')),
        CONSTRAINT fk_stored_files_created_by_users FOREIGN KEY(created_by) REFERENCES users (id),
        CONSTRAINT fk_stored_files_archived_by_users FOREIGN KEY(archived_by) REFERENCES users (id)
    )
    """,
    """
    CREATE TABLE card_attachments (
        card_id UUID NOT NULL,
        stored_file_id UUID NOT NULL,
        title VARCHAR NOT NULL,
        description VARCHAR,
        position INTEGER DEFAULT '0' NOT NULL,
        created_by UUID NOT NULL,
        archived_by UUID,
        archive_reason VARCHAR,
        id UUID DEFAULT gen_random_uuid() NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
        archived_at TIMESTAMP WITH TIME ZONE,
        CONSTRAINT pk_card_attachments PRIMARY KEY (id),
        CONSTRAINT ck_card_attachments_position_non_negative CHECK (position >= 0),
        CONSTRAINT fk_card_attachments_card_id_cards FOREIGN KEY(card_id) REFERENCES cards (id),
        CONSTRAINT fk_card_attachments_stored_file_id_stored_files
            FOREIGN KEY(stored_file_id) REFERENCES stored_files (id),
        CONSTRAINT fk_card_attachments_created_by_users
            FOREIGN KEY(created_by) REFERENCES users (id),
        CONSTRAINT fk_card_attachments_archived_by_users
            FOREIGN KEY(archived_by) REFERENCES users (id)
    )
    """,
)


INDEX_DDL: tuple[str, ...] = (
    "CREATE INDEX ix_stored_files_checksum_sha256 ON stored_files (checksum_sha256)",
    "CREATE INDEX ix_stored_files_created_by ON stored_files (created_by)",
    "CREATE INDEX ix_card_attachments_card_id ON card_attachments (card_id)",
    "CREATE INDEX ix_card_attachments_stored_file_id ON card_attachments (stored_file_id)",
    "CREATE INDEX ix_card_attachments_card_archive ON card_attachments (card_id, archived_at)",
)


DROP_DDL: tuple[str, ...] = (
    "DROP TABLE IF EXISTS public.card_attachments CASCADE",
    "DROP TABLE IF EXISTS public.stored_files CASCADE",
)


def upgrade() -> None:
    for statement in TABLE_DDL:
        op.execute(statement)
    for statement in INDEX_DDL:
        op.execute(statement)


def downgrade() -> None:
    for statement in DROP_DDL:
        op.execute(statement)
