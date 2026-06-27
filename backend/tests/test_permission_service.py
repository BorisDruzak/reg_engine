from uuid import UUID, uuid4

from app.services.permissions import ActorContext, PermissionService


class InMemoryPermissionRepository:
    def __init__(self, closure: set[tuple[UUID, UUID]]) -> None:
        self.closure = closure

    def is_descendant_or_self(self, *, ancestor_id: UUID, descendant_id: UUID) -> bool:
        return (ancestor_id, descendant_id) in self.closure


def test_superuser_can_manage_any_organization() -> None:
    service = PermissionService(InMemoryPermissionRepository(set()))
    actor = ActorContext(user_id=uuid4(), is_superuser=True, grants=())

    assert service.can_manage_organization(actor, uuid4())


def test_org_admin_can_manage_descendant_when_grant_includes_descendants() -> None:
    parent_id = uuid4()
    child_id = uuid4()
    service = PermissionService(InMemoryPermissionRepository({(parent_id, child_id)}))
    actor = ActorContext.for_org_admin(user_id=uuid4(), organization_id=parent_id)

    assert service.can_manage_organization(actor, child_id)


def test_org_admin_cannot_manage_parent_or_sibling_branch() -> None:
    parent_id = uuid4()
    child_id = uuid4()
    sibling_id = uuid4()
    service = PermissionService(
        InMemoryPermissionRepository(
            {
                (parent_id, parent_id),
                (parent_id, child_id),
                (parent_id, sibling_id),
                (child_id, child_id),
                (sibling_id, sibling_id),
            }
        )
    )
    actor = ActorContext.for_org_admin(user_id=uuid4(), organization_id=child_id)

    assert not service.can_manage_organization(actor, parent_id)
    assert not service.can_manage_organization(actor, sibling_id)


def test_grant_without_descendants_only_allows_exact_organization() -> None:
    parent_id = uuid4()
    child_id = uuid4()
    service = PermissionService(InMemoryPermissionRepository({(parent_id, child_id)}))
    actor = ActorContext.for_org_admin(
        user_id=uuid4(),
        organization_id=parent_id,
        include_descendants=False,
    )

    assert service.can_manage_organization(actor, parent_id)
    assert not service.can_manage_organization(actor, child_id)
