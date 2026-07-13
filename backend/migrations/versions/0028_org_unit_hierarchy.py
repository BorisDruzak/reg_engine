"""enforce organization unit hierarchy

Revision ID: 0028_org_unit_hierarchy
Revises: 0027_card_creation_links
Create Date: 2026-07-13
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0028_org_unit_hierarchy"
down_revision: str | None = "0027_card_creation_links"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM public.org_units
                WHERE type IS NULL OR type NOT IN ('management', 'department')
            ) THEN
                RAISE EXCEPTION 'org_units contains a null or unsupported type';
            END IF;
            IF EXISTS (
                SELECT 1
                FROM public.org_units
                WHERE type = 'management' AND parent_id IS NOT NULL
            ) THEN
                RAISE EXCEPTION 'org_units contains a management with a parent';
            END IF;
            IF EXISTS (
                SELECT 1
                FROM public.org_units AS child
                LEFT JOIN public.org_units AS parent ON parent.id = child.parent_id
                WHERE child.parent_id IS NOT NULL
                  AND (
                      child.type <> 'department'
                      OR parent.id IS NULL
                      OR parent.type <> 'management'
                      OR parent.organization_id <> child.organization_id
                  )
            ) THEN
                RAISE EXCEPTION 'org_units contains an invalid department parent relationship';
            END IF;
        END $$;
        """
    )
    op.alter_column(
        "org_units",
        "type",
        existing_type=sa.String(),
        nullable=False,
        schema="public",
    )
    op.create_check_constraint(
        "type",
        "org_units",
        "type IN ('management', 'department')",
        schema="public",
    )
    op.create_check_constraint(
        "management_is_root",
        "org_units",
        "type <> 'management' OR parent_id IS NULL",
        schema="public",
    )


def downgrade() -> None:
    op.drop_constraint(
        "management_is_root",
        "org_units",
        type_="check",
        schema="public",
    )
    op.drop_constraint(
        "type",
        "org_units",
        type_="check",
        schema="public",
    )
    op.alter_column(
        "org_units",
        "type",
        existing_type=sa.String(),
        nullable=True,
        schema="public",
    )
