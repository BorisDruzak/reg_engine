from collections.abc import Generator
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from app.api.dependencies import (
    get_card_query_service,
    get_card_service,
    get_current_actor,
    get_db_session,
)
from app.main import app
from app.services.card_queries import (
    CardBlockRead,
    CardFieldRead,
    CardListFilters,
    CardListItem,
    CardReadModel,
)
from app.services.cards import CardCreate, CardTransfer, CardTransferResult, FieldValueWrite
from app.services.permissions import ActorContext


class FakeSession:
    def __init__(self) -> None:
        self.committed = False

    def commit(self) -> None:
        self.committed = True


class FakeCardService:
    def __init__(self) -> None:
        self.created_cards: list[tuple[ActorContext, CardCreate]] = []
        self.created_block_instances: list[tuple[ActorContext, UUID, UUID, int]] = []
        self.written_values: list[tuple[ActorContext, FieldValueWrite]] = []
        self.archived_cards: list[tuple[ActorContext, UUID, str | None]] = []
        self.transferred_cards: list[tuple[ActorContext, CardTransfer]] = []

    def create_card(self, actor: ActorContext, data: CardCreate) -> UUID:
        self.created_cards.append((actor, data))
        return uuid4()

    def create_block_instance(
        self,
        actor: ActorContext,
        *,
        card_id: UUID,
        block_id: UUID,
        ordinal: int = 0,
    ) -> UUID:
        self.created_block_instances.append((actor, card_id, block_id, ordinal))
        return uuid4()

    def write_field_value(self, actor: ActorContext, data: FieldValueWrite) -> UUID:
        self.written_values.append((actor, data))
        return uuid4()

    def archive_card(
        self,
        actor: ActorContext,
        *,
        card_id: UUID,
        reason: str | None = None,
    ) -> None:
        self.archived_cards.append((actor, card_id, reason))

    def transfer_card(self, actor: ActorContext, data: CardTransfer) -> CardTransferResult:
        self.transferred_cards.append((actor, data))
        return CardTransferResult(target_card_id=uuid4(), relation_id=uuid4())


class FakeCardQueryService:
    def __init__(self) -> None:
        self.requested_cards: list[tuple[ActorContext, UUID]] = []
        self.list_filters: list[tuple[ActorContext, CardListFilters]] = []

    def get_card(self, actor: ActorContext, card_id: UUID) -> CardReadModel:
        self.requested_cards.append((actor, card_id))
        field_id = uuid4()
        return CardReadModel(
            id=card_id,
            registry_id=uuid4(),
            organization_id=uuid4(),
            org_unit_id=None,
            display_name="Card A",
            lifecycle_status="active",
            blocks=(
                CardBlockRead(
                    id=uuid4(),
                    code="main",
                    title="Main",
                    fields=(
                        CardFieldRead(
                            id=field_id,
                            code="status",
                            field_type="text",
                            value="open",
                        ),
                    ),
                ),
            ),
        )

    def list_cards(
        self,
        actor: ActorContext,
        filters: CardListFilters,
    ) -> tuple[CardListItem, ...]:
        self.list_filters.append((actor, filters))
        return (
            CardListItem(
                id=uuid4(),
                registry_id=filters.registry_id or uuid4(),
                organization_id=uuid4(),
                org_unit_id=filters.org_unit_id,
                display_name="Card A",
                lifecycle_status=filters.lifecycle_status or "active",
            ),
        )


@pytest.fixture()
def api_client() -> Generator[
    tuple[TestClient, FakeCardService, FakeCardQueryService, FakeSession], None, None
]:
    service = FakeCardService()
    query_service = FakeCardQueryService()
    session = FakeSession()
    actor = ActorContext(user_id=uuid4(), is_superuser=True, grants=())
    app.dependency_overrides[get_card_service] = lambda: service
    app.dependency_overrides[get_card_query_service] = lambda: query_service
    app.dependency_overrides[get_db_session] = lambda: session
    app.dependency_overrides[get_current_actor] = lambda: actor
    with TestClient(app) as test_client:
        yield test_client, service, query_service, session
    app.dependency_overrides.clear()


def test_create_card_endpoint_uses_service_and_commits(
    api_client: tuple[TestClient, FakeCardService, FakeCardQueryService, FakeSession],
) -> None:
    client, service, _, session = api_client
    registry_id = uuid4()
    organization_id = uuid4()
    org_unit_id = uuid4()

    response = client.post(
        "/api/v1/cards",
        json={
            "registry_id": str(registry_id),
            "organization_id": str(organization_id),
            "org_unit_id": str(org_unit_id),
            "display_name": "Card A",
        },
    )

    assert response.status_code == 201
    assert UUID(response.json()["id"])
    assert service.created_cards[0][1] == CardCreate(
        registry_id=registry_id,
        organization_id=organization_id,
        org_unit_id=org_unit_id,
        display_name="Card A",
    )
    assert session.committed is True


def test_get_and_list_card_endpoints_use_query_service(
    api_client: tuple[TestClient, FakeCardService, FakeCardQueryService, FakeSession],
) -> None:
    client, _, query_service, _ = api_client
    card_id = uuid4()
    registry_id = uuid4()
    org_unit_id = uuid4()

    get_response = client.get(f"/api/v1/cards/{card_id}")
    list_response = client.get(
        "/api/v1/cards",
        params={
            "registry_id": str(registry_id),
            "lifecycle_status": "active",
            "org_unit_id": str(org_unit_id),
            "display_name_query": "Card",
        },
    )

    assert get_response.status_code == 200
    assert get_response.json()["id"] == str(card_id)
    assert get_response.json()["blocks"][0]["fields"][0]["value"] == "open"
    assert list_response.status_code == 200
    assert len(list_response.json()) == 1
    assert query_service.requested_cards[0][1] == card_id
    assert query_service.list_filters[0][1] == CardListFilters(
        registry_id=registry_id,
        lifecycle_status="active",
        org_unit_id=org_unit_id,
        display_name_query="Card",
    )


def test_create_block_instance_endpoint_uses_service_and_commits(
    api_client: tuple[TestClient, FakeCardService, FakeCardQueryService, FakeSession],
) -> None:
    client, service, _, session = api_client
    card_id = uuid4()
    block_id = uuid4()

    response = client.post(
        f"/api/v1/cards/{card_id}/block-instances",
        json={"block_id": str(block_id), "ordinal": 2},
    )

    assert response.status_code == 201
    assert UUID(response.json()["id"])
    assert service.created_block_instances[0][1:] == (card_id, block_id, 2)
    assert session.committed is True


def test_write_field_value_endpoint_uses_service_and_commits(
    api_client: tuple[TestClient, FakeCardService, FakeCardQueryService, FakeSession],
) -> None:
    client, service, _, session = api_client
    card_id = uuid4()
    block_instance_id = uuid4()
    field_id = uuid4()

    response = client.post(
        "/api/v1/cards/values",
        json={
            "card_id": str(card_id),
            "block_instance_id": str(block_instance_id),
            "field_id": str(field_id),
            "value": "open",
        },
    )

    assert response.status_code == 201
    assert UUID(response.json()["id"])
    assert service.written_values[0][1] == FieldValueWrite(
        card_id=card_id,
        block_instance_id=block_instance_id,
        field_id=field_id,
        value="open",
    )
    assert session.committed is True


def test_archive_and_transfer_card_endpoints_use_service_and_commit(
    api_client: tuple[TestClient, FakeCardService, FakeCardQueryService, FakeSession],
) -> None:
    client, service, _, session = api_client
    card_id = uuid4()
    target_organization_id = uuid4()
    target_org_unit_id = uuid4()

    archive_response = client.post(
        f"/api/v1/cards/{card_id}/archive",
        json={"reason": "duplicate"},
    )
    transfer_response = client.post(
        f"/api/v1/cards/{card_id}/transfer",
        json={
            "target_organization_id": str(target_organization_id),
            "target_org_unit_id": str(target_org_unit_id),
            "display_name": "Transferred Card",
        },
    )

    assert archive_response.status_code == 204
    assert transfer_response.status_code == 201
    assert UUID(transfer_response.json()["target_card_id"])
    assert UUID(transfer_response.json()["relation_id"])
    assert service.archived_cards[0][1:] == (card_id, "duplicate")
    assert service.transferred_cards[0][1] == CardTransfer(
        source_card_id=card_id,
        target_organization_id=target_organization_id,
        target_org_unit_id=target_org_unit_id,
        display_name="Transferred Card",
    )
    assert session.committed is True
