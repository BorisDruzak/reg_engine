from collections.abc import Generator
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from app.api.dependencies import get_current_actor, get_db_session, get_public_link_service
from app.main import app
from app.services.permissions import ActorContext
from app.services.public_links import (
    PublicFieldValueWrite,
    PublicLinkCardAccess,
    PublicLinkCreate,
    PublicLinkCreated,
    PublicLinkRead,
)


class FakeSession:
    def __init__(self) -> None:
        self.committed = False

    def commit(self) -> None:
        self.committed = True


class FakePublicLinkService:
    def __init__(self) -> None:
        self.created_links: list[tuple[ActorContext, PublicLinkCreate]] = []
        self.listed_cards: list[tuple[ActorContext, UUID]] = []
        self.disabled_links: list[tuple[ActorContext, UUID]] = []
        self.public_tokens: list[str] = []
        self.updated_values: list[tuple[str, PublicFieldValueWrite]] = []
        self.expires_at = datetime(2026, 7, 4, 12, 0, tzinfo=UTC)

    def create_link(self, actor: ActorContext, data: PublicLinkCreate) -> PublicLinkCreated:
        self.created_links.append((actor, data))
        return PublicLinkCreated(link_id=uuid4(), raw_token="raw-token", expires_at=self.expires_at)

    def list_links(self, actor: ActorContext, card_id: UUID) -> tuple[PublicLinkRead, ...]:
        self.listed_cards.append((actor, card_id))
        return (
            PublicLinkRead(
                id=uuid4(),
                card_id=card_id,
                status="active",
                can_view=True,
                can_edit=True,
                expires_at=self.expires_at,
                max_uses=None,
                used_count=0,
            ),
        )

    def disable_link(self, actor: ActorContext, link_id: UUID) -> None:
        self.disabled_links.append((actor, link_id))

    def get_public_card(self, raw_token: str) -> PublicLinkCardAccess:
        self.public_tokens.append(raw_token)
        return PublicLinkCardAccess(
            card_id=uuid4(),
            can_view=True,
            can_edit=True,
            expires_at=self.expires_at,
        )

    def update_value(self, raw_token: str, data: PublicFieldValueWrite) -> UUID:
        self.updated_values.append((raw_token, data))
        return uuid4()


@pytest.fixture()
def api_client() -> Generator[tuple[TestClient, FakePublicLinkService, FakeSession], None, None]:
    service = FakePublicLinkService()
    session = FakeSession()
    actor = ActorContext(user_id=uuid4(), is_superuser=True, grants=())
    app.dependency_overrides[get_public_link_service] = lambda: service
    app.dependency_overrides[get_db_session] = lambda: session
    app.dependency_overrides[get_current_actor] = lambda: actor
    with TestClient(app) as test_client:
        yield test_client, service, session
    app.dependency_overrides.clear()


def test_create_public_link_endpoint_uses_service_and_commits(
    api_client: tuple[TestClient, FakePublicLinkService, FakeSession],
) -> None:
    client, service, session = api_client
    card_id = uuid4()

    response = client.post(
        "/api/v1/public-links",
        json={"card_id": str(card_id), "can_view": True, "can_edit": True, "max_uses": 3},
    )

    assert response.status_code == 201
    assert UUID(response.json()["link_id"])
    assert response.json()["raw_token"] == "raw-token"
    assert service.created_links[0][1] == PublicLinkCreate(
        card_id=card_id,
        can_view=True,
        can_edit=True,
        expires_at=None,
        max_uses=3,
    )
    assert session.committed is True


def test_list_public_links_endpoint_uses_service(
    api_client: tuple[TestClient, FakePublicLinkService, FakeSession],
) -> None:
    client, service, _ = api_client
    card_id = uuid4()

    response = client.get("/api/v1/public-links", params={"card_id": str(card_id)})

    assert response.status_code == 200
    assert response.json()[0]["card_id"] == str(card_id)
    assert "raw_token" not in response.json()[0]
    assert service.listed_cards[0][1] == card_id


def test_disable_public_link_endpoint_uses_service_and_commits(
    api_client: tuple[TestClient, FakePublicLinkService, FakeSession],
) -> None:
    client, service, session = api_client
    link_id = uuid4()

    response = client.post(f"/api/v1/public-links/{link_id}/disable")

    assert response.status_code == 204
    assert service.disabled_links[0][1] == link_id
    assert session.committed is True


def test_public_get_endpoint_uses_raw_token(
    api_client: tuple[TestClient, FakePublicLinkService, FakeSession],
) -> None:
    client, service, _ = api_client

    response = client.get("/api/v1/public-links/public/raw-token")

    assert response.status_code == 200
    assert UUID(response.json()["card_id"])
    assert service.public_tokens == ["raw-token"]


def test_public_value_update_endpoint_uses_service_and_commits(
    api_client: tuple[TestClient, FakePublicLinkService, FakeSession],
) -> None:
    client, service, session = api_client
    block_instance_id = uuid4()
    field_id = uuid4()

    response = client.post(
        "/api/v1/public-links/public/raw-token/values",
        json={
            "block_instance_id": str(block_instance_id),
            "field_id": str(field_id),
            "value": "public text",
        },
    )

    assert response.status_code == 201
    assert UUID(response.json()["id"])
    assert service.updated_values[0] == (
        "raw-token",
        PublicFieldValueWrite(
            block_instance_id=block_instance_id,
            field_id=field_id,
            value="public text",
        ),
    )
    assert session.committed is True
