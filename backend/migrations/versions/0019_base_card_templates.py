"""enforce base card templates

Revision ID: 0019_base_card_templates
Revises: 0018_card_templates
Create Date: 2026-07-02
"""

from collections.abc import Sequence

from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0019_base_card_templates"
down_revision: str | None = "0018_card_templates"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        WITH registry_fields AS (
            SELECT
                r.id AS registry_id,
                COALESCE(
                    jsonb_agg(
                        f.id::text
                        ORDER BY b.position, f.position, f.label, f.id
                    ) FILTER (WHERE f.id IS NOT NULL),
                    '[]'::jsonb
                ) AS field_ids
            FROM public.registries r
            LEFT JOIN public.form_blocks b
                ON b.registry_id = r.id
                AND b.archived_at IS NULL
                AND b.is_active IS TRUE
            LEFT JOIN public.form_fields f
                ON f.block_id = b.id
                AND f.archived_at IS NULL
                AND f.is_active IS TRUE
            GROUP BY r.id
        )
        INSERT INTO public.card_templates (
            registry_id,
            code,
            name,
            description,
            position,
            field_schema_json,
            default_values_json,
            is_active,
            created_at,
            updated_at
        )
        SELECT
            registry_id,
            'base_template',
            'Базовый шаблон',
            'Автоматический шаблон из текущей схемы карточки.',
            0,
            jsonb_build_object('field_ids', field_ids),
            '[]'::jsonb,
            true,
            now(),
            now()
        FROM registry_fields
        ON CONFLICT (registry_id, code)
        DO UPDATE SET
            field_schema_json = EXCLUDED.field_schema_json,
            is_active = true,
            archived_at = NULL,
            archived_by = NULL,
            archive_reason = NULL,
            updated_at = now()
        """
    )
    op.execute(
        """
        UPDATE public.cards AS c
        SET
            card_template_id = t.id,
            updated_at = now()
        FROM public.card_templates AS t
        WHERE
            c.card_template_id IS NULL
            AND t.registry_id = c.registry_id
            AND t.code = 'base_template'
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM public.cards WHERE card_template_id IS NULL
            ) THEN
                RAISE EXCEPTION
                    'cards.card_template_id cannot be enforced while null values remain';
            END IF;
        END $$;
        """
    )
    op.alter_column(
        "cards",
        "card_template_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=False,
        schema="public",
    )


def downgrade() -> None:
    op.alter_column(
        "cards",
        "card_template_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=True,
        schema="public",
    )
