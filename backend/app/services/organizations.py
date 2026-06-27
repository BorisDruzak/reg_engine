from dataclasses import dataclass
from typing import Protocol, cast
from uuid import UUID

from app.services.audit import AuditEventCreate, AuditRecorder
from app.services.permissions import AccessDeniedError, ActorContext, PermissionService


@dataclass(frozen=True)
class OrganizationCreate:
    code: str
    name: str


@dataclass(frozen=True)
class OrganizationUpdate:
    code: str | None = None
    name: str | None = None


@dataclass(frozen=True)
class OrganizationRead:
    id: UUID
    code: str
    name: str
    parent_id: UUID | None
    archived: bool


@dataclass(frozen=True)
class OrganizationTreeNode:
    id: UUID
    code: str
    name: str
    parent_id: UUID | None
    archived: bool
    children: tuple["OrganizationTreeNode", ...]


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

    def get_organization(self, organization_id: UUID) -> dict[str, object]:
        """Return organization attributes."""

    def list_organizations(self, organization_ids: set[UUID] | None) -> list[dict[str, object]]:
        """Return organizations by ids, or all organizations when ids is None."""

    def update_organization(
        self,
        *,
        organization_id: UUID,
        code: str | None,
        name: str | None,
    ) -> None:
        """Update mutable organization fields."""

    def archive_organization(self, organization_id: UUID) -> None:
        """Archive an organization without physical deletion."""


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

    def get_organization(self, actor: ActorContext, organization_id: UUID) -> OrganizationRead:
        organization = self.repository.get_organization(organization_id)
        self._require_view(actor, organization_id)
        return self._organization_to_read(organization)

    def get_tree(
        self,
        actor: ActorContext,
        *,
        root_id: UUID | None = None,
    ) -> tuple[OrganizationTreeNode, ...]:
        if root_id is not None:
            self._require_view(actor, root_id)
            organization_ids: set[UUID] | None = self.repository.subtree_ids(root_id)
        elif actor.is_superuser:
            organization_ids = None
        else:
            organization_ids = self.accessible_tree_ids(actor)
        return self._build_tree(self.repository.list_organizations(organization_ids))

    def update_organization(
        self,
        actor: ActorContext,
        *,
        organization_id: UUID,
        data: OrganizationUpdate,
    ) -> OrganizationRead:
        self._require_manage(actor, organization_id)
        before = self.repository.get_organization(organization_id)
        self.repository.update_organization(
            organization_id=organization_id,
            code=data.code,
            name=data.name,
        )
        after = self.repository.get_organization(organization_id)
        self._record_user_event(
            actor,
            "organization.update",
            organization_id,
            {
                "old": {
                    "code": before["code"],
                    "name": before["name"],
                },
                "new": {
                    "code": after["code"],
                    "name": after["name"],
                },
            },
        )
        return self._organization_to_read(after)

    def archive_organization(self, actor: ActorContext, organization_id: UUID) -> None:
        self._require_manage(actor, organization_id)
        self.repository.archive_organization(organization_id)
        self._record_user_event(
            actor,
            "organization.archive",
            organization_id,
            None,
        )

    def _require_view(self, actor: ActorContext, organization_id: UUID) -> None:
        if not self.permissions.can_view_organization(actor, organization_id):
            raise AccessDeniedError("Actor cannot view this organization.")

    def _require_manage(self, actor: ActorContext, organization_id: UUID) -> None:
        if not self.permissions.can_manage_organization(actor, organization_id):
            raise AccessDeniedError("Actor cannot manage this organization.")

    def _organization_to_read(self, organization: dict[str, object]) -> OrganizationRead:
        return OrganizationRead(
            id=cast(UUID, organization["id"]),
            code=str(organization["code"]),
            name=str(organization["name"]),
            parent_id=cast(UUID | None, organization["parent_id"]),
            archived=bool(organization["archived"]),
        )

    def _build_tree(self, rows: list[dict[str, object]]) -> tuple[OrganizationTreeNode, ...]:
        rows_by_id = {cast(UUID, row["id"]): row for row in rows}
        children_by_parent: dict[UUID | None, list[dict[str, object]]] = {}
        for row in rows:
            parent_id = cast(UUID | None, row["parent_id"])
            visible_parent_id = parent_id if parent_id in rows_by_id else None
            children_by_parent.setdefault(visible_parent_id, []).append(row)

        def build_node(row: dict[str, object]) -> OrganizationTreeNode:
            organization_id = cast(UUID, row["id"])
            children = tuple(
                build_node(child) for child in children_by_parent.get(organization_id, [])
            )
            return OrganizationTreeNode(
                id=organization_id,
                code=str(row["code"]),
                name=str(row["name"]),
                parent_id=cast(UUID | None, row["parent_id"]),
                archived=bool(row["archived"]),
                children=children,
            )

        return tuple(build_node(row) for row in children_by_parent.get(None, []))

    def _record_user_event(
        self,
        actor: ActorContext,
        action: str,
        object_id: UUID,
        new_data: dict[str, object] | None,
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
