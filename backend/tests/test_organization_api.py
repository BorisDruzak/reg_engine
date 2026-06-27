from collections.abc import Generator
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from app.api.dependencies import get_current_actor, get_db_session, get_organization_service
from app.main import app
from app.services.organizations import (
    OrganizationCreate,
    OrganizationRead,
    OrganizationTreeNode,
    OrganizationUpdate,
)
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
        self.tree_requests: list[tuple[ActorContext, UUID | None]] = []
        self.get_requests: list[tuple[ActorContext, UUID]] = []
        self.updated: list[tuple[ActorContext, UUID, OrganizationUpdate]] = []
        self.archived: list[tuple[ActorContext, UUID]] = []

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

    def get_tree(
        self,
        actor: ActorContext,
        *,
        root_id: UUID | None = None,
    ) -> tuple[OrganizationTreeNode, ...]:
        self.tree_requests.append((actor, root_id))
        return (
            OrganizationTreeNode(
                id=root_id or uuid4(),
                code="root",
                name="Root",
                parent_id=None,
                archived=False,
                children=(),
            ),
        )

    def get_organization(self, actor: ActorContext, organization_id: UUID) -> OrganizationRead:
        self.get_requests.append((actor, organization_id))
        return OrganizationRead(
            id=organization_id,
            code="root",
            name="Root",
            parent_id=None,
            archived=False,
        )

    def update_organization(
        self,
        actor: ActorContext,
        *,
        organization_id: UUID,
        data: OrganizationUpdate,
    ) -> OrganizationRead:
        self.updated.append((actor, organization_id, data))
        return OrganizationRead(
            id=organization_id,
            code=data.code or "root",
            name=data.name or "Root",
            parent_id=None,
            archived=False,
        )

    def archive_organization(self, actor: ActorContext, organization_id: UUID) -> None:
        self.archived.append((actor, organization_id))


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


def test_tree_and_get_organization_endpoints_use_service(
    api_client: tuple[TestClient, FakeOrganizationService],
) -> None:
    client, service = api_client
    organization_id = uuid4()

    tree_response = client.get(
        "/api/v1/organizations/tree", params={"root_id": str(organization_id)}
    )
    get_response = client.get(f"/api/v1/organizations/{organization_id}")

    assert tree_response.status_code == 200
    assert tree_response.json()[0]["id"] == str(organization_id)
    assert get_response.status_code == 200
    assert get_response.json()["id"] == str(organization_id)
    assert service.tree_requests[0][1] == organization_id
    assert service.get_requests[0][1] == organization_id


def test_update_and_archive_organization_endpoints_use_service_and_commit(
    api_client: tuple[TestClient, FakeOrganizationService],
) -> None:
    client, service = api_client
    organization_id = uuid4()

    update_response = client.patch(
        f"/api/v1/organizations/{organization_id}",
        json={"code": "new", "name": "New Name"},
    )
    archive_response = client.post(f"/api/v1/organizations/{organization_id}/archive")

    assert update_response.status_code == 200
    assert update_response.json()["code"] == "new"
    assert archive_response.status_code == 204
    assert service.updated[0][1:] == (
        organization_id,
        OrganizationUpdate(code="new", name="New Name"),
    )
    assert service.archived[0][1] == organization_id
    assert service.session.committed is True
