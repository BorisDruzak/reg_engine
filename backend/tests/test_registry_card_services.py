import os
from collections.abc import Iterator
from contextlib import nullcontext
from datetime import UTC, date, datetime
from decimal import Decimal
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast
from uuid import UUID, uuid4

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from openpyxl import load_workbook
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import app.services.audit as audit_module
import app.services.cards as cards_module
import app.services.import_export as import_export_module
from app.api.dependencies import get_db_session
from app.core.config import get_settings
from app.main import create_app
from app.models import (
    AccessGrant,
    AuditEvent,
    Card,
    CardBlockInstance,
    CardChangeNotification,
    CardPublicFieldSetting,
    CardPublicLink,
    CardTemplate,
    FieldValue,
    FieldValueItem,
    FormBlock,
    FormField,
    Organization,
    Permission,
    ReferenceItem,
    Registry,
    Role,
    User,
    role_permissions,
)
from app.schemas.cards import CardPublicAccessUpdate, CardPublicFieldSettingUpdate
from app.services.card_change_notifications import CardChangeNotificationService
from app.services.card_public_access import CardPublicAccessService
from app.services.cards import (
    BulkFieldValueInput,
    CardService,
    CardServiceError,
    InvalidFieldValueError,
)
from app.services.organizations import OrganizationService
from app.services.permissions import PermissionDeniedError
from app.services.public_links import PublicLinkService
from app.services.references import ReferenceListError, ReferenceListService
from app.services.registry_schema import RegistrySchemaError, RegistrySchemaService


class _FlushOnlySession:
    def flush(self) -> None:
        pass


def test_safe_field_value_audit_snapshot_redacts_non_normal_sensitivity() -> None:
    field = SimpleNamespace(
        id=uuid4(),
        code="secret",
        label="Secret",
        field_type="text",
        sensitivity_level="restricted",
    )

    snapshot_builder = getattr(audit_module, "safe_field_value_audit_snapshot", None)

    assert snapshot_builder is not None
    snapshot = snapshot_builder(field=field, value="never persist this")

    assert snapshot == {
        "field": {
            "id": str(field.id),
            "code": "secret",
            "label": "Secret",
            "type": "text",
        },
        "value": {"redacted": True},
    }


def test_automatic_lifecycle_marks_complete_card_active_without_database(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = CardService(cast(Session, _FlushOnlySession()))
    monkeypatch.setattr(
        service,
        "_missing_required_field_labels",
        lambda _card, *, include_publish_required: [] if include_publish_required else [],
        raising=False,
    )
    card = SimpleNamespace(id=uuid4(), lifecycle_status="draft")

    changed = service.synchronize_card_lifecycle(card, audit_transition=False)

    assert changed is True
    assert card.lifecycle_status == "active"


def test_automatic_lifecycle_marks_incomplete_active_card_draft_without_database(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = CardService(cast(Session, _FlushOnlySession()))
    monkeypatch.setattr(
        service,
        "_missing_required_field_labels",
        lambda _card, *, include_publish_required: (
            ["Обязательное поле"] if include_publish_required else []
        ),
        raising=False,
    )
    card = SimpleNamespace(id=uuid4(), lifecycle_status="active")

    changed = service.synchronize_card_lifecycle(card, audit_transition=False)

    assert changed is True
    assert card.lifecycle_status == "draft"


def _require_test_database_url() -> str:
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is required for disposable PostgreSQL service tests.")

    database_name = make_url(database_url).database or ""
    if database_name == "reg_engine" or not database_name.endswith("_test"):
        pytest.fail("TEST_DATABASE_URL must point to a disposable database ending with '_test'.")

    return database_url


def _alembic_config() -> Config:
    backend_root = Path(__file__).resolve().parents[1]
    config = Config(str(backend_root / "alembic.ini"))
    config.set_main_option("script_location", str(backend_root / "migrations"))
    return config


def _run_alembic_upgrade(database_url: str) -> None:
    previous_url = os.environ.get("TEST_DATABASE_URL")
    os.environ["TEST_DATABASE_URL"] = database_url
    try:
        command.upgrade(_alembic_config(), "head")
    finally:
        if previous_url is None:
            os.environ.pop("TEST_DATABASE_URL", None)
        else:
            os.environ["TEST_DATABASE_URL"] = previous_url


def _reset_public_schema(engine: Engine) -> None:
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
        connection.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
        connection.execute(text("CREATE SCHEMA public"))


@pytest.fixture(scope="module")
def migrated_test_engine() -> Iterator[Engine]:
    database_url = _require_test_database_url()
    engine = create_engine(database_url)

    _reset_public_schema(engine)
    _run_alembic_upgrade(database_url)

    try:
        yield engine
    finally:
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
        transaction.rollback()
        connection.close()


@pytest.fixture()
def api_client(db_session: Session) -> Iterator[TestClient]:
    previous_allow_dev_actor = os.environ.get("ALLOW_DEV_ACTOR_HEADER")
    os.environ["ALLOW_DEV_ACTOR_HEADER"] = "true"
    get_settings.cache_clear()
    app = create_app()

    def override_session() -> Iterator[Session]:
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


def _create_user(
    session: Session,
    email: str,
    display_name: str = "Test user",
    *,
    is_superuser: bool = False,
) -> User:
    user = User(email=email, display_name=display_name, is_superuser=is_superuser)
    session.add(user)
    session.flush()
    return user


def _create_role_with_permissions(
    session: Session,
    role_code: str,
    permission_codes: list[str],
) -> Role:
    role = Role(code=role_code, name=role_code)
    session.add(role)
    session.flush()

    for permission_code in permission_codes:
        permission = session.scalar(select(Permission).where(Permission.code == permission_code))
        if permission is None:
            permission = Permission(code=permission_code, description=permission_code)
            session.add(permission)
            session.flush()
        session.execute(
            role_permissions.insert().values(
                role_id=role.id,
                permission_id=permission.id,
            )
        )

    session.flush()
    return role


def _grant_access(
    session: Session,
    *,
    user_id: UUID,
    role_id: UUID,
    organization_id: UUID | None = None,
    registry_id: UUID | None = None,
    include_descendants: bool = True,
    created_by: UUID | None = None,
) -> AccessGrant:
    grant = AccessGrant(
        user_id=user_id,
        role_id=role_id,
        organization_id=organization_id,
        registry_id=registry_id,
        include_descendants=include_descendants,
        created_by=created_by,
    )
    session.add(grant)
    session.flush()
    return grant


def _phase_1d_context(db_session: Session) -> dict[str, Any]:
    system_admin = _create_user(db_session, "phase1d-system@example.test", is_superuser=True)
    registry_admin = _create_user(db_session, "phase1d-registry-admin@example.test")
    org_admin = _create_user(db_session, "phase1d-org-admin@example.test")
    schema_role = _create_role_with_permissions(
        db_session,
        "phase1d_schema_admin",
        ["registry.schema.manage"],
    )
    card_role = _create_role_with_permissions(
        db_session,
        "phase1d_card_admin",
        ["cards.manage"],
    )

    organization_service = OrganizationService(db_session)
    root = organization_service.create_root_for_actor(
        actor_user_id=system_admin.id,
        code="phase1d-root",
        name="Phase 1D Root",
    )
    child = organization_service.create_child(
        parent_id=root.id,
        code="phase1d-child",
        name="Phase 1D Child",
        created_by=system_admin.id,
    )
    sibling = organization_service.create_child(
        parent_id=root.id,
        code="phase1d-sibling",
        name="Phase 1D Sibling",
        created_by=system_admin.id,
    )

    schema_service = RegistrySchemaService(db_session)
    registry = schema_service.create_registry_for_actor(
        actor_user_id=system_admin.id,
        code="phase1d-assets",
        name="Phase 1D Assets",
    )

    _grant_access(
        db_session,
        user_id=registry_admin.id,
        role_id=schema_role.id,
        registry_id=registry.id,
        created_by=system_admin.id,
    )
    _grant_access(
        db_session,
        user_id=org_admin.id,
        role_id=card_role.id,
        organization_id=child.id,
        registry_id=registry.id,
        include_descendants=True,
        created_by=system_admin.id,
    )

    return {
        "system_admin": system_admin,
        "registry_admin": registry_admin,
        "org_admin": org_admin,
        "root": root,
        "child": child,
        "sibling": sibling,
        "registry": registry,
    }


def test_global_import_reference_resolution_normalizes_and_preserves_existing_label(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Import matching is tolerant, but never rewrites a stored display label."""
    actor_user_id = uuid4()
    list_id = uuid4()
    existing_item = SimpleNamespace(
        id=uuid4(),
        parent_id=None,
        label="Ready for review",
        is_active=True,
        archived_at=None,
    )
    reference_list = SimpleNamespace(
        id=list_id,
        owner_organization_id=None,
        is_active=True,
        archived_at=None,
    )
    service = ReferenceListService(cast(Session, object()))
    monkeypatch.setattr(service, "_get_active_reference_list", lambda _list_id: reference_list)
    monkeypatch.setattr(service, "_require_reference_edit_permission", lambda *_args: None)
    monkeypatch.setattr(service, "list_items", lambda _list_id: [existing_item])

    resolution = service.resolve_or_plan_global_import_item_for_actor(
        actor_user_id=actor_user_id,
        list_id=list_id,
        raw_label="  READY\u00a0 FOR   REVIEW  ",
    )

    assert resolution.status == "existing"
    assert resolution.reference_item_id == existing_item.id
    assert resolution.display_label == "READY FOR REVIEW"


def test_global_import_reference_resolution_plans_or_rejects_ambiguous_and_hierarchical_lists(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    actor_user_id = uuid4()
    list_id = uuid4()
    reference_list = SimpleNamespace(
        id=list_id,
        owner_organization_id=None,
        is_active=True,
        archived_at=None,
    )
    service = ReferenceListService(cast(Session, object()))
    monkeypatch.setattr(service, "_get_active_reference_list", lambda _list_id: reference_list)
    monkeypatch.setattr(service, "_require_reference_edit_permission", lambda *_args: None)
    monkeypatch.setattr(service, "list_items", lambda _list_id: [])

    planned = service.resolve_or_plan_global_import_item_for_actor(
        actor_user_id=actor_user_id,
        list_id=list_id,
        raw_label="  New   value ",
    )

    assert planned.status == "create"
    assert planned.normalized_label == "new value"
    assert planned.display_label == "New value"

    duplicate = SimpleNamespace(id=uuid4(), parent_id=None, label="Duplicate")
    monkeypatch.setattr(service, "list_items", lambda _list_id: [duplicate, duplicate])
    with pytest.raises(
        ReferenceListError,
        match="^Значение справочника в импорте неоднозначно\\.$",
    ):
        service.resolve_or_plan_global_import_item_for_actor(
            actor_user_id=actor_user_id,
            list_id=list_id,
            raw_label="duplicate",
        )

    child_item = SimpleNamespace(id=uuid4(), parent_id=uuid4(), label="Child")
    monkeypatch.setattr(service, "list_items", lambda _list_id: [child_item])
    with pytest.raises(
        ReferenceListError,
        match="^Импорт не может пополнять иерархические справочники\\.$",
    ):
        service.resolve_or_plan_global_import_item_for_actor(
            actor_user_id=actor_user_id,
            list_id=list_id,
            raw_label="new value",
        )


def test_global_import_reference_creation_requires_edit_permission_and_uses_stable_code(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    actor_user_id = uuid4()
    list_id = uuid4()
    reference_list = SimpleNamespace(
        id=list_id,
        owner_organization_id=None,
        is_active=True,
        archived_at=None,
    )
    created: list[object] = []

    class Session:
        def add(self, item: object) -> None:
            created.append(item)

        def begin_nested(self):  # type: ignore[no-untyped-def]
            return nullcontext()

        def flush(self) -> None:
            pass

    class Audit:
        def __init__(self, _session: object) -> None:
            pass

        def record_user_event(self, **_kwargs: object) -> None:
            pass

    service = ReferenceListService(cast(Session, Session()))
    monkeypatch.setattr(service, "_get_active_reference_list", lambda _list_id: reference_list)
    monkeypatch.setattr(service, "_require_reference_edit_permission", lambda *_args: None)
    monkeypatch.setattr(service, "list_items", lambda _list_id: [])
    monkeypatch.setattr("app.services.references.AuditService", Audit)

    item = service.create_global_import_item_for_actor(
        actor_user_id=actor_user_id,
        list_id=list_id,
        normalized_label="new value",
        display_label="New value",
    )

    assert item.parent_id is None
    assert item.label == "New value"
    assert item.code.startswith("import-")
    assert created == [item]


def test_global_import_reference_creation_reuses_item_created_by_concurrent_import(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    actor_user_id = uuid4()
    list_id = uuid4()
    concurrent_item = SimpleNamespace(
        id=uuid4(),
        list_id=list_id,
        parent_id=None,
        label="Ready for review",
        is_active=True,
        archived_at=None,
    )
    reference_list = SimpleNamespace(
        id=list_id,
        owner_organization_id=None,
        scope_mode="global",
        is_active=True,
        archived_at=None,
    )
    created: list[object] = []
    audits: list[object] = []

    class Session:
        def add(self, item: object) -> None:
            created.append(item)

        def begin_nested(self):  # type: ignore[no-untyped-def]
            return nullcontext()

        def flush(self) -> None:
            raise IntegrityError("INSERT", {}, Exception("duplicate reference code"))

    class Audit:
        def __init__(self, _session: object) -> None:
            pass

        def record_user_event(self, **kwargs: object) -> None:
            audits.append(kwargs)

    service = ReferenceListService(cast(Session, Session()))
    monkeypatch.setattr(service, "_get_active_reference_list", lambda _list_id: reference_list)
    monkeypatch.setattr(service, "_require_reference_edit_permission", lambda *_args: None)
    monkeypatch.setattr(
        service,
        "list_items",
        lambda _list_id: [] if not created else [concurrent_item],
    )
    monkeypatch.setattr("app.services.references.AuditService", Audit)

    item = service.create_global_import_item_for_actor(
        actor_user_id=actor_user_id,
        list_id=list_id,
        normalized_label="ready for review",
        display_label="Ready for review",
    )

    assert item is concurrent_item
    assert len(created) == 1
    assert audits == []


def test_global_import_reference_resolution_rejects_non_global_list_and_missing_edit_permission(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    actor_user_id = uuid4()
    list_id = uuid4()
    service = ReferenceListService(cast(Session, object()))
    local_list = SimpleNamespace(
        id=list_id,
        owner_organization_id=uuid4(),
        is_active=True,
        archived_at=None,
    )
    monkeypatch.setattr(service, "_get_active_reference_list", lambda _list_id: local_list)
    monkeypatch.setattr(service, "_require_reference_edit_permission", lambda *_args: None)

    with pytest.raises(
        ReferenceListError,
        match="^Импорт может пополнять только глобальные справочники\\.$",
    ):
        service.resolve_or_plan_global_import_item_for_actor(
            actor_user_id=actor_user_id,
            list_id=list_id,
            raw_label="New value",
        )

    global_list = SimpleNamespace(
        id=list_id,
        owner_organization_id=None,
        scope_mode="organization",
        is_active=True,
        archived_at=None,
    )
    monkeypatch.setattr(service, "_get_active_reference_list", lambda _list_id: global_list)
    with pytest.raises(
        ReferenceListError,
        match="^Импорт может пополнять только глобальные справочники\\.$",
    ):
        service.resolve_or_plan_global_import_item_for_actor(
            actor_user_id=actor_user_id,
            list_id=list_id,
            raw_label="New value",
        )

    global_list.scope_mode = "global"

    def deny_edit(*_args: object) -> None:
        raise PermissionDeniedError("reference edit is required")

    monkeypatch.setattr(service, "_require_reference_edit_permission", deny_edit)
    with pytest.raises(PermissionDeniedError, match="reference edit"):
        service.resolve_or_plan_global_import_item_for_actor(
            actor_user_id=actor_user_id,
            list_id=list_id,
            raw_label="New value",
        )


def test_xlsx_enrichment_rolls_back_real_postgresql_reference_and_card_writes(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    context = _phase_1d_context(db_session)
    schema_service = RegistrySchemaService(db_session)
    reference_service = ReferenceListService(db_session)
    block = schema_service.create_block_for_actor(
        actor_user_id=context["system_admin"].id,
        registry_id=context["registry"].id,
        code="xlsx-enrichment-rollback",
        title="XLSX enrichment rollback",
    )
    reference_list = reference_service.create_reference_list_for_actor(
        actor_user_id=context["system_admin"].id,
        registry_id=context["registry"].id,
        code="xlsx-enrichment-rollback-statuses",
        name="XLSX enrichment rollback statuses",
    )
    field = schema_service.create_field_for_actor(
        actor_user_id=context["system_admin"].id,
        block_id=block.id,
        code="xlsx_enrichment_rollback_status",
        label="Status",
        field_type="select",
        options_source_type="reference_list",
        options_source_id=reference_list.id,
    )
    template = schema_service.create_card_template_for_actor(
        actor_user_id=context["system_admin"].id,
        registry_id=context["registry"].id,
        code="xlsx-enrichment-rollback-template",
        name="XLSX enrichment rollback template",
        field_schema_json={"field_ids": [str(field.id)]},
    )
    service = import_export_module.TabularCardExchangeService(db_session)
    template_content = service.import_template_xlsx_for_actor(
        actor_user_id=context["system_admin"].id,
        registry_id=context["registry"].id,
        card_template_id=template.id,
        field_ids=[field.id],
        organization_ids=[context["child"].id],
        import_mode="enrich_global_references",
    )
    workbook = load_workbook(BytesIO(template_content))
    sheet = workbook["Карточки"]
    sheet["B2"] = "Rollback card one"
    sheet["C2"] = "New rollback status"
    sheet["B3"] = "Rollback card two"
    sheet["C3"] = "New rollback status"
    content = BytesIO()
    workbook.save(content)

    class FailingSecondCardWriteService(CardService):
        created_card_count = 0

        def create_card_for_actor(self, **kwargs: object) -> Card:
            type(self).created_card_count += 1
            if type(self).created_card_count == 2:
                raise RuntimeError("forced later XLSX card write failure")
            return super().create_card_for_actor(**kwargs)

    monkeypatch.setattr(import_export_module, "CardService", FailingSecondCardWriteService)

    with pytest.raises(RuntimeError, match="later XLSX card write failure"):
        service.commit_import_xlsx_for_actor(
            actor_user_id=context["system_admin"].id,
            registry_id=context["registry"].id,
            xlsx_content=content.getvalue(),
        )

    db_session.expire_all()
    assert (
        db_session.scalars(
            select(Card).where(Card.display_name.in_(["Rollback card one", "Rollback card two"]))
        ).all()
        == []
    )
    assert (
        db_session.scalar(
            select(func.count())
            .select_from(ReferenceItem)
            .where(
                ReferenceItem.list_id == reference_list.id,
                ReferenceItem.label == "New rollback status",
            )
        )
        == 0
    )


def test_registry_schema_is_not_duplicated_per_organization(db_session: Session) -> None:
    context = _phase_1d_context(db_session)
    registry = context["registry"]

    assert registry.code == "phase1d-assets"
    assert registry.owner_organization_id is None
    assert registry.is_default_for_owner_tree is False


def test_main_root_organization_gets_one_default_registry(db_session: Session) -> None:
    system_admin = _create_user(db_session, "phase6c-system@example.test", is_superuser=True)
    organization_service = OrganizationService(db_session)

    root = organization_service.create_root_for_actor(
        actor_user_id=system_admin.id,
        code="phase6c-root",
        name="Phase 6C Root",
    )
    child = organization_service.create_child(
        parent_id=root.id,
        code="phase6c-child",
        name="Phase 6C Child",
        created_by=system_admin.id,
    )

    registries = list(
        db_session.scalars(
            select(Registry).where(
                Registry.owner_organization_id == root.id,
                Registry.is_default_for_owner_tree.is_(True),
                Registry.archived_at.is_(None),
            )
        ).all()
    )

    assert len(registries) == 1
    assert registries[0].name == "Реестр карточек"
    assert not db_session.scalars(
        select(Registry).where(
            Registry.owner_organization_id == child.id,
            Registry.is_default_for_owner_tree.is_(True),
        )
    ).first()


def test_backend_rejects_second_active_root_organization(db_session: Session) -> None:
    system_admin = _create_user(
        db_session,
        "phase6f-single-root-system@example.test",
        is_superuser=True,
    )
    organization_service = OrganizationService(db_session)
    root = organization_service.create_root_for_actor(
        actor_user_id=system_admin.id,
        code="phase6f-root",
        name="Phase 6F Root",
    )

    with pytest.raises(ValueError, match="one active root organization"):
        organization_service.create_root_for_actor(
            actor_user_id=system_admin.id,
            code="phase6f-second-root",
            name="Phase 6F Second Root",
        )

    roots = list(
        db_session.scalars(
            select(Organization).where(
                Organization.parent_id.is_(None),
                Organization.archived_at.is_(None),
                Organization.is_active.is_(True),
            )
        ).all()
    )
    assert [item.id for item in roots] == [root.id]


def test_single_root_default_registry_repair_is_idempotent(db_session: Session) -> None:
    root = OrganizationService(db_session).create_root(
        code="phase6f-repair-root",
        name="Phase 6F Repair Root",
    )
    legacy_registry = Registry(
        code="phase6f-legacy-registry",
        name="Phase 6F Legacy Registry",
    )
    db_session.add(legacy_registry)
    db_session.flush()
    schema_service = RegistrySchemaService(db_session)

    repaired = schema_service.ensure_single_root_default_registry()
    repaired_again = schema_service.ensure_single_root_default_registry()

    assert repaired.id == legacy_registry.id
    assert repaired_again.id == legacy_registry.id
    assert repaired.owner_organization_id == root.id
    assert repaired.is_default_for_owner_tree is True
    default_count = db_session.scalar(
        select(func.count())
        .select_from(Registry)
        .where(
            Registry.is_default_for_owner_tree.is_(True),
            Registry.archived_at.is_(None),
            Registry.lifecycle_status != "archived",
        )
    )
    assert default_count == 1


def test_single_root_default_registry_repair_refuses_ambiguous_registries(
    db_session: Session,
) -> None:
    OrganizationService(db_session).create_root(
        code="phase6f-ambiguous-root",
        name="Phase 6F Ambiguous Root",
    )
    db_session.add_all(
        [
            Registry(code="phase6f-ambiguous-a", name="Phase 6F Ambiguous A"),
            Registry(code="phase6f-ambiguous-b", name="Phase 6F Ambiguous B"),
        ]
    )
    db_session.flush()

    with pytest.raises(RegistrySchemaError, match="multiple active registries"):
        RegistrySchemaService(db_session).ensure_single_root_default_registry()


def test_default_registry_resolves_for_descendant_and_archived_default_is_ignored(
    db_session: Session,
) -> None:
    system_admin = _create_user(
        db_session,
        "phase6c-resolve-system@example.test",
        is_superuser=True,
    )
    organization_service = OrganizationService(db_session)
    root = organization_service.create_root_for_actor(
        actor_user_id=system_admin.id,
        code="phase6c-resolve-root",
        name="Phase 6C Resolve Root",
    )
    child = organization_service.create_child(
        parent_id=root.id,
        code="phase6c-resolve-child",
        name="Phase 6C Resolve Child",
        created_by=system_admin.id,
    )
    schema_service = RegistrySchemaService(db_session)

    default_registry = schema_service.resolve_default_registry_for_organization(child.id)

    assert default_registry.owner_organization_id == root.id
    default_registry.archived_at = datetime.now(UTC)
    default_registry.lifecycle_status = "archived"
    db_session.flush()

    with pytest.raises(RegistrySchemaError, match="Default card registry is not configured"):
        schema_service.resolve_default_registry_for_organization(child.id)


def test_organization_centered_card_create_uses_root_default_registry(
    db_session: Session,
) -> None:
    system_admin = _create_user(
        db_session,
        "phase6c-card-system@example.test",
        is_superuser=True,
    )
    org_admin = _create_user(db_session, "phase6c-card-admin@example.test")
    card_role = _create_role_with_permissions(
        db_session,
        "phase6c_card_admin",
        ["cards.manage"],
    )
    organization_service = OrganizationService(db_session)
    root = organization_service.create_root_for_actor(
        actor_user_id=system_admin.id,
        code="phase6c-card-root",
        name="Phase 6C Card Root",
    )
    child = organization_service.create_child(
        parent_id=root.id,
        code="phase6c-card-child",
        name="Phase 6C Card Child",
        created_by=system_admin.id,
    )
    default_registry = RegistrySchemaService(db_session).resolve_default_registry_for_organization(
        child.id
    )
    _grant_access(
        db_session,
        user_id=org_admin.id,
        role_id=card_role.id,
        organization_id=child.id,
        registry_id=default_registry.id,
        include_descendants=True,
        created_by=system_admin.id,
    )

    card = CardService(db_session).create_card_for_organization_for_actor(
        actor_user_id=org_admin.id,
        organization_id=child.id,
        display_name="Organization-centered card",
    )

    assert card.registry_id == default_registry.id
    assert card.organization_id == child.id


def test_card_creation_preview_uses_template_layout_field_order(
    db_session: Session,
) -> None:
    system_admin = _create_user(
        db_session,
        "creation-preview-layout-system@example.test",
        is_superuser=True,
    )
    organization = OrganizationService(db_session).create_root_for_actor(
        actor_user_id=system_admin.id,
        code="creation-preview-layout-root",
        name="Preview layout root",
    )
    registry = RegistrySchemaService(db_session).resolve_default_registry_for_organization(
        organization.id
    )
    schema_service = RegistrySchemaService(db_session)
    block = schema_service.create_block_for_actor(
        actor_user_id=system_admin.id,
        registry_id=registry.id,
        code="creation-preview-layout-main",
        title="Preview layout main",
    )
    first_layout_field = schema_service.create_field_for_actor(
        actor_user_id=system_admin.id,
        block_id=block.id,
        code="creation_preview_first_layout",
        label="First layout field",
        field_type="text",
        position=1,
    )
    second_layout_field = schema_service.create_field_for_actor(
        actor_user_id=system_admin.id,
        block_id=block.id,
        code="creation_preview_second_layout",
        label="Second layout field",
        field_type="text",
        position=0,
    )
    template = schema_service.create_card_template_for_actor(
        actor_user_id=system_admin.id,
        registry_id=registry.id,
        code="creation-preview-layout-template",
        name="Preview layout template",
        field_schema_json={
            "field_ids": [str(first_layout_field.id), str(second_layout_field.id)],
            "form_layout": {
                "columns": 12,
                "sections": [
                    {
                        "id": "creation-preview-layout-section",
                        "block_id": str(block.id),
                        "row": 1,
                        "column": 1,
                        "column_span": 12,
                        "items": [
                            {
                                "id": "creation-preview-layout-first",
                                "kind": "field",
                                "field_id": str(first_layout_field.id),
                                "row": 1,
                                "column": 1,
                                "column_span": 12,
                            },
                            {
                                "id": "creation-preview-layout-second",
                                "kind": "field",
                                "field_id": str(second_layout_field.id),
                                "row": 2,
                                "column": 1,
                                "column_span": 12,
                            },
                        ],
                    }
                ],
            },
        },
    )

    preview = CardService(db_session).preview_card_creation_for_actor(
        actor_user_id=system_admin.id,
        organization_id=organization.id,
        card_template_id=template.id,
    )

    assert [item.field_id for item in preview.blocks[0].fields] == [
        first_layout_field.id,
        second_layout_field.id,
    ]


def test_card_creation_preview_uses_template_layout_section_order_for_blocks(
    db_session: Session,
) -> None:
    system_admin = _create_user(
        db_session,
        "creation-preview-sections-system@example.test",
        is_superuser=True,
    )
    organization = OrganizationService(db_session).create_root_for_actor(
        actor_user_id=system_admin.id,
        code="creation-preview-sections-root",
        name="Preview sections root",
    )
    registry = RegistrySchemaService(db_session).resolve_default_registry_for_organization(
        organization.id
    )
    schema_service = RegistrySchemaService(db_session)
    first_schema_block = schema_service.create_block_for_actor(
        actor_user_id=system_admin.id,
        registry_id=registry.id,
        code="creation-preview-first-schema-block",
        title="First schema block",
        position=0,
    )
    second_schema_block = schema_service.create_block_for_actor(
        actor_user_id=system_admin.id,
        registry_id=registry.id,
        code="creation-preview-second-schema-block",
        title="Second schema block",
        position=1,
    )
    first_schema_field = schema_service.create_field_for_actor(
        actor_user_id=system_admin.id,
        block_id=first_schema_block.id,
        code="creation_preview_first_schema_field",
        label="First schema field",
        field_type="text",
    )
    second_schema_field = schema_service.create_field_for_actor(
        actor_user_id=system_admin.id,
        block_id=second_schema_block.id,
        code="creation_preview_second_schema_field",
        label="Second schema field",
        field_type="text",
    )
    template = schema_service.create_card_template_for_actor(
        actor_user_id=system_admin.id,
        registry_id=registry.id,
        code="creation-preview-sections-template",
        name="Preview sections template",
        field_schema_json={
            "field_ids": [str(first_schema_field.id), str(second_schema_field.id)],
            "form_layout": {
                "columns": 12,
                "sections": [
                    {
                        "id": "creation-preview-second-section",
                        "block_id": str(second_schema_block.id),
                        "row": 1,
                        "column": 1,
                        "column_span": 12,
                        "items": [
                            {
                                "id": "creation-preview-second-field",
                                "kind": "field",
                                "field_id": str(second_schema_field.id),
                                "row": 1,
                                "column": 1,
                                "column_span": 12,
                            }
                        ],
                    },
                    {
                        "id": "creation-preview-first-section",
                        "block_id": str(first_schema_block.id),
                        "row": 2,
                        "column": 1,
                        "column_span": 12,
                        "items": [
                            {
                                "id": "creation-preview-first-field",
                                "kind": "field",
                                "field_id": str(first_schema_field.id),
                                "row": 1,
                                "column": 1,
                                "column_span": 12,
                            }
                        ],
                    },
                ],
            },
        },
    )

    preview = CardService(db_session).preview_card_creation_for_actor(
        actor_user_id=system_admin.id,
        organization_id=organization.id,
        card_template_id=template.id,
    )

    assert [block.block_id for block in preview.blocks] == [
        second_schema_block.id,
        first_schema_block.id,
    ]


def test_card_creation_preview_keeps_unranked_fields_after_partial_layout(
    db_session: Session,
) -> None:
    system_admin = _create_user(
        db_session,
        "creation-preview-partial-system@example.test",
        is_superuser=True,
    )
    organization = OrganizationService(db_session).create_root_for_actor(
        actor_user_id=system_admin.id,
        code="creation-preview-partial-root",
        name="Preview partial root",
    )
    registry = RegistrySchemaService(db_session).resolve_default_registry_for_organization(
        organization.id
    )
    schema_service = RegistrySchemaService(db_session)
    block = schema_service.create_block_for_actor(
        actor_user_id=system_admin.id,
        registry_id=registry.id,
        code="creation-preview-partial-main",
        title="Preview partial main",
    )
    unranked_field = schema_service.create_field_for_actor(
        actor_user_id=system_admin.id,
        block_id=block.id,
        code="creation_preview_unranked",
        label="Unranked field",
        field_type="text",
        position=0,
    )
    ranked_field = schema_service.create_field_for_actor(
        actor_user_id=system_admin.id,
        block_id=block.id,
        code="creation_preview_ranked",
        label="Ranked field",
        field_type="text",
        position=1,
    )
    template = schema_service.create_card_template_for_actor(
        actor_user_id=system_admin.id,
        registry_id=registry.id,
        code="creation-preview-partial-template",
        name="Preview partial template",
        field_schema_json={
            "field_ids": [str(unranked_field.id), str(ranked_field.id)],
            "form_layout": {
                "columns": 12,
                "sections": [
                    {
                        "id": "creation-preview-partial-section",
                        "block_id": str(block.id),
                        "row": 1,
                        "column": 1,
                        "column_span": 12,
                        "items": [
                            {
                                "id": "creation-preview-ranked-field",
                                "kind": "field",
                                "field_id": str(ranked_field.id),
                                "row": 1,
                                "column": 1,
                                "column_span": 12,
                            }
                        ],
                    }
                ],
            },
        },
    )

    preview = CardService(db_session).preview_card_creation_for_actor(
        actor_user_id=system_admin.id,
        organization_id=organization.id,
        card_template_id=template.id,
    )

    assert [item.field_id for item in preview.blocks[0].fields] == [
        ranked_field.id,
        unranked_field.id,
    ]


def test_first_card_value_creates_card_atomically_and_updates_lifecycle(
    db_session: Session,
) -> None:
    system_admin = _create_user(
        db_session,
        "single-stage-card-system@example.test",
        is_superuser=True,
    )
    organization = OrganizationService(db_session).create_root_for_actor(
        actor_user_id=system_admin.id,
        code="single-stage-card-root",
        name="Single-stage card root",
    )
    registry = RegistrySchemaService(db_session).resolve_default_registry_for_organization(
        organization.id
    )
    schema_service = RegistrySchemaService(db_session)
    block = schema_service.create_block_for_actor(
        actor_user_id=system_admin.id,
        registry_id=registry.id,
        code="single-stage-main",
        title="Single-stage main",
    )
    field = schema_service.create_field_for_actor(
        actor_user_id=system_admin.id,
        block_id=block.id,
        code="single_stage_name",
        label="Single-stage name",
        field_type="text",
        required_mode="required",
    )
    template = schema_service.create_card_template_for_actor(
        actor_user_id=system_admin.id,
        registry_id=registry.id,
        code="single-stage-template",
        name="Single-stage template",
        field_schema_json={"field_ids": [str(field.id)]},
    )
    card_service = CardService(db_session)

    preview = card_service.preview_card_creation_for_actor(
        actor_user_id=system_admin.id,
        organization_id=organization.id,
        card_template_id=template.id,
    )

    assert preview.card_template_id == template.id
    assert [(item.title, item.fields[0].field_id) for item in preview.blocks] == [
        (block.title, field.id)
    ]

    with pytest.raises(InvalidFieldValueError, match="At least one non-empty"):
        card_service.create_card_with_first_value_for_actor(
            actor_user_id=system_admin.id,
            organization_id=organization.id,
            display_name=None,
            card_template_id=template.id,
            public_view_enabled=True,
            public_edit_enabled=True,
            field_id=field.id,
            value="",
        )

    assert not db_session.scalars(select(Card).where(Card.organization_id == organization.id)).all()

    card = card_service.create_card_with_first_value_for_actor(
        actor_user_id=system_admin.id,
        organization_id=organization.id,
        display_name=None,
        card_template_id=template.id,
        public_view_enabled=True,
        public_edit_enabled=True,
        field_id=field.id,
        value="Created after first value",
    )

    stored_value = db_session.scalar(
        select(FieldValue).where(FieldValue.card_id == card.id, FieldValue.field_id == field.id)
    )
    assert card.lifecycle_status == "active"
    assert card.display_name == template.name
    assert stored_value is not None
    assert stored_value.value_text == "Created after first value"


def test_first_card_value_discards_card_when_public_access_update_fails_without_database(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _NestedTransaction:
        def __init__(self, session: "_FirstSaveRollbackSession") -> None:
            self.session = session
            self.created_count = len(session.created_cards)

        def __enter__(self) -> "_NestedTransaction":
            return self

        def __exit__(self, exc_type: object, _exc: object, _traceback: object) -> bool:
            if exc_type is not None:
                del self.session.created_cards[self.created_count :]
            return False

    class _FirstSaveRollbackSession:
        def __init__(self) -> None:
            self.created_cards: list[SimpleNamespace] = []

        def begin_nested(self) -> _NestedTransaction:
            return _NestedTransaction(self)

    session = _FirstSaveRollbackSession()
    service = CardService(cast(Session, session))
    actor_id = uuid4()
    organization_id = uuid4()
    registry_id = uuid4()
    template_id = uuid4()
    field_id = uuid4()
    card = SimpleNamespace(id=uuid4())

    monkeypatch.setattr(
        RegistrySchemaService,
        "resolve_default_registry_for_organization",
        lambda _self, _organization_id: SimpleNamespace(id=registry_id),
    )
    monkeypatch.setattr(service, "_require_card_permission", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(
        service,
        "_get_active_card_template_for_registry",
        lambda *_args, **_kwargs: SimpleNamespace(id=template_id),
    )
    monkeypatch.setattr(
        service,
        "_get_active_field",
        lambda _field_id: SimpleNamespace(id=field_id, block_id=uuid4()),
    )
    monkeypatch.setattr(
        service,
        "_get_active_block",
        lambda _block_id: SimpleNamespace(registry_id=registry_id),
    )
    monkeypatch.setattr(service, "_template_field_ids", lambda _template: {field_id})
    monkeypatch.setattr(
        service,
        "_coerce_field_assignment",
        lambda *_args, **_kwargs: "first value",
    )
    monkeypatch.setattr(service, "_field_assignment_is_empty", lambda _assignment: False)

    def create_card(*_args: object, **_kwargs: object) -> SimpleNamespace:
        session.created_cards.append(card)
        return card

    monkeypatch.setattr(service, "create_card_for_actor", create_card)
    monkeypatch.setattr(service, "set_field_value_for_actor", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(
        CardPublicAccessService,
        "update_for_actor",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            RuntimeError("forced public-access update failure")
        ),
    )

    with pytest.raises(RuntimeError, match="forced public-access update failure"):
        service.create_card_with_first_value_for_actor(
            actor_user_id=actor_id,
            organization_id=organization_id,
            display_name=None,
            card_template_id=template_id,
            public_view_enabled=True,
            public_edit_enabled=True,
            public_access=CardPublicAccessUpdate(),
            field_id=field_id,
            value="Created value",
        )

    assert session.created_cards == []


def test_first_card_value_rolls_back_when_public_access_update_fails(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    context = _phase_1d_context(db_session)
    registry = RegistrySchemaService(db_session).resolve_default_registry_for_organization(
        context["child"].id
    )
    schema_service = RegistrySchemaService(db_session)
    block = schema_service.create_block_for_actor(
        actor_user_id=context["system_admin"].id,
        registry_id=registry.id,
        code="first-save-public-access-rollback",
        title="First-save public-access rollback",
    )
    field = schema_service.create_field_for_actor(
        actor_user_id=context["system_admin"].id,
        block_id=block.id,
        code="first_save_value",
        label="First-save value",
        field_type="text",
    )
    template = schema_service.create_card_template_for_actor(
        actor_user_id=context["system_admin"].id,
        registry_id=registry.id,
        code="first-save-public-access-rollback",
        name="First-save public-access rollback",
        field_schema_json={"field_ids": [str(field.id)]},
    )

    def fail_public_access_update(*_args: object, **_kwargs: object) -> None:
        raise RuntimeError("forced public-access update failure")

    monkeypatch.setattr(
        CardPublicAccessService,
        "update_for_actor",
        fail_public_access_update,
    )

    with pytest.raises(RuntimeError, match="forced public-access update failure"):
        CardService(db_session).create_card_with_first_value_for_actor(
            actor_user_id=context["system_admin"].id,
            organization_id=context["child"].id,
            display_name=None,
            card_template_id=template.id,
            public_view_enabled=True,
            public_edit_enabled=True,
            public_access=CardPublicAccessUpdate(),
            field_id=field.id,
            value="Created value",
        )

    assert (
        db_session.scalar(
            select(func.count(Card.id)).where(Card.organization_id == context["child"].id)
        )
        == 0
    )


def test_organization_centered_card_list_uses_default_registry_not_arbitrary_first_registry(
    db_session: Session,
) -> None:
    system_admin = _create_user(
        db_session,
        "phase6f-list-system@example.test",
        is_superuser=True,
    )
    organization_service = OrganizationService(db_session)
    root = organization_service.create_root_for_actor(
        actor_user_id=system_admin.id,
        code="phase6f-list-root",
        name="Phase 6F List Root",
    )
    default_registry = RegistrySchemaService(db_session).resolve_default_registry_for_organization(
        root.id
    )
    arbitrary_registry = RegistrySchemaService(db_session).create_registry_for_actor(
        actor_user_id=system_admin.id,
        code="phase6f-arbitrary-first",
        name="Phase 6F Arbitrary First",
    )
    default_card = CardService(db_session).create_card_for_actor(
        actor_user_id=system_admin.id,
        registry_id=default_registry.id,
        organization_id=root.id,
        display_name="Default registry card",
    )
    arbitrary_card = CardService(db_session).create_card_for_actor(
        actor_user_id=system_admin.id,
        registry_id=arbitrary_registry.id,
        organization_id=root.id,
        display_name="Arbitrary registry card",
    )

    cards = CardService(db_session).list_visible_cards_for_organization_for_actor(
        actor_user_id=system_admin.id,
        resolver_organization_id=root.id,
    )

    assert {card.id for card in cards} == {default_card.id}
    assert arbitrary_card.id not in {card.id for card in cards}


def test_active_default_registry_with_cards_cannot_be_archived(
    db_session: Session,
) -> None:
    system_admin = _create_user(
        db_session,
        "phase6c-archive-system@example.test",
        is_superuser=True,
    )
    organization_service = OrganizationService(db_session)
    root = organization_service.create_root_for_actor(
        actor_user_id=system_admin.id,
        code="phase6c-archive-root",
        name="Phase 6C Archive Root",
    )
    default_registry = RegistrySchemaService(db_session).resolve_default_registry_for_organization(
        root.id
    )
    CardService(db_session).create_card(
        registry_id=default_registry.id,
        organization_id=root.id,
        display_name="Draft card blocks archive",
        created_by=system_admin.id,
    )

    with pytest.raises(RegistrySchemaError, match="Default registry has active or draft cards"):
        RegistrySchemaService(db_session).archive_registry_for_actor(
            actor_user_id=system_admin.id,
            registry_id=default_registry.id,
        )


def test_registry_admin_can_manage_schema_but_org_admin_cannot(
    db_session: Session,
) -> None:
    context = _phase_1d_context(db_session)
    schema_service = RegistrySchemaService(db_session)

    block = schema_service.create_block_for_actor(
        actor_user_id=context["registry_admin"].id,
        registry_id=context["registry"].id,
        code="identity",
        title="Identity",
    )
    updated_block = schema_service.update_block_for_actor(
        actor_user_id=context["registry_admin"].id,
        block_id=block.id,
        title="Identity Updated",
    )
    field = schema_service.create_field_for_actor(
        actor_user_id=context["registry_admin"].id,
        block_id=block.id,
        code="serial_number",
        label="Serial number",
        field_type="text",
    )
    archived_field = schema_service.archive_field_for_actor(
        actor_user_id=context["registry_admin"].id,
        field_id=field.id,
    )

    assert updated_block.title == "Identity Updated"
    assert archived_field.archived_at is not None
    assert db_session.get(FormBlock, block.id) is not None
    assert db_session.get(FormField, field.id) is not None

    with pytest.raises(PermissionDeniedError):
        schema_service.create_field_for_actor(
            actor_user_id=context["org_admin"].id,
            block_id=block.id,
            code="forbidden",
            label="Forbidden",
            field_type="text",
        )


def test_schema_layout_and_static_text_roundtrip(db_session: Session) -> None:
    context = _phase_1d_context(db_session)
    schema_service = RegistrySchemaService(db_session)

    block = schema_service.create_block_for_actor(
        actor_user_id=context["registry_admin"].id,
        registry_id=context["registry"].id,
        code="layout-block",
        title="Layout block",
        layout_columns=3,
        display_config_json={"title_position": "left"},
    )
    field = schema_service.create_field_for_actor(
        actor_user_id=context["registry_admin"].id,
        block_id=block.id,
        code="instruction",
        label="Instruction",
        field_type="static_text",
        required_mode="required",
        options_config_json={"static_text": "Read this before editing."},
        display_config_json={
            "column_span": 5,
            "layout_row": 2,
            "layout_column": 5,
            "label_position": "top",
            "separator_style": "line",
        },
        is_list_display=True,
        public_editable=True,
    )

    updated_block = schema_service.update_block_for_actor(
        actor_user_id=context["registry_admin"].id,
        block_id=block.id,
        layout_columns=2,
        display_config_json={"title_position": "bottom"},
    )
    updated_field = schema_service.update_field_for_actor(
        actor_user_id=context["registry_admin"].id,
        field_id=field.id,
        options_config_json={"static_text": "Updated read-only text."},
        display_config_json={
            "column_span": 4,
            "layout_row": 3,
            "layout_column": 2,
            "label_position": "left",
            "separator_style": "muted",
        },
    )

    assert updated_block.layout_columns == 2
    assert updated_block.display_config_json == {"title_position": "bottom"}
    assert field.required_mode == "not_required"
    assert field.is_list_display is False
    assert field.public_editable is False
    assert updated_field.options_config_json == {"static_text": "Updated read-only text."}
    assert updated_field.display_config_json == {
        "column_span": 4,
        "layout_row": 3,
        "layout_column": 2,
        "label_position": "left",
        "separator_style": "muted",
    }


def test_static_text_fields_cannot_be_edited_as_card_values(db_session: Session) -> None:
    context = _phase_1d_context(db_session)
    schema_service = RegistrySchemaService(db_session)
    block = schema_service.create_block_for_actor(
        actor_user_id=context["registry_admin"].id,
        registry_id=context["registry"].id,
        code="static-card-block",
        title="Static card block",
    )
    field = schema_service.create_field_for_actor(
        actor_user_id=context["registry_admin"].id,
        block_id=block.id,
        code="static_help",
        label="Static help",
        field_type="static_text",
        options_config_json={"static_text": "Not editable."},
    )
    card = CardService(db_session).create_card_for_actor(
        actor_user_id=context["org_admin"].id,
        registry_id=context["registry"].id,
        organization_id=context["child"].id,
    )

    with pytest.raises(InvalidFieldValueError, match="Static text fields cannot be edited"):
        CardService(db_session).set_field_value_for_actor(
            actor_user_id=context["org_admin"].id,
            card_id=card.id,
            field_id=field.id,
            value="attempt",
        )


def test_field_value_audit_records_safe_before_and_after_snapshots(db_session: Session) -> None:
    context = _phase_1d_context(db_session)
    schema_service = RegistrySchemaService(db_session)
    block = schema_service.create_block_for_actor(
        actor_user_id=context["registry_admin"].id,
        registry_id=context["registry"].id,
        code="audit-diff",
        title="Audit diff",
    )
    field = schema_service.create_field_for_actor(
        actor_user_id=context["registry_admin"].id,
        block_id=block.id,
        code="serial",
        label="Serial number",
        field_type="text",
    )
    card = CardService(db_session).create_card_for_actor(
        actor_user_id=context["org_admin"].id,
        registry_id=context["registry"].id,
        organization_id=context["child"].id,
    )

    CardService(db_session).set_field_value_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=card.id,
        field_id=field.id,
        value="old serial",
    )
    CardService(db_session).set_field_value_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=card.id,
        field_id=field.id,
        value="new serial",
    )

    event = db_session.scalars(
        select(AuditEvent)
        .where(AuditEvent.object_type == "field_value")
        .order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc())
    ).first()

    assert event is not None
    assert event.card_id == card.id
    assert event.retention_class == "card_history"
    assert event.old_data_json == {
        "field": {
            "id": str(field.id),
            "code": "serial",
            "label": "Serial number",
            "type": "text",
        },
        "value": "old serial",
    }
    assert event.new_data_json == {
        "field": {
            "id": str(field.id),
            "code": "serial",
            "label": "Serial number",
            "type": "text",
        },
        "value": "new serial",
    }


def test_bulk_field_values_api_creates_two_history_events_and_one_notification(
    db_session: Session,
    api_client: TestClient,
) -> None:
    context = _phase_1d_context(db_session)
    schema_service = RegistrySchemaService(db_session)
    block = schema_service.create_block_for_actor(
        actor_user_id=context["registry_admin"].id,
        registry_id=context["registry"].id,
        code="notification-bulk-api",
        title="Пакет API уведомлений",
    )
    first = schema_service.create_field_for_actor(
        actor_user_id=context["registry_admin"].id,
        block_id=block.id,
        code="first_api_value",
        label="Первое API поле",
        field_type="text",
    )
    second = schema_service.create_field_for_actor(
        actor_user_id=context["registry_admin"].id,
        block_id=block.id,
        code="second_api_value",
        label="Второе API поле",
        field_type="text",
    )
    card = CardService(db_session).create_card_for_actor(
        actor_user_id=context["org_admin"].id,
        registry_id=context["registry"].id,
        organization_id=context["child"].id,
        display_name="Карточка пакетного API",
    )
    subscriber = _create_user(
        db_session,
        "notification-bulk-api-subscriber@example.test",
        display_name="Подписчик API",
        is_superuser=True,
    )
    CardChangeNotificationService(db_session).set_card_subscription_for_actor(
        actor_user_id=subscriber.id,
        card_id=card.id,
        enabled=True,
    )

    response = api_client.patch(
        f"/api/v1/cards/{card.id}/values",
        headers={"X-Actor-User-Id": str(context["org_admin"].id)},
        json={
            "values": [
                {"field_id": str(first.id), "value": "Раз"},
                {"field_id": str(second.id), "value": "Два"},
            ]
        },
    )

    assert response.status_code == 200, response.text
    events = list(
        db_session.scalars(
            select(AuditEvent)
            .where(AuditEvent.card_id == card.id)
            .where(AuditEvent.object_type == "field_value")
            .where(AuditEvent.retention_class == "card_history")
            .order_by(AuditEvent.created_at, AuditEvent.id)
        ).all()
    )
    assert len(events) == 2
    notifications = list(
        db_session.scalars(
            select(CardChangeNotification).where(CardChangeNotification.user_id == subscriber.id)
        ).all()
    )
    assert len(notifications) == 1
    assert notifications[0].changes_json == [
        {"label": "Первое API поле", "before": None, "after": "Раз"},
        {"label": "Второе API поле", "before": None, "after": "Два"},
    ]


def test_sensitive_field_value_audit_redacts_before_and_after_values(db_session: Session) -> None:
    context = _phase_1d_context(db_session)
    schema_service = RegistrySchemaService(db_session)
    block = schema_service.create_block_for_actor(
        actor_user_id=context["registry_admin"].id,
        registry_id=context["registry"].id,
        code="sensitive-audit-diff",
        title="Sensitive audit diff",
    )
    field = schema_service.create_field_for_actor(
        actor_user_id=context["registry_admin"].id,
        block_id=block.id,
        code="secret",
        label="Secret",
        field_type="text",
    )
    field.sensitivity_level = "restricted"
    db_session.flush()
    card = CardService(db_session).create_card_for_actor(
        actor_user_id=context["org_admin"].id,
        registry_id=context["registry"].id,
        organization_id=context["child"].id,
    )

    CardService(db_session).set_field_value_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=card.id,
        field_id=field.id,
        value="previous secret",
    )
    CardService(db_session).set_field_value_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=card.id,
        field_id=field.id,
        value="next secret",
    )

    event = db_session.scalars(
        select(AuditEvent)
        .where(AuditEvent.object_type == "field_value")
        .order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc())
    ).first()

    assert event is not None
    assert event.old_data_json == {
        "field": {
            "id": str(field.id),
            "code": "secret",
            "label": "Secret",
            "type": "text",
        },
        "value": {"redacted": True},
    }
    assert event.new_data_json == {
        "field": {
            "id": str(field.id),
            "code": "secret",
            "label": "Secret",
            "type": "text",
        },
        "value": {"redacted": True},
    }


def test_one_registry_contains_cards_from_multiple_organizations_with_scope_visibility(
    db_session: Session,
) -> None:
    context = _phase_1d_context(db_session)
    card_service = CardService(db_session)

    child_card = card_service.create_card_for_actor(
        actor_user_id=context["org_admin"].id,
        registry_id=context["registry"].id,
        organization_id=context["child"].id,
        display_name="Child card",
    )
    sibling_card = card_service.create_card(
        registry_id=context["registry"].id,
        organization_id=context["sibling"].id,
        display_name="Sibling card",
        created_by=context["system_admin"].id,
    )

    visible_cards = card_service.list_visible_cards(
        actor_user_id=context["org_admin"].id,
        registry_id=context["registry"].id,
    )

    assert child_card.registry_id == sibling_card.registry_id == context["registry"].id
    assert {card.id for card in visible_cards} == {child_card.id}


def test_card_template_creates_card_name_and_default_values(
    db_session: Session,
) -> None:
    context = _phase_1d_context(db_session)
    schema_service = RegistrySchemaService(db_session)
    card_service = CardService(db_session)
    block = schema_service.create_block_for_actor(
        actor_user_id=context["registry_admin"].id,
        registry_id=context["registry"].id,
        code="template-main",
        title="Template main",
    )
    text_field = schema_service.create_field_for_actor(
        actor_user_id=context["registry_admin"].id,
        block_id=block.id,
        code="template_text",
        label="Template text",
        field_type="text",
    )
    bool_field = schema_service.create_field_for_actor(
        actor_user_id=context["registry_admin"].id,
        block_id=block.id,
        code="template_bool",
        label="Template bool",
        field_type="bool",
    )
    template = schema_service.create_card_template_for_actor(
        actor_user_id=context["registry_admin"].id,
        registry_id=context["registry"].id,
        code="template-card",
        name="Template card",
        field_schema_json={"field_ids": [str(text_field.id), str(bool_field.id)]},
        default_values_json=[
            {"field_id": str(text_field.id), "value": "prefilled"},
            {"field_id": str(bool_field.id), "value": True},
        ],
    )

    card = card_service.create_card_for_actor(
        actor_user_id=context["org_admin"].id,
        registry_id=context["registry"].id,
        organization_id=context["child"].id,
        card_template_id=template.id,
    )

    assert db_session.get(CardTemplate, template.id) is not None
    assert card.display_name == "Template card"
    assert card.card_template_id == template.id
    values = {
        value.field_id: value
        for value in db_session.scalars(select(FieldValue).where(FieldValue.card_id == card.id))
    }
    assert values[text_field.id].value_text == "prefilled"
    assert values[bool_field.id].value_bool is True


def test_card_public_access_is_individual_to_the_card_and_is_audited(
    db_session: Session,
) -> None:
    context = _phase_1d_context(db_session)
    schema_service = RegistrySchemaService(db_session)
    block = schema_service.create_block_for_actor(
        actor_user_id=context["registry_admin"].id,
        registry_id=context["registry"].id,
        code="public-access",
        title="Public access",
    )
    text_field = schema_service.create_field_for_actor(
        actor_user_id=context["registry_admin"].id,
        block_id=block.id,
        code="public_text",
        label="Public text",
        field_type="text",
    )
    static_field = schema_service.create_field_for_actor(
        actor_user_id=context["registry_admin"].id,
        block_id=block.id,
        code="public_instruction",
        label="Public instruction",
        field_type="static_text",
        options_config_json={"static_text": "Read this first."},
    )
    template = schema_service.create_card_template_for_actor(
        actor_user_id=context["registry_admin"].id,
        registry_id=context["registry"].id,
        code="public-access-template",
        name="Public access template",
        field_schema_json={
            "field_ids": [str(text_field.id), str(static_field.id)],
        },
    )
    card = CardService(db_session).create_card_for_actor(
        actor_user_id=context["org_admin"].id,
        registry_id=context["registry"].id,
        organization_id=context["child"].id,
        card_template_id=template.id,
    )

    result = CardPublicAccessService(db_session).update_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=card.id,
        payload=CardPublicAccessUpdate(
            public_view_enabled=False,
            public_edit_enabled=True,
            fields=[
                CardPublicFieldSettingUpdate(
                    field_id=text_field.id,
                    public_visible=False,
                    public_editable=True,
                ),
                CardPublicFieldSettingUpdate(
                    field_id=static_field.id,
                    public_visible=True,
                    public_editable=False,
                ),
            ],
        ),
    )

    assert result.public_view_enabled is True
    assert result.public_edit_enabled is True
    assert {
        item.field_id: (item.public_visible, item.public_editable) for item in result.fields
    } == {
        text_field.id: (True, True),
        static_field.id: (True, False),
    }
    settings = list(
        db_session.scalars(
            select(CardPublicFieldSetting).where(CardPublicFieldSetting.card_id == card.id)
        ).all()
    )
    saved_settings = {
        (setting.field_id, setting.public_visible, setting.public_editable) for setting in settings
    }
    assert saved_settings == {
        (text_field.id, True, True),
        (static_field.id, True, False),
    }
    assert (
        db_session.scalar(
            select(AuditEvent).where(
                AuditEvent.object_type == "card_public_access",
                AuditEvent.object_id == card.id,
                AuditEvent.action == "update",
            )
        )
        is not None
    )

    with pytest.raises(PermissionDeniedError):
        CardPublicAccessService(db_session).update_for_actor(
            actor_user_id=context["registry_admin"].id,
            card_id=card.id,
            payload=CardPublicAccessUpdate(),
        )


def test_create_draft_card_and_public_link_saves_access_and_audits(
    db_session: Session,
) -> None:
    context = _phase_1d_context(db_session)
    registry = RegistrySchemaService(db_session).resolve_default_registry_for_organization(
        context["child"].id
    )
    template = RegistrySchemaService(db_session).create_card_template_for_actor(
        actor_user_id=context["system_admin"].id,
        registry_id=registry.id,
        code="draft-public-link-template",
        name="Draft public link template",
        field_schema_json={"field_ids": []},
    )

    created = CardService(db_session).create_card_draft_with_public_link_for_actor(
        actor_user_id=context["system_admin"].id,
        organization_id=context["child"].id,
        display_name="Draft public link card",
        card_template_id=template.id,
        public_access=CardPublicAccessUpdate(
            public_view_enabled=True,
            public_edit_enabled=False,
        ),
    )

    assert created.card.lifecycle_status == "draft"
    assert created.public_link.public_link.card_id == created.card.id
    assert created.public_link.public_link.review_enabled is True
    assert CardPublicAccessService(db_session).read_for_actor(
        actor_user_id=context["system_admin"].id,
        card_id=created.card.id,
    ).model_dump() == {
        "card_id": created.card.id,
        "public_view_enabled": True,
        "public_edit_enabled": False,
        "fields": [],
    }
    audit_object_types = set(
        db_session.scalars(
            select(AuditEvent.object_type).where(
                AuditEvent.object_id.in_([created.card.id, created.public_link.public_link.id])
            )
        ).all()
    )
    assert {"card", "card_public_link"}.issubset(audit_object_types)


def test_create_draft_card_and_public_link_preserves_draft_for_empty_template_without_database(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _NestedTransaction:
        def __enter__(self) -> "_NestedTransaction":
            return self

        def __exit__(self, *_args: object) -> bool:
            return False

    class _NestedSession:
        def begin_nested(self) -> _NestedTransaction:
            return _NestedTransaction()

        def flush(self) -> None:
            pass

    card = SimpleNamespace(id=uuid4(), lifecycle_status="active", updated_by=None)
    service = CardService(cast(Session, _NestedSession()))
    monkeypatch.setattr(
        service,
        "create_card_for_organization_for_actor",
        lambda **_payload: card,
    )
    monkeypatch.setattr(service, "_record_lifecycle_transition", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(
        CardPublicAccessService,
        "update_for_actor",
        lambda _self, **_payload: None,
    )
    monkeypatch.setattr(
        PublicLinkService,
        "create_public_link_for_actor",
        lambda _self, **_payload: SimpleNamespace(),
    )

    created = service.create_card_draft_with_public_link_for_actor(
        actor_user_id=uuid4(),
        organization_id=uuid4(),
        display_name=None,
        card_template_id=uuid4(),
        public_access=CardPublicAccessUpdate(),
    )

    assert created.card.lifecycle_status == "draft"


def test_create_draft_card_and_public_link_keeps_draft_for_required_template(
    db_session: Session,
) -> None:
    context = _phase_1d_context(db_session)
    registry = RegistrySchemaService(db_session).resolve_default_registry_for_organization(
        context["child"].id
    )
    schema_service = RegistrySchemaService(db_session)
    block = schema_service.create_block_for_actor(
        actor_user_id=context["system_admin"].id,
        registry_id=registry.id,
        code="draft-public-link-required",
        title="Draft public link required",
    )
    required_field = schema_service.create_field_for_actor(
        actor_user_id=context["system_admin"].id,
        block_id=block.id,
        code="required_value",
        label="Required value",
        field_type="text",
        required_mode="required",
    )
    template = schema_service.create_card_template_for_actor(
        actor_user_id=context["system_admin"].id,
        registry_id=registry.id,
        code="draft-public-link-required-template",
        name="Draft public link required template",
        field_schema_json={"field_ids": [str(required_field.id)]},
    )

    created = CardService(db_session).create_card_draft_with_public_link_for_actor(
        actor_user_id=context["system_admin"].id,
        organization_id=context["child"].id,
        display_name=None,
        card_template_id=template.id,
        public_access=CardPublicAccessUpdate(),
    )

    assert created.card.lifecycle_status == "draft"


def test_create_draft_card_and_public_link_rolls_back_after_public_link_failure(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    context = _phase_1d_context(db_session)
    registry = RegistrySchemaService(db_session).resolve_default_registry_for_organization(
        context["child"].id
    )
    schema_service = RegistrySchemaService(db_session)
    block = schema_service.create_block_for_actor(
        actor_user_id=context["system_admin"].id,
        registry_id=registry.id,
        code="draft-public-link-rollback",
        title="Draft public link rollback",
    )
    field_model = schema_service.create_field_for_actor(
        actor_user_id=context["system_admin"].id,
        block_id=block.id,
        code="rollback_value",
        label="Rollback value",
        field_type="text",
    )
    template = schema_service.create_card_template_for_actor(
        actor_user_id=context["system_admin"].id,
        registry_id=registry.id,
        code="draft-public-link-rollback-template",
        name="Draft public link rollback template",
        field_schema_json={"field_ids": [str(field_model.id)]},
    )
    counts_before = {
        "cards": db_session.scalar(select(func.count(Card.id))),
        "links": db_session.scalar(select(func.count(CardPublicLink.id))),
        "settings": db_session.scalar(select(func.count(CardPublicFieldSetting.id))),
        "audits": db_session.scalar(select(func.count(AuditEvent.id))),
    }

    original_create_public_link = PublicLinkService.create_public_link_for_actor
    created_public_link_ids: list[UUID] = []
    created_card_ids: list[UUID] = []

    def create_public_link_then_fail(*args: object, **kwargs: object) -> None:
        token = original_create_public_link(*args, **kwargs)  # type: ignore[arg-type]
        created_public_link_ids.append(token.public_link.id)
        created_card_ids.append(token.public_link.card_id)
        raise RuntimeError("forced public-link failure")

    monkeypatch.setattr(
        PublicLinkService,
        "create_public_link_for_actor",
        create_public_link_then_fail,
    )

    with pytest.raises(RuntimeError, match="forced public-link failure"):
        CardService(db_session).create_card_draft_with_public_link_for_actor(
            actor_user_id=context["system_admin"].id,
            organization_id=context["child"].id,
            display_name=None,
            card_template_id=template.id,
            public_access=CardPublicAccessUpdate(
                fields=[
                    CardPublicFieldSettingUpdate(
                        field_id=field_model.id,
                        public_visible=True,
                        public_editable=True,
                    )
                ]
            ),
        )

    assert len(created_card_ids) == 1
    assert len(created_public_link_ids) == 1
    card_id = created_card_ids[0]
    public_link_id = created_public_link_ids[0]
    assert db_session.get(Card, card_id) is None
    assert db_session.get(CardPublicLink, public_link_id) is None
    assert (
        db_session.scalar(
            select(func.count(CardPublicFieldSetting.id)).where(
                CardPublicFieldSetting.card_id == card_id
            )
        )
        == 0
    )
    assert (
        db_session.scalar(
            select(func.count(AuditEvent.id)).where(
                AuditEvent.object_id.in_([card_id, public_link_id])
            )
        )
        == 0
    )
    assert {
        "cards": db_session.scalar(select(func.count(Card.id))),
        "links": db_session.scalar(select(func.count(CardPublicLink.id))),
        "settings": db_session.scalar(select(func.count(CardPublicFieldSetting.id))),
        "audits": db_session.scalar(select(func.count(AuditEvent.id))),
    } == counts_before


def test_create_draft_card_and_public_link_denies_actor_without_card_management(
    db_session: Session,
) -> None:
    context = _phase_1d_context(db_session)
    registry = RegistrySchemaService(db_session).resolve_default_registry_for_organization(
        context["child"].id
    )
    template = RegistrySchemaService(db_session).create_card_template_for_actor(
        actor_user_id=context["system_admin"].id,
        registry_id=registry.id,
        code="draft-public-link-denied-template",
        name="Draft public link denied template",
        field_schema_json={"field_ids": []},
    )

    with pytest.raises(PermissionDeniedError):
        CardService(db_session).create_card_draft_with_public_link_for_actor(
            actor_user_id=context["registry_admin"].id,
            organization_id=context["child"].id,
            display_name=None,
            card_template_id=template.id,
            public_access=CardPublicAccessUpdate(),
        )

    assert db_session.scalar(select(func.count(Card.id))) == 0


def test_explicit_draft_creation_saves_draft_without_public_link(
    db_session: Session,
) -> None:
    context = _phase_1d_context(db_session)
    registry = RegistrySchemaService(db_session).resolve_default_registry_for_organization(
        context["child"].id
    )
    template = RegistrySchemaService(db_session).create_card_template_for_actor(
        actor_user_id=context["system_admin"].id,
        registry_id=registry.id,
        code="explicit-draft-template",
        name="Explicit draft template",
        field_schema_json={"field_ids": []},
    )

    created = CardService(db_session).create_card_draft_for_actor(
        actor_user_id=context["system_admin"].id,
        organization_id=context["child"].id,
        display_name="Новая карточка",
        card_template_id=template.id,
        public_access=CardPublicAccessUpdate(
            public_view_enabled=True,
            public_edit_enabled=False,
        ),
    )

    assert created.lifecycle_status == "draft"
    assert created.display_name == "Новая карточка"
    assert PublicLinkService(db_session).list_for_card(created.id) == []
    assert CardPublicAccessService(db_session).read_for_actor(
        actor_user_id=context["system_admin"].id,
        card_id=created.id,
    ).model_dump() == {
        "card_id": created.id,
        "public_view_enabled": True,
        "public_edit_enabled": False,
        "fields": [],
    }


def test_explicit_draft_creation_preserves_draft_without_database(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _NestedTransaction:
        def __enter__(self) -> "_NestedTransaction":
            return self

        def __exit__(self, *_args: object) -> bool:
            return False

    class _NestedSession:
        def begin_nested(self) -> _NestedTransaction:
            return _NestedTransaction()

        def flush(self) -> None:
            pass

    card = SimpleNamespace(id=uuid4(), lifecycle_status="active", updated_by=None)
    service = CardService(cast(Session, _NestedSession()))
    monkeypatch.setattr(
        service,
        "create_card_for_organization_for_actor",
        lambda **_payload: card,
    )
    monkeypatch.setattr(service, "_record_lifecycle_transition", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(
        CardPublicAccessService,
        "update_for_actor",
        lambda _self, **_payload: None,
    )

    created = service.create_card_draft_for_actor(
        actor_user_id=uuid4(),
        organization_id=uuid4(),
        display_name=None,
        card_template_id=uuid4(),
        public_access=CardPublicAccessUpdate(),
    )

    assert created.lifecycle_status == "draft"


def test_explicit_draft_creation_denies_actor_without_card_management(
    db_session: Session,
) -> None:
    context = _phase_1d_context(db_session)
    registry = RegistrySchemaService(db_session).resolve_default_registry_for_organization(
        context["child"].id
    )
    template = RegistrySchemaService(db_session).create_card_template_for_actor(
        actor_user_id=context["system_admin"].id,
        registry_id=registry.id,
        code="explicit-draft-denied-template",
        name="Explicit draft denied template",
        field_schema_json={"field_ids": []},
    )

    with pytest.raises(PermissionDeniedError):
        CardService(db_session).create_card_draft_for_actor(
            actor_user_id=context["registry_admin"].id,
            organization_id=context["child"].id,
            display_name=None,
            card_template_id=template.id,
            public_access=CardPublicAccessUpdate(),
        )

    assert db_session.scalar(select(func.count(Card.id))) == 0


def test_draft_creation_rolls_back_after_public_access_failure(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    context = _phase_1d_context(db_session)
    registry = RegistrySchemaService(db_session).resolve_default_registry_for_organization(
        context["child"].id
    )
    template = RegistrySchemaService(db_session).create_card_template_for_actor(
        actor_user_id=context["system_admin"].id,
        registry_id=registry.id,
        code="explicit-draft-rollback-template",
        name="Explicit draft rollback template",
        field_schema_json={"field_ids": []},
    )
    original_create_card = CardService.create_card_for_organization_for_actor
    created_card_ids: list[UUID] = []

    def create_card_and_capture(
        service: CardService,
        **payload: object,
    ) -> Card:
        card = original_create_card(service, **payload)  # type: ignore[arg-type]
        created_card_ids.append(card.id)
        return card

    def fail_public_access_update(*_args: object, **_kwargs: object) -> None:
        raise RuntimeError("forced public-access update failure")

    monkeypatch.setattr(
        CardService,
        "create_card_for_organization_for_actor",
        create_card_and_capture,
    )
    monkeypatch.setattr(
        CardPublicAccessService,
        "update_for_actor",
        fail_public_access_update,
    )

    with pytest.raises(RuntimeError, match="forced public-access update failure"):
        CardService(db_session).create_card_draft_for_actor(
            actor_user_id=context["system_admin"].id,
            organization_id=context["child"].id,
            display_name="Rollback draft",
            card_template_id=template.id,
            public_access=CardPublicAccessUpdate(),
        )

    assert (
        db_session.scalar(
            select(func.count(Card.id)).where(Card.organization_id == context["child"].id)
        )
        == 0
    )
    assert db_session.scalar(select(func.count(CardPublicFieldSetting.id))) == 0
    assert len(created_card_ids) == 1
    assert not db_session.scalars(
        select(AuditEvent).where(
            AuditEvent.object_id == created_card_ids[0],
            AuditEvent.object_type.in_(("card", "card_public_access")),
        )
    ).all()


def test_card_update_keeps_public_view_enabled_when_public_edit_is_enabled(
    db_session: Session,
) -> None:
    context = _phase_1d_context(db_session)
    card = CardService(db_session).create_card_for_actor(
        actor_user_id=context["org_admin"].id,
        registry_id=context["registry"].id,
        organization_id=context["child"].id,
    )

    updated = CardService(db_session).update_card_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=card.id,
        public_view_enabled=False,
        public_edit_enabled=True,
    )

    assert updated.public_view_enabled is True
    assert updated.public_edit_enabled is True


def test_card_public_access_defaults_template_fields_to_visible_and_editable(
    db_session: Session,
) -> None:
    context = _phase_1d_context(db_session)
    schema_service = RegistrySchemaService(db_session)
    block = schema_service.create_block_for_actor(
        actor_user_id=context["registry_admin"].id,
        registry_id=context["registry"].id,
        code="public-defaults",
        title="Public defaults",
    )
    text_field = schema_service.create_field_for_actor(
        actor_user_id=context["registry_admin"].id,
        block_id=block.id,
        code="public_default_text",
        label="Public default text",
        field_type="text",
    )
    static_field = schema_service.create_field_for_actor(
        actor_user_id=context["registry_admin"].id,
        block_id=block.id,
        code="public_default_static",
        label="Public default static",
        field_type="static_text",
        options_config_json={"static_text": "Read only."},
    )
    template = schema_service.create_card_template_for_actor(
        actor_user_id=context["registry_admin"].id,
        registry_id=context["registry"].id,
        code="public-defaults-template",
        name="Public defaults template",
        field_schema_json={"field_ids": [str(text_field.id), str(static_field.id)]},
    )
    card = CardService(db_session).create_card_for_actor(
        actor_user_id=context["org_admin"].id,
        registry_id=context["registry"].id,
        organization_id=context["child"].id,
        card_template_id=template.id,
        public_edit_enabled=True,
    )

    access_service = CardPublicAccessService(db_session)
    access = access_service.read_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=card.id,
    )

    assert {
        setting.field_id: (setting.public_visible, setting.public_editable)
        for setting in access.fields
    } == {
        text_field.id: (True, True),
        static_field.id: (True, False),
    }
    assert [field.id for _, field in access_service.public_schema_rows_for_card(card)] == [
        text_field.id,
        static_field.id,
    ]
    assert [field.id for _, field in access_service.public_editable_schema_rows_for_card(card)] == [
        text_field.id
    ]


def test_card_creation_keeps_public_view_enabled_when_public_edit_is_enabled(
    db_session: Session,
) -> None:
    context = _phase_1d_context(db_session)

    card = CardService(db_session).create_card_for_actor(
        actor_user_id=context["org_admin"].id,
        registry_id=context["registry"].id,
        organization_id=context["child"].id,
        public_view_enabled=False,
        public_edit_enabled=True,
    )

    assert card.public_view_enabled is True
    assert card.public_edit_enabled is True


def test_card_creation_defaults_to_public_access_enabled(
    db_session: Session,
) -> None:
    context = _phase_1d_context(db_session)

    card = CardService(db_session).create_card_for_actor(
        actor_user_id=context["org_admin"].id,
        registry_id=context["registry"].id,
        organization_id=context["child"].id,
    )

    assert card.public_view_enabled is True
    assert card.public_edit_enabled is True


def test_card_creation_without_explicit_template_uses_base_template(
    db_session: Session,
) -> None:
    context = _phase_1d_context(db_session)
    schema_service = RegistrySchemaService(db_session)
    block = schema_service.create_block_for_actor(
        actor_user_id=context["registry_admin"].id,
        registry_id=context["registry"].id,
        code="base-template-main",
        title="Base template main",
    )
    first_field = schema_service.create_field_for_actor(
        actor_user_id=context["registry_admin"].id,
        block_id=block.id,
        code="base_template_first",
        label="Base template first",
        field_type="text",
    )
    second_field = schema_service.create_field_for_actor(
        actor_user_id=context["registry_admin"].id,
        block_id=block.id,
        code="base_template_second",
        label="Base template second",
        field_type="bool",
    )

    card = CardService(db_session).create_card_for_actor(
        actor_user_id=context["org_admin"].id,
        registry_id=context["registry"].id,
        organization_id=context["child"].id,
    )
    base_template = db_session.get(CardTemplate, card.card_template_id)

    assert base_template is not None
    assert base_template.code == "base_template"
    assert base_template.name == "Базовый шаблон"
    assert card.display_name == "Базовый шаблон"
    assert set(base_template.field_schema_json["field_ids"]) == {
        str(first_field.id),
        str(second_field.id),
    }


def test_base_template_field_refresh_preserves_form_layout(db_session: Session) -> None:
    context = _phase_1d_context(db_session)
    schema_service = RegistrySchemaService(db_session)
    block = schema_service.create_block_for_actor(
        actor_user_id=context["registry_admin"].id,
        registry_id=context["registry"].id,
        code="layout-preservation",
        title="Layout preservation",
    )
    first_field = schema_service.create_field_for_actor(
        actor_user_id=context["registry_admin"].id,
        block_id=block.id,
        code="layout_first",
        label="Layout first",
        field_type="text",
    )
    template = schema_service.ensure_base_card_template_for_registry(
        registry_id=context["registry"].id,
        actor_user_id=context["registry_admin"].id,
    )
    form_layout = {
        "columns": 12,
        "sections": [
            {
                "id": "section-main",
                "block_id": str(block.id),
                "row": 1,
                "column": 1,
                "column_span": 12,
                "items": [
                    {
                        "id": "field-first",
                        "kind": "field",
                        "field_id": str(first_field.id),
                        "row": 1,
                        "column": 1,
                        "column_span": 12,
                    }
                ],
            }
        ],
    }
    template.field_schema_json = {
        **template.field_schema_json,
        "form_layout": form_layout,
    }
    db_session.flush()

    second_field = schema_service.create_field_for_actor(
        actor_user_id=context["registry_admin"].id,
        block_id=block.id,
        code="layout_second",
        label="Layout second",
        field_type="bool",
    )

    assert template.field_schema_json["form_layout"] == form_layout
    assert set(template.field_schema_json["field_ids"]) == {
        str(first_field.id),
        str(second_field.id),
    }


def test_base_card_template_cannot_be_archived(db_session: Session) -> None:
    context = _phase_1d_context(db_session)
    card = CardService(db_session).create_card_for_actor(
        actor_user_id=context["org_admin"].id,
        registry_id=context["registry"].id,
        organization_id=context["child"].id,
    )

    with pytest.raises(RegistrySchemaError, match="Base card template cannot be archived"):
        RegistrySchemaService(db_session).archive_card_template_for_actor(
            actor_user_id=context["registry_admin"].id,
            template_id=card.card_template_id,
        )


def test_card_creation_rejects_an_inactive_template() -> None:
    registry_id = uuid4()
    template = SimpleNamespace(
        id=uuid4(),
        registry_id=registry_id,
        archived_at=None,
        is_active=False,
    )

    class TemplateSession:
        def get(self, model: object, _model_id: object) -> object:
            assert model is CardTemplate
            return template

    service = CardService(cast(Session, TemplateSession()))

    with pytest.raises(CardServiceError, match="Card template was not found"):
        service._get_active_card_template_for_registry(  # noqa: SLF001
            template.id,
            registry_id=registry_id,
            actor_user_id=uuid4(),
        )


def test_card_template_filter_is_backend_enforced(db_session: Session) -> None:
    context = _phase_1d_context(db_session)
    schema_service = RegistrySchemaService(db_session)
    card_service = CardService(db_session)
    block = schema_service.create_block_for_actor(
        actor_user_id=context["registry_admin"].id,
        registry_id=context["registry"].id,
        code="template-filter",
        title="Template filter",
    )
    field = schema_service.create_field_for_actor(
        actor_user_id=context["registry_admin"].id,
        block_id=block.id,
        code="filter_text",
        label="Filter text",
        field_type="text",
    )
    first_template = schema_service.create_card_template_for_actor(
        actor_user_id=context["registry_admin"].id,
        registry_id=context["registry"].id,
        code="first-template",
        name="First template",
        field_schema_json={"field_ids": [str(field.id)]},
    )
    second_template = schema_service.create_card_template_for_actor(
        actor_user_id=context["registry_admin"].id,
        registry_id=context["registry"].id,
        code="second-template",
        name="Second template",
        field_schema_json={"field_ids": [str(field.id)]},
    )
    first_card = card_service.create_card_for_actor(
        actor_user_id=context["org_admin"].id,
        registry_id=context["registry"].id,
        organization_id=context["child"].id,
        card_template_id=first_template.id,
    )
    card_service.create_card_for_actor(
        actor_user_id=context["org_admin"].id,
        registry_id=context["registry"].id,
        organization_id=context["child"].id,
        card_template_id=second_template.id,
    )

    visible_cards = card_service.list_visible_cards(
        actor_user_id=context["org_admin"].id,
        registry_id=context["registry"].id,
        card_template_ids=[first_template.id],
    )

    assert [card.id for card in visible_cards] == [first_card.id]


def test_existing_card_org_unit_can_be_corrected_inside_same_organization(
    db_session: Session,
) -> None:
    context = _phase_1d_context(db_session)
    organization_service = OrganizationService(db_session)
    child_unit = organization_service.create_org_unit(
        organization_id=context["child"].id,
        code="phase1d-child-unit",
        name="Child Unit",
        created_by=context["system_admin"].id,
    )
    sibling_unit = organization_service.create_org_unit(
        organization_id=context["sibling"].id,
        code="phase1d-sibling-unit",
        name="Sibling Unit",
        created_by=context["system_admin"].id,
    )
    card_service = CardService(db_session)
    card = card_service.create_card_for_actor(
        actor_user_id=context["org_admin"].id,
        registry_id=context["registry"].id,
        organization_id=context["child"].id,
        display_name="Org unit correction card",
    )

    updated = card_service.update_card_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=card.id,
        org_unit_id=child_unit.id,
        update_org_unit=True,
    )

    assert updated.org_unit_id == child_unit.id
    audit_event = db_session.scalar(
        select(AuditEvent).where(
            AuditEvent.action == "update",
            AuditEvent.object_type == "card",
            AuditEvent.object_id == card.id,
        )
    )
    assert audit_event is not None
    assert audit_event.new_data_json["org_unit_id"] == str(child_unit.id)

    cleared = card_service.update_card_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=card.id,
        org_unit_id=None,
        update_org_unit=True,
    )

    assert cleared.org_unit_id is None
    with pytest.raises(CardServiceError):
        card_service.update_card_for_actor(
            actor_user_id=context["org_admin"].id,
            card_id=card.id,
            org_unit_id=sibling_unit.id,
            update_org_unit=True,
        )


def test_required_field_mode_is_saved_and_enforced_on_bulk_save(db_session: Session) -> None:
    context = _phase_1d_context(db_session)
    schema_service = RegistrySchemaService(db_session)
    card_service = CardService(db_session)
    block = schema_service.create_block_for_actor(
        actor_user_id=context["registry_admin"].id,
        registry_id=context["registry"].id,
        code="required-values",
        title="Required values",
    )
    field = schema_service.create_field_for_actor(
        actor_user_id=context["registry_admin"].id,
        block_id=block.id,
        code="required_text",
        label="Required text",
        field_type="text",
        required_mode="required",
    )
    card = card_service.create_card_for_actor(
        actor_user_id=context["org_admin"].id,
        registry_id=context["registry"].id,
        organization_id=context["child"].id,
        display_name="Required card",
    )

    assert field.required_mode == "required"

    with pytest.raises(InvalidFieldValueError, match="Required text"):
        card_service.set_field_values_for_actor(
            actor_user_id=context["org_admin"].id,
            card_id=card.id,
            values=[
                BulkFieldValueInput(field_id=field.id, value=""),
            ],
        )

    saved = card_service.set_field_values_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=card.id,
        values=[
            BulkFieldValueInput(field_id=field.id, value="filled"),
        ],
    )

    assert saved[0].value_text == "filled"


def test_card_text_value_rejects_configured_russian_text_violation(
    db_session: Session,
) -> None:
    context = _phase_1d_context(db_session)
    schema_service = RegistrySchemaService(db_session)
    card_service = CardService(db_session)
    block = schema_service.create_block_for_actor(
        actor_user_id=context["registry_admin"].id,
        registry_id=context["registry"].id,
        code="validated-text",
        title="Validated text",
    )
    field = schema_service.create_field_for_actor(
        actor_user_id=context["registry_admin"].id,
        block_id=block.id,
        code="full_name",
        label="ФИО",
        field_type="text",
        validation_json={
            "kind": "russian_text",
            "message": "Введите ФИО русскими буквами",
        },
    )
    card = card_service.create_card_for_actor(
        actor_user_id=context["org_admin"].id,
        registry_id=context["registry"].id,
        organization_id=context["child"].id,
        display_name="Validated card",
    )

    with pytest.raises(
        InvalidFieldValueError,
        match="Введите ФИО русскими буквами",
    ) as exc_info:
        card_service.set_field_value_for_actor(
            actor_user_id=context["org_admin"].id,
            card_id=card.id,
            field_id=field.id,
            value="Иванов 7",
        )

    assert str(exc_info.value) == "Введите ФИО русскими буквами"


def test_card_without_mandatory_fields_is_active_after_creation(db_session: Session) -> None:
    context = _phase_1d_context(db_session)

    card = CardService(db_session).create_card_for_actor(
        actor_user_id=context["org_admin"].id,
        registry_id=context["registry"].id,
        organization_id=context["child"].id,
        display_name="Complete by default",
    )

    assert card.lifecycle_status == "active"


def test_new_mandatory_schema_field_recalculates_existing_card_lifecycle(
    db_session: Session,
) -> None:
    context = _phase_1d_context(db_session)
    schema_service = RegistrySchemaService(db_session)
    card = CardService(db_session).create_card_for_actor(
        actor_user_id=context["org_admin"].id,
        registry_id=context["registry"].id,
        organization_id=context["child"].id,
        display_name="Existing complete card",
    )
    block = schema_service.create_block_for_actor(
        actor_user_id=context["registry_admin"].id,
        registry_id=context["registry"].id,
        code="new_mandatory_block",
        title="New mandatory block",
    )

    assert card.lifecycle_status == "active"

    schema_service.create_field_for_actor(
        actor_user_id=context["registry_admin"].id,
        block_id=block.id,
        code="new_mandatory_field",
        label="New mandatory field",
        field_type="text",
        required_mode="required_on_publish",
    )

    assert card.lifecycle_status == "draft"


def test_publish_required_field_drives_automatic_draft_active_draft_lifecycle(
    db_session: Session,
) -> None:
    context = _phase_1d_context(db_session)
    schema_service = RegistrySchemaService(db_session)
    card_service = CardService(db_session)
    block = schema_service.create_block_for_actor(
        actor_user_id=context["registry_admin"].id,
        registry_id=context["registry"].id,
        code="automatic_lifecycle",
        title="Automatic lifecycle",
    )
    field = schema_service.create_field_for_actor(
        actor_user_id=context["registry_admin"].id,
        block_id=block.id,
        code="mandatory_text",
        label="Mandatory text",
        field_type="text",
        required_mode="required_on_publish",
    )
    card = card_service.create_card_for_actor(
        actor_user_id=context["org_admin"].id,
        registry_id=context["registry"].id,
        organization_id=context["child"].id,
        display_name="Automatic lifecycle card",
    )

    assert card.lifecycle_status == "draft"

    card_service.set_field_value_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=card.id,
        field_id=field.id,
        value="filled",
    )
    assert card.lifecycle_status == "active"

    card_service.set_field_value_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=card.id,
        field_id=field.id,
        value="",
    )
    assert card.lifecycle_status == "draft"

    lifecycle_events = list(
        db_session.scalars(
            select(AuditEvent).where(
                AuditEvent.object_type == "card",
                AuditEvent.object_id == card.id,
                AuditEvent.action == "lifecycle_sync",
            )
        ).all()
    )
    assert [event.new_data_json["lifecycle_status"] for event in lifecycle_events] == [
        "active",
        "draft",
    ]


def test_incomplete_required_card_can_save_other_draft_values(db_session: Session) -> None:
    context = _phase_1d_context(db_session)
    schema_service = RegistrySchemaService(db_session)
    card_service = CardService(db_session)
    block = schema_service.create_block_for_actor(
        actor_user_id=context["registry_admin"].id,
        registry_id=context["registry"].id,
        code="incremental_draft",
        title="Incremental draft",
    )
    schema_service.create_field_for_actor(
        actor_user_id=context["registry_admin"].id,
        block_id=block.id,
        code="required_text",
        label="Required text",
        field_type="text",
        required_mode="required",
    )
    optional_field = schema_service.create_field_for_actor(
        actor_user_id=context["registry_admin"].id,
        block_id=block.id,
        code="optional_text",
        label="Optional text",
        field_type="text",
    )
    card = card_service.create_card_for_actor(
        actor_user_id=context["org_admin"].id,
        registry_id=context["registry"].id,
        organization_id=context["child"].id,
        display_name="Incremental draft card",
    )

    saved = card_service.set_field_values_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=card.id,
        values=[BulkFieldValueInput(field_id=optional_field.id, value="partial")],
    )

    assert saved[0].value_text == "partial"
    assert card.lifecycle_status == "draft"


def test_manual_lifecycle_update_cannot_override_required_field_completeness(
    db_session: Session,
) -> None:
    context = _phase_1d_context(db_session)
    schema_service = RegistrySchemaService(db_session)
    card_service = CardService(db_session)
    block = schema_service.create_block_for_actor(
        actor_user_id=context["registry_admin"].id,
        registry_id=context["registry"].id,
        code="publish-values",
        title="Publish values",
    )
    field = schema_service.create_field_for_actor(
        actor_user_id=context["registry_admin"].id,
        block_id=block.id,
        code="publish_text",
        label="Publish text",
        field_type="text",
        required_mode="required_on_publish",
    )
    card = card_service.create_card_for_actor(
        actor_user_id=context["org_admin"].id,
        registry_id=context["registry"].id,
        organization_id=context["child"].id,
        display_name="Publish card",
    )

    incomplete = card_service.update_card_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=card.id,
        lifecycle_status="active",
    )
    assert incomplete.lifecycle_status == "draft"

    card_service.set_field_values_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=card.id,
        values=[
            BulkFieldValueInput(field_id=field.id, value="ready"),
        ],
    )
    assert card.lifecycle_status == "active"

    updated = card_service.update_card_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=card.id,
        lifecycle_status="draft",
    )

    assert updated.lifecycle_status == "active"


def test_dynamic_typed_values_are_saved_to_typed_columns(db_session: Session) -> None:
    context = _phase_1d_context(db_session)
    schema_service = RegistrySchemaService(db_session)
    card_service = CardService(db_session)
    block = schema_service.create_block_for_actor(
        actor_user_id=context["registry_admin"].id,
        registry_id=context["registry"].id,
        code="typed",
        title="Typed values",
    )
    fields = {
        "text": schema_service.create_field_for_actor(
            actor_user_id=context["registry_admin"].id,
            block_id=block.id,
            code="text_value",
            label="Text value",
            field_type="text",
        ),
        "number": schema_service.create_field_for_actor(
            actor_user_id=context["registry_admin"].id,
            block_id=block.id,
            code="number_value",
            label="Number value",
            field_type="number",
        ),
        "date": schema_service.create_field_for_actor(
            actor_user_id=context["registry_admin"].id,
            block_id=block.id,
            code="date_value",
            label="Date value",
            field_type="date",
        ),
        "datetime": schema_service.create_field_for_actor(
            actor_user_id=context["registry_admin"].id,
            block_id=block.id,
            code="datetime_value",
            label="Datetime value",
            field_type="datetime",
        ),
        "bool": schema_service.create_field_for_actor(
            actor_user_id=context["registry_admin"].id,
            block_id=block.id,
            code="bool_value",
            label="Bool value",
            field_type="bool",
        ),
        "json": schema_service.create_field_for_actor(
            actor_user_id=context["registry_admin"].id,
            block_id=block.id,
            code="json_value",
            label="JSON value",
            field_type="json",
        ),
    }
    card = card_service.create_card_for_actor(
        actor_user_id=context["org_admin"].id,
        registry_id=context["registry"].id,
        organization_id=context["child"].id,
        display_name="Typed card",
    )
    value_datetime = datetime(2026, 6, 28, 10, 30, tzinfo=UTC)

    card_service.set_field_value_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=card.id,
        field_id=fields["text"].id,
        value="SN-001",
    )
    card_service.set_field_value_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=card.id,
        field_id=fields["number"].id,
        value=Decimal("42.5"),
    )
    card_service.set_field_value_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=card.id,
        field_id=fields["date"].id,
        value=date(2026, 6, 28),
    )
    card_service.set_field_value_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=card.id,
        field_id=fields["datetime"].id,
        value=value_datetime,
    )
    card_service.set_field_value_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=card.id,
        field_id=fields["bool"].id,
        value=True,
    )
    card_service.set_field_value_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=card.id,
        field_id=fields["json"].id,
        value={"key": "value"},
    )

    values = {
        value.field_id: value
        for value in db_session.scalars(select(FieldValue).where(FieldValue.card_id == card.id))
    }

    assert values[fields["text"].id].value_text == "SN-001"
    assert values[fields["number"].id].value_number == Decimal("42.5")
    assert values[fields["date"].id].value_date == date(2026, 6, 28)
    assert values[fields["datetime"].id].value_datetime == value_datetime
    assert values[fields["bool"].id].value_bool is True
    assert values[fields["json"].id].value_json == {"key": "value"}


def test_work_experience_field_is_required_reads_as_duration_and_copies_its_anchor(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class ServerDate(date):
        @classmethod
        def today(cls) -> date:
            return cls(2026, 6, 28)

    monkeypatch.setattr(cards_module, "date", ServerDate)
    context = _phase_1d_context(db_session)
    schema_service = RegistrySchemaService(db_session)
    card_service = CardService(db_session)
    block = schema_service.create_block_for_actor(
        actor_user_id=context["registry_admin"].id,
        registry_id=context["registry"].id,
        code="experience",
        title="Experience",
    )
    field = schema_service.create_field_for_actor(
        actor_user_id=context["registry_admin"].id,
        block_id=block.id,
        code="work_experience",
        label="Work experience",
        field_type="work_experience",
        required_mode="required",
    )
    card = card_service.create_card_for_actor(
        actor_user_id=context["org_admin"].id,
        registry_id=context["registry"].id,
        organization_id=context["child"].id,
        display_name="Experience card",
    )

    assert card.lifecycle_status == "draft"
    field_value = card_service.set_field_value_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=card.id,
        field_id=field.id,
        value={"days": 16, "months": 3, "years": 9},
    )

    assert field_value.value_json == {"anchor_date": "2017-03-12"}
    assert card.lifecycle_status == "active"
    card_read = card_service.read_card_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=card.id,
    )
    assert card_read.fields["work_experience"].value == {
        "days": 16,
        "months": 3,
        "years": 9,
        "display": "16 дней 3 месяца 9 лет",
    }

    class NextServerDate(date):
        @classmethod
        def today(cls) -> date:
            return cls(2026, 6, 29)

    monkeypatch.setattr(cards_module, "date", NextServerDate)
    next_day_read = card_service.read_card_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=card.id,
    )
    assert next_day_read.fields["work_experience"].value == {
        "days": 17,
        "months": 3,
        "years": 9,
        "display": "17 дней 3 месяца 9 лет",
    }
    assert field_value.value_json == {"anchor_date": "2017-03-12"}

    copied_card = card_service.transfer_card_for_actor(
        actor_user_id=context["system_admin"].id,
        card_id=card.id,
        target_organization_id=context["sibling"].id,
    )
    copied_value = db_session.scalar(
        select(FieldValue).where(
            FieldValue.card_id == copied_card.id,
            FieldValue.field_id == field.id,
        )
    )
    assert copied_value is not None
    assert copied_value.value_json == {"anchor_date": "2017-03-12"}


def test_select_and_multi_select_use_reference_items_and_validate_list_scope(
    db_session: Session,
) -> None:
    context = _phase_1d_context(db_session)
    schema_service = RegistrySchemaService(db_session)
    reference_service = ReferenceListService(db_session)
    card_service = CardService(db_session)
    block = schema_service.create_block_for_actor(
        actor_user_id=context["registry_admin"].id,
        registry_id=context["registry"].id,
        code="references",
        title="References",
    )
    asset_types = reference_service.create_reference_list_for_actor(
        actor_user_id=context["registry_admin"].id,
        registry_id=context["registry"].id,
        code="asset_types",
        name="Asset types",
    )
    other_list = reference_service.create_reference_list_for_actor(
        actor_user_id=context["registry_admin"].id,
        registry_id=context["registry"].id,
        code="other_types",
        name="Other types",
    )
    laptop = reference_service.create_reference_item_for_actor(
        actor_user_id=context["registry_admin"].id,
        list_id=asset_types.id,
        code="laptop",
        label="Laptop",
    )
    monitor = reference_service.create_reference_item_for_actor(
        actor_user_id=context["registry_admin"].id,
        list_id=asset_types.id,
        code="monitor",
        label="Monitor",
    )
    invalid_item = reference_service.create_reference_item_for_actor(
        actor_user_id=context["registry_admin"].id,
        list_id=other_list.id,
        code="invalid",
        label="Invalid",
    )
    select_field = schema_service.create_field_for_actor(
        actor_user_id=context["registry_admin"].id,
        block_id=block.id,
        code="asset_type",
        label="Asset type",
        field_type="select",
        options_source_type="reference_list",
        options_source_id=asset_types.id,
    )
    multi_select_field = schema_service.create_field_for_actor(
        actor_user_id=context["registry_admin"].id,
        block_id=block.id,
        code="asset_tags",
        label="Asset tags",
        field_type="multi_select",
        options_source_type="reference_list",
        options_source_id=asset_types.id,
    )
    card = card_service.create_card_for_actor(
        actor_user_id=context["org_admin"].id,
        registry_id=context["registry"].id,
        organization_id=context["child"].id,
        display_name="Reference card",
    )

    select_value = card_service.set_field_value_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=card.id,
        field_id=select_field.id,
        value=laptop.id,
    )
    multi_value = card_service.set_field_value_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=card.id,
        field_id=multi_select_field.id,
        value=[laptop.id, monitor.id],
    )

    assert select_value.value_reference_item_id == laptop.id
    assert (
        db_session.scalar(
            select(func.count())
            .select_from(FieldValueItem)
            .where(FieldValueItem.field_value_id == multi_value.id)
        )
        == 2
    )

    with pytest.raises(InvalidFieldValueError):
        card_service.set_field_value_for_actor(
            actor_user_id=context["org_admin"].id,
            card_id=card.id,
            field_id=select_field.id,
            value=invalid_item.id,
        )

    with pytest.raises(InvalidFieldValueError):
        card_service.set_field_value_for_actor(
            actor_user_id=context["org_admin"].id,
            card_id=card.id,
            field_id=multi_select_field.id,
            value=[laptop.id, invalid_item.id],
        )


def test_organization_effective_reference_list_replaces_inherited_values(
    db_session: Session,
) -> None:
    context = _phase_1d_context(db_session)
    schema_service = RegistrySchemaService(db_session)
    reference_service = ReferenceListService(db_session)
    card_service = CardService(db_session)
    block = schema_service.create_block_for_actor(
        actor_user_id=context["registry_admin"].id,
        registry_id=context["registry"].id,
        code="local_refs",
        title="Local references",
    )
    root_departments = reference_service.create_reference_list_for_actor(
        actor_user_id=context["system_admin"].id,
        registry_id=context["registry"].id,
        owner_organization_id=context["root"].id,
        code="departments",
        name="Root departments",
        inherit_to_descendants=True,
        locked_for_descendants=True,
    )
    root_department = reference_service.create_reference_item_for_actor(
        actor_user_id=context["system_admin"].id,
        list_id=root_departments.id,
        code="root-admin",
        label="Root Admin",
    )
    child_departments = reference_service.create_reference_list_for_actor(
        actor_user_id=context["system_admin"].id,
        registry_id=context["registry"].id,
        owner_organization_id=context["child"].id,
        code="departments",
        name="Child departments",
        inherit_to_descendants=True,
        locked_for_descendants=False,
    )
    child_department = reference_service.create_reference_item_for_actor(
        actor_user_id=context["system_admin"].id,
        list_id=child_departments.id,
        code="child-admin",
        label="Child Admin",
    )
    field = schema_service.create_field_for_actor(
        actor_user_id=context["registry_admin"].id,
        block_id=block.id,
        code="department",
        label="Department",
        field_type="select",
        options_source_type="reference_list",
        options_source_id=root_departments.id,
        options_config_json={
            "reference_resolution": "by_card_organization",
            "allow_owner_override": True,
        },
    )
    card = card_service.create_card_for_actor(
        actor_user_id=context["org_admin"].id,
        registry_id=context["registry"].id,
        organization_id=context["child"].id,
        display_name="Local reference card",
    )

    effective_items = card_service.list_reference_items_for_card_field_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=card.id,
        field_id=field.id,
    )
    field_value = card_service.set_field_value_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=card.id,
        field_id=field.id,
        value=child_department.id,
    )

    assert [item.id for item in effective_items] == [child_department.id]
    assert field_value.value_reference_item_id == child_department.id
    with pytest.raises(InvalidFieldValueError, match="effective reference list"):
        card_service.set_field_value_for_actor(
            actor_user_id=context["org_admin"].id,
            card_id=card.id,
            field_id=field.id,
            value=root_department.id,
        )


def test_fixed_reference_list_ignores_local_override(db_session: Session) -> None:
    context = _phase_1d_context(db_session)
    schema_service = RegistrySchemaService(db_session)
    reference_service = ReferenceListService(db_session)
    card_service = CardService(db_session)
    block = schema_service.create_block_for_actor(
        actor_user_id=context["registry_admin"].id,
        registry_id=context["registry"].id,
        code="fixed_refs",
        title="Fixed references",
    )
    central_statuses = reference_service.create_reference_list_for_actor(
        actor_user_id=context["system_admin"].id,
        registry_id=context["registry"].id,
        owner_organization_id=context["root"].id,
        code="statuses",
        name="Central statuses",
        inherit_to_descendants=True,
        locked_for_descendants=True,
    )
    central_status = reference_service.create_reference_item_for_actor(
        actor_user_id=context["system_admin"].id,
        list_id=central_statuses.id,
        code="central",
        label="Central",
    )
    local_statuses = reference_service.create_reference_list_for_actor(
        actor_user_id=context["system_admin"].id,
        registry_id=context["registry"].id,
        owner_organization_id=context["child"].id,
        code="statuses",
        name="Local statuses",
    )
    local_status = reference_service.create_reference_item_for_actor(
        actor_user_id=context["system_admin"].id,
        list_id=local_statuses.id,
        code="local",
        label="Local",
    )
    field = schema_service.create_field_for_actor(
        actor_user_id=context["registry_admin"].id,
        block_id=block.id,
        code="status",
        label="Status",
        field_type="select",
        options_source_type="reference_list",
        options_source_id=central_statuses.id,
    )
    card = card_service.create_card_for_actor(
        actor_user_id=context["org_admin"].id,
        registry_id=context["registry"].id,
        organization_id=context["child"].id,
        display_name="Fixed reference card",
    )

    effective_items = card_service.list_reference_items_for_card_field_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=card.id,
        field_id=field.id,
    )
    field_value = card_service.set_field_value_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=card.id,
        field_id=field.id,
        value=central_status.id,
    )

    assert [item.id for item in effective_items] == [central_status.id]
    assert field_value.value_reference_item_id == central_status.id
    with pytest.raises(InvalidFieldValueError, match="configured list"):
        card_service.set_field_value_for_actor(
            actor_user_id=context["org_admin"].id,
            card_id=card.id,
            field_id=field.id,
            value=local_status.id,
        )


def test_org_unit_field_values_are_scoped_to_card_organization_and_keep_saved_archived_option(
    db_session: Session,
) -> None:
    context = _phase_1d_context(db_session)
    organization_service = OrganizationService(db_session)
    schema_service = RegistrySchemaService(db_session)
    card_service = CardService(db_session)
    block = schema_service.create_block_for_actor(
        actor_user_id=context["registry_admin"].id,
        registry_id=context["registry"].id,
        code="organization_units",
        title="Organization units",
    )
    field = schema_service.create_field_for_actor(
        actor_user_id=context["registry_admin"].id,
        block_id=block.id,
        code="responsible_unit",
        label="Responsible unit",
        field_type="org_unit_ref",
    )
    active_management = organization_service.create_org_unit(
        organization_id=context["child"].id,
        code="management",
        name="Management",
        unit_type="management",
        created_by=context["system_admin"].id,
    )
    active_department = organization_service.create_org_unit(
        organization_id=context["child"].id,
        parent_id=active_management.id,
        code="department",
        name="Department",
        unit_type="department",
        created_by=context["system_admin"].id,
    )
    historical_management = organization_service.create_org_unit(
        organization_id=context["child"].id,
        code="historical-management",
        name="Historical management",
        unit_type="management",
        created_by=context["system_admin"].id,
    )
    foreign_unit = organization_service.create_org_unit(
        organization_id=context["sibling"].id,
        code="foreign-management",
        name="Foreign management",
        unit_type="management",
        created_by=context["system_admin"].id,
    )
    card = card_service.create_card_for_actor(
        actor_user_id=context["org_admin"].id,
        registry_id=context["registry"].id,
        organization_id=context["child"].id,
        display_name="Scoped organization unit card",
    )

    card_service.set_field_value_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=card.id,
        field_id=field.id,
        value=historical_management.id,
    )
    organization_service.archive_org_unit_for_actor(
        actor_user_id=context["system_admin"].id,
        org_unit_id=historical_management.id,
    )

    with pytest.raises(InvalidFieldValueError):
        card_service.set_field_value_for_actor(
            actor_user_id=context["org_admin"].id,
            card_id=card.id,
            field_id=field.id,
            value=foreign_unit.id,
        )
    with pytest.raises(InvalidFieldValueError):
        card_service.set_field_value_for_actor(
            actor_user_id=context["org_admin"].id,
            card_id=card.id,
            field_id=field.id,
            value=historical_management.id,
        )

    options = card_service.list_org_unit_options_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=card.id,
        field_id=field.id,
    )

    assert [(option.id, option.label, option.archived) for option in options] == [
        (active_management.id, "Management", False),
        (active_department.id, "Management → Department", False),
        (historical_management.id, "Historical management", True),
    ]

    colliding_management = organization_service.create_org_unit(
        organization_id=context["child"].id,
        code="management-department-label",
        name="Management → Department",
        unit_type="management",
        created_by=context["system_admin"].id,
    )
    collision_options = card_service.list_org_unit_options_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=card.id,
        field_id=field.id,
    )
    collision_labels_by_id = {option.id: option.label for option in collision_options}

    assert collision_labels_by_id[colliding_management.id] == "Management → Department (Управление)"
    assert collision_labels_by_id[active_department.id] == "Management → Department (Отдел)"


def test_old_cards_show_new_fields_as_null_without_mass_value_rows(
    db_session: Session,
) -> None:
    context = _phase_1d_context(db_session)
    schema_service = RegistrySchemaService(db_session)
    card_service = CardService(db_session)
    block = schema_service.create_block_for_actor(
        actor_user_id=context["registry_admin"].id,
        registry_id=context["registry"].id,
        code="late-fields",
        title="Late fields",
    )
    existing_field = schema_service.create_field_for_actor(
        actor_user_id=context["registry_admin"].id,
        block_id=block.id,
        code="existing",
        label="Existing",
        field_type="text",
    )
    card = card_service.create_card_for_actor(
        actor_user_id=context["org_admin"].id,
        registry_id=context["registry"].id,
        organization_id=context["child"].id,
        display_name="Old card",
    )
    card_service.set_field_value_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=card.id,
        field_id=existing_field.id,
        value="existing value",
    )

    new_field = schema_service.create_field_for_actor(
        actor_user_id=context["registry_admin"].id,
        block_id=block.id,
        code="added_later",
        label="Added later",
        field_type="text",
    )
    card_read = card_service.read_card_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=card.id,
    )

    assert card_read.fields["existing"].value == "existing value"
    assert card_read.fields["added_later"].value is None
    assert (
        db_session.scalar(
            select(func.count())
            .select_from(FieldValue)
            .where(FieldValue.card_id == card.id, FieldValue.field_id == new_field.id)
        )
        == 0
    )


def test_archived_schema_and_cards_remain_in_database(db_session: Session) -> None:
    context = _phase_1d_context(db_session)
    schema_service = RegistrySchemaService(db_session)
    card_service = CardService(db_session)
    block = schema_service.create_block_for_actor(
        actor_user_id=context["registry_admin"].id,
        registry_id=context["registry"].id,
        code="archive",
        title="Archive",
    )
    field = schema_service.create_field_for_actor(
        actor_user_id=context["registry_admin"].id,
        block_id=block.id,
        code="archived_field",
        label="Archived field",
        field_type="text",
    )
    card = card_service.create_card_for_actor(
        actor_user_id=context["org_admin"].id,
        registry_id=context["registry"].id,
        organization_id=context["child"].id,
        display_name="Archive card",
    )

    archived_block = schema_service.archive_block_for_actor(
        actor_user_id=context["registry_admin"].id,
        block_id=block.id,
    )
    archived_card = card_service.archive_card_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=card.id,
    )

    assert archived_block.archived_at is not None
    assert archived_card.archived_at is not None
    assert archived_card.lifecycle_status == "archived"
    assert db_session.get(FormBlock, block.id) is not None
    assert db_session.get(FormField, field.id) is not None
    assert db_session.get(Card, card.id) is not None


def test_archiving_a_field_retains_filled_values_and_deletes_empty_rows(
    db_session: Session,
) -> None:
    context = _phase_1d_context(db_session)
    schema_service = RegistrySchemaService(db_session)
    card_service = CardService(db_session)
    block = schema_service.create_block_for_actor(
        actor_user_id=context["registry_admin"].id,
        registry_id=context["registry"].id,
        code="archive-values",
        title="Archive values",
    )
    field = schema_service.create_field_for_actor(
        actor_user_id=context["registry_admin"].id,
        block_id=block.id,
        code="archive-value",
        label="Archive value",
        field_type="text",
    )
    filled_card = card_service.create_card_for_actor(
        actor_user_id=context["org_admin"].id,
        registry_id=context["registry"].id,
        organization_id=context["child"].id,
        display_name="Filled archive value",
    )
    empty_card = card_service.create_card_for_actor(
        actor_user_id=context["org_admin"].id,
        registry_id=context["registry"].id,
        organization_id=context["child"].id,
        display_name="Empty archive value",
    )
    retained_value = card_service.set_field_value_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=filled_card.id,
        field_id=field.id,
        value="Keep this value",
    )
    empty_instance = db_session.scalar(
        select(CardBlockInstance).where(
            CardBlockInstance.card_id == empty_card.id,
            CardBlockInstance.block_id == block.id,
        )
    )
    assert empty_instance is not None
    empty_value = FieldValue(
        card_id=empty_card.id,
        block_instance_id=empty_instance.id,
        field_id=field.id,
        created_by=context["org_admin"].id,
        updated_by=context["org_admin"].id,
    )
    db_session.add(empty_value)
    db_session.flush()

    archived_field = schema_service.archive_field_for_actor(
        actor_user_id=context["registry_admin"].id,
        field_id=field.id,
    )

    assert archived_field.archived_at is not None
    assert db_session.get(FieldValue, retained_value.id) is not None
    assert db_session.get(FieldValue, empty_value.id) is None
    archive_event = db_session.scalar(
        select(AuditEvent).where(
            AuditEvent.object_type == "form_field",
            AuditEvent.object_id == field.id,
            AuditEvent.action == "archive",
        )
    )
    assert archive_event is not None
    assert archive_event.new_data_json == {
        "deleted_empty_value_count": 1,
        "retained_value_count": 1,
    }
