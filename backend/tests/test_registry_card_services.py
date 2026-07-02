import os
from collections.abc import Iterator
from datetime import UTC, date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any
from uuid import UUID

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import Session

from app.models import (
    AccessGrant,
    AuditEvent,
    Card,
    CardTemplate,
    FieldValue,
    FieldValueItem,
    FormBlock,
    FormField,
    Organization,
    Permission,
    Registry,
    Role,
    User,
    role_permissions,
)
from app.services.cards import (
    BulkFieldValueInput,
    CardService,
    CardServiceError,
    InvalidFieldValueError,
)
from app.services.organizations import OrganizationService
from app.services.permissions import PermissionDeniedError
from app.services.references import ReferenceListService
from app.services.registry_schema import RegistrySchemaError, RegistrySchemaService


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


def test_card_activation_validates_publish_required_fields(db_session: Session) -> None:
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

    with pytest.raises(InvalidFieldValueError, match="Publish text"):
        card_service.update_card_for_actor(
            actor_user_id=context["org_admin"].id,
            card_id=card.id,
            lifecycle_status="active",
        )

    card_service.set_field_values_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=card.id,
        values=[
            BulkFieldValueInput(field_id=field.id, value="ready"),
        ],
    )
    updated = card_service.update_card_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=card.id,
        lifecycle_status="active",
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
