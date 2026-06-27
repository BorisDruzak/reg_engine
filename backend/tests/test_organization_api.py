from collections.abc import Generator
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from app.api.dependencies import get_current_actor, get_db_session, get_organization_service
from app.main import app
from app.services.organizations import OrganizationCreate
from app.services.permissions import ActorContext


class FakeSession:
    def __init__(self) -> None:
        self.committed = False

    def commit(self) -> None:
        self.committed = True


class FakeOrganizationService:
    def __init__(self) -> None:
        self.created_roots: list[tuple[ActorContext, OrganizationCreate]] = []
        self.created_children: list[tuple[ActorContext, UUID, OrganizationCreate]] = []

    def create_root(self, actor: ActorContext, data: OrganizationCreate) -> UUID:
        self.created_roots.append((actor, data))
        return uuid4()

    def create_child(
        self,
        actor: ActorContext,
        *,
        parent_id: UUID,
        data: OrganizationCreate,
    ) -> UUID:
        self.created_children.append((actor, parent_id, data))
        return uuid4()


@pytest.fixture()
def api_client() -> Generator[tuple[TestClient, FakeOrganizationService], None, None]:
    service = FakeOrganizationService()
    session = FakeSession()
    actor = ActorContext(user_id=uuid4(), is_superuser=True, grants=())
    app.dependency_overrides[get_organization_service] = lambda: service
    app.dependency_overrides[get_db_session] = lambda: session
    app.dependency_overrides[get_current_actor] = lambda: actor
    with TestClient(app) as test_client:
        service.session = session
        yield test_client, service
    app.dependency_overrides.clear()


def test_create_root_organization_endpoint_uses_service_and_commits(
    api_client: tuple[TestClient, FakeOrganizationService],
) -> None:
    client, service = api_client

    response = client.post("/api/v1/organizations/root", json={"code": "root", "name": "Root"})

    assert response.status_code == 201
    payload = response.json()
    assert UUID(payload["id"])
    assert service.created_roots[0][1] == OrganizationCreate(code="root", name="Root")
    assert service.session.committed is True


def test_create_child_organization_endpoint_uses_service_and_commits(
    api_client: tuple[TestClient, FakeOrganizationService],
) -> None:
    client, service = api_client
    parent_id = uuid4()

    response = client.post(
        f"/api/v1/organizations/{parent_id}/children",
        json={"code": "child", "name": "Child"},
    )

    assert response.status_code == 201
    payload = response.json()
    assert UUID(payload["id"])
    assert service.created_children[0][1] == parent_id
    assert service.created_children[0][2] == OrganizationCreate(code="child", name="Child")
    assert service.session.committed is True
