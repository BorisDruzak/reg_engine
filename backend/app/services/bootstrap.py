from collections.abc import Sequence
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Permission, Role, User, role_permissions


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
    PermissionSeed("organizations.manage", "Manage organizations within granted scope."),
    PermissionSeed("registry.schema.manage", "Manage registry schema, blocks, and fields."),
    PermissionSeed("cards.manage", "Manage cards within granted organization scope."),
    PermissionSeed("audit.read", "Read audit events."),
    PermissionSeed("users.manage", "Manage users."),
    PermissionSeed("roles.read", "Read roles."),
    PermissionSeed("permissions.read", "Read permissions."),
    PermissionSeed("access_grants.manage", "Manage access grants."),
)

CORE_ROLE_SEEDS: tuple[RoleSeed, ...] = (
    RoleSeed(
        code="system_admin",
        name="System admin",
        description="Full system administration role.",
        permission_codes=tuple(seed.code for seed in CORE_PERMISSION_SEEDS),
    ),
    RoleSeed(
        code="registry_admin",
        name="Registry admin",
        description="Registry schema and card administration role.",
        permission_codes=("registry.schema.manage", "cards.manage"),
    ),
    RoleSeed(
        code="org_admin",
        name="Organization admin",
        description="Organization branch and card administration role.",
        permission_codes=("organizations.manage", "cards.manage"),
    ),
    RoleSeed(
        code="auditor",
        name="Auditor",
        description="Audit read-only role.",
        permission_codes=("audit.read",),
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
            for permission_code in role_seed.permission_codes:
                permission = permissions_by_code[permission_code]
                if not self._role_permission_exists(role.id, permission.id):
                    self.session.execute(
                        role_permissions.insert().values(
                            role_id=role.id,
                            permission_id=permission.id,
                        )
                    )
                    links_created += 1

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

    def _role_permission_exists(self, role_id: object, permission_id: object) -> bool:
        result = self.session.scalar(
            select(role_permissions.c.role_id).where(
                role_permissions.c.role_id == role_id,
                role_permissions.c.permission_id == permission_id,
            )
        )
        return result is not None
