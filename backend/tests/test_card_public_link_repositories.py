from datetime import UTC, datetime
from uuid import uuid4

from app.models.card import Card, CardBlockInstance, CardRelation, FieldValue, FieldValueItem
from app.models.public_link import CardPublicLink
from app.models.registry_schema import FormBlock, FormField
from app.repositories.cards import SQLAlchemyCardRepository
from app.repositories.public_links import SQLAlchemyPublicLinkRepository


class FakeScalarResult:
    def __init__(self, values: list[object]) -> None:
        self.values = values

    def all(self) -> list[object]:
        return self.values

    def first(self) -> object | None:
        return self.values[0] if self.values else None


class FakeResult:
    def __init__(self, rows: list[object]) -> None:
        self.rows = rows

    def scalars(self) -> FakeScalarResult:
        return FakeScalarResult(self.rows)

    def all(self) -> list[object]:
        return self.rows


class FakeSession:
    def __init__(self) -> None:
        self.added: list[object] = []
        self.flushed = False
        self.execute_results: list[FakeResult] = []
        self.get_results: dict[tuple[type[object], object], object] = {}

    def add(self, instance: object) -> None:
        self.added.append(instance)

    def add_all(self, instances: list[object]) -> None:
        self.added.extend(instances)

    def flush(self) -> None:
        self.flushed = True

    def execute(self, statement: object) -> FakeResult:
        _ = statement
        return self.execute_results.pop(0) if self.execute_results else FakeResult([])

    def get(self, model: type[object], identity: object) -> object | None:
        return self.get_results.get((model, identity))


def test_card_repository_creates_updates_values_and_relations() -> None:
    session = FakeSession()
    archived_at = datetime(2026, 6, 27, 12, 0, tzinfo=UTC)
    repository = SQLAlchemyCardRepository(session, now_provider=lambda: archived_at)
    registry_id = uuid4()
    organization_id = uuid4()
    org_unit_id = uuid4()
    created_by = uuid4()

    card_id = repository.create_card(
        registry_id=registry_id,
        organization_id=organization_id,
        org_unit_id=org_unit_id,
        display_name="Card",
        created_by=created_by,
    )
    block_instance_id = repository.create_block_instance(
        card_id=card_id,
        block_id=uuid4(),
        ordinal=0,
        created_by=created_by,
    )
    field_id = uuid4()
    session.execute_results = [FakeResult([])]
    value_id = repository.upsert_field_value(
        card_id=card_id,
        block_instance_id=block_instance_id,
        field_id=field_id,
        values={"value_text": "Text", "value_bool": None},
        updated_by=created_by,
    )
    first_item_id = uuid4()
    second_item_id = uuid4()
    repository.replace_field_value_items(
        field_value_id=value_id,
        reference_item_ids=(first_item_id, second_item_id),
    )
    target_card_id = uuid4()
    relation_id = repository.create_card_relation(
        source_card_id=card_id,
        target_card_id=target_card_id,
        relation_type="transferred_to",
        created_by=created_by,
    )

    card, block_instance, field_value, first_item, second_item, relation = session.added
    assert isinstance(card, Card)
    assert card.id == card_id
    assert card.lifecycle_status == "active"
    assert isinstance(block_instance, CardBlockInstance)
    assert block_instance.id == block_instance_id
    assert isinstance(field_value, FieldValue)
    assert field_value.id == value_id
    assert field_value.value_text == "Text"
    assert isinstance(first_item, FieldValueItem)
    assert first_item.reference_item_id == first_item_id
    assert isinstance(second_item, FieldValueItem)
    assert second_item.reference_item_id == second_item_id
    assert isinstance(relation, CardRelation)
    assert relation.id == relation_id

    session.get_results[(Card, card_id)] = card
    repository.archive_card(card_id=card_id, archived_by=created_by, reason="done")
    assert card.lifecycle_status == "archived"
    assert card.archived_at == archived_at
    repository.mark_card_superseded(card_id=card_id, updated_by=created_by)
    assert card.lifecycle_status == "superseded"


def test_card_query_repository_returns_dict_contracts() -> None:
    session = FakeSession()
    repository = SQLAlchemyCardRepository(session)
    card = Card(
        id=uuid4(),
        registry_id=uuid4(),
        organization_id=uuid4(),
        org_unit_id=None,
        display_name="Card",
        lifecycle_status="active",
        public_edit_enabled=True,
        public_view_enabled=False,
    )
    field = FormField(id=uuid4(), block_id=uuid4(), code="name", label="Name", field_type="text")
    block = FormBlock(id=uuid4(), registry_id=card.registry_id, code="main", title="Main")
    value = FieldValue(
        id=uuid4(),
        card_id=card.id,
        block_instance_id=uuid4(),
        field_id=field.id,
        value_text="Card",
    )
    item_id = uuid4()
    session.get_results[(Card, card.id)] = card
    session.get_results[(FormField, field.id)] = field
    session.execute_results = [
        FakeResult([block]),
        FakeResult([field]),
        FakeResult([value]),
        FakeResult([item_id]),
        FakeResult([card]),
    ]

    assert repository.get_card(card.id)["display_name"] == "Card"
    assert repository.get_field_schema(field.id)["field_type"] == "text"
    assert repository.list_schema_blocks(card.registry_id)[0]["code"] == "main"
    assert repository.list_schema_fields(block.id)[0]["code"] == "name"
    assert repository.list_field_values(card.id)[0]["value_text"] == "Card"
    assert repository.list_field_value_items(value.id) == [item_id]
    assert repository.list_cards(filters=object())[0]["id"] == card.id


def test_public_link_repository_creates_disables_and_updates_public_values() -> None:
    session = FakeSession()
    disabled_at = datetime(2026, 6, 27, 12, 0, tzinfo=UTC)
    repository = SQLAlchemyPublicLinkRepository(session, now_provider=lambda: disabled_at)
    card_id = uuid4()
    expires_at = datetime(2026, 7, 4, 12, 0, tzinfo=UTC)
    created_by = uuid4()

    link_id = repository.create_public_link(
        card_id=card_id,
        token_hash="hash",
        can_view=True,
        can_edit=True,
        expires_at=expires_at,
        max_uses=None,
        created_by=created_by,
    )
    link = session.added[0]
    assert isinstance(link, CardPublicLink)
    assert link.id == link_id
    assert link.token_hash == "hash"

    session.get_results[(CardPublicLink, link_id)] = link
    repository.disable_public_link(link_id=link_id, disabled_at=disabled_at)
    assert link.status == "disabled"
    assert link.disabled_at == disabled_at
    link.status = "active"
    repository.increment_public_link_usage(link_id)
    assert link.used_count == 1

    block = FormBlock(id=uuid4(), registry_id=uuid4(), code="main", title="Main")
    block.public_editable = True
    block_instance = CardBlockInstance(id=uuid4(), card_id=card_id, block_id=block.id, ordinal=0)
    field = FormField(id=uuid4(), block_id=block.id, code="name", label="Name", field_type="text")
    field.public_editable = True
    session.get_results[(CardBlockInstance, block_instance.id)] = block_instance
    session.get_results[(FormBlock, block.id)] = block
    session.get_results[(FormField, field.id)] = field
    assert repository.get_public_field_access(
        block_instance_id=block_instance.id,
        field_id=field.id,
    ) == {
        "field_type": "text",
        "block_public_editable": True,
        "field_public_editable": True,
    }
