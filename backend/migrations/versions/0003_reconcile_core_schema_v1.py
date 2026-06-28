"""reconcile core schema v1 constraints and indexes

Revision ID: 0003_reconcile_core_schema_v1
Revises: 0002_core_schema_v1
Create Date: 2026-06-28
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0003_reconcile_core_schema_v1"
down_revision: str | None = "0002_core_schema_v1"
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


def _create_check_constraint_if_missing(
    table_name: str,
    constraint_name: str,
    expression_sql: str,
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
                ADD CONSTRAINT {constraint_name} CHECK ({expression_sql});
            END IF;
        END
        $$;
        """
    )


def upgrade() -> None:
    _create_unique_constraint_if_missing(
        "card_relations",
        "uq_card_relations_source_target_type",
        "source_card_id, target_card_id, relation_type",
    )

    _create_check_constraint_if_missing(
        "organizations",
        "ck_organizations_parent_not_self",
        "parent_id IS NULL OR parent_id <> id",
    )
    _create_check_constraint_if_missing(
        "organization_closure",
        "ck_organization_closure_depth_non_negative",
        "depth >= 0",
    )
    _create_check_constraint_if_missing(
        "registries",
        "ck_registries_status",
        "lifecycle_status in ('draft', 'active', 'archived')",
    )
    _create_check_constraint_if_missing(
        "form_blocks",
        "ck_form_blocks_min_non_negative",
        "min_instances IS NULL OR min_instances >= 0",
    )
    _create_check_constraint_if_missing(
        "form_blocks",
        "ck_form_blocks_max_non_negative",
        "max_instances IS NULL OR max_instances >= 0",
    )

    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_role_permissions_role_id "
        "ON public.role_permissions (role_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_role_permissions_permission_id "
        "ON public.role_permissions (permission_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_reference_items_parent_id "
        "ON public.reference_items (parent_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_field_value_items_reference_item_id "
        "ON public.field_value_items (reference_item_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_card_public_links_expires_at "
        "ON public.card_public_links (expires_at)"
    )


def downgrade() -> None:
    """No-op: this revision reconciles existing production schema drift."""
