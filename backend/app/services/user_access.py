from collections.abc import Sequence
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from app.models import (
    AccessGrant,
    Organization,
    OrganizationClosure,
    Permission,
    Registry,
    Role,
    User,
    role_permissions,
)
from app.services.audit import AuditService
from app.services.auth import hash_password
from app.services.permissions import PermissionDeniedError, PermissionService

BUSINESS_ROLE_CODES = frozenset(
    {
        "administrator",
        "organization_administrator",
        "subordinate_organization_administrator",
    }
)
ADMINISTRATOR_ROLE_CODE = "administrator"
ORGANIZATION_ADMINISTRATOR_ROLE_CODE = "organization_administrator"
SUBORDINATE_ORGANIZATION_ADMINISTRATOR_ROLE_CODE = "subordinate_organization_administrator"


class UserAccessError(ValueError):
    """Raised when user/access management input is invalid."""


class UserAccessNotFoundError(UserAccessError):
    """Raised when a user/access management object is not found."""


class UserAccessConflictError(UserAccessError):
    """Raised when user/access management input conflicts with existing data."""


class UserAccessService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.permissions = PermissionService(session)

    def user_read_data(self, user: User) -> dict[str, object]:
        profile = self._user_role_profile(user)
        return {
            "id": user.id,
            "email": user.email,
            "display_name": user.display_name,
            "status": user.status,
            "is_superuser": user.is_superuser,
            "role_code": profile["role_code"],
            "organization_ids": profile["organization_ids"],
            "can_manage_access": user.can_manage_access,
            "archived_at": user.archived_at,
        }

    def list_users_for_actor(self, *, actor_user_id: UUID) -> list[User]:
        if self.permissions.is_superuser(actor_user_id):
            return list(
                self.session.scalars(
                    select(User)
                    .where(User.archived_at.is_(None))
                    .order_by(func.lower(User.email), User.id)
                ).all()
            )

        self._require_permission(actor_user_id, "users.manage")
        scope_ids = self.permissions.get_organization_scope_ids(actor_user_id)
        if not scope_ids:
            return []

        return list(
            self.session.scalars(
                select(User)
                .join(AccessGrant, AccessGrant.user_id == User.id)
                .where(
                    User.archived_at.is_(None),
                    AccessGrant.archived_at.is_(None),
                    or_(
                        AccessGrant.organization_id.is_(None),
                        AccessGrant.organization_id.in_(scope_ids),
                    ),
                )
                .distinct()
                .order_by(User.email, User.id)
            ).all()
        )

    def read_user_for_actor(self, *, actor_user_id: UUID, user_id: UUID) -> User:
        user = self._get_existing_user(user_id)
        if self.permissions.is_superuser(actor_user_id):
            return user

        self._require_permission(actor_user_id, "users.manage")
        visible_ids = {item.id for item in self.list_users_for_actor(actor_user_id=actor_user_id)}
        if user.id not in visible_ids:
            raise PermissionDeniedError("Actor cannot read this user.")
        return user

    def create_user_for_actor(
        self,
        *,
        actor_user_id: UUID,
        email: str,
        display_name: str,
        password: str,
        status: str = "active",
        is_superuser: bool = False,
        role_code: str | None = None,
        organization_ids: Sequence[UUID] = (),
        can_manage_access: bool = False,
    ) -> User:
        actor_is_superuser = self.permissions.is_superuser(actor_user_id)
        if not actor_is_superuser:
            self._require_permission(actor_user_id, "users.manage")
            if is_superuser:
                raise PermissionDeniedError("Only a system admin can create superusers.")
            if can_manage_access:
                raise PermissionDeniedError("Only a system admin can manage access delegation.")

        requested_role_code = role_code
        if is_superuser:
            if requested_role_code not in {None, ADMINISTRATOR_ROLE_CODE}:
                raise UserAccessError("A superuser must use the administrator role.")
            requested_role_code = ADMINISTRATOR_ROLE_CODE
        normalized_organization_ids = self._prepare_role_profile(
            actor_user_id=actor_user_id,
            role_code=requested_role_code,
            organization_ids=organization_ids,
        )

        normalized_email = self._normalize_login(email)
        self._validate_display_name(display_name)
        self._validate_user_status(status, allow_archived=False)
        if self._user_by_email(normalized_email) is not None:
            raise UserAccessConflictError("User email already exists.")

        user = User(
            email=normalized_email,
            display_name=display_name.strip(),
            password_hash=hash_password(password),
            status=status,
            is_superuser=requested_role_code == ADMINISTRATOR_ROLE_CODE,
            can_manage_access=can_manage_access if actor_is_superuser else False,
        )
        self.session.add(user)
        self.session.flush()
        if requested_role_code is not None:
            self._apply_role_profile(
                actor_user_id=actor_user_id,
                user=user,
                role_code=requested_role_code,
                organization_ids=normalized_organization_ids,
            )
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="create",
            object_type="user",
            object_id=user.id,
            new_data_json=self._user_audit_data(user),
        )
        return user

    def update_user_for_actor(
        self,
        *,
        actor_user_id: UUID,
        user_id: UUID,
        email: str | None = None,
        display_name: str | None = None,
        password: str | None = None,
        status: str | None = None,
        is_superuser: bool | None = None,
        role_code: str | None = None,
        organization_ids: Sequence[UUID] | None = None,
        can_manage_access: bool | None = None,
    ) -> User:
        user = self._get_existing_user(user_id)
        actor_is_superuser = self.permissions.is_superuser(actor_user_id)
        if not actor_is_superuser:
            self._assert_can_manage_existing_user(actor_user_id, user)
            if is_superuser is not None and is_superuser != user.is_superuser:
                raise PermissionDeniedError("Only a system admin can change superuser status.")
            if can_manage_access is not None:
                raise PermissionDeniedError("Only a system admin can manage access delegation.")

        old_data = self._user_audit_data(user)
        old_profile = self._user_role_profile(user)
        if email is not None:
            normalized_email = self._normalize_login(email)
            existing = self._user_by_email(normalized_email)
            if existing is not None and existing.id != user.id:
                raise UserAccessConflictError("User email already exists.")
            user.email = normalized_email
        if display_name is not None:
            self._validate_display_name(display_name)
            user.display_name = display_name.strip()
        if password is not None:
            user.password_hash = hash_password(password)
        if status is not None:
            self._validate_user_status(status, allow_archived=False)
            user.status = status
        if is_superuser is not None and actor_is_superuser:
            user.is_superuser = is_superuser
        if can_manage_access is not None and actor_is_superuser:
            user.can_manage_access = can_manage_access

        profile_changed = role_code is not None or organization_ids is not None
        if profile_changed:
            effective_role_code = role_code or str(old_profile["role_code"])
            effective_organization_ids: Sequence[UUID]
            if organization_ids is None:
                saved_organization_ids = old_profile["organization_ids"]
                if not isinstance(saved_organization_ids, list) or not all(
                    isinstance(organization_id, UUID) for organization_id in saved_organization_ids
                ):
                    raise UserAccessError("User role profile is invalid.")
                effective_organization_ids = saved_organization_ids
            else:
                effective_organization_ids = organization_ids
            normalized_organization_ids = self._prepare_role_profile(
                actor_user_id=actor_user_id,
                role_code=effective_role_code,
                organization_ids=effective_organization_ids,
            )
            self._apply_role_profile(
                actor_user_id=actor_user_id,
                user=user,
                role_code=effective_role_code,
                organization_ids=normalized_organization_ids,
            )

        self.session.flush()
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="update",
            object_type="user",
            object_id=user.id,
            old_data_json=old_data,
            new_data_json=self._user_audit_data(user),
        )
        if profile_changed:
            AuditService(self.session).record_user_event(
                actor_user_id=actor_user_id,
                action="update",
                object_type="user_role_profile",
                object_id=user.id,
                old_data_json=old_profile,
                new_data_json=self._user_role_profile(user),
            )
        return user

    def archive_user_for_actor(self, *, actor_user_id: UUID, user_id: UUID) -> User:
        user = self._get_existing_user(user_id)
        actor_is_superuser = self.permissions.is_superuser(actor_user_id)
        if not actor_is_superuser:
            self._assert_can_manage_existing_user(actor_user_id, user)
        if user.id == actor_user_id:
            raise UserAccessError("Actor cannot archive the current user.")

        old_data = self._user_audit_data(user)
        user.status = "archived"
        user.archived_at = datetime.now(UTC)
        self.session.flush()
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="archive",
            object_type="user",
            object_id=user.id,
            old_data_json=old_data,
            new_data_json=self._user_audit_data(user),
        )
        return user

    def list_roles_for_actor(self, *, actor_user_id: UUID) -> list[Role]:
        self._require_permission(actor_user_id, "roles.read")
        return list(
            self.session.scalars(
                select(Role).where(Role.archived_at.is_(None)).order_by(Role.code, Role.id)
            ).all()
        )

    def read_role_for_actor(self, *, actor_user_id: UUID, role_id: UUID) -> Role:
        self._require_permission(actor_user_id, "roles.read")
        return self._get_active_role(role_id)

    def list_permissions_for_actor(self, *, actor_user_id: UUID) -> list[Permission]:
        self._require_permission(actor_user_id, "permissions.read")
        return list(
            self.session.scalars(select(Permission).order_by(Permission.code, Permission.id)).all()
        )

    def list_access_grants_for_actor(
        self,
        *,
        actor_user_id: UUID,
        user_id: UUID | None = None,
        organization_id: UUID | None = None,
        include_archived: bool = False,
    ) -> list[AccessGrant]:
        self._require_permission(actor_user_id, "access_grants.manage")
        criteria: list[ColumnElement[bool]] = []
        if not include_archived:
            criteria.append(AccessGrant.archived_at.is_(None))
        if user_id is not None:
            criteria.append(AccessGrant.user_id == user_id)
        if organization_id is not None:
            criteria.append(AccessGrant.organization_id == organization_id)

        if not self.permissions.is_superuser(actor_user_id):
            scope_ids = self.permissions.get_organization_scope_ids(actor_user_id)
            if not scope_ids:
                return []
            criteria.append(AccessGrant.organization_id.in_(scope_ids))

        return list(
            self.session.scalars(
                select(AccessGrant)
                .where(*criteria)
                .order_by(AccessGrant.created_at.desc(), AccessGrant.id)
            ).all()
        )

    def create_access_grant_for_actor(
        self,
        *,
        actor_user_id: UUID,
        user_id: UUID,
        role_id: UUID,
        organization_id: UUID | None,
        registry_id: UUID | None = None,
        include_descendants: bool = True,
        valid_from: datetime | None = None,
        valid_to: datetime | None = None,
    ) -> AccessGrant:
        self._get_grantable_user(user_id)
        role = self._get_active_role(role_id)
        self._validate_registry(registry_id)
        if organization_id is not None:
            self._get_active_organization(organization_id)
        if valid_from is not None and valid_to is not None and valid_to <= valid_from:
            raise UserAccessError("Grant valid_to must be later than valid_from.")

        actor_is_superuser = self.permissions.is_superuser(actor_user_id)
        if not actor_is_superuser:
            self._assert_scoped_actor_can_create_grant(
                actor_user_id=actor_user_id,
                role=role,
                organization_id=organization_id,
                registry_id=registry_id,
                include_descendants=include_descendants,
            )

        grant = self._matching_grant(
            user_id=user_id,
            role_id=role_id,
            registry_id=registry_id,
            organization_id=organization_id,
        )
        old_data = self._grant_audit_data(grant) if grant is not None else None
        if grant is None:
            grant = AccessGrant(
                user_id=user_id,
                role_id=role_id,
                organization_id=organization_id,
                registry_id=registry_id,
                include_descendants=include_descendants,
                valid_from=valid_from,
                valid_to=valid_to,
                created_by=actor_user_id,
            )
            self.session.add(grant)
            action = "create"
        else:
            grant.include_descendants = include_descendants
            grant.valid_from = valid_from
            grant.valid_to = valid_to
            grant.created_by = actor_user_id
            grant.archived_at = None
            action = "update"

        self.session.flush()
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action=action,
            object_type="access_grant",
            object_id=grant.id,
            old_data_json=old_data,
            new_data_json=self._grant_audit_data(grant),
        )
        return grant

    def archive_access_grant_for_actor(
        self,
        *,
        actor_user_id: UUID,
        grant_id: UUID,
    ) -> AccessGrant:
        grant = self._get_access_grant(grant_id)
        actor_is_superuser = self.permissions.is_superuser(actor_user_id)
        if not actor_is_superuser:
            if grant.organization_id is None:
                raise PermissionDeniedError("Only a system admin can revoke global grants.")
            if not self.permissions.has_permission(
                actor_user_id,
                "access_grants.manage",
                organization_id=grant.organization_id,
                registry_id=grant.registry_id,
            ):
                raise PermissionDeniedError("Actor cannot revoke grants in this scope.")

        old_data = self._grant_audit_data(grant)
        grant.archived_at = datetime.now(UTC)
        self.session.flush()
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="archive",
            object_type="access_grant",
            object_id=grant.id,
            old_data_json=old_data,
            new_data_json=self._grant_audit_data(grant),
        )
        return grant

    def _prepare_role_profile(
        self,
        *,
        actor_user_id: UUID,
        role_code: str | None,
        organization_ids: Sequence[UUID],
    ) -> tuple[UUID, ...]:
        normalized_organization_ids = tuple(dict.fromkeys(organization_ids))
        if role_code is None:
            if normalized_organization_ids:
                raise UserAccessError("Organization scope requires a business role.")
            return ()
        if role_code not in BUSINESS_ROLE_CODES:
            raise UserAccessError("Unsupported business role.")
        if role_code in {
            ADMINISTRATOR_ROLE_CODE,
            ORGANIZATION_ADMINISTRATOR_ROLE_CODE,
        }:
            if normalized_organization_ids:
                raise UserAccessError("Global administrator roles cannot have organization roots.")
        elif not normalized_organization_ids:
            raise UserAccessError("A subordinate administrator requires at least one organization.")

        for organization_id in normalized_organization_ids:
            self._get_active_organization(organization_id)
        self._assert_actor_can_assign_role_profile(
            actor_user_id=actor_user_id,
            role_code=role_code,
            organization_ids=normalized_organization_ids,
        )
        return normalized_organization_ids

    def _assert_actor_can_assign_role_profile(
        self,
        *,
        actor_user_id: UUID,
        role_code: str,
        organization_ids: Sequence[UUID],
    ) -> None:
        if self.permissions.is_superuser(actor_user_id):
            return

        self._require_permission(actor_user_id, "users.manage")
        if role_code != SUBORDINATE_ORGANIZATION_ADMINISTRATOR_ROLE_CODE:
            raise PermissionDeniedError(
                "Only a system admin can assign global administrator roles."
            )
        if not self.permissions.has_permission(actor_user_id, "access_grants.manage"):
            raise PermissionDeniedError("Actor cannot manage user access profiles.")
        for organization_id in organization_ids:
            if not self.permissions.has_permission(
                actor_user_id,
                "access_grants.manage",
                organization_id=organization_id,
            ):
                raise PermissionDeniedError(
                    "Actor cannot assign an organization outside its scope."
                )

    def _apply_role_profile(
        self,
        *,
        actor_user_id: UUID,
        user: User,
        role_code: str,
        organization_ids: Sequence[UUID],
    ) -> None:
        role_ids_by_code = {
            code: role_id
            for code, role_id in self.session.execute(
                select(Role.code, Role.id).where(
                    Role.code.in_(BUSINESS_ROLE_CODES),
                    Role.archived_at.is_(None),
                )
            )
        }
        if set(role_ids_by_code) != BUSINESS_ROLE_CODES:
            raise UserAccessError("Business roles are not initialized.")

        now = datetime.now(UTC)
        for grant in self._active_business_role_grants(user.id):
            grant.archived_at = now

        user.is_superuser = role_code == ADMINISTRATOR_ROLE_CODE
        if role_code == ADMINISTRATOR_ROLE_CODE:
            self.session.flush()
            return

        role_id = role_ids_by_code[role_code]
        if role_code == ORGANIZATION_ADMINISTRATOR_ROLE_CODE:
            self._activate_role_profile_grant(
                actor_user_id=actor_user_id,
                user_id=user.id,
                role_id=role_id,
                organization_id=None,
            )
        else:
            for organization_id in organization_ids:
                self._activate_role_profile_grant(
                    actor_user_id=actor_user_id,
                    user_id=user.id,
                    role_id=role_id,
                    organization_id=organization_id,
                )
        self.session.flush()

    def _activate_role_profile_grant(
        self,
        *,
        actor_user_id: UUID,
        user_id: UUID,
        role_id: UUID,
        organization_id: UUID | None,
    ) -> None:
        grant = self._matching_grant(
            user_id=user_id,
            role_id=role_id,
            registry_id=None,
            organization_id=organization_id,
        )
        if grant is None:
            self.session.add(
                AccessGrant(
                    user_id=user_id,
                    role_id=role_id,
                    organization_id=organization_id,
                    include_descendants=True,
                    created_by=actor_user_id,
                )
            )
            return

        grant.include_descendants = True
        grant.valid_from = None
        grant.valid_to = None
        grant.created_by = actor_user_id
        grant.archived_at = None

    def _active_business_role_grants(self, user_id: UUID) -> list[AccessGrant]:
        now = datetime.now(UTC)
        return list(
            self.session.scalars(
                select(AccessGrant)
                .join(Role, Role.id == AccessGrant.role_id)
                .where(
                    AccessGrant.user_id == user_id,
                    AccessGrant.archived_at.is_(None),
                    Role.archived_at.is_(None),
                    Role.code.in_(BUSINESS_ROLE_CODES),
                    or_(AccessGrant.valid_from.is_(None), AccessGrant.valid_from <= now),
                    or_(AccessGrant.valid_to.is_(None), AccessGrant.valid_to > now),
                )
            ).all()
        )

    def _user_role_profile(self, user: User) -> dict[str, object]:
        if user.is_superuser:
            return {
                "role_code": ADMINISTRATOR_ROLE_CODE,
                "organization_ids": [],
            }

        grants = self._active_business_role_grants(user.id)
        if any(
            grant.role_id == self._business_role_id(ORGANIZATION_ADMINISTRATOR_ROLE_CODE)
            for grant in grants
        ):
            return {
                "role_code": ORGANIZATION_ADMINISTRATOR_ROLE_CODE,
                "organization_ids": [],
            }
        return {
            "role_code": SUBORDINATE_ORGANIZATION_ADMINISTRATOR_ROLE_CODE,
            "organization_ids": sorted(
                (
                    grant.organization_id
                    for grant in grants
                    if grant.role_id
                    == self._business_role_id(SUBORDINATE_ORGANIZATION_ADMINISTRATOR_ROLE_CODE)
                    and grant.organization_id is not None
                ),
                key=str,
            ),
        }

    def _business_role_id(self, role_code: str) -> UUID | None:
        return self.session.scalar(
            select(Role.id).where(
                Role.code == role_code,
                Role.archived_at.is_(None),
            )
        )

    def _require_permission(
        self,
        actor_user_id: UUID,
        permission_code: str,
        *,
        organization_id: UUID | None = None,
        registry_id: UUID | None = None,
    ) -> None:
        if not self.permissions.has_permission(
            actor_user_id,
            permission_code,
            organization_id=organization_id,
            registry_id=registry_id,
        ):
            raise PermissionDeniedError(f"Actor lacks {permission_code}.")

    def _assert_can_manage_existing_user(self, actor_user_id: UUID, user: User) -> None:
        self._require_permission(actor_user_id, "users.manage")
        visible_ids = {item.id for item in self.list_users_for_actor(actor_user_id=actor_user_id)}
        if user.id not in visible_ids:
            raise PermissionDeniedError("Actor cannot manage this user.")

    def _assert_scoped_actor_can_create_grant(
        self,
        *,
        actor_user_id: UUID,
        role: Role,
        organization_id: UUID | None,
        registry_id: UUID | None,
        include_descendants: bool,
    ) -> None:
        if organization_id is None:
            raise PermissionDeniedError("Only a system admin can create global grants.")
        if role.code in {"administrator", "organization_administrator"}:
            raise PermissionDeniedError(
                "Only a system admin can assign a global administrator role."
            )
        if not self.permissions.has_permission(
            actor_user_id,
            "access_grants.manage",
            organization_id=organization_id,
            registry_id=registry_id,
        ):
            raise PermissionDeniedError("Actor cannot create grants in this scope.")
        if include_descendants and not self._actor_can_delegate_descendant_scope(
            actor_user_id,
            organization_id,
            registry_id=registry_id,
        ):
            raise PermissionDeniedError("Actor cannot delegate descendant scope.")

    def _actor_can_delegate_descendant_scope(
        self,
        actor_user_id: UUID,
        organization_id: UUID,
        *,
        registry_id: UUID | None,
    ) -> bool:
        if self.permissions.has_access_management_flag(actor_user_id):
            return self.permissions.can_see_organization(
                actor_user_id,
                organization_id,
                registry_id=registry_id,
            )

        now = datetime.now(UTC)
        criteria: list[ColumnElement[bool]] = [
            AccessGrant.user_id == actor_user_id,
            AccessGrant.archived_at.is_(None),
            AccessGrant.include_descendants.is_(True),
            Role.archived_at.is_(None),
            Permission.code == "access_grants.manage",
            or_(AccessGrant.valid_from.is_(None), AccessGrant.valid_from <= now),
            or_(AccessGrant.valid_to.is_(None), AccessGrant.valid_to > now),
            or_(AccessGrant.organization_id == organization_id, OrganizationClosure.depth >= 0),
        ]
        if registry_id is not None:
            criteria.append(
                or_(AccessGrant.registry_id.is_(None), AccessGrant.registry_id == registry_id)
            )

        statement = (
            select(AccessGrant.id)
            .join(Role, AccessGrant.role_id == Role.id)
            .join(role_permissions, role_permissions.c.role_id == Role.id)
            .join(Permission, Permission.id == role_permissions.c.permission_id)
            .outerjoin(
                OrganizationClosure,
                and_(
                    OrganizationClosure.ancestor_id == AccessGrant.organization_id,
                    OrganizationClosure.descendant_id == organization_id,
                ),
            )
            .where(*criteria)
            .limit(1)
        )
        return self.session.scalar(statement) is not None

    def _get_existing_user(self, user_id: UUID) -> User:
        user = self.session.get(User, user_id)
        if user is None:
            raise UserAccessNotFoundError("User was not found.")
        return user

    def _get_grantable_user(self, user_id: UUID) -> User:
        user = self._get_existing_user(user_id)
        if user.archived_at is not None or user.status == "archived":
            raise UserAccessNotFoundError("User was not found.")
        return user

    def _get_active_role(self, role_id: UUID) -> Role:
        role = self.session.get(Role, role_id)
        if role is None or role.archived_at is not None:
            raise UserAccessNotFoundError("Role was not found.")
        return role

    def _get_access_grant(self, grant_id: UUID) -> AccessGrant:
        grant = self.session.get(AccessGrant, grant_id)
        if grant is None:
            raise UserAccessNotFoundError("Access grant was not found.")
        return grant

    def _get_active_organization(self, organization_id: UUID) -> Organization:
        organization = self.session.get(Organization, organization_id)
        if (
            organization is None
            or organization.archived_at is not None
            or not organization.is_active
        ):
            raise UserAccessNotFoundError("Organization was not found.")
        return organization

    def _validate_registry(self, registry_id: UUID | None) -> None:
        if registry_id is None:
            return
        registry = self.session.get(Registry, registry_id)
        if (
            registry is None
            or registry.archived_at is not None
            or registry.lifecycle_status == "archived"
        ):
            raise UserAccessNotFoundError("Registry was not found.")

    def _matching_grant(
        self,
        *,
        user_id: UUID,
        role_id: UUID,
        registry_id: UUID | None,
        organization_id: UUID | None,
    ) -> AccessGrant | None:
        criteria = [
            AccessGrant.user_id == user_id,
            AccessGrant.role_id == role_id,
        ]
        criteria.append(
            AccessGrant.registry_id.is_(None)
            if registry_id is None
            else AccessGrant.registry_id == registry_id
        )
        criteria.append(
            AccessGrant.organization_id.is_(None)
            if organization_id is None
            else AccessGrant.organization_id == organization_id
        )
        return self.session.scalars(select(AccessGrant).where(*criteria)).one_or_none()

    def _user_by_email(self, normalized_email: str) -> User | None:
        return self.session.scalars(
            select(User).where(func.lower(User.email) == normalized_email)
        ).one_or_none()

    def _normalize_login(self, login: str) -> str:
        normalized = login.strip().lower()
        if not normalized or any(character.isspace() for character in normalized):
            raise UserAccessError("Valid login is required.")
        return normalized

    def _validate_display_name(self, display_name: str) -> None:
        if not display_name.strip():
            raise UserAccessError("Display name is required.")

    def _validate_user_status(self, status: str, *, allow_archived: bool) -> None:
        allowed = {"active", "disabled"}
        if allow_archived:
            allowed.add("archived")
        if status not in allowed:
            raise UserAccessError("Unsupported user status.")

    def _user_audit_data(self, user: User) -> dict[str, object]:
        return {
            "email": user.email,
            "display_name": user.display_name,
            "status": user.status,
            "is_superuser": user.is_superuser,
            "archived_at": user.archived_at.isoformat() if user.archived_at else None,
        }

    def _grant_audit_data(self, grant: AccessGrant) -> dict[str, object]:
        return {
            "user_id": str(grant.user_id),
            "role_id": str(grant.role_id),
            "registry_id": str(grant.registry_id) if grant.registry_id else None,
            "organization_id": str(grant.organization_id) if grant.organization_id else None,
            "include_descendants": grant.include_descendants,
            "valid_from": grant.valid_from.isoformat() if grant.valid_from else None,
            "valid_to": grant.valid_to.isoformat() if grant.valid_to else None,
            "created_by": str(grant.created_by) if grant.created_by else None,
            "archived_at": grant.archived_at.isoformat() if grant.archived_at else None,
        }
