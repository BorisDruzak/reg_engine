from collections.abc import Generator
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from app.api.dependencies import get_current_actor, get_db_session, get_org_unit_service
from app.main import app
from app.services.org_units import OrgUnitCreate
from app.services.permissions import ActorContext


class FakeSession:
    def __init__(self) -> None:
        self.committed = False

    def commit(self) -> None:
        self.committed = True


class FakeOrgUnitService:
    def __init__(self) -> None:
        self.created: list[tuple[UUID, OrgUnitCreate, UUID | None, ActorContext | None]] = []
        self.archived: list[tuple[UUID, ActorContext | None]] = []
        self.units: list[dict[str, object]] = []

    def create(
        self,
        *,
        organization_id: UUID,
        data: OrgUnitCreate,
        created_by: UUID | None,
        actor: ActorContext | None = None,
    ) -> UUID:
        unit_id = uuid4()
        self.created.append((organization_id, data, created_by, actor))
        self.units.append(
            {
                "id": unit_id,
                "organization_id": organization_id,
                "code": data.code,
                "name": data.name,
                "parent_id": data.parent_id,
                "archived": False,
            }
        )
        return unit_id

    def list_by_organization(self, organization_id: UUID) -> list[dict[str, object]]:
        return [unit for unit in self.units if unit["organization_id"] == organization_id]

    def archive(self, org_unit_id: UUID, *, actor: ActorContext | None = None) -> None:
        self.archived.append((org_unit_id, actor))


@pytest.fixture()
def api_client() -> Generator[tuple[TestClient, FakeOrgUnitService, FakeSession], None, None]:
    service = FakeOrgUnitService()
    session = FakeSession()
    actor = ActorContext(user_id=uuid4(), is_superuser=True, grants=())
    app.dependency_overrides[get_org_unit_service] = lambda: service
    app.dependency_overrides[get_db_session] = lambda: session
    app.dependency_overrides[get_current_actor] = lambda: actor
    with TestClient(app) as test_client:
        yield test_client, service, session
    app.dependency_overrides.clear()


def test_create_org_unit_endpoint_uses_service_and_commits(
    api_client: tuple[TestClient, FakeOrgUnitService, FakeSession],
) -> None:
    client, service, session = api_client
    organization_id = uuid4()

    response = client.post(
        "/api/v1/org-units",
        json={"organization_id": str(organization_id), "code": "ops", "name": "Ops"},
    )

    assert response.status_code == 201
    payload = response.json()
    assert UUID(payload["id"])
    assert service.created[0][0] == organization_id
    assert service.created[0][1] == OrgUnitCreate(code="ops", name="Ops")
    assert service.created[0][2] is not None
    assert service.created[0][3] is not None
    assert session.committed is True


def test_list_org_units_endpoint_returns_units_for_organization(
    api_client: tuple[TestClient, FakeOrgUnitService, FakeSession],
) -> None:
    client, service, _session = api_client
    organization_id = uuid4()
    other_organization_id = uuid4()
    unit_id = service.create(
        organization_id=organization_id,
        data=OrgUnitCreate(code="ops", name="Ops"),
        created_by=uuid4(),
    )
    service.create(
        organization_id=other_organization_id,
        data=OrgUnitCreate(code="hr", name="HR"),
        created_by=uuid4(),
    )

    response = client.get(f"/api/v1/org-units?organization_id={organization_id}")

    assert response.status_code == 200
    assert response.json() == [
        {
            "id": str(unit_id),
            "organization_id": str(organization_id),
            "code": "ops",
            "name": "Ops",
            "parent_id": None,
            "archived": False,
        }
    ]


def test_archive_org_unit_endpoint_uses_service_and_commits(
    api_client: tuple[TestClient, FakeOrgUnitService, FakeSession],
) -> None:
    client, service, session = api_client
    org_unit_id = uuid4()

    response = client.post(f"/api/v1/org-units/{org_unit_id}/archive")

    assert response.status_code == 204
    assert service.archived[0][0] == org_unit_id
    assert service.archived[0][1] is not None
    assert session.committed is True
