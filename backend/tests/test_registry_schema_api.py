from collections.abc import Generator
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from app.api.dependencies import get_current_actor, get_db_session, get_registry_schema_service
from app.main import app
from app.services.permissions import ActorContext
from app.services.registry_schema import (
    FieldCreate,
    FieldUpdate,
    FormBlockUpdate,
    RegistryCreate,
    RegistryUpdate,
)


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
        self.schema_requests: list[tuple[ActorContext, UUID]] = []
        self.updated_registries: list[tuple[ActorContext, UUID, RegistryUpdate]] = []
        self.updated_blocks: list[tuple[ActorContext, UUID, FormBlockUpdate]] = []
        self.updated_fields: list[tuple[ActorContext, UUID, FieldUpdate]] = []

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

    def get_schema(self, actor: ActorContext, registry_id: UUID) -> dict[str, object]:
        self.schema_requests.append((actor, registry_id))
        block_id = uuid4()
        field_id = uuid4()
        return {
            "id": registry_id,
            "code": "cards",
            "name": "Cards",
            "archived": False,
            "blocks": [
                {
                    "id": block_id,
                    "registry_id": registry_id,
                    "code": "main",
                    "title": "Main",
                    "archived": False,
                    "fields": [
                        {
                            "id": field_id,
                            "block_id": block_id,
                            "code": "status",
                            "label": "Status",
                            "field_type": "text",
                            "required_mode": "not_required",
                            "options_source_type": None,
                            "options_source_id": None,
                            "archived": False,
                        }
                    ],
                }
            ],
        }

    def update_registry(
        self,
        actor: ActorContext,
        registry_id: UUID,
        data: RegistryUpdate,
    ) -> dict[str, object]:
        self.updated_registries.append((actor, registry_id, data))
        return {
            "id": registry_id,
            "code": data.code or "cards",
            "name": data.name or "Cards",
            "archived": False,
            "blocks": [],
        }

    def update_block(
        self,
        actor: ActorContext,
        block_id: UUID,
        data: FormBlockUpdate,
    ) -> dict[str, object]:
        self.updated_blocks.append((actor, block_id, data))
        return {
            "id": block_id,
            "registry_id": uuid4(),
            "code": data.code or "main",
            "title": data.title or "Main",
            "archived": False,
            "fields": [],
        }

    def update_field(
        self,
        actor: ActorContext,
        field_id: UUID,
        data: FieldUpdate,
    ) -> dict[str, object]:
        self.updated_fields.append((actor, field_id, data))
        return {
            "id": field_id,
            "block_id": uuid4(),
            "code": data.code or "status",
            "label": data.label or "Status",
            "field_type": "text",
            "required_mode": data.required_mode or "not_required",
            "options_source_type": data.options_source_type,
            "options_source_id": data.options_source_id,
            "archived": False,
        }


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
            "options_source_type": "reference_list",
            "options_source_id": str(reference_list_id := uuid4()),
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
        options_source_type="reference_list",
        options_source_id=reference_list_id,
    )
    assert session.committed is True


def test_update_field_endpoint_accepts_reference_list_source(
    api_client: tuple[TestClient, FakeRegistrySchemaService, FakeSession],
) -> None:
    client, service, session = api_client
    field_id = uuid4()
    reference_list_id = uuid4()

    response = client.patch(
        f"/api/v1/registries/fields/{field_id}",
        json={
            "options_source_type": "reference_list",
            "options_source_id": str(reference_list_id),
        },
    )

    assert response.status_code == 200
    assert response.json()["options_source_type"] == "reference_list"
    assert response.json()["options_source_id"] == str(reference_list_id)
    assert service.updated_fields[0][1:] == (
        field_id,
        FieldUpdate(options_source_type="reference_list", options_source_id=reference_list_id),
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


def test_get_registry_schema_endpoint_uses_service(
    api_client: tuple[TestClient, FakeRegistrySchemaService, FakeSession],
) -> None:
    client, service, _session = api_client
    registry_id = uuid4()

    response = client.get(f"/api/v1/registries/{registry_id}/schema")

    assert response.status_code == 200
    assert response.json()["id"] == str(registry_id)
    assert response.json()["blocks"][0]["fields"][0]["code"] == "status"
    assert service.schema_requests[0][1] == registry_id


def test_update_registry_block_and_field_endpoints_use_service_and_commit(
    api_client: tuple[TestClient, FakeRegistrySchemaService, FakeSession],
) -> None:
    client, service, session = api_client
    registry_id = uuid4()
    block_id = uuid4()
    field_id = uuid4()

    registry_response = client.patch(
        f"/api/v1/registries/{registry_id}",
        json={"code": "cards-2", "name": "Cards 2"},
    )
    block_response = client.patch(
        f"/api/v1/registries/blocks/{block_id}",
        json={"code": "main-2", "title": "Main 2"},
    )
    field_response = client.patch(
        f"/api/v1/registries/fields/{field_id}",
        json={
            "code": "status-2",
            "label": "Status 2",
            "required_mode": "required_on_publish",
        },
    )

    assert registry_response.status_code == 200
    assert block_response.status_code == 200
    assert field_response.status_code == 200
    assert service.updated_registries[0][1:] == (
        registry_id,
        RegistryUpdate(code="cards-2", name="Cards 2"),
    )
    assert service.updated_blocks[0][1:] == (
        block_id,
        FormBlockUpdate(code="main-2", title="Main 2"),
    )
    assert service.updated_fields[0][1:] == (
        field_id,
        FieldUpdate(code="status-2", label="Status 2", required_mode="required_on_publish"),
    )
    assert session.committed is True
