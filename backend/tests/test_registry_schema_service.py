from uuid import UUID, uuid4

import pytest

from app.services.permissions import AccessDeniedError, ActorContext
from app.services.registry_schema import (
    FieldCreate,
    InvalidSchemaOperationError,
    RegistryCreate,
    RegistrySchemaService,
)


class InMemoryRegistrySchemaRepository:
    def __init__(self) -> None:
        self.registries: dict[UUID, dict[str, object]] = {}
        self.blocks: dict[UUID, dict[str, object]] = {}
        self.fields: dict[UUID, dict[str, object]] = {}

    def create_registry(self, *, code: str, name: str, created_by: UUID | None) -> UUID:
        registry_id = uuid4()
        self.registries[registry_id] = {
            "id": registry_id,
            "code": code,
            "name": name,
            "created_by": created_by,
            "archived": False,
        }
        return registry_id

    def create_block(
        self,
        *,
        registry_id: UUID,
        code: str,
        title: str,
        created_by: UUID | None,
    ) -> UUID:
        block_id = uuid4()
        self.blocks[block_id] = {
            "id": block_id,
            "registry_id": registry_id,
            "code": code,
            "title": title,
            "created_by": created_by,
            "archived": False,
        }
        return block_id

    def create_field(
        self,
        *,
        block_id: UUID,
        code: str,
        label: str,
        field_type: str,
        required_mode: str,
        created_by: UUID | None,
    ) -> UUID:
        field_id = uuid4()
        self.fields[field_id] = {
            "id": field_id,
            "block_id": block_id,
            "code": code,
            "label": label,
            "field_type": field_type,
            "required_mode": required_mode,
            "created_by": created_by,
            "archived": False,
        }
        return field_id

    def archive_field(self, field_id: UUID) -> None:
        self.fields[field_id]["archived"] = True

    def archive_block(self, block_id: UUID) -> None:
        self.blocks[block_id]["archived"] = True

    def field_exists(self, field_id: UUID) -> bool:
        return field_id in self.fields


def test_system_admin_can_create_registry_block_and_field() -> None:
    repository = InMemoryRegistrySchemaRepository()
    service = RegistrySchemaService(repository)
    actor = ActorContext(user_id=uuid4(), is_superuser=True, grants=())

    registry_id = service.create_registry(actor, RegistryCreate(code="employees", name="Employees"))
    block_id = service.create_block(
        actor,
        registry_id=registry_id,
        code="main",
        title="Main",
    )
    field_id = service.create_field(
        actor,
        block_id=block_id,
        data=FieldCreate(code="display", label="Display", field_type="text"),
    )

    assert repository.registries[registry_id]["code"] == "employees"
    assert repository.blocks[block_id]["registry_id"] == registry_id
    assert repository.fields[field_id]["field_type"] == "text"


def test_org_admin_cannot_manage_registry_schema() -> None:
    repository = InMemoryRegistrySchemaRepository()
    service = RegistrySchemaService(repository)
    actor = ActorContext.for_org_admin(user_id=uuid4(), organization_id=uuid4())

    with pytest.raises(AccessDeniedError):
        service.create_registry(actor, RegistryCreate(code="illegal", name="Illegal"))


def test_invalid_field_type_is_rejected_before_persisting() -> None:
    repository = InMemoryRegistrySchemaRepository()
    service = RegistrySchemaService(repository)
    actor = ActorContext(user_id=uuid4(), is_superuser=True, grants=())
    registry_id = service.create_registry(actor, RegistryCreate(code="reg", name="Registry"))
    block_id = service.create_block(actor, registry_id=registry_id, code="main", title="Main")

    with pytest.raises(InvalidSchemaOperationError):
        service.create_field(
            actor,
            block_id=block_id,
            data=FieldCreate(code="bad", label="Bad", field_type="file_ref"),
        )

    assert repository.fields == {}


def test_archive_field_marks_field_without_deleting() -> None:
    repository = InMemoryRegistrySchemaRepository()
    service = RegistrySchemaService(repository)
    actor = ActorContext(user_id=uuid4(), is_superuser=True, grants=())
    registry_id = service.create_registry(actor, RegistryCreate(code="reg", name="Registry"))
    block_id = service.create_block(actor, registry_id=registry_id, code="main", title="Main")
    field_id = service.create_field(
        actor,
        block_id=block_id,
        data=FieldCreate(code="display", label="Display", field_type="text"),
    )

    service.archive_field(actor, field_id)

    assert repository.field_exists(field_id)
    assert repository.fields[field_id]["archived"] is True


def test_archive_block_marks_block_without_deleting() -> None:
    repository = InMemoryRegistrySchemaRepository()
    service = RegistrySchemaService(repository)
    actor = ActorContext(user_id=uuid4(), is_superuser=True, grants=())
    registry_id = service.create_registry(actor, RegistryCreate(code="reg", name="Registry"))
    block_id = service.create_block(actor, registry_id=registry_id, code="main", title="Main")

    service.archive_block(actor, block_id)

    assert block_id in repository.blocks
    assert repository.blocks[block_id]["archived"] is True
