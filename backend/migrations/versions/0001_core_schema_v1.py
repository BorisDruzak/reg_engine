"""create core schema v1

Revision ID: 0001_core_schema_v1
Revises:
Create Date: 2026-06-27
"""

from collections.abc import Sequence

from alembic import op

from app.domain.constants import SEED_PERMISSIONS, SEED_ROLES
from app.models import Base

revision: str = "0001_core_schema_v1"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
    Base.metadata.create_all(bind=op.get_bind())
    _seed_roles_and_permissions()


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind())


def _seed_roles_and_permissions() -> None:
    roles = Base.metadata.tables["roles"]
    permissions = Base.metadata.tables["permissions"]

    op.bulk_insert(
        roles,
        [
            {
                "code": code,
                "name": name,
                "description": description,
                "is_system": is_system,
            }
            for code, name, description, is_system in SEED_ROLES
        ],
    )
    op.bulk_insert(
        permissions,
        [{"code": code, "description": code} for code in SEED_PERMISSIONS],
    )
    op.execute(
        """
        insert into role_permissions (role_id, permission_id)
        select roles.id, permissions.id
        from roles
        cross join permissions
        where roles.code in ('system_admin', 'org_admin')
        """
    )
