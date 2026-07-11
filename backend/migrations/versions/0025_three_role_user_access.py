"""consolidate user access into three business roles

Revision ID: 0025_three_role_access
Revises: 0024_card_public_access
Create Date: 2026-07-11
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0025_three_role_access"
down_revision: str | None = "0024_card_public_access"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("can_manage_access", sa.Boolean(), server_default=sa.false(), nullable=False),
        schema="public",
    )

    op.execute(
        """
        INSERT INTO public.permissions (code, description)
        VALUES
            ('organizations.manage', 'Управление организациями в разрешенной области.'),
            ('registry.schema.manage', 'Управление схемой реестра, блоками и полями.'),
            ('cards.manage', 'Управление карточками в разрешенной области организаций.'),
            ('audit.read', 'Чтение событий аудита.'),
            ('users.manage', 'Управление пользователями.'),
            ('roles.read', 'Чтение ролей.'),
            ('permissions.read', 'Чтение прав.'),
            ('access_grants.manage', 'Управление правами доступа.')
        ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description
        """
    )
    op.execute(
        """
        INSERT INTO public.roles (code, name, description, is_system, archived_at)
        VALUES
            ('administrator', 'Администратор', 'Полное администрирование системы.', true, NULL),
            (
                'organization_administrator',
                'Администратор организации',
                'Управление всеми организациями и карточками без назначения прав доступа.',
                true,
                NULL
            ),
            (
                'subordinate_organization_administrator',
                'Администратор подведомственной организации',
                'Управление карточками и организациями в назначенной ветке.',
                true,
                NULL
            )
        ON CONFLICT (code) DO UPDATE
        SET name = EXCLUDED.name,
            description = EXCLUDED.description,
            is_system = true,
            archived_at = NULL
        """
    )
    op.execute(
        """
        DELETE FROM public.role_permissions
        WHERE role_id IN (
            SELECT id FROM public.roles
            WHERE code IN (
                'administrator',
                'organization_administrator',
                'subordinate_organization_administrator'
            )
        )
        """
    )
    op.execute(
        """
        INSERT INTO public.role_permissions (role_id, permission_id)
        SELECT role.id, permission.id
        FROM (
            VALUES
                ('administrator', 'organizations.manage'),
                ('administrator', 'registry.schema.manage'),
                ('administrator', 'cards.manage'),
                ('administrator', 'audit.read'),
                ('administrator', 'users.manage'),
                ('administrator', 'roles.read'),
                ('administrator', 'permissions.read'),
                ('administrator', 'access_grants.manage'),
                ('organization_administrator', 'organizations.manage'),
                ('organization_administrator', 'registry.schema.manage'),
                ('organization_administrator', 'cards.manage'),
                ('organization_administrator', 'audit.read'),
                ('organization_administrator', 'users.manage'),
                ('organization_administrator', 'roles.read'),
                ('organization_administrator', 'permissions.read'),
                ('subordinate_organization_administrator', 'organizations.manage'),
                ('subordinate_organization_administrator', 'cards.manage')
        ) AS expected(role_code, permission_code)
        JOIN public.roles AS role ON role.code = expected.role_code
        JOIN public.permissions AS permission ON permission.code = expected.permission_code
        """
    )
    op.execute(
        """
        INSERT INTO public.access_grants (
            user_id,
            role_id,
            registry_id,
            organization_id,
            include_descendants,
            valid_from,
            valid_to,
            created_by
        )
        SELECT
            legacy.user_id,
            replacement.id,
            legacy.registry_id,
            legacy.organization_id,
            legacy.include_descendants,
            legacy.valid_from,
            legacy.valid_to,
            legacy.created_by
        FROM public.access_grants AS legacy
        JOIN public.roles AS old_role ON old_role.id = legacy.role_id
        JOIN public.roles AS replacement
            ON replacement.code = 'subordinate_organization_administrator'
        WHERE old_role.code = 'org_admin'
          AND legacy.archived_at IS NULL
        ON CONFLICT DO NOTHING
        """
    )
    op.execute(
        """
        UPDATE public.access_grants
        SET archived_at = now()
        WHERE archived_at IS NULL
          AND role_id IN (
              SELECT id FROM public.roles
              WHERE code NOT IN (
                  'administrator',
                  'organization_administrator',
                  'subordinate_organization_administrator'
              )
          )
        """
    )
    op.execute(
        """
        UPDATE public.roles
        SET archived_at = now()
        WHERE archived_at IS NULL
          AND code NOT IN (
              'administrator',
              'organization_administrator',
              'subordinate_organization_administrator'
          )
        """
    )


def downgrade() -> None:
    op.drop_column("users", "can_manage_access", schema="public")
