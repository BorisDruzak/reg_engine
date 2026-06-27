from uuid import UUID, uuid4

import pytest

from app.services.organizations import OrganizationCreate, OrganizationService
from app.services.permissions import AccessDeniedError, ActorContext


class InMemoryOrganizationRepository:
    def __init__(self) -> None:
        self.organizations: dict[UUID, dict[str, object]] = {}
        self.closure: set[tuple[UUID, UUID, int]] = set()

    def create_organization(
        self,
        *,
        code: str,
        name: str,
        parent_id: UUID | None,
        created_by: UUID | None,
    ) -> UUID:
        organization_id = uuid4()
        self.organizations[organization_id] = {
            "id": organization_id,
            "code": code,
            "name": name,
            "parent_id": parent_id,
            "created_by": created_by,
        }
        return organization_id

    def add_closure_rows(self, rows: list[tuple[UUID, UUID, int]]) -> None:
        self.closure.update(rows)

    def ancestor_rows_for(self, organization_id: UUID) -> list[tuple[UUID, int]]:
        return [
            (ancestor_id, depth)
            for ancestor_id, descendant_id, depth in self.closure
            if descendant_id == organization_id
        ]

    def is_descendant_or_self(self, *, ancestor_id: UUID, descendant_id: UUID) -> bool:
        return any(
            row_ancestor == ancestor_id and row_descendant == descendant_id
            for row_ancestor, row_descendant, _depth in self.closure
        )

    def subtree_ids(self, organization_id: UUID) -> set[UUID]:
        return {
            descendant_id
            for ancestor_id, descendant_id, _depth in self.closure
            if ancestor_id == organization_id
        }


def test_system_admin_can_create_root_organization() -> None:
    repository = InMemoryOrganizationRepository()
    service = OrganizationService(repository)
    actor = ActorContext(user_id=uuid4(), is_superuser=True, grants=())

    organization_id = service.create_root(
        actor,
        OrganizationCreate(code="adm", name="ADM"),
    )

    assert repository.organizations[organization_id]["parent_id"] is None
    assert (organization_id, organization_id, 0) in repository.closure


def test_org_admin_can_create_child_inside_own_subtree() -> None:
    repository = InMemoryOrganizationRepository()
    service = OrganizationService(repository)
    system_actor = ActorContext(user_id=uuid4(), is_superuser=True, grants=())
    root_id = service.create_root(system_actor, OrganizationCreate(code="adm", name="ADM"))
    org_admin = ActorContext.for_org_admin(user_id=uuid4(), organization_id=root_id)

    child_id = service.create_child(
        org_admin,
        parent_id=root_id,
        data=OrganizationCreate(code="child", name="Child"),
    )

    assert repository.organizations[child_id]["parent_id"] == root_id
    assert (root_id, child_id, 1) in repository.closure
    assert (child_id, child_id, 0) in repository.closure


def test_org_admin_cannot_create_sibling_organization() -> None:
    repository = InMemoryOrganizationRepository()
    service = OrganizationService(repository)
    system_actor = ActorContext(user_id=uuid4(), is_superuser=True, grants=())
    root_id = service.create_root(system_actor, OrganizationCreate(code="adm", name="ADM"))
    first_child_id = service.create_child(
        system_actor,
        parent_id=root_id,
        data=OrganizationCreate(code="first", name="First"),
    )
    second_child_id = service.create_child(
        system_actor,
        parent_id=root_id,
        data=OrganizationCreate(code="second", name="Second"),
    )
    first_child_admin = ActorContext.for_org_admin(
        user_id=uuid4(),
        organization_id=first_child_id,
    )

    with pytest.raises(AccessDeniedError):
        service.create_child(
            first_child_admin,
            parent_id=second_child_id,
            data=OrganizationCreate(code="illegal", name="Illegal"),
        )


def test_org_admin_accessible_tree_contains_descendants_only() -> None:
    repository = InMemoryOrganizationRepository()
    service = OrganizationService(repository)
    system_actor = ActorContext(user_id=uuid4(), is_superuser=True, grants=())
    root_id = service.create_root(system_actor, OrganizationCreate(code="adm", name="ADM"))
    child_id = service.create_child(
        system_actor,
        parent_id=root_id,
        data=OrganizationCreate(code="child", name="Child"),
    )
    grandchild_id = service.create_child(
        system_actor,
        parent_id=child_id,
        data=OrganizationCreate(code="grandchild", name="Grandchild"),
    )
    sibling_id = service.create_child(
        system_actor,
        parent_id=root_id,
        data=OrganizationCreate(code="sibling", name="Sibling"),
    )
    child_admin = ActorContext.for_org_admin(user_id=uuid4(), organization_id=child_id)

    assert service.accessible_tree_ids(child_admin) == {child_id, grandchild_id}
    assert root_id not in service.accessible_tree_ids(child_admin)
    assert sibling_id not in service.accessible_tree_ids(child_admin)
