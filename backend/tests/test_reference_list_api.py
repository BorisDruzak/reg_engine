from collections.abc import Generator
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from app.api.dependencies import get_current_actor, get_db_session, get_reference_list_service
from app.main import app
from app.services.permissions import ActorContext
from app.services.reference_lists import ReferenceItemCreate, ReferenceListCreate


class FakeSession:
    def __init__(self) -> None:
        self.committed = False

    def commit(self) -> None:
        self.committed = True


class FakeReferenceListService:
    def __init__(self) -> None:
        self.created_lists: list[tuple[ActorContext, ReferenceListCreate]] = []
        self.created_items: list[tuple[ActorContext, UUID, ReferenceItemCreate]] = []
        self.archived_lists: list[tuple[ActorContext, UUID]] = []
        self.archived_items: list[tuple[ActorContext, UUID]] = []

    def create_list(self, actor: ActorContext, data: ReferenceListCreate) -> UUID:
        self.created_lists.append((actor, data))
        return uuid4()

    def create_item(
        self,
        actor: ActorContext,
        *,
        list_id: UUID,
        data: ReferenceItemCreate,
    ) -> UUID:
        self.created_items.append((actor, list_id, data))
        return uuid4()

    def archive_list(self, actor: ActorContext, list_id: UUID) -> None:
        self.archived_lists.append((actor, list_id))

    def archive_item(self, actor: ActorContext, item_id: UUID) -> None:
        self.archived_items.append((actor, item_id))


@pytest.fixture()
def api_client() -> Generator[tuple[TestClient, FakeReferenceListService, FakeSession], None, None]:
    service = FakeReferenceListService()
    session = FakeSession()
    actor = ActorContext(user_id=uuid4(), is_superuser=True, grants=())
    app.dependency_overrides[get_reference_list_service] = lambda: service
    app.dependency_overrides[get_db_session] = lambda: session
    app.dependency_overrides[get_current_actor] = lambda: actor
    with TestClient(app) as test_client:
        yield test_client, service, session
    app.dependency_overrides.clear()


def test_create_reference_list_endpoint_uses_service_and_commits(
    api_client: tuple[TestClient, FakeReferenceListService, FakeSession],
) -> None:
    client, service, session = api_client
    registry_id = uuid4()
    organization_id = uuid4()

    response = client.post(
        "/api/v1/reference-lists",
        json={
            "registry_id": str(registry_id),
            "owner_organization_id": str(organization_id),
            "code": "statuses",
            "name": "Statuses",
            "locked_for_descendants": True,
            "inherit_to_descendants": True,
        },
    )

    assert response.status_code == 201
    assert UUID(response.json()["id"])
    assert service.created_lists[0][1] == ReferenceListCreate(
        registry_id=registry_id,
        owner_organization_id=organization_id,
        code="statuses",
        name="Statuses",
        locked_for_descendants=True,
        inherit_to_descendants=True,
    )
    assert session.committed is True


def test_create_reference_item_endpoint_uses_service_and_commits(
    api_client: tuple[TestClient, FakeReferenceListService, FakeSession],
) -> None:
    client, service, session = api_client
    list_id = uuid4()

    response = client.post(
        f"/api/v1/reference-lists/{list_id}/items",
        json={"code": "active", "label": "Active"},
    )

    assert response.status_code == 201
    assert UUID(response.json()["id"])
    assert service.created_items[0][1] == list_id
    assert service.created_items[0][2] == ReferenceItemCreate(code="active", label="Active")
    assert session.committed is True


def test_archive_reference_list_and_item_endpoints_use_service_and_commit(
    api_client: tuple[TestClient, FakeReferenceListService, FakeSession],
) -> None:
    client, service, session = api_client
    list_id = uuid4()
    item_id = uuid4()

    list_response = client.post(f"/api/v1/reference-lists/{list_id}/archive")
    item_response = client.post(f"/api/v1/reference-lists/items/{item_id}/archive")

    assert list_response.status_code == 204
    assert item_response.status_code == 204
    assert service.archived_lists[0][1] == list_id
    assert service.archived_items[0][1] == item_id
    assert session.committed is True
