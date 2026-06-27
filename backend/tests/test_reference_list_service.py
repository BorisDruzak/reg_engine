from uuid import UUID, uuid4

import pytest

from app.services.permissions import AccessDeniedError, ActorContext
from app.services.reference_lists import (
    ReferenceItemCreate,
    ReferenceItemUpdate,
    ReferenceListCreate,
    ReferenceListService,
    ReferenceListUpdate,
)


class InMemoryReferenceListRepository:
    def __init__(self, closure: set[tuple[UUID, UUID]]) -> None:
        self.closure = closure
        self.lists: dict[UUID, dict[str, object]] = {}
        self.items: dict[UUID, dict[str, object]] = {}

    def create_reference_list(
        self,
        *,
        registry_id: UUID | None,
        owner_organization_id: UUID | None,
        code: str,
        name: str,
        locked_for_descendants: bool,
        inherit_to_descendants: bool,
        created_by: UUID | None,
    ) -> UUID:
        list_id = uuid4()
        self.lists[list_id] = {
            "id": list_id,
            "registry_id": registry_id,
            "owner_organization_id": owner_organization_id,
            "code": code,
            "name": name,
            "locked_for_descendants": locked_for_descendants,
            "inherit_to_descendants": inherit_to_descendants,
            "created_by": created_by,
            "archived": False,
        }
        return list_id

    def create_reference_item(
        self,
        *,
        list_id: UUID,
        code: str,
        label: str,
        created_by: UUID | None,
    ) -> UUID:
        item_id = uuid4()
        self.items[item_id] = {
            "id": item_id,
            "list_id": list_id,
            "code": code,
            "label": label,
            "created_by": created_by,
        }
        return item_id

    def get_reference_list(self, list_id: UUID) -> dict[str, object]:
        return self.lists[list_id]

    def get_reference_item(self, item_id: UUID) -> dict[str, object]:
        return self.items[item_id]

    def inherited_list_ids_for(self, organization_id: UUID) -> set[UUID]:
        visible: set[UUID] = set()
        for list_id, reference_list in self.lists.items():
            owner_id = reference_list["owner_organization_id"]
            if owner_id is None or owner_id == organization_id:
                visible.add(list_id)
                continue
            if (
                reference_list["inherit_to_descendants"]
                and (owner_id, organization_id) in self.closure
            ):
                visible.add(list_id)
        return visible

    def archive_reference_list(self, list_id: UUID) -> None:
        self.lists[list_id]["archived"] = True

    def archive_reference_item(self, item_id: UUID) -> None:
        self.items[item_id]["archived"] = True

    def update_reference_list(
        self,
        list_id: UUID,
        *,
        code: str | None,
        name: str | None,
    ) -> None:
        if code is not None:
            self.lists[list_id]["code"] = code
        if name is not None:
            self.lists[list_id]["name"] = name

    def update_reference_item(
        self,
        item_id: UUID,
        *,
        code: str | None,
        label: str | None,
    ) -> None:
        if code is not None:
            self.items[item_id]["code"] = code
        if label is not None:
            self.items[item_id]["label"] = label


def test_system_admin_can_create_reference_list_and_item() -> None:
    repository = InMemoryReferenceListRepository(set())
    service = ReferenceListService(repository)
    actor = ActorContext(user_id=uuid4(), is_superuser=True, grants=())

    list_id = service.create_list(
        actor,
        ReferenceListCreate(code="statuses", name="Statuses"),
    )
    item_id = service.create_item(
        actor,
        list_id=list_id,
        data=ReferenceItemCreate(code="active", label="Active"),
    )

    assert repository.lists[list_id]["code"] == "statuses"
    assert repository.items[item_id]["list_id"] == list_id


def test_descendant_organization_can_use_inherited_reference_list() -> None:
    parent_id = uuid4()
    child_id = uuid4()
    repository = InMemoryReferenceListRepository({(parent_id, child_id)})
    service = ReferenceListService(repository)
    actor = ActorContext(user_id=uuid4(), is_superuser=True, grants=())
    list_id = service.create_list(
        actor,
        ReferenceListCreate(
            code="statuses",
            name="Statuses",
            owner_organization_id=parent_id,
            inherit_to_descendants=True,
        ),
    )

    assert service.available_list_ids_for_organization(child_id) == {list_id}


def test_descendant_admin_cannot_edit_locked_inherited_reference_list() -> None:
    parent_id = uuid4()
    child_id = uuid4()
    repository = InMemoryReferenceListRepository({(parent_id, child_id)})
    service = ReferenceListService(repository)
    system_actor = ActorContext(user_id=uuid4(), is_superuser=True, grants=())
    list_id = service.create_list(
        system_actor,
        ReferenceListCreate(
            code="statuses",
            name="Statuses",
            owner_organization_id=parent_id,
            locked_for_descendants=True,
        ),
    )
    child_admin = ActorContext.for_org_admin(user_id=uuid4(), organization_id=child_id)

    with pytest.raises(AccessDeniedError):
        service.create_item(
            child_admin,
            list_id=list_id,
            data=ReferenceItemCreate(code="active", label="Active"),
        )


def test_reference_list_and_item_archive_without_deleting() -> None:
    repository = InMemoryReferenceListRepository(set())
    service = ReferenceListService(repository)
    actor = ActorContext(user_id=uuid4(), is_superuser=True, grants=())
    list_id = service.create_list(
        actor,
        ReferenceListCreate(code="statuses", name="Statuses"),
    )
    item_id = service.create_item(
        actor,
        list_id=list_id,
        data=ReferenceItemCreate(code="active", label="Active"),
    )

    service.archive_item(actor, item_id)
    service.archive_list(actor, list_id)

    assert list_id in repository.lists
    assert item_id in repository.items
    assert repository.lists[list_id]["archived"] is True
    assert repository.items[item_id]["archived"] is True


def test_reference_list_and_item_can_be_updated() -> None:
    repository = InMemoryReferenceListRepository(set())
    service = ReferenceListService(repository)
    actor = ActorContext(user_id=uuid4(), is_superuser=True, grants=())
    list_id = service.create_list(
        actor,
        ReferenceListCreate(code="statuses", name="Statuses"),
    )
    item_id = service.create_item(
        actor,
        list_id=list_id,
        data=ReferenceItemCreate(code="active", label="Active"),
    )

    updated_list = service.update_list(
        actor,
        list_id,
        ReferenceListUpdate(name="Updated Statuses"),
    )
    updated_item = service.update_item(
        actor,
        item_id,
        ReferenceItemUpdate(label="Updated Active"),
    )

    assert updated_list["code"] == "statuses"
    assert updated_list["name"] == "Updated Statuses"
    assert updated_item["code"] == "active"
    assert updated_item["label"] == "Updated Active"
