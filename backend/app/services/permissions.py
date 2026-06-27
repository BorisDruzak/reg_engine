from dataclasses import dataclass
from typing import Protocol
from uuid import UUID


class AccessDeniedError(Exception):
    """Raised when an actor is not allowed to perform the requested operation."""


@dataclass(frozen=True)
class AccessGrantContext:
    organization_id: UUID | None = None
    registry_id: UUID | None = None
    include_descendants: bool = True
    role_code: str = "org_admin"


@dataclass(frozen=True)
class ActorContext:
    user_id: UUID
    is_superuser: bool
    grants: tuple[AccessGrantContext, ...]

    @classmethod
    def for_org_admin(
        cls,
        *,
        user_id: UUID,
        organization_id: UUID,
        include_descendants: bool = True,
    ) -> "ActorContext":
        return cls(
            user_id=user_id,
            is_superuser=False,
            grants=(
                AccessGrantContext(
                    organization_id=organization_id,
                    include_descendants=include_descendants,
                    role_code="org_admin",
                ),
            ),
        )


class PermissionRepository(Protocol):
    def is_descendant_or_self(self, *, ancestor_id: UUID, descendant_id: UUID) -> bool:
        """Return true when descendant_id is inside ancestor_id scope, including itself."""


class PermissionService:
    def __init__(self, repository: PermissionRepository) -> None:
        self.repository = repository

    def can_view_organization(self, actor: ActorContext, organization_id: UUID) -> bool:
        return self._has_organization_scope(actor, organization_id)

    def can_manage_organization(self, actor: ActorContext, organization_id: UUID) -> bool:
        return self._has_organization_scope(actor, organization_id)

    def can_create_child_organization(
        self,
        actor: ActorContext,
        parent_organization_id: UUID,
    ) -> bool:
        return self.can_manage_organization(actor, parent_organization_id)

    def can_manage_schema(self, actor: ActorContext, registry_id: UUID | None = None) -> bool:
        _ = registry_id
        return actor.is_superuser

    def _has_organization_scope(self, actor: ActorContext, organization_id: UUID) -> bool:
        if actor.is_superuser:
            return True

        for grant in actor.grants:
            if grant.organization_id is None:
                continue
            if grant.organization_id == organization_id:
                return True
            if grant.include_descendants and self.repository.is_descendant_or_self(
                ancestor_id=grant.organization_id,
                descendant_id=organization_id,
            ):
                return True

        return False
