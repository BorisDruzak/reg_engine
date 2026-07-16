import os
from collections.abc import Iterator
from pathlib import Path
from uuid import UUID

import pytest
from alembic import command
from alembic.config import Config
from fastapi import Request
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import Session

from app.api.dependencies import get_db_session
from app.core.config import get_settings
from app.main import create_app
from app.models import (
    AccessGrant,
    Card,
    CardChangeNotification,
    CardPublicLink,
    Permission,
    Role,
    User,
    role_permissions,
)
from app.services.cards import CardService
from app.services.organizations import OrganizationService
from app.services.registry_schema import RegistrySchemaService


def _require_test_database_url() -> str:
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip(
            "TEST_DATABASE_URL is required for disposable PostgreSQL notification API tests."
        )
    database_name = make_url(database_url).database or ""
    if database_name == "reg_engine" or not database_name.endswith("_test"):
        pytest.fail("TEST_DATABASE_URL must point to a disposable database ending with '_test'.")
    return database_url


def _alembic_config() -> Config:
    backend_root = Path(__file__).resolve().parents[1]
    config = Config(str(backend_root / "alembic.ini"))
    config.set_main_option("script_location", str(backend_root / "migrations"))
    return config


@pytest.fixture(scope="module")
def migrated_test_engine() -> Iterator[Engine]:
    database_url = _require_test_database_url()
    engine = create_engine(database_url)
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
        connection.exec_driver_sql("DROP SCHEMA IF EXISTS public CASCADE")
        connection.exec_driver_sql("CREATE SCHEMA public")
    previous_url = os.environ.get("TEST_DATABASE_URL")
    os.environ["TEST_DATABASE_URL"] = database_url
    try:
        command.upgrade(_alembic_config(), "head")
        yield engine
    finally:
        if previous_url is None:
            os.environ.pop("TEST_DATABASE_URL", None)
        else:
            os.environ["TEST_DATABASE_URL"] = previous_url
        engine.dispose()


@pytest.fixture()
def db_session(migrated_test_engine: Engine) -> Iterator[Session]:
    connection = migrated_test_engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, expire_on_commit=False)
    try:
        yield session
    finally:
        session.close()
        if transaction.is_active:
            transaction.rollback()
        connection.close()


@pytest.fixture()
def api_client(db_session: Session) -> Iterator[TestClient]:
    previous_allow_dev_actor = os.environ.get("ALLOW_DEV_ACTOR_HEADER")
    os.environ["ALLOW_DEV_ACTOR_HEADER"] = "true"
    get_settings.cache_clear()
    app = create_app()

    def override_session(_request: Request) -> Iterator[Session]:
        yield db_session

    app.dependency_overrides[get_db_session] = override_session
    try:
        with TestClient(app) as client:
            yield client
    finally:
        if previous_allow_dev_actor is None:
            os.environ.pop("ALLOW_DEV_ACTOR_HEADER", None)
        else:
            os.environ["ALLOW_DEV_ACTOR_HEADER"] = previous_allow_dev_actor
        get_settings.cache_clear()


@pytest.fixture()
def notification_api_context(db_session: Session) -> dict[str, object]:
    admin = User(
        email="notification-api-admin@example.test",
        display_name="Администратор",
        is_superuser=True,
    )
    creator = User(email="notification-api-creator@example.test", display_name="Создатель")
    manager = User(email="notification-api-manager@example.test", display_name="Руководитель")
    outsider = User(email="notification-api-outsider@example.test", display_name="Посторонний")
    db_session.add_all([admin, creator, manager, outsider])
    db_session.flush()

    organization = OrganizationService(db_session).create_root_for_actor(
        actor_user_id=admin.id,
        code="notification-api-root",
        name="Уведомления API",
    )
    schema_service = RegistrySchemaService(db_session)
    registry = schema_service.create_registry_for_actor(
        actor_user_id=admin.id,
        code="notification-api-registry",
        name="Реестр уведомлений API",
    )
    card = CardService(db_session).create_card_for_actor(
        actor_user_id=admin.id,
        registry_id=registry.id,
        organization_id=organization.id,
        display_name="Карточка уведомлений API",
    )

    role = Role(code="notification-api-card-manager", name="Управление карточками")
    permission = db_session.scalar(select(Permission).where(Permission.code == "cards.manage"))
    if permission is None:
        permission = Permission(code="cards.manage", description="Управление карточками")
        db_session.add(permission)
    db_session.add(role)
    db_session.flush()
    db_session.execute(
        role_permissions.insert().values(role_id=role.id, permission_id=permission.id)
    )
    creator_grant = AccessGrant(
        user_id=creator.id,
        role_id=role.id,
        organization_id=organization.id,
        registry_id=registry.id,
        include_descendants=False,
        created_by=admin.id,
    )
    manager_grant = AccessGrant(
        user_id=manager.id,
        role_id=role.id,
        organization_id=organization.id,
        registry_id=registry.id,
        include_descendants=False,
        created_by=admin.id,
    )
    public_link = CardPublicLink(
        card_id=card.id,
        token_hash="notification-api-public-link",
        created_by=creator.id,
    )
    creator_notification = CardChangeNotification(
        user_id=creator.id,
        card_id=card.id,
        actor_display_name="Исполнитель",
        changes_json=[{"label": "Поле", "before": "Было", "after": "Стало"}],
    )
    manager_notification = CardChangeNotification(
        user_id=manager.id,
        card_id=card.id,
        actor_display_name="Исполнитель",
        changes_json=[{"label": "Поле", "before": "Было", "after": "Стало"}],
    )
    db_session.add_all(
        [
            creator_grant,
            manager_grant,
            public_link,
            creator_notification,
            manager_notification,
        ]
    )
    db_session.flush()
    return {
        "creator": creator,
        "manager": manager,
        "outsider": outsider,
        "card": card,
        "public_link": public_link,
        "creator_grant": creator_grant,
        "creator_notification": creator_notification,
        "manager_notification": manager_notification,
    }


def _headers(user_id: UUID) -> dict[str, str]:
    return {"X-Actor-User-Id": str(user_id)}


def test_card_subscription_endpoints_enforce_card_visibility(
    api_client: TestClient,
    notification_api_context: dict[str, object],
) -> None:
    creator = notification_api_context["creator"]
    outsider = notification_api_context["outsider"]
    card = notification_api_context["card"]

    assert isinstance(creator, User)
    assert isinstance(outsider, User)
    assert isinstance(card, Card)
    path = f"/api/v1/cards/{card.id}/change-notification-subscription"
    assert api_client.get(path, headers=_headers(creator.id)).json() == {"enabled": False}
    assert api_client.put(path, headers=_headers(creator.id), json={"enabled": True}).json() == {
        "enabled": True
    }
    assert api_client.get(path, headers=_headers(creator.id)).json() == {"enabled": True}
    denied = api_client.put(path, headers=_headers(outsider.id), json={"enabled": True})
    assert denied.status_code == 403


def test_public_link_subscription_state_is_creator_specific_without_created_by_leak(
    api_client: TestClient,
    notification_api_context: dict[str, object],
) -> None:
    creator = notification_api_context["creator"]
    manager = notification_api_context["manager"]
    card = notification_api_context["card"]
    public_link = notification_api_context["public_link"]

    assert isinstance(creator, User)
    assert isinstance(manager, User)
    assert isinstance(card, Card)
    assert isinstance(public_link, CardPublicLink)
    subscription_path = f"/api/v1/public-links/{public_link.id}/change-notification-subscription"
    assert api_client.put(
        subscription_path,
        headers=_headers(creator.id),
        json={"enabled": True},
    ).json() == {"enabled": True}
    denied = api_client.get(subscription_path, headers=_headers(manager.id))
    assert denied.status_code == 403

    creator_item = api_client.get(
        f"/api/v1/cards/{card.id}/public-links",
        headers=_headers(creator.id),
    ).json()["items"][0]
    manager_item = api_client.get(
        f"/api/v1/cards/{card.id}/public-links",
        headers=_headers(manager.id),
    ).json()["items"][0]
    assert creator_item["can_manage_change_notifications"] is True
    assert creator_item["change_notifications_enabled"] is True
    assert manager_item["can_manage_change_notifications"] is False
    assert manager_item["change_notifications_enabled"] is False
    assert "created_by" not in creator_item
    assert "created_by" not in manager_item


def test_inbox_endpoints_are_actor_scoped_idempotent_and_omit_lost_access(
    api_client: TestClient,
    db_session: Session,
    notification_api_context: dict[str, object],
) -> None:
    creator = notification_api_context["creator"]
    manager = notification_api_context["manager"]
    creator_grant = notification_api_context["creator_grant"]
    creator_notification = notification_api_context["creator_notification"]
    manager_notification = notification_api_context["manager_notification"]

    assert isinstance(creator, User)
    assert isinstance(manager, User)
    assert isinstance(creator_grant, AccessGrant)
    assert isinstance(creator_notification, CardChangeNotification)
    assert isinstance(manager_notification, CardChangeNotification)

    inbox_path = "/api/v1/card-change-notifications?limit=20"
    inbox = api_client.get(inbox_path, headers=_headers(creator.id))
    assert inbox.status_code == 200, inbox.text
    body = inbox.json()
    assert body["unread_count"] == 1
    assert [item["id"] for item in body["items"]] == [str(creator_notification.id)]
    assert body["items"][0]["changes"] == [
        {"label": "Поле", "before": "Было", "after": "Стало", "description": None}
    ]
    assert "changes_json" not in body["items"][0]

    read_path = f"/api/v1/card-change-notifications/{creator_notification.id}/read"
    first = api_client.post(read_path, headers=_headers(creator.id))
    second = api_client.post(read_path, headers=_headers(creator.id))
    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    assert first.json()["read_at"] == second.json()["read_at"]
    response = api_client.post(
        "/api/v1/card-change-notifications/read-all",
        headers=_headers(creator.id),
    )
    assert response.json() == {"marked_count": 0}
    assert manager_notification.read_at is None

    db_session.delete(creator_grant)
    db_session.flush()
    hidden = api_client.get(inbox_path, headers=_headers(creator.id))
    assert hidden.status_code == 200, hidden.text
    assert hidden.json() == {"unread_count": 0, "items": []}


def test_inbox_dto_ignores_extra_persisted_audit_like_change_keys(
    api_client: TestClient,
    db_session: Session,
    notification_api_context: dict[str, object],
) -> None:
    creator = notification_api_context["creator"]
    creator_notification = notification_api_context["creator_notification"]

    assert isinstance(creator, User)
    assert isinstance(creator_notification, CardChangeNotification)
    creator_notification.changes_json = [
        {
            "label": "Поле",
            "before": "Было",
            "after": "Стало",
            "description": "Безопасное описание",
            "audit_event_id": "audit-id-must-not-leak",
            "token_hash": "hash-must-not-leak",
            "raw_metadata": {"stored_file_id": "file-id-must-not-leak"},
        }
    ]
    db_session.flush()

    response = api_client.get(
        "/api/v1/card-change-notifications?limit=20",
        headers=_headers(creator.id),
    )

    assert response.status_code == 200, response.text
    assert response.json()["items"][0]["changes"] == [
        {
            "label": "Поле",
            "before": "Было",
            "after": "Стало",
            "description": "Безопасное описание",
        }
    ]
