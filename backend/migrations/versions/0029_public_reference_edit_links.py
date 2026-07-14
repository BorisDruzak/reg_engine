"""add public reference edit links

Revision ID: 0029_public_reference_edit_links
Revises: 0028_org_unit_hierarchy
Create Date: 2026-07-14
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0029_public_reference_edit_links"
down_revision: str | None = "0028_org_unit_hierarchy"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "reference_edit_links",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("registry_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("owner_organization_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("token_hash", sa.String(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["owner_organization_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["registry_id"], ["registries.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
        schema="public",
    )
    op.create_index(
        "ix_reference_edit_links_registry_id",
        "reference_edit_links",
        ["registry_id"],
        schema="public",
    )
    op.create_index(
        "ix_reference_edit_links_owner_organization_id",
        "reference_edit_links",
        ["owner_organization_id"],
        schema="public",
    )
    op.create_index(
        "ix_reference_edit_links_creator_id",
        "reference_edit_links",
        ["created_by"],
        schema="public",
    )
    op.add_column(
        "reference_lists",
        sa.Column(
            "created_via_reference_edit_link_id", postgresql.UUID(as_uuid=True), nullable=True
        ),
        schema="public",
    )
    op.create_foreign_key(
        "fk_reference_lists_created_via_reference_edit_link_id",
        "reference_lists",
        "reference_edit_links",
        ["created_via_reference_edit_link_id"],
        ["id"],
        source_schema="public",
        referent_schema="public",
    )
    op.add_column(
        "audit_events",
        sa.Column("actor_reference_edit_link_id", postgresql.UUID(as_uuid=True), nullable=True),
        schema="public",
    )
    op.create_foreign_key(
        "fk_audit_events_actor_reference_edit_link_id",
        "audit_events",
        "reference_edit_links",
        ["actor_reference_edit_link_id"],
        ["id"],
        source_schema="public",
        referent_schema="public",
    )
    op.create_index(
        "ix_audit_events_actor_reference_edit_link_id",
        "audit_events",
        ["actor_reference_edit_link_id"],
        schema="public",
    )
    op.drop_constraint("actor_type", "audit_events", type_="check", schema="public")
    op.create_check_constraint(
        "actor_type",
        "audit_events",
        "actor_type in ('user', 'public_link', 'reference_edit_link', 'system')",
        schema="public",
    )
    op.execute("ALTER TABLE public.audit_events DROP CONSTRAINT ck_audit_events_source")
    op.execute(
        """
        ALTER TABLE public.audit_events
        ADD CONSTRAINT ck_audit_events_source
        CHECK (source in ('api', 'public_link', 'reference_edit_link', 'system', 'mcp'))
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE public.audit_events DROP CONSTRAINT ck_audit_events_source")
    op.execute(
        """
        ALTER TABLE public.audit_events
        ADD CONSTRAINT ck_audit_events_source
        CHECK (source in ('api', 'public_link', 'system', 'mcp'))
        """
    )
    op.drop_constraint("actor_type", "audit_events", type_="check", schema="public")
    op.create_check_constraint(
        "actor_type",
        "audit_events",
        "actor_type in ('user', 'public_link', 'system')",
        schema="public",
    )
    op.drop_index(
        "ix_audit_events_actor_reference_edit_link_id", table_name="audit_events", schema="public"
    )
    op.drop_constraint(
        "fk_audit_events_actor_reference_edit_link_id",
        "audit_events",
        type_="foreignkey",
        schema="public",
    )
    op.drop_column("audit_events", "actor_reference_edit_link_id", schema="public")
    op.drop_constraint(
        "fk_reference_lists_created_via_reference_edit_link_id",
        "reference_lists",
        type_="foreignkey",
        schema="public",
    )
    op.drop_column("reference_lists", "created_via_reference_edit_link_id", schema="public")
    op.drop_index(
        "ix_reference_edit_links_creator_id", table_name="reference_edit_links", schema="public"
    )
    op.drop_index(
        "ix_reference_edit_links_owner_organization_id",
        table_name="reference_edit_links",
        schema="public",
    )
    op.drop_index(
        "ix_reference_edit_links_registry_id", table_name="reference_edit_links", schema="public"
    )
    op.drop_table("reference_edit_links", schema="public")
