import os
from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, func, select
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import Session

from app.models import (
    AccessGrant,
    AuditEvent,
    Card,
    CardChangeNotification,
    CardPublicLink,
    Organization,
    Permission,
    Registry,
    Role,
    User,
    role_permissions,
)
from app.services.card_change_notifications import CardChangeNotificationService
from app.services.cards import CardService
from app.services.organizations import OrganizationService
from app.services.permissions import PermissionDeniedError, PermissionService
from app.services.registry_schema import RegistrySchemaService


def _require_test_database_url() -> str:
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is required for disposable PostgreSQL notification tests.")
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
def notification_context(db_session: Session) -> dict[str, object]:
    admin = User(
        email="notification-admin@example.test",
        display_name="Администратор",
        is_superuser=True,
    )
    reader = User(email="notification-reader@example.test", display_name="Читатель")
    manager = User(email="notification-manager@example.test", display_name="Руководитель")
    outsider = User(email="notification-outsider@example.test", display_name="Посторонний")
    db_session.add_all([admin, reader, manager, outsider])
    db_session.flush()

    organization = OrganizationService(db_session).create_root_for_actor(
        actor_user_id=admin.id,
        code="notification-root",
        name="Уведомления",
    )
    schema_service = RegistrySchemaService(db_session)
    registry = schema_service.create_registry_for_actor(
        actor_user_id=admin.id,
        code="notification-registry",
        name="Реестр уведомлений",
    )
    card = CardService(db_session).create_card_for_actor(
        actor_user_id=admin.id,
        registry_id=registry.id,
        organization_id=organization.id,
        display_name="Карточка уведомлений",
    )

    role = Role(code="notification-card-manager", name="Управление карточками")
    permission = db_session.scalar(select(Permission).where(Permission.code == "cards.manage"))
    if permission is None:
        permission = Permission(code="cards.manage", description="Управление карточками")
        db_session.add(permission)
    db_session.add(role)
    db_session.flush()
    db_session.execute(
        role_permissions.insert().values(role_id=role.id, permission_id=permission.id)
    )
    reader_grant = AccessGrant(
        user_id=reader.id,
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
        token_hash="notification-public-link",
        created_by=reader.id,
    )
    db_session.add_all([reader_grant, manager_grant, public_link])
    db_session.flush()

    reader_notification = CardChangeNotification(
        user_id=reader.id,
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
    db_session.add_all([reader_notification, manager_notification])
    db_session.flush()
    return {
        "admin": admin,
        "reader": reader,
        "manager": manager,
        "outsider": outsider,
        "card": card,
        "organization": organization,
        "registry": registry,
        "public_link": public_link,
        "reader_grant": reader_grant,
        "reader_notification": reader_notification,
        "manager_notification": manager_notification,
    }


def test_subscriptions_require_card_visibility_and_public_link_ownership(
    db_session: Session,
    notification_context: dict[str, object],
) -> None:
    service = CardChangeNotificationService(db_session)
    reader = notification_context["reader"]
    manager = notification_context["manager"]
    outsider = notification_context["outsider"]
    card = notification_context["card"]
    public_link = notification_context["public_link"]

    assert isinstance(reader, User)
    assert isinstance(manager, User)
    assert isinstance(outsider, User)
    assert isinstance(card, Card)
    assert isinstance(public_link, CardPublicLink)
    assert service.set_card_subscription_for_actor(
        actor_user_id=reader.id,
        card_id=card.id,
        enabled=True,
    )
    assert service.get_card_subscription_for_actor(actor_user_id=reader.id, card_id=card.id)
    assert (
        service.set_card_subscription_for_actor(
            actor_user_id=reader.id,
            card_id=card.id,
            enabled=False,
        )
        is False
    )
    with pytest.raises(PermissionDeniedError):
        service.set_card_subscription_for_actor(
            actor_user_id=outsider.id,
            card_id=card.id,
            enabled=True,
        )
    assert service.set_public_link_subscription_for_creator(
        actor_user_id=reader.id,
        public_link_id=public_link.id,
        enabled=True,
    )
    with pytest.raises(PermissionDeniedError):
        service.set_public_link_subscription_for_creator(
            actor_user_id=manager.id,
            public_link_id=public_link.id,
            enabled=True,
        )


def test_inbox_is_scoped_to_actor_and_filters_lost_card_access(
    db_session: Session,
    notification_context: dict[str, object],
) -> None:
    service = CardChangeNotificationService(db_session)
    reader = notification_context["reader"]
    manager = notification_context["manager"]
    reader_grant = notification_context["reader_grant"]
    reader_notification = notification_context["reader_notification"]
    manager_notification = notification_context["manager_notification"]

    assert isinstance(reader, User)
    assert isinstance(manager, User)
    assert isinstance(reader_grant, AccessGrant)
    assert isinstance(reader_notification, CardChangeNotification)
    assert isinstance(manager_notification, CardChangeNotification)

    unread_count, notifications = service.list_for_actor(actor_user_id=reader.id, limit=20)
    assert unread_count == 1
    assert [item.id for item in notifications] == [reader_notification.id]

    first_read = service.mark_read_for_actor(
        actor_user_id=reader.id,
        notification_id=reader_notification.id,
    )
    second_read = service.mark_read_for_actor(
        actor_user_id=reader.id,
        notification_id=reader_notification.id,
    )
    assert first_read.read_at is not None
    assert second_read.read_at == first_read.read_at
    assert service.mark_all_read_for_actor(actor_user_id=reader.id) == 0
    assert manager_notification.read_at is None

    db_session.delete(reader_grant)
    db_session.flush()
    unread_count, notifications = service.list_for_actor(actor_user_id=reader.id, limit=20)
    assert unread_count == 0
    assert notifications == []


def test_inbox_counts_only_visible_cards_paginates_and_keeps_archived_cards(
    db_session: Session,
    notification_context: dict[str, object],
) -> None:
    service = CardChangeNotificationService(db_session)
    admin = notification_context["admin"]
    reader = notification_context["reader"]
    card = notification_context["card"]
    organization = notification_context["organization"]
    registry = notification_context["registry"]

    assert isinstance(admin, User)
    assert isinstance(reader, User)
    assert isinstance(card, Card)
    assert isinstance(organization, Organization)
    assert isinstance(registry, Registry)

    card.lifecycle_status = "archived"
    card.archived_at = datetime.now(UTC)
    invisible_organization = OrganizationService(db_session).create_child_for_actor(
        actor_user_id=admin.id,
        parent_id=organization.id,
        code="notification-hidden-child",
        name="Недоступная организация",
    )
    invisible_card = CardService(db_session).create_card_for_actor(
        actor_user_id=admin.id,
        registry_id=registry.id,
        organization_id=invisible_organization.id,
        display_name="Недоступная карточка",
    )
    archived_notification = CardChangeNotification(
        user_id=reader.id,
        card_id=card.id,
        actor_display_name="Исполнитель",
        changes_json=[{"label": "Архив", "before": None, "after": "Да"}],
    )
    inaccessible_notification = CardChangeNotification(
        user_id=reader.id,
        card_id=invisible_card.id,
        actor_display_name="Исполнитель",
        changes_json=[{"label": "Скрыто", "before": None, "after": "Да"}],
    )
    db_session.add_all([archived_notification, inaccessible_notification])
    db_session.flush()

    unread_count, page = service.list_for_actor(actor_user_id=reader.id, limit=1)
    assert unread_count == 2
    assert len(page) == 1

    _unread_count, visible_notifications = service.list_for_actor(
        actor_user_id=reader.id,
        limit=20,
    )
    assert {item.id for item in visible_notifications} >= {archived_notification.id}
    assert inaccessible_notification.id not in {item.id for item in visible_notifications}


def test_inbox_calculates_one_visibility_scope_per_registry(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
    notification_context: dict[str, object],
) -> None:
    service = CardChangeNotificationService(db_session)
    reader = notification_context["reader"]
    card = notification_context["card"]
    registry = notification_context["registry"]

    assert isinstance(reader, User)
    assert isinstance(card, Card)
    assert isinstance(registry, Registry)
    db_session.add(
        CardChangeNotification(
            user_id=reader.id,
            card_id=card.id,
            actor_display_name="Исполнитель",
            changes_json=[{"label": "Ещё поле", "before": None, "after": "Да"}],
        )
    )
    db_session.flush()

    calls: list[UUID | None] = []
    original = PermissionService.get_organization_scope_ids

    def record_scope(
        permissions: PermissionService,
        actor_user_id: UUID,
        *,
        registry_id: UUID | None = None,
    ) -> set[UUID]:
        calls.append(registry_id)
        return original(permissions, actor_user_id, registry_id=registry_id)

    monkeypatch.setattr(PermissionService, "get_organization_scope_ids", record_scope)

    unread_count, notifications = service.list_for_actor(actor_user_id=reader.id, limit=20)

    assert unread_count == 2
    assert len(notifications) == 2
    assert calls == [registry.id]


def test_subscription_toggles_write_technical_audit_without_inbox_events(
    db_session: Session,
    notification_context: dict[str, object],
) -> None:
    service = CardChangeNotificationService(db_session)
    reader = notification_context["reader"]
    card = notification_context["card"]
    public_link = notification_context["public_link"]

    assert isinstance(reader, User)
    assert isinstance(card, Card)
    assert isinstance(public_link, CardPublicLink)
    inbox_count_before = db_session.scalar(select(func.count(CardChangeNotification)))

    service.set_card_subscription_for_actor(
        actor_user_id=reader.id,
        card_id=card.id,
        enabled=True,
    )
    service.set_card_subscription_for_actor(
        actor_user_id=reader.id,
        card_id=card.id,
        enabled=False,
    )
    service.set_public_link_subscription_for_creator(
        actor_user_id=reader.id,
        public_link_id=public_link.id,
        enabled=True,
    )
    service.set_public_link_subscription_for_creator(
        actor_user_id=reader.id,
        public_link_id=public_link.id,
        enabled=False,
    )

    events = list(
        db_session.scalars(
            select(AuditEvent)
            .where(AuditEvent.actor_user_id == reader.id)
            .where(
                AuditEvent.object_type.in_(
                    {
                        "card_change_notification_subscription",
                        "public_link_change_notification_subscription",
                    }
                )
            )
            .order_by(AuditEvent.created_at, AuditEvent.id)
        ).all()
    )
    assert [(event.object_type, event.action, event.new_data_json) for event in events] == [
        ("card_change_notification_subscription", "subscribe", {"enabled": True}),
        ("card_change_notification_subscription", "unsubscribe", {"enabled": False}),
        ("public_link_change_notification_subscription", "subscribe", {"enabled": True}),
        ("public_link_change_notification_subscription", "unsubscribe", {"enabled": False}),
    ]
    assert all(event.retention_class == "technical" for event in events)
    assert db_session.scalar(select(func.count(CardChangeNotification))) == inbox_count_before
