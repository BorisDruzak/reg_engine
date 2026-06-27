from datetime import UTC, datetime
from uuid import uuid4

from app.models.reference import ReferenceItem, ReferenceList
from app.models.registry_schema import FormBlock, FormField, Registry
from app.repositories.reference_lists import SQLAlchemyReferenceListRepository
from app.repositories.registry_schema import SQLAlchemyRegistrySchemaRepository


class FakeScalarResult:
    def __init__(self, values: list[object]) -> None:
        self.values = values

    def all(self) -> list[object]:
        return self.values


class FakeResult:
    def __init__(self, rows: list[object]) -> None:
        self.rows = rows

    def scalars(self) -> FakeScalarResult:
        return FakeScalarResult(self.rows)


class FakeSession:
    def __init__(self) -> None:
        self.added: list[object] = []
        self.flushed = False
        self.execute_results: list[FakeResult] = []
        self.get_results: dict[tuple[type[object], object], object] = {}

    def add(self, instance: object) -> None:
        self.added.append(instance)

    def flush(self) -> None:
        self.flushed = True

    def execute(self, statement: object) -> FakeResult:
        _ = statement
        return self.execute_results.pop(0)

    def get(self, model: type[object], identity: object) -> object | None:
        return self.get_results.get((model, identity))


def test_registry_schema_repository_creates_and_archives_schema_objects() -> None:
    session = FakeSession()
    archived_at = datetime(2026, 6, 27, 12, 0, tzinfo=UTC)
    repository = SQLAlchemyRegistrySchemaRepository(session, now_provider=lambda: archived_at)
    created_by = uuid4()

    registry_id = repository.create_registry(code="cards", name="Cards", created_by=created_by)
    block_id = repository.create_block(
        registry_id=registry_id,
        code="main",
        title="Main",
        created_by=created_by,
    )
    field_id = repository.create_field(
        block_id=block_id,
        code="status",
        label="Status",
        field_type="select",
        required_mode="not_required",
        created_by=created_by,
    )

    registry, block, field = session.added
    assert isinstance(registry, Registry)
    assert registry.id == registry_id
    assert registry.lifecycle_status == "active"
    assert isinstance(block, FormBlock)
    assert block.id == block_id
    assert block.registry_id == registry_id
    assert block.public_editable is False
    assert isinstance(field, FormField)
    assert field.id == field_id
    assert field.block_id == block_id
    assert field.field_type == "select"

    session.get_results[(Registry, registry_id)] = registry
    session.get_results[(FormBlock, block_id)] = block
    session.get_results[(FormField, field_id)] = field
    session.execute_results = [FakeResult([block]), FakeResult([field])]
    assert repository.get_registry(registry_id)["code"] == "cards"
    assert repository.get_block(block_id)["title"] == "Main"
    assert repository.get_field(field_id)["required_mode"] == "not_required"
    assert repository.list_blocks(registry_id)[0]["id"] == block_id
    assert repository.list_fields(block_id)[0]["id"] == field_id

    repository.update_registry(registry_id, code="cards-2", name="Cards 2")
    repository.update_block(block_id, code="main-2", title="Main 2")
    repository.update_field(
        field_id,
        code="status-2",
        label="Status 2",
        required_mode="required_on_publish",
    )
    assert registry.code == "cards-2"
    assert registry.name == "Cards 2"
    assert block.code == "main-2"
    assert block.title == "Main 2"
    assert field.code == "status-2"
    assert field.label == "Status 2"
    assert field.required_mode == "required_on_publish"

    repository.archive_block(block_id)
    repository.archive_field(field_id)

    assert block.is_active is False
    assert block.archived_at == archived_at
    assert field.is_active is False
    assert field.archived_at == archived_at


def test_reference_list_repository_creates_reads_inherits_and_archives_reference_data() -> None:
    session = FakeSession()
    archived_at = datetime(2026, 6, 27, 12, 0, tzinfo=UTC)
    repository = SQLAlchemyReferenceListRepository(session, now_provider=lambda: archived_at)
    registry_id = uuid4()
    organization_id = uuid4()
    created_by = uuid4()

    list_id = repository.create_reference_list(
        registry_id=registry_id,
        owner_organization_id=organization_id,
        code="statuses",
        name="Statuses",
        locked_for_descendants=True,
        inherit_to_descendants=True,
        created_by=created_by,
    )
    item_id = repository.create_reference_item(
        list_id=list_id,
        code="active",
        label="Active",
        created_by=created_by,
    )

    reference_list, reference_item = session.added
    assert isinstance(reference_list, ReferenceList)
    assert reference_list.id == list_id
    assert reference_list.scope_mode == "organization"
    assert isinstance(reference_item, ReferenceItem)
    assert reference_item.id == item_id
    assert reference_item.list_id == list_id

    session.get_results[(ReferenceList, list_id)] = reference_list
    session.get_results[(ReferenceItem, item_id)] = reference_item
    assert repository.get_reference_list(list_id)["owner_organization_id"] == organization_id
    assert repository.get_reference_item(item_id)["list_id"] == list_id
    repository.update_reference_list(list_id, code="statuses-2", name="Statuses 2")
    repository.update_reference_item(item_id, code="active-2", label="Active 2")
    assert reference_list.code == "statuses-2"
    assert reference_list.name == "Statuses 2"
    assert reference_item.code == "active-2"
    assert reference_item.label == "Active 2"

    inherited_id = uuid4()
    session.execute_results = [FakeResult([list_id, inherited_id])]
    assert repository.inherited_list_ids_for(organization_id) == {list_id, inherited_id}

    repository.archive_reference_item(item_id)
    repository.archive_reference_list(list_id)

    assert reference_item.is_active is False
    assert reference_item.archived_at == archived_at
    assert reference_list.is_active is False
    assert reference_list.archived_at == archived_at
