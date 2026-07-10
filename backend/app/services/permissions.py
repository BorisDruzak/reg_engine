from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import AccessGrant, Organization, OrganizationClosure, Permission, Role, User
from app.models.identity import role_permissions


class PermissionDeniedError(PermissionError):
    """Raised when an actor does not have the required organization-scoped access."""


class PersistStatePermissionDeniedError(PermissionDeniedError):
    """Raised after a deliberate state transition that must survive the denied request."""


class PublicLinkSubmittedReadOnlyError(PermissionDeniedError):
    """Raised when a submitted public link attempts another public mutation."""


class PublicLinkReviewPermissionDeniedError(PermissionDeniedError):
    """Raised when an actor cannot use administrator public-link review actions."""


class PermissionService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def is_superuser(self, user_id: UUID) -> bool:
        result = self.session.scalar(
            select(User.is_superuser).where(
                User.id == user_id,
                User.archived_at.is_(None),
                User.status == "active",
            )
        )
        return bool(result)

    def get_organization_scope_ids(
        self,
        user_id: UUID,
        *,
        registry_id: UUID | None = None,
    ) -> set[UUID]:
        if self.is_superuser(user_id):
            return set(
                self.session.scalars(
                    select(Organization.id).where(
                        Organization.archived_at.is_(None),
                        Organization.is_active.is_(True),
                    )
                ).all()
            )

        scope_ids: set[UUID] = set()
        for grant in self._active_access_grants(user_id, registry_id=registry_id):
            if grant.organization_id is None:
                continue

            if grant.include_descendants:
                scope_ids.update(self._active_descendant_ids(grant.organization_id))
            else:
                scope_ids.add(grant.organization_id)

        return scope_ids

    def can_see_organization(
        self,
        user_id: UUID,
        organization_id: UUID,
        *,
        registry_id: UUID | None = None,
    ) -> bool:
        if not self._organization_is_active(organization_id):
            return False

        return organization_id in self.get_organization_scope_ids(
            user_id,
            registry_id=registry_id,
        )

    def has_permission(
        self,
        user_id: UUID,
        permission_code: str,
        *,
        organization_id: UUID | None = None,
        registry_id: UUID | None = None,
    ) -> bool:
        if self.is_superuser(user_id):
            return organization_id is None or self._organization_is_active(organization_id)

        if organization_id is not None and not self._organization_is_active(organization_id):
            return False

        grants = self._active_access_grants_with_permission(
            user_id,
            permission_code,
            registry_id=registry_id,
        )
        if organization_id is None:
            return bool(grants)

        return any(self._grant_covers_organization(grant, organization_id) for grant in grants)

    def can_manage_child_organization(
        self,
        user_id: UUID,
        parent_organization_id: UUID,
        *,
        registry_id: UUID | None = None,
    ) -> bool:
        return self.has_permission(
            user_id,
            "organizations.manage",
            organization_id=parent_organization_id,
            registry_id=registry_id,
        )

    def _active_access_grants(
        self,
        user_id: UUID,
        *,
        registry_id: UUID | None = None,
    ) -> list[AccessGrant]:
        now = datetime.now(UTC)
        criteria = [
            AccessGrant.user_id == user_id,
            AccessGrant.archived_at.is_(None),
            or_(AccessGrant.valid_from.is_(None), AccessGrant.valid_from <= now),
            or_(AccessGrant.valid_to.is_(None), AccessGrant.valid_to > now),
        ]
        if registry_id is not None:
            criteria.append(
                or_(AccessGrant.registry_id.is_(None), AccessGrant.registry_id == registry_id)
            )

        return list(self.session.scalars(select(AccessGrant).where(*criteria)).all())

    def _active_access_grants_with_permission(
        self,
        user_id: UUID,
        permission_code: str,
        *,
        registry_id: UUID | None = None,
    ) -> list[AccessGrant]:
        now = datetime.now(UTC)
        criteria = [
            AccessGrant.user_id == user_id,
            AccessGrant.archived_at.is_(None),
            Role.archived_at.is_(None),
            Permission.code == permission_code,
            or_(AccessGrant.valid_from.is_(None), AccessGrant.valid_from <= now),
            or_(AccessGrant.valid_to.is_(None), AccessGrant.valid_to > now),
        ]
        if registry_id is not None:
            criteria.append(
                or_(AccessGrant.registry_id.is_(None), AccessGrant.registry_id == registry_id)
            )

        statement = (
            select(AccessGrant)
            .join(Role, AccessGrant.role_id == Role.id)
            .join(role_permissions, role_permissions.c.role_id == Role.id)
            .join(Permission, Permission.id == role_permissions.c.permission_id)
            .where(*criteria)
        )
        return list(self.session.scalars(statement).all())

    def _active_descendant_ids(self, organization_id: UUID) -> set[UUID]:
        return set(
            self.session.scalars(
                select(OrganizationClosure.descendant_id)
                .join(Organization, Organization.id == OrganizationClosure.descendant_id)
                .where(
                    OrganizationClosure.ancestor_id == organization_id,
                    Organization.archived_at.is_(None),
                    Organization.is_active.is_(True),
                )
            ).all()
        )

    def _organization_is_active(self, organization_id: UUID) -> bool:
        result = self.session.scalar(
            select(Organization.id).where(
                Organization.id == organization_id,
                Organization.archived_at.is_(None),
                Organization.is_active.is_(True),
            )
        )
        return result is not None

    def _grant_covers_organization(self, grant: AccessGrant, organization_id: UUID) -> bool:
        if grant.organization_id is None:
            return True

        if grant.organization_id == organization_id:
            return True

        if not grant.include_descendants:
            return False

        result = self.session.scalar(
            select(OrganizationClosure.descendant_id).where(
                OrganizationClosure.ancestor_id == grant.organization_id,
                OrganizationClosure.descendant_id == organization_id,
            )
        )
        return result is not None
