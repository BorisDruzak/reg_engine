from collections.abc import Generator
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from app.api.dependencies import get_current_actor, get_db_session, get_registry_schema_service
from app.main import app
from app.services.permissions import ActorContext
from app.services.registry_schema import FieldCreate, RegistryCreate


class FakeSession:
    def __init__(self) -> None:
        self.committed = False

    def commit(self) -> None:
        self.committed = True


class FakeRegistrySchemaService:
    def __init__(self) -> None:
        self.created_registries: list[tuple[ActorContext, RegistryCreate]] = []
        self.created_blocks: list[tuple[ActorContext, UUID, str, str]] = []
        self.created_fields: list[tuple[ActorContext, UUID, FieldCreate]] = []
        self.archived_blocks: list[tuple[ActorContext, UUID]] = []
        self.archived_fields: list[tuple[ActorContext, UUID]] = []

    def create_registry(self, actor: ActorContext, data: RegistryCreate) -> UUID:
        self.created_registries.append((actor, data))
        return uuid4()

    def create_block(
        self,
        actor: ActorContext,
        *,
        registry_id: UUID,
        code: str,
        title: str,
    ) -> UUID:
        self.created_blocks.append((actor, registry_id, code, title))
        return uuid4()

    def create_field(self, actor: ActorContext, *, block_id: UUID, data: FieldCreate) -> UUID:
        self.created_fields.append((actor, block_id, data))
        return uuid4()

    def archive_block(self, actor: ActorContext, block_id: UUID) -> None:
        self.archived_blocks.append((actor, block_id))

    def archive_field(self, actor: ActorContext, field_id: UUID) -> None:
        self.archived_fields.append((actor, field_id))


@pytest.fixture()
def api_client() -> Generator[
    tuple[TestClient, FakeRegistrySchemaService, FakeSession], None, None
]:
    service = FakeRegistrySchemaService()
    session = FakeSession()
    actor = ActorContext(user_id=uuid4(), is_superuser=True, grants=())
    app.dependency_overrides[get_registry_schema_service] = lambda: service
    app.dependency_overrides[get_db_session] = lambda: session
    app.dependency_overrides[get_current_actor] = lambda: actor
    with TestClient(app) as test_client:
        yield test_client, service, session
    app.dependency_overrides.clear()


def test_create_registry_endpoint_uses_service_and_commits(
    api_client: tuple[TestClient, FakeRegistrySchemaService, FakeSession],
) -> None:
    client, service, session = api_client

    response = client.post("/api/v1/registries", json={"code": "cards", "name": "Cards"})

    assert response.status_code == 201
    assert UUID(response.json()["id"])
    assert service.created_registries[0][1] == RegistryCreate(code="cards", name="Cards")
    assert session.committed is True


def test_create_block_endpoint_uses_service_and_commits(
    api_client: tuple[TestClient, FakeRegistrySchemaService, FakeSession],
) -> None:
    client, service, session = api_client
    registry_id = uuid4()

    response = client.post(
        f"/api/v1/registries/{registry_id}/blocks",
        json={"code": "main", "title": "Main"},
    )

    assert response.status_code == 201
    assert UUID(response.json()["id"])
    assert service.created_blocks[0][1:] == (registry_id, "main", "Main")
    assert session.committed is True


def test_create_field_endpoint_uses_service_and_commits(
    api_client: tuple[TestClient, FakeRegistrySchemaService, FakeSession],
) -> None:
    client, service, session = api_client
    block_id = uuid4()

    response = client.post(
        f"/api/v1/registries/blocks/{block_id}/fields",
        json={
            "code": "status",
            "label": "Status",
            "field_type": "select",
            "required_mode": "not_required",
        },
    )

    assert response.status_code == 201
    assert UUID(response.json()["id"])
    assert service.created_fields[0][1] == block_id
    assert service.created_fields[0][2] == FieldCreate(
        code="status",
        label="Status",
        field_type="select",
        required_mode="not_required",
    )
    assert session.committed is True


def test_archive_block_and_field_endpoints_use_service_and_commit(
    api_client: tuple[TestClient, FakeRegistrySchemaService, FakeSession],
) -> None:
    client, service, session = api_client
    block_id = uuid4()
    field_id = uuid4()

    block_response = client.post(f"/api/v1/registries/blocks/{block_id}/archive")
    field_response = client.post(f"/api/v1/registries/fields/{field_id}/archive")

    assert block_response.status_code == 204
    assert field_response.status_code == 204
    assert service.archived_blocks[0][1] == block_id
    assert service.archived_fields[0][1] == field_id
    assert session.committed is True
