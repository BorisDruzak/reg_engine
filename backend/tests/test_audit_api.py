from collections.abc import Generator
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from app.api.dependencies import get_audit_service, get_current_actor
from app.main import app
from app.services.audit import AuditEventFilters, AuditEventRead
from app.services.permissions import ActorContext


class FakeAuditService:
    def __init__(self) -> None:
        self.filters: list[tuple[ActorContext, AuditEventFilters]] = []
        self.created_at = datetime(2026, 6, 27, 12, 0, tzinfo=UTC)

    def list_events(
        self,
        actor: ActorContext,
        filters: AuditEventFilters,
    ) -> tuple[AuditEventRead, ...]:
        self.filters.append((actor, filters))
        return (
            AuditEventRead(
                id=uuid4(),
                actor_type="user",
                actor_user_id=actor.user_id,
                actor_public_link_id=None,
                action="card.create",
                object_type=filters.object_type or "card",
                object_id=filters.object_id,
                old_data=None,
                new_data={"display_name": "Card A"},
                source="api",
                created_at=self.created_at,
            ),
        )


@pytest.fixture()
def api_client() -> Generator[tuple[TestClient, FakeAuditService], None, None]:
    service = FakeAuditService()
    actor = ActorContext(user_id=uuid4(), is_superuser=True, grants=())
    app.dependency_overrides[get_audit_service] = lambda: service
    app.dependency_overrides[get_current_actor] = lambda: actor
    with TestClient(app) as test_client:
        yield test_client, service
    app.dependency_overrides.clear()


def test_list_audit_events_endpoint_uses_service_filters(
    api_client: tuple[TestClient, FakeAuditService],
) -> None:
    client, service = api_client
    object_id = uuid4()

    response = client.get(
        "/api/v1/audit",
        params={
            "object_type": "card",
            "object_id": str(object_id),
            "action": "card.create",
            "limit": 25,
        },
    )

    assert response.status_code == 200
    assert UUID(response.json()[0]["id"])
    assert response.json()[0]["object_type"] == "card"
    assert service.filters[0][1] == AuditEventFilters(
        object_type="card",
        object_id=object_id,
        action="card.create",
        limit=25,
    )


def test_card_and_organization_audit_endpoints_use_object_filters(
    api_client: tuple[TestClient, FakeAuditService],
) -> None:
    client, service = api_client
    card_id = uuid4()
    organization_id = uuid4()

    card_response = client.get(f"/api/v1/audit/cards/{card_id}")
    organization_response = client.get(f"/api/v1/audit/organizations/{organization_id}")

    assert card_response.status_code == 200
    assert organization_response.status_code == 200
    assert service.filters[0][1] == AuditEventFilters(
        object_type="card",
        object_id=card_id,
        limit=100,
    )
    assert service.filters[1][1] == AuditEventFilters(
        object_type="organization",
        object_id=organization_id,
        limit=100,
    )
