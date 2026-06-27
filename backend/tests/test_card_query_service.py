from uuid import UUID, uuid4

from app.services.card_queries import CardListFilters, CardQueryService
from app.services.permissions import ActorContext, PermissionService


class InMemoryPermissionRepository:
    def __init__(self, closure: set[tuple[UUID, UUID]]) -> None:
        self.closure = closure

    def is_descendant_or_self(self, *, ancestor_id: UUID, descendant_id: UUID) -> bool:
        return ancestor_id == descendant_id or (ancestor_id, descendant_id) in self.closure


class InMemoryCardQueryRepository:
    def __init__(self) -> None:
        self.cards: dict[UUID, dict[str, object]] = {}
        self.blocks: list[dict[str, object]] = []
        self.fields: list[dict[str, object]] = []
        self.field_values: list[dict[str, object]] = []
        self.field_value_items: dict[UUID, list[UUID]] = {}

    def add_card(
        self,
        *,
        registry_id: UUID,
        organization_id: UUID,
        org_unit_id: UUID | None,
        display_name: str,
        lifecycle_status: str = "active",
    ) -> UUID:
        card_id = uuid4()
        self.cards[card_id] = {
            "id": card_id,
            "registry_id": registry_id,
            "organization_id": organization_id,
            "org_unit_id": org_unit_id,
            "display_name": display_name,
            "lifecycle_status": lifecycle_status,
        }
        return card_id

    def add_block(self, *, registry_id: UUID, code: str, title: str) -> UUID:
        block_id = uuid4()
        self.blocks.append(
            {
                "id": block_id,
                "registry_id": registry_id,
                "code": code,
                "title": title,
                "archived": False,
            }
        )
        return block_id

    def add_field(self, *, block_id: UUID, code: str, field_type: str) -> UUID:
        field_id = uuid4()
        self.fields.append(
            {
                "id": field_id,
                "block_id": block_id,
                "code": code,
                "field_type": field_type,
                "archived": False,
            }
        )
        return field_id

    def add_value(
        self,
        *,
        card_id: UUID,
        block_instance_id: UUID,
        field_id: UUID,
        value_text: str | None = None,
    ) -> UUID:
        value_id = uuid4()
        self.field_values.append(
            {
                "id": value_id,
                "card_id": card_id,
                "block_instance_id": block_instance_id,
                "field_id": field_id,
                "value_text": value_text,
                "value_number": None,
                "value_date": None,
                "value_datetime": None,
                "value_bool": None,
                "value_json": None,
                "value_reference_item_id": None,
                "value_card_id": None,
                "value_user_id": None,
                "value_organization_id": None,
                "value_org_unit_id": None,
                "value_registry_id": None,
            }
        )
        return value_id

    def get_card(self, card_id: UUID) -> dict[str, object]:
        return self.cards[card_id]

    def list_schema_blocks(self, registry_id: UUID) -> list[dict[str, object]]:
        return [
            block
            for block in self.blocks
            if block["registry_id"] == registry_id and not block["archived"]
        ]

    def list_schema_fields(self, block_id: UUID) -> list[dict[str, object]]:
        return [
            field
            for field in self.fields
            if field["block_id"] == block_id and not field["archived"]
        ]

    def list_field_values(self, card_id: UUID) -> list[dict[str, object]]:
        return [value for value in self.field_values if value["card_id"] == card_id]

    def list_field_value_items(self, field_value_id: UUID) -> list[UUID]:
        return self.field_value_items.get(field_value_id, [])

    def list_cards(self, filters: CardListFilters) -> list[dict[str, object]]:
        cards = list(self.cards.values())
        if filters.registry_id is not None:
            cards = [card for card in cards if card["registry_id"] == filters.registry_id]
        if filters.lifecycle_status is not None:
            cards = [card for card in cards if card["lifecycle_status"] == filters.lifecycle_status]
        if filters.org_unit_id is not None:
            cards = [card for card in cards if card["org_unit_id"] == filters.org_unit_id]
        if filters.display_name_query is not None:
            query = filters.display_name_query.casefold()
            cards = [card for card in cards if query in str(card["display_name"]).casefold()]
        return cards


def test_card_read_model_merges_schema_and_values_without_creating_missing_rows() -> None:
    organization_id = uuid4()
    registry_id = uuid4()
    block_instance_id = uuid4()
    repository = InMemoryCardQueryRepository()
    card_id = repository.add_card(
        registry_id=registry_id,
        organization_id=organization_id,
        org_unit_id=None,
        display_name="Alpha",
    )
    block_id = repository.add_block(registry_id=registry_id, code="main", title="Main")
    existing_field_id = repository.add_field(block_id=block_id, code="existing", field_type="text")
    new_field_id = repository.add_field(block_id=block_id, code="new_empty", field_type="text")
    repository.add_value(
        card_id=card_id,
        block_instance_id=block_instance_id,
        field_id=existing_field_id,
        value_text="saved",
    )
    permission_service = PermissionService(InMemoryPermissionRepository(set()))
    service = CardQueryService(repository, permission_service)
    actor = ActorContext.for_org_admin(user_id=uuid4(), organization_id=organization_id)
    before_value_count = len(repository.field_values)

    read_model = service.get_card(actor, card_id)

    fields = {field.code: field for block in read_model.blocks for field in block.fields}
    assert fields["existing"].value == "saved"
    assert fields["new_empty"].id == new_field_id
    assert fields["new_empty"].value is None
    assert len(repository.field_values) == before_value_count


def test_card_list_filters_by_registry_scope_status_org_unit_and_display_name() -> None:
    parent_id = uuid4()
    child_id = uuid4()
    sibling_id = uuid4()
    registry_id = uuid4()
    other_registry_id = uuid4()
    org_unit_id = uuid4()
    other_org_unit_id = uuid4()
    repository = InMemoryCardQueryRepository()
    parent_card_id = repository.add_card(
        registry_id=registry_id,
        organization_id=parent_id,
        org_unit_id=org_unit_id,
        display_name="Alpha parent",
    )
    child_card_id = repository.add_card(
        registry_id=registry_id,
        organization_id=child_id,
        org_unit_id=org_unit_id,
        display_name="Alpha child",
    )
    repository.add_card(
        registry_id=registry_id,
        organization_id=sibling_id,
        org_unit_id=org_unit_id,
        display_name="Alpha sibling",
    )
    repository.add_card(
        registry_id=other_registry_id,
        organization_id=parent_id,
        org_unit_id=org_unit_id,
        display_name="Alpha other registry",
    )
    repository.add_card(
        registry_id=registry_id,
        organization_id=parent_id,
        org_unit_id=other_org_unit_id,
        display_name="Alpha other org unit",
    )
    repository.add_card(
        registry_id=registry_id,
        organization_id=parent_id,
        org_unit_id=org_unit_id,
        display_name="Beta archived",
        lifecycle_status="archived",
    )
    permission_service = PermissionService(InMemoryPermissionRepository({(parent_id, child_id)}))
    service = CardQueryService(repository, permission_service)
    actor = ActorContext.for_org_admin(user_id=uuid4(), organization_id=parent_id)

    cards = service.list_cards(
        actor,
        CardListFilters(
            registry_id=registry_id,
            lifecycle_status="active",
            org_unit_id=org_unit_id,
            display_name_query="alpha",
        ),
    )

    assert [card.id for card in cards] == [parent_card_id, child_card_id]
