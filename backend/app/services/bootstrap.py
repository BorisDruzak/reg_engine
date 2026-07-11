from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.models import AccessGrant, Permission, Role, User, role_permissions


@dataclass(frozen=True)
class PermissionSeed:
    code: str
    description: str


@dataclass(frozen=True)
class RoleSeed:
    code: str
    name: str
    description: str
    permission_codes: tuple[str, ...]


@dataclass(frozen=True)
class BootstrapSeedResult:
    permissions_created: int
    roles_created: int
    role_permission_links_created: int


CORE_PERMISSION_SEEDS: tuple[PermissionSeed, ...] = (
    PermissionSeed("organizations.manage", "Управление организациями в разрешенной области."),
    PermissionSeed("registry.schema.manage", "Управление схемой реестра, блоками и полями."),
    PermissionSeed("cards.manage", "Управление карточками в разрешенной области организаций."),
    PermissionSeed("audit.read", "Чтение событий аудита."),
    PermissionSeed("users.manage", "Управление пользователями."),
    PermissionSeed("roles.read", "Чтение ролей."),
    PermissionSeed("permissions.read", "Чтение прав."),
    PermissionSeed("access_grants.manage", "Управление правами доступа."),
)

CANONICAL_ROLE_CODES = frozenset(
    {
        "administrator",
        "organization_administrator",
        "subordinate_organization_administrator",
    }
)


CORE_ROLE_SEEDS: tuple[RoleSeed, ...] = (
    RoleSeed(
        code="administrator",
        name="Администратор",
        description="Полное администрирование системы.",
        permission_codes=tuple(seed.code for seed in CORE_PERMISSION_SEEDS),
    ),
    RoleSeed(
        code="organization_administrator",
        name="Администратор организации",
        description="Управление всеми организациями и карточками без назначения прав доступа.",
        permission_codes=tuple(
            seed.code for seed in CORE_PERMISSION_SEEDS if seed.code != "access_grants.manage"
        ),
    ),
    RoleSeed(
        code="subordinate_organization_administrator",
        name="Администратор подведомственной организации",
        description="Управление карточками и организациями в назначенной ветке.",
        permission_codes=("organizations.manage", "cards.manage"),
    ),
)


class BootstrapService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def seed_defaults(
        self,
        *,
        permission_seeds: Sequence[PermissionSeed] = CORE_PERMISSION_SEEDS,
        role_seeds: Sequence[RoleSeed] = CORE_ROLE_SEEDS,
    ) -> BootstrapSeedResult:
        permissions_created = 0
        roles_created = 0
        links_created = 0

        permissions_by_code: dict[str, Permission] = {}
        for permission_seed in permission_seeds:
            permission = self._get_permission(permission_seed.code)
            if permission is None:
                permission = Permission(
                    code=permission_seed.code,
                    description=permission_seed.description,
                )
                self.session.add(permission)
                permissions_created += 1
            else:
                permission.description = permission_seed.description
            permissions_by_code[permission_seed.code] = permission

        self.session.flush()

        canonical_role_codes = {role_seed.code for role_seed in role_seeds}
        if canonical_role_codes == set(CANONICAL_ROLE_CODES):
            self._archive_noncanonical_roles(now=datetime.now(UTC))

        for role_seed in role_seeds:
            role = self._get_role(role_seed.code)
            if role is None:
                role = Role(
                    code=role_seed.code,
                    name=role_seed.name,
                    description=role_seed.description,
                    is_system=True,
                )
                self.session.add(role)
                roles_created += 1
            else:
                role.name = role_seed.name
                role.description = role_seed.description
                role.is_system = True
                role.archived_at = None

            self.session.flush()
            links_created += self._reconcile_role_permissions(
                role=role,
                permissions_by_code=permissions_by_code,
                permission_codes=role_seed.permission_codes,
            )

        self.session.flush()
        return BootstrapSeedResult(
            permissions_created=permissions_created,
            roles_created=roles_created,
            role_permission_links_created=links_created,
        )

    def create_superadmin(
        self,
        *,
        email: str,
        display_name: str,
        password_hash: str | None = None,
    ) -> User:
        normalized_email = email.strip().lower()
        if not normalized_email:
            raise ValueError("Superadmin email is required.")
        if not display_name.strip():
            raise ValueError("Superadmin display name is required.")

        user = self.session.scalars(
            select(User).where(func.lower(User.email) == normalized_email)
        ).one_or_none()
        if user is None:
            user = User(
                email=normalized_email,
                display_name=display_name,
                password_hash=password_hash,
                status="active",
                is_superuser=True,
            )
            self.session.add(user)
        else:
            user.email = normalized_email
            user.display_name = display_name
            user.status = "active"
            user.is_superuser = True
            user.archived_at = None
            if password_hash is not None:
                user.password_hash = password_hash

        self.session.flush()
        return user

    def _get_permission(self, code: str) -> Permission | None:
        return self.session.scalars(select(Permission).where(Permission.code == code)).one_or_none()

    def _get_role(self, code: str) -> Role | None:
        return self.session.scalars(select(Role).where(Role.code == code)).one_or_none()

    def _archive_noncanonical_roles(self, *, now: datetime) -> None:
        legacy_role_ids = list(
            self.session.scalars(
                select(Role.id).where(
                    Role.archived_at.is_(None),
                    Role.code.not_in(CANONICAL_ROLE_CODES),
                )
            )
        )
        if not legacy_role_ids:
            return

        self.session.execute(
            update(AccessGrant)
            .where(
                AccessGrant.role_id.in_(legacy_role_ids),
                AccessGrant.archived_at.is_(None),
            )
            .values(archived_at=now)
        )
        self.session.execute(
            update(Role).where(Role.id.in_(legacy_role_ids)).values(archived_at=now)
        )

    def _reconcile_role_permissions(
        self,
        *,
        role: Role,
        permissions_by_code: dict[str, Permission],
        permission_codes: tuple[str, ...],
    ) -> int:
        desired_permission_ids = {
            permissions_by_code[permission_code].id for permission_code in permission_codes
        }
        existing_permission_ids = set(
            self.session.scalars(
                select(role_permissions.c.permission_id).where(
                    role_permissions.c.role_id == role.id
                )
            )
        )
        stale_permission_ids = existing_permission_ids - desired_permission_ids
        if stale_permission_ids:
            self.session.execute(
                delete(role_permissions).where(
                    role_permissions.c.role_id == role.id,
                    role_permissions.c.permission_id.in_(stale_permission_ids),
                )
            )

        missing_permission_ids = desired_permission_ids - existing_permission_ids
        for permission_id in missing_permission_ids:
            self.session.execute(
                role_permissions.insert().values(
                    role_id=role.id,
                    permission_id=permission_id,
                )
            )
        return len(missing_permission_ids)
