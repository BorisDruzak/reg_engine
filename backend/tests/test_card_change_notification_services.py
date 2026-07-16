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
    PublicLinkChangeNotificationSubscription,
    Registry,
    Role,
    User,
    role_permissions,
)
from app.services.audit import AuditService
from app.services.card_change_notifications import CardChangeNotificationService
from app.services.cards import BulkFieldValueInput, CardService
from app.services.organizations import OrganizationService
from app.services.permissions import PermissionDeniedError, PermissionService
from app.services.references import ReferenceListService
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


def test_inbox_excludes_cards_in_inactive_or_archived_organizations(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
    notification_context: dict[str, object],
) -> None:
    service = CardChangeNotificationService(db_session)
    reader = notification_context["reader"]
    organization = notification_context["organization"]
    reader_grant = notification_context["reader_grant"]

    assert isinstance(reader, User)
    assert isinstance(organization, Organization)
    assert isinstance(reader_grant, AccessGrant)
    assert reader_grant.organization_id == organization.id

    def include_granted_organization(
        _permissions: PermissionService,
        _actor_user_id: UUID,
        *,
        registry_id: UUID | None = None,
    ) -> set[UUID]:
        assert registry_id is not None
        return {organization.id}

    monkeypatch.setattr(
        PermissionService,
        "get_organization_scope_ids",
        include_granted_organization,
    )

    organization.is_active = False
    db_session.flush()
    assert service.list_for_actor(actor_user_id=reader.id, limit=20) == (0, [])

    organization.is_active = True
    organization.archived_at = datetime.now(UTC)
    db_session.flush()
    assert service.list_for_actor(actor_user_id=reader.id, limit=20) == (0, [])


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
    inbox_count_before = db_session.scalar(select(func.count()).select_from(CardChangeNotification))

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
    assert {
        (event.object_type, event.action, (event.new_data_json or {})["enabled"])
        for event in events
    } == {
        ("card_change_notification_subscription", "subscribe", True),
        ("card_change_notification_subscription", "unsubscribe", False),
        ("public_link_change_notification_subscription", "subscribe", True),
        ("public_link_change_notification_subscription", "unsubscribe", False),
    }
    assert all(event.retention_class == "technical" for event in events)
    assert (
        db_session.scalar(select(func.count()).select_from(CardChangeNotification))
        == inbox_count_before
    )


def test_card_history_events_create_safe_notifications_without_self_or_link_duplicates(
    db_session: Session,
    notification_context: dict[str, object],
) -> None:
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

    editor = User(email="notification-editor@example.test", display_name="Исполнитель")
    link_creator = User(
        email="notification-link-creator@example.test", display_name="Создатель ссылки"
    )
    other_creator = User(
        email="notification-other-creator@example.test", display_name="Другой создатель"
    )
    db_session.add_all([editor, link_creator, other_creator])
    db_session.flush()
    role = db_session.scalar(select(Role).where(Role.code == "notification-card-manager"))
    assert role is not None
    db_session.add_all(
        [
            AccessGrant(
                user_id=user.id,
                role_id=role.id,
                organization_id=organization.id,
                registry_id=registry.id,
                include_descendants=False,
                created_by=admin.id,
            )
            for user in (editor, link_creator, other_creator)
        ]
    )
    schema = RegistrySchemaService(db_session)
    block = schema.create_block_for_actor(
        actor_user_id=admin.id,
        registry_id=registry.id,
        code="notification-history",
        title="История уведомлений",
    )
    field = schema.create_field_for_actor(
        actor_user_id=admin.id,
        block_id=block.id,
        code="full_name",
        label="ФИО",
        field_type="text",
    )
    cards = CardService(db_session)
    cards.set_field_value_for_actor(
        actor_user_id=admin.id,
        card_id=card.id,
        field_id=field.id,
        value="Было",
    )
    public_link = CardPublicLink(
        card_id=card.id,
        token_hash="history-notification-link",
        created_by=link_creator.id,
    )
    db_session.add(public_link)
    db_session.flush()

    service = CardChangeNotificationService(db_session)
    service.set_card_subscription_for_actor(
        actor_user_id=reader.id,
        card_id=card.id,
        enabled=True,
    )
    service.set_card_subscription_for_actor(
        actor_user_id=other_creator.id,
        card_id=card.id,
        enabled=True,
    )
    service.set_public_link_subscription_for_creator(
        actor_user_id=link_creator.id,
        public_link_id=public_link.id,
        enabled=True,
    )
    db_session.add(
        PublicLinkChangeNotificationSubscription(
            user_id=other_creator.id,
            public_link_id=public_link.id,
        )
    )
    db_session.flush()

    cards.set_field_value_for_actor(
        actor_user_id=editor.id,
        card_id=card.id,
        field_id=field.id,
        value="Стало",
    )

    generated = [
        item
        for item in service.list_for_actor(actor_user_id=reader.id, limit=20)[1]
        if item.changes_json == [{"label": "ФИО", "before": "Было", "after": "Стало"}]
    ]
    assert len(generated) == 1
    assert generated[0].actor_display_name == "Исполнитель"
    assert service.list_for_actor(actor_user_id=editor.id, limit=20)[1] == []

    event = AuditEvent(
        actor_type="public_link",
        actor_public_link_id=public_link.id,
        attributed_user_id=link_creator.id,
        action="update",
        object_type="field_value",
        card_id=card.id,
        retention_class="card_history",
        old_data_json={
            "field": {"code": "full_name", "label": "ФИО", "type": "text"},
            "value": "Стало",
        },
        new_data_json={
            "field": {"code": "full_name", "label": "ФИО", "type": "text"},
            "value": "Из публичной ссылки",
        },
        source="public_link",
    )
    db_session.add(event)
    db_session.flush()
    service.record_card_history_events([event])

    assert service.list_for_actor(actor_user_id=link_creator.id, limit=20)[1] == []
    public_items = [
        item
        for item in service.list_for_actor(actor_user_id=other_creator.id, limit=20)[1]
        if item.changes_json
        == [{"label": "ФИО", "before": "Стало", "after": "Из публичной ссылки"}]
    ]
    assert len(public_items) == 1


def test_bulk_field_updates_make_one_notification_with_safe_history_values(
    db_session: Session,
    notification_context: dict[str, object],
) -> None:
    admin = notification_context["admin"]
    reader = notification_context["reader"]
    card = notification_context["card"]
    registry = notification_context["registry"]

    assert isinstance(admin, User)
    assert isinstance(reader, User)
    assert isinstance(card, Card)
    assert isinstance(registry, Registry)

    schema = RegistrySchemaService(db_session)
    block = schema.create_block_for_actor(
        actor_user_id=admin.id,
        registry_id=registry.id,
        code="notification-bulk",
        title="Пакет уведомлений",
    )
    first = schema.create_field_for_actor(
        actor_user_id=admin.id,
        block_id=block.id,
        code="first",
        label="Первое поле",
        field_type="text",
    )
    second = schema.create_field_for_actor(
        actor_user_id=admin.id,
        block_id=block.id,
        code="second",
        label="Второе поле",
        field_type="text",
    )
    service = CardChangeNotificationService(db_session)
    service.set_card_subscription_for_actor(actor_user_id=reader.id, card_id=card.id, enabled=True)
    before_audits = db_session.scalar(
        select(func.count()).select_from(AuditEvent).where(AuditEvent.object_type == "field_value")
    )
    before_notifications = db_session.scalar(
        select(func.count())
        .select_from(CardChangeNotification)
        .where(CardChangeNotification.user_id == reader.id)
    )

    CardService(db_session).set_field_values_for_actor(
        actor_user_id=admin.id,
        card_id=card.id,
        values=[
            BulkFieldValueInput(field_id=first.id, value="Раз"),
            BulkFieldValueInput(field_id=second.id, value="Два"),
        ],
    )

    assert (
        db_session.scalar(
            select(func.count())
            .select_from(AuditEvent)
            .where(AuditEvent.object_type == "field_value")
        )
        == before_audits + 2
    )
    assert (
        db_session.scalar(
            select(func.count())
            .select_from(CardChangeNotification)
            .where(CardChangeNotification.user_id == reader.id)
        )
        == before_notifications + 1
    )
    bulk_changes = [
        item.changes_json
        for item in service.list_for_actor(actor_user_id=reader.id, limit=20)[1]
        if {change.get("label") for change in item.changes_json} == {"Первое поле", "Второе поле"}
    ]
    assert bulk_changes == [
        [
            {"label": "Первое поле", "before": None, "after": "Раз"},
            {"label": "Второе поле", "before": None, "after": "Два"},
        ]
    ]


def test_notifications_reuse_safe_history_redaction_and_reference_labels(
    db_session: Session,
    notification_context: dict[str, object],
) -> None:
    admin = notification_context["admin"]
    reader = notification_context["reader"]
    card = notification_context["card"]
    registry = notification_context["registry"]

    assert isinstance(admin, User)
    assert isinstance(reader, User)
    assert isinstance(card, Card)
    assert isinstance(registry, Registry)

    service = CardChangeNotificationService(db_session)
    service.set_card_subscription_for_actor(actor_user_id=reader.id, card_id=card.id, enabled=True)
    references = ReferenceListService(db_session)
    reference_list = references.create_reference_list_for_actor(
        actor_user_id=admin.id,
        registry_id=registry.id,
        code="notification-assets",
        name="Активы уведомлений",
    )
    before_item = references.create_reference_item_for_actor(
        actor_user_id=admin.id,
        list_id=reference_list.id,
        code="laptop",
        label="Ноутбук",
    )
    after_item = references.create_reference_item_for_actor(
        actor_user_id=admin.id,
        list_id=reference_list.id,
        code="monitor",
        label="Монитор",
    )
    audit = AuditService(db_session)
    audit.record_user_event(
        actor_user_id=admin.id,
        action="update",
        object_type="field_value",
        card_id=card.id,
        retention_class="card_history",
        old_data_json={
            "field": {"code": "secret", "label": "Секрет", "type": "text"},
            "value": {"redacted": True},
        },
        new_data_json={
            "field": {"code": "secret", "label": "Секрет", "type": "text"},
            "value": {"redacted": True},
        },
    )
    audit.record_user_event(
        actor_user_id=admin.id,
        action="update",
        object_type="field_value",
        card_id=card.id,
        retention_class="card_history",
        old_data_json={
            "field": {"code": "asset", "label": "Актив", "type": "select"},
            "value": str(before_item.id),
        },
        new_data_json={
            "field": {"code": "asset", "label": "Актив", "type": "select"},
            "value": str(after_item.id),
        },
    )

    notifications = service.list_for_actor(actor_user_id=reader.id, limit=20)[1]
    safe_changes = [change for item in notifications for change in item.changes_json]
    assert {
        "label": "Секрет",
        "before": {"redacted": True},
        "after": {"redacted": True},
    } in safe_changes
    assert {"label": "Актив", "before": "Ноутбук", "after": "Монитор"} in safe_changes
    serialized = str(safe_changes)
    assert str(before_item.id) not in serialized
    assert str(after_item.id) not in serialized
