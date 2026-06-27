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
    Card,
    FieldValue,
    FieldValueItem,
    FormBlock,
    FormField,
    Permission,
    Role,
    User,
    role_permissions,
)
from app.services.cards import CardService, InvalidFieldValueError
from app.services.organizations import OrganizationService
from app.services.permissions import PermissionDeniedError
from app.services.references import ReferenceListService
from app.services.registry_schema import RegistrySchemaService


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
    assert not hasattr(registry, "organization_id")


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
