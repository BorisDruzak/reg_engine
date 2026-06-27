from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import UUID, uuid4

import pytest

from app.services.cards import CardCreate, CardService, CardTransfer, FieldValueWrite
from app.services.permissions import AccessDeniedError, ActorContext, PermissionService


class InMemoryPermissionRepository:
    def __init__(self, closure: set[tuple[UUID, UUID]]) -> None:
        self.closure = closure

    def is_descendant_or_self(self, *, ancestor_id: UUID, descendant_id: UUID) -> bool:
        return ancestor_id == descendant_id or (ancestor_id, descendant_id) in self.closure


class InMemoryCardRepository:
    def __init__(self) -> None:
        self.cards: dict[UUID, dict[str, object]] = {}
        self.block_instances: dict[UUID, dict[str, object]] = {}
        self.fields: dict[UUID, dict[str, object]] = {}
        self.field_values: dict[UUID, dict[str, object]] = {}
        self.field_value_items: dict[UUID, list[UUID]] = {}
        self.relations: dict[UUID, dict[str, object]] = {}

    def add_field(self, field_type: str) -> UUID:
        field_id = uuid4()
        self.fields[field_id] = {"id": field_id, "field_type": field_type}
        return field_id

    def create_card(
        self,
        *,
        registry_id: UUID,
        organization_id: UUID,
        org_unit_id: UUID | None,
        display_name: str,
        created_by: UUID | None,
    ) -> UUID:
        card_id = uuid4()
        self.cards[card_id] = {
            "id": card_id,
            "registry_id": registry_id,
            "organization_id": organization_id,
            "org_unit_id": org_unit_id,
            "display_name": display_name,
            "lifecycle_status": "active",
            "created_by": created_by,
            "archived": False,
            "archive_reason": None,
        }
        return card_id

    def get_card(self, card_id: UUID) -> dict[str, object]:
        return self.cards[card_id]

    def archive_card(self, *, card_id: UUID, archived_by: UUID | None, reason: str | None) -> None:
        self.cards[card_id]["archived"] = True
        self.cards[card_id]["lifecycle_status"] = "archived"
        self.cards[card_id]["archived_by"] = archived_by
        self.cards[card_id]["archive_reason"] = reason

    def mark_card_superseded(self, *, card_id: UUID, updated_by: UUID | None) -> None:
        self.cards[card_id]["lifecycle_status"] = "superseded"
        self.cards[card_id]["updated_by"] = updated_by

    def create_card_relation(
        self,
        *,
        source_card_id: UUID,
        target_card_id: UUID,
        relation_type: str,
        created_by: UUID | None,
    ) -> UUID:
        relation_id = uuid4()
        self.relations[relation_id] = {
            "id": relation_id,
            "source_card_id": source_card_id,
            "target_card_id": target_card_id,
            "relation_type": relation_type,
            "created_by": created_by,
        }
        return relation_id

    def create_block_instance(
        self,
        *,
        card_id: UUID,
        block_id: UUID,
        ordinal: int,
        created_by: UUID | None,
    ) -> UUID:
        instance_id = uuid4()
        self.block_instances[instance_id] = {
            "id": instance_id,
            "card_id": card_id,
            "block_id": block_id,
            "ordinal": ordinal,
            "created_by": created_by,
        }
        return instance_id

    def get_field_schema(self, field_id: UUID) -> dict[str, object]:
        return self.fields[field_id]

    def upsert_field_value(
        self,
        *,
        card_id: UUID,
        block_instance_id: UUID,
        field_id: UUID,
        values: dict[str, object],
        updated_by: UUID | None,
    ) -> UUID:
        for value_id, existing in self.field_values.items():
            if (
                existing["card_id"] == card_id
                and existing["block_instance_id"] == block_instance_id
                and existing["field_id"] == field_id
            ):
                existing.update(values)
                existing["updated_by"] = updated_by
                return value_id

        value_id = uuid4()
        self.field_values[value_id] = {
            "id": value_id,
            "card_id": card_id,
            "block_instance_id": block_instance_id,
            "field_id": field_id,
            **values,
            "updated_by": updated_by,
        }
        return value_id

    def replace_field_value_items(
        self,
        *,
        field_value_id: UUID,
        reference_item_ids: tuple[UUID, ...],
    ) -> None:
        self.field_value_items[field_value_id] = list(reference_item_ids)


def test_org_admin_can_create_card_in_own_organization() -> None:
    repository = InMemoryCardRepository()
    permission_service = PermissionService(InMemoryPermissionRepository(set()))
    service = CardService(repository, permission_service)
    organization_id = uuid4()
    actor = ActorContext.for_org_admin(user_id=uuid4(), organization_id=organization_id)

    card_id = service.create_card(
        actor,
        CardCreate(
            registry_id=uuid4(),
            organization_id=organization_id,
            org_unit_id=None,
            display_name="Alpha",
        ),
    )

    assert repository.cards[card_id]["organization_id"] == organization_id
    assert repository.cards[card_id]["created_by"] == actor.user_id


def test_org_admin_cannot_create_card_in_sibling_organization() -> None:
    repository = InMemoryCardRepository()
    permission_service = PermissionService(InMemoryPermissionRepository(set()))
    service = CardService(repository, permission_service)
    actor = ActorContext.for_org_admin(user_id=uuid4(), organization_id=uuid4())

    with pytest.raises(AccessDeniedError):
        service.create_card(
            actor,
            CardCreate(
                registry_id=uuid4(),
                organization_id=uuid4(),
                org_unit_id=None,
                display_name="Blocked",
            ),
        )


def test_org_admin_can_edit_card_in_own_subtree() -> None:
    parent_id = uuid4()
    child_id = uuid4()
    repository = InMemoryCardRepository()
    permission_service = PermissionService(InMemoryPermissionRepository({(parent_id, child_id)}))
    service = CardService(repository, permission_service)
    system_actor = ActorContext(user_id=uuid4(), is_superuser=True, grants=())
    card_id = service.create_card(
        system_actor,
        CardCreate(
            registry_id=uuid4(),
            organization_id=child_id,
            org_unit_id=None,
            display_name="Child card",
        ),
    )
    block_instance_id = service.create_block_instance(
        system_actor,
        card_id=card_id,
        block_id=uuid4(),
    )
    field_id = repository.add_field("text")
    parent_admin = ActorContext.for_org_admin(user_id=uuid4(), organization_id=parent_id)

    value_id = service.write_field_value(
        parent_admin,
        FieldValueWrite(
            card_id=card_id,
            block_instance_id=block_instance_id,
            field_id=field_id,
            value="editable",
        ),
    )

    assert repository.field_values[value_id]["value_text"] == "editable"


def test_org_admin_cannot_edit_parent_or_sibling_card() -> None:
    parent_id = uuid4()
    child_id = uuid4()
    sibling_id = uuid4()
    repository = InMemoryCardRepository()
    permission_service = PermissionService(InMemoryPermissionRepository({(parent_id, child_id)}))
    service = CardService(repository, permission_service)
    system_actor = ActorContext(user_id=uuid4(), is_superuser=True, grants=())
    parent_card_id = service.create_card(
        system_actor,
        CardCreate(
            registry_id=uuid4(),
            organization_id=parent_id,
            org_unit_id=None,
            display_name="Parent card",
        ),
    )
    sibling_card_id = service.create_card(
        system_actor,
        CardCreate(
            registry_id=uuid4(),
            organization_id=sibling_id,
            org_unit_id=None,
            display_name="Sibling card",
        ),
    )
    child_admin = ActorContext.for_org_admin(user_id=uuid4(), organization_id=child_id)

    with pytest.raises(AccessDeniedError):
        service.create_block_instance(child_admin, card_id=parent_card_id, block_id=uuid4())

    with pytest.raises(AccessDeniedError):
        service.create_block_instance(child_admin, card_id=sibling_card_id, block_id=uuid4())


def test_typed_field_values_are_written_to_expected_columns() -> None:
    repository = InMemoryCardRepository()
    permission_service = PermissionService(InMemoryPermissionRepository(set()))
    service = CardService(repository, permission_service)
    organization_id = uuid4()
    actor = ActorContext.for_org_admin(user_id=uuid4(), organization_id=organization_id)
    card_id = service.create_card(
        actor,
        CardCreate(
            registry_id=uuid4(),
            organization_id=organization_id,
            org_unit_id=None,
            display_name="Typed",
        ),
    )
    block_instance_id = service.create_block_instance(actor, card_id=card_id, block_id=uuid4())
    text_field_id = repository.add_field("text")
    date_field_id = repository.add_field("date")
    bool_field_id = repository.add_field("boolean")
    select_field_id = repository.add_field("select")
    multi_select_field_id = repository.add_field("multi_select")
    reference_item_id = uuid4()
    another_reference_item_id = uuid4()

    text_value_id = service.write_field_value(
        actor,
        FieldValueWrite(
            card_id=card_id,
            block_instance_id=block_instance_id,
            field_id=text_field_id,
            value="plain text",
        ),
    )
    date_value_id = service.write_field_value(
        actor,
        FieldValueWrite(
            card_id=card_id,
            block_instance_id=block_instance_id,
            field_id=date_field_id,
            value=date(2026, 6, 27),
        ),
    )
    bool_value_id = service.write_field_value(
        actor,
        FieldValueWrite(
            card_id=card_id,
            block_instance_id=block_instance_id,
            field_id=bool_field_id,
            value=True,
        ),
    )
    select_value_id = service.write_field_value(
        actor,
        FieldValueWrite(
            card_id=card_id,
            block_instance_id=block_instance_id,
            field_id=select_field_id,
            value=reference_item_id,
        ),
    )
    multi_value_id = service.write_field_value(
        actor,
        FieldValueWrite(
            card_id=card_id,
            block_instance_id=block_instance_id,
            field_id=multi_select_field_id,
            value=(reference_item_id, another_reference_item_id),
        ),
    )

    assert repository.field_values[text_value_id]["value_text"] == "plain text"
    assert repository.field_values[date_value_id]["value_date"] == date(2026, 6, 27)
    assert repository.field_values[bool_value_id]["value_bool"] is True
    assert repository.field_values[select_value_id]["value_reference_item_id"] == reference_item_id
    assert repository.field_values[multi_value_id]["value_reference_item_id"] is None
    assert repository.field_value_items[multi_value_id] == [
        reference_item_id,
        another_reference_item_id,
    ]


def test_datetime_and_decimal_values_are_normalized() -> None:
    repository = InMemoryCardRepository()
    permission_service = PermissionService(InMemoryPermissionRepository(set()))
    service = CardService(repository, permission_service)
    organization_id = uuid4()
    actor = ActorContext.for_org_admin(user_id=uuid4(), organization_id=organization_id)
    card_id = service.create_card(
        actor,
        CardCreate(
            registry_id=uuid4(),
            organization_id=organization_id,
            org_unit_id=None,
            display_name="Typed",
        ),
    )
    block_instance_id = service.create_block_instance(actor, card_id=card_id, block_id=uuid4())
    decimal_field_id = repository.add_field("decimal")
    datetime_field_id = repository.add_field("datetime")
    instant = datetime(2026, 6, 27, 12, 30, tzinfo=UTC)

    decimal_value_id = service.write_field_value(
        actor,
        FieldValueWrite(
            card_id=card_id,
            block_instance_id=block_instance_id,
            field_id=decimal_field_id,
            value="10.50",
        ),
    )
    datetime_value_id = service.write_field_value(
        actor,
        FieldValueWrite(
            card_id=card_id,
            block_instance_id=block_instance_id,
            field_id=datetime_field_id,
            value=instant,
        ),
    )

    assert repository.field_values[decimal_value_id]["value_number"] == Decimal("10.50")
    assert repository.field_values[datetime_value_id]["value_datetime"] == instant


def test_archived_card_leaves_existing_values_intact() -> None:
    repository = InMemoryCardRepository()
    permission_service = PermissionService(InMemoryPermissionRepository(set()))
    service = CardService(repository, permission_service)
    organization_id = uuid4()
    actor = ActorContext.for_org_admin(user_id=uuid4(), organization_id=organization_id)
    card_id = service.create_card(
        actor,
        CardCreate(
            registry_id=uuid4(),
            organization_id=organization_id,
            org_unit_id=None,
            display_name="Archive me",
        ),
    )
    block_instance_id = service.create_block_instance(actor, card_id=card_id, block_id=uuid4())
    field_id = repository.add_field("text")
    value_id = service.write_field_value(
        actor,
        FieldValueWrite(
            card_id=card_id,
            block_instance_id=block_instance_id,
            field_id=field_id,
            value="keep me",
        ),
    )

    service.archive_card(actor, card_id=card_id, reason="done")

    assert repository.cards[card_id]["lifecycle_status"] == "archived"
    assert repository.field_values[value_id]["value_text"] == "keep me"


def test_transfer_creates_new_card_marks_old_superseded_and_records_relation() -> None:
    source_org_id = uuid4()
    target_org_id = uuid4()
    registry_id = uuid4()
    repository = InMemoryCardRepository()
    permission_service = PermissionService(
        InMemoryPermissionRepository({(source_org_id, target_org_id)})
    )
    service = CardService(repository, permission_service)
    actor = ActorContext.for_org_admin(user_id=uuid4(), organization_id=source_org_id)
    source_card_id = service.create_card(
        actor,
        CardCreate(
            registry_id=registry_id,
            organization_id=source_org_id,
            org_unit_id=None,
            display_name="Source card",
        ),
    )

    result = service.transfer_card(
        actor,
        CardTransfer(
            source_card_id=source_card_id,
            target_organization_id=target_org_id,
            target_org_unit_id=None,
            display_name="Transferred card",
        ),
    )

    assert repository.cards[source_card_id]["lifecycle_status"] == "superseded"
    assert repository.cards[result.target_card_id]["registry_id"] == registry_id
    assert repository.cards[result.target_card_id]["organization_id"] == target_org_id
    assert repository.cards[result.target_card_id]["display_name"] == "Transferred card"
    assert repository.relations[result.relation_id] == {
        "id": result.relation_id,
        "source_card_id": source_card_id,
        "target_card_id": result.target_card_id,
        "relation_type": "transferred_to",
        "created_by": actor.user_id,
    }


def test_transfer_requires_access_to_source_and_target_organizations() -> None:
    source_org_id = uuid4()
    target_org_id = uuid4()
    repository = InMemoryCardRepository()
    permission_service = PermissionService(InMemoryPermissionRepository(set()))
    service = CardService(repository, permission_service)
    system_actor = ActorContext(user_id=uuid4(), is_superuser=True, grants=())
    source_card_id = service.create_card(
        system_actor,
        CardCreate(
            registry_id=uuid4(),
            organization_id=source_org_id,
            org_unit_id=None,
            display_name="Source card",
        ),
    )
    source_admin = ActorContext.for_org_admin(user_id=uuid4(), organization_id=source_org_id)

    with pytest.raises(AccessDeniedError):
        service.transfer_card(
            source_admin,
            CardTransfer(
                source_card_id=source_card_id,
                target_organization_id=target_org_id,
                target_org_unit_id=None,
            ),
        )
