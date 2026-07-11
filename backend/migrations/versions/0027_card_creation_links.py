"""add card creation links

Revision ID: 0027_card_creation_links
Revises: 0026_reuse_archived_field_codes
Create Date: 2026-07-12
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0027_card_creation_links"
down_revision: str | None = "0026_reuse_archived_field_codes"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "card_public_links",
        "expires_at",
        existing_type=postgresql.TIMESTAMP(timezone=True),
        nullable=True,
        schema="public",
    )
    op.create_table(
        "card_creation_links",
        sa.Column("registry_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("card_template_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("token_hash", sa.String(), nullable=False),
        sa.Column("token_ciphertext", sa.Text(), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("closed_at", postgresql.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("closed_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("expires_at", postgresql.TIMESTAMP(timezone=True), nullable=True),
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            postgresql.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["registry_id"], ["registries.id"]),
        sa.ForeignKeyConstraint(["card_template_id"], ["card_templates.id"]),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["closed_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash", name="uq_card_creation_links_token_hash"),
        schema="public",
    )
    op.create_index(
        "ix_card_creation_links_registry_id",
        "card_creation_links",
        ["registry_id"],
        schema="public",
    )
    op.create_index(
        "ix_card_creation_links_template_id",
        "card_creation_links",
        ["card_template_id"],
        schema="public",
    )
    op.create_index(
        "ix_card_creation_links_token_hash", "card_creation_links", ["token_hash"], schema="public"
    )
    op.create_index(
        "ix_card_creation_links_closed_at", "card_creation_links", ["closed_at"], schema="public"
    )
    op.create_table(
        "card_creation_link_organizations",
        sa.Column("creation_link_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["creation_link_id"], ["card_creation_links.id"]),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "creation_link_id",
            "organization_id",
            name="uq_card_creation_link_organizations_link_org",
        ),
        schema="public",
    )
    op.create_index(
        "ix_card_creation_link_organizations_link_id",
        "card_creation_link_organizations",
        ["creation_link_id"],
        schema="public",
    )
    op.create_index(
        "ix_card_creation_link_organizations_organization_id",
        "card_creation_link_organizations",
        ["organization_id"],
        schema="public",
    )
    op.create_table(
        "card_creation_link_cards",
        sa.Column("creation_link_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("card_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("child_public_link_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("child_token_ciphertext", sa.Text(), nullable=False),
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            postgresql.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["creation_link_id"], ["card_creation_links.id"]),
        sa.ForeignKeyConstraint(["card_id"], ["cards.id"]),
        sa.ForeignKeyConstraint(["child_public_link_id"], ["card_public_links.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "creation_link_id", "card_id", name="uq_card_creation_link_cards_link_card"
        ),
        sa.UniqueConstraint("card_id", name="uq_card_creation_link_cards_card_id"),
        sa.UniqueConstraint(
            "child_public_link_id", name="uq_card_creation_link_cards_child_link_id"
        ),
        schema="public",
    )
    op.create_index(
        "ix_card_creation_link_cards_link_id",
        "card_creation_link_cards",
        ["creation_link_id"],
        schema="public",
    )
    op.create_index(
        "ix_card_creation_link_cards_card_id",
        "card_creation_link_cards",
        ["card_id"],
        schema="public",
    )


def downgrade() -> None:
    op.drop_index(
        "ix_card_creation_link_cards_card_id",
        table_name="card_creation_link_cards",
        schema="public",
    )
    op.drop_index(
        "ix_card_creation_link_cards_link_id",
        table_name="card_creation_link_cards",
        schema="public",
    )
    op.drop_table("card_creation_link_cards", schema="public")
    op.drop_index(
        "ix_card_creation_link_organizations_organization_id",
        table_name="card_creation_link_organizations",
        schema="public",
    )
    op.drop_index(
        "ix_card_creation_link_organizations_link_id",
        table_name="card_creation_link_organizations",
        schema="public",
    )
    op.drop_table("card_creation_link_organizations", schema="public")
    op.drop_index(
        "ix_card_creation_links_closed_at", table_name="card_creation_links", schema="public"
    )
    op.drop_index(
        "ix_card_creation_links_token_hash", table_name="card_creation_links", schema="public"
    )
    op.drop_index(
        "ix_card_creation_links_template_id", table_name="card_creation_links", schema="public"
    )
    op.drop_index(
        "ix_card_creation_links_registry_id", table_name="card_creation_links", schema="public"
    )
    op.drop_table("card_creation_links", schema="public")
    # The previous schema required an expiry value. Preserve existing child
    # links during a downgrade by making formerly indefinite links expired,
    # rather than failing the migration or deleting them.
    op.execute("UPDATE card_public_links SET expires_at = now() WHERE expires_at IS NULL")
    op.alter_column(
        "card_public_links",
        "expires_at",
        existing_type=postgresql.TIMESTAMP(timezone=True),
        nullable=False,
        schema="public",
    )
