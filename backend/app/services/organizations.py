from dataclasses import dataclass
from typing import Protocol
from uuid import UUID

from app.services.audit import AuditEventCreate, AuditRecorder
from app.services.permissions import AccessDeniedError, ActorContext, PermissionService


@dataclass(frozen=True)
class OrganizationCreate:
    code: str
    name: str


class OrganizationRepository(Protocol):
    def create_organization(
        self,
        *,
        code: str,
        name: str,
        parent_id: UUID | None,
        created_by: UUID | None,
    ) -> UUID:
        """Create an organization and return its id."""

    def add_closure_rows(self, rows: list[tuple[UUID, UUID, int]]) -> None:
        """Persist closure rows as ancestor, descendant, depth."""

    def ancestor_rows_for(self, organization_id: UUID) -> list[tuple[UUID, int]]:
        """Return ancestor rows for an existing organization as ancestor id and depth."""

    def is_descendant_or_self(self, *, ancestor_id: UUID, descendant_id: UUID) -> bool:
        """Return true when descendant_id is in ancestor_id subtree."""

    def subtree_ids(self, organization_id: UUID) -> set[UUID]:
        """Return organization ids in subtree, including organization_id."""


class OrganizationService:
    def __init__(
        self,
        repository: OrganizationRepository,
        audit_service: AuditRecorder | None = None,
    ) -> None:
        self.repository = repository
        self.permissions = PermissionService(repository)
        self.audit_service = audit_service

    def create_root(self, actor: ActorContext, data: OrganizationCreate) -> UUID:
        if not actor.is_superuser:
            raise AccessDeniedError("Only a superuser can create a root organization.")

        organization_id = self.repository.create_organization(
            code=data.code,
            name=data.name,
            parent_id=None,
            created_by=actor.user_id,
        )
        self.repository.add_closure_rows([(organization_id, organization_id, 0)])
        self._record_user_event(
            actor,
            "organization.create",
            organization_id,
            {"code": data.code, "name": data.name, "parent_id": None},
        )
        return organization_id

    def create_child(
        self,
        actor: ActorContext,
        *,
        parent_id: UUID,
        data: OrganizationCreate,
    ) -> UUID:
        if not self.permissions.can_create_child_organization(actor, parent_id):
            raise AccessDeniedError("Actor cannot create a child organization in this scope.")

        organization_id = self.repository.create_organization(
            code=data.code,
            name=data.name,
            parent_id=parent_id,
            created_by=actor.user_id,
        )
        rows = [(organization_id, organization_id, 0)]
        rows.extend(
            (ancestor_id, organization_id, depth + 1)
            for ancestor_id, depth in self.repository.ancestor_rows_for(parent_id)
        )
        self.repository.add_closure_rows(rows)
        self._record_user_event(
            actor,
            "organization.create",
            organization_id,
            {"code": data.code, "name": data.name, "parent_id": parent_id},
        )
        return organization_id

    def accessible_tree_ids(self, actor: ActorContext) -> set[UUID]:
        if actor.is_superuser:
            raise ValueError("Superuser tree access requires an explicit root organization.")

        visible: set[UUID] = set()
        for grant in actor.grants:
            if grant.organization_id is None:
                continue
            if grant.include_descendants:
                visible.update(self.repository.subtree_ids(grant.organization_id))
            else:
                visible.add(grant.organization_id)
        return visible

    def _record_user_event(
        self,
        actor: ActorContext,
        action: str,
        object_id: UUID,
        new_data: dict[str, object],
    ) -> None:
        if self.audit_service is None:
            return
        self.audit_service.record_user_event(
            actor,
            AuditEventCreate(
                action=action,
                object_type="organization",
                object_id=object_id,
                new_data=new_data,
            ),
        )
