"""add default registry metadata for organization tree

Revision ID: 0016_default_registry_tree
Revises: 0015_audit_created_at_default
Create Date: 2026-07-01
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0016_default_registry_tree"
down_revision: str | None = "0015_audit_created_at_default"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "registries",
        sa.Column(
            "owner_organization_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
        schema="public",
    )
    op.add_column(
        "registries",
        sa.Column(
            "is_default_for_owner_tree",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        schema="public",
    )
    op.create_foreign_key(
        "fk_registries_owner_organization_id_organizations",
        "registries",
        "organizations",
        ["owner_organization_id"],
        ["id"],
        source_schema="public",
        referent_schema="public",
    )
    op.create_check_constraint(
        "ck_registries_default_owner_requires_owner",
        "registries",
        "is_default_for_owner_tree = false or owner_organization_id is not null",
        schema="public",
    )
    op.create_index(
        "ix_registries_owner_organization_id",
        "registries",
        ["owner_organization_id"],
        unique=False,
        schema="public",
    )
    op.create_index(
        "uq_registries_default_owner_tree_active",
        "registries",
        ["owner_organization_id"],
        unique=True,
        postgresql_where=sa.text("is_default_for_owner_tree = true and archived_at is null"),
        schema="public",
    )


def downgrade() -> None:
    op.drop_index(
        "uq_registries_default_owner_tree_active",
        table_name="registries",
        schema="public",
    )
    op.drop_index(
        "ix_registries_owner_organization_id",
        table_name="registries",
        schema="public",
    )
    op.drop_constraint(
        "ck_registries_default_owner_requires_owner",
        "registries",
        schema="public",
        type_="check",
    )
    op.drop_constraint(
        "fk_registries_owner_organization_id_organizations",
        "registries",
        schema="public",
        type_="foreignkey",
    )
    op.drop_column("registries", "is_default_for_owner_tree", schema="public")
    op.drop_column("registries", "owner_organization_id", schema="public")
