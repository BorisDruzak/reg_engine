"""harden core service schema constraints

Revision ID: 0004_core_service_hardening
Revises: 0003_reconcile_core_schema_v1
Create Date: 2026-06-28
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0004_core_service_hardening"
down_revision: str | None = "0003_reconcile_core_schema_v1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _create_unique_constraint_if_missing(
    table_name: str,
    constraint_name: str,
    columns_sql: str,
) -> None:
    op.execute(
        f"""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint
                WHERE conname = '{constraint_name}'
                  AND conrelid = 'public.{table_name}'::regclass
            ) THEN
                ALTER TABLE public.{table_name}
                ADD CONSTRAINT {constraint_name} UNIQUE ({columns_sql});
            END IF;
        END
        $$;
        """
    )


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE IF EXISTS public.access_grants
        DROP CONSTRAINT IF EXISTS uq_access_grants_user_role_organization
        """
    )
    op.execute(
        """
        ALTER TABLE IF EXISTS public.card_block_instances
        DROP CONSTRAINT IF EXISTS uq_card_block_instances_card_id_block_id
        """
    )

    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS
        uq_access_grants_user_role_registry_organization_scope
        ON public.access_grants (
            user_id,
            role_id,
            coalesce(registry_id, '00000000-0000-0000-0000-000000000000'::uuid),
            coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid)
        )
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS
        uq_reference_lists_registry_owner_code_scope
        ON public.reference_lists (
            coalesce(registry_id, '00000000-0000-0000-0000-000000000000'::uuid),
            coalesce(owner_organization_id, '00000000-0000-0000-0000-000000000000'::uuid),
            code
        )
        """
    )
    _create_unique_constraint_if_missing(
        "card_block_instances",
        "uq_card_block_instances_card_id_block_id_ordinal",
        "card_id, block_id, ordinal",
    )


def downgrade() -> None:
    """No-op: production rollback must be planned from live schema and data state."""
