import os
from collections.abc import Iterator
from pathlib import Path
from types import SimpleNamespace
from typing import Any
from uuid import UUID

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core import database
from app.domain.constants import FIELD_TYPES
from app.models import (
    AccessGrant,
    CardBlockInstance,
    FieldValue,
    FieldValueItem,
    Permission,
    ReferenceList,
    Registry,
    Role,
    User,
    role_permissions,
)
from app.services.cards import CardService, CardServiceError
from app.services.organizations import OrganizationService
from app.services.permissions import PermissionDeniedError
from app.services.references import ReferenceListService
from app.services.registry_schema import RegistrySchemaError, RegistrySchemaService


def _require_test_database_url() -> str:
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is required for disposable PostgreSQL hardening tests.")

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


def _hardening_context(db_session: Session) -> dict[str, Any]:
    system_admin = _create_user(db_session, "hardening-system@example.test", is_superuser=True)
    registry_admin = _create_user(db_session, "hardening-registry-admin@example.test")
    org_admin = _create_user(db_session, "hardening-org-admin@example.test")
    child_admin = _create_user(db_session, "hardening-child-admin@example.test")
    schema_role = _create_role_with_permissions(
        db_session,
        "hardening_schema_admin",
        ["registry.schema.manage"],
    )
    card_role = _create_role_with_permissions(
        db_session,
        "hardening_card_admin",
        ["cards.manage"],
    )

    organization_service = OrganizationService(db_session)
    root = organization_service.create_root_for_actor(
        actor_user_id=system_admin.id,
        code="hardening-root",
        name="Hardening Root",
    )
    child = organization_service.create_child(
        parent_id=root.id,
        code="hardening-child",
        name="Hardening Child",
        created_by=system_admin.id,
    )
    sibling = organization_service.create_child(
        parent_id=root.id,
        code="hardening-sibling",
        name="Hardening Sibling",
        created_by=system_admin.id,
    )
    org_unit = organization_service.create_org_unit(
        organization_id=child.id,
        code="hardening-unit",
        name="Hardening Unit",
        created_by=system_admin.id,
    )
    schema_service = RegistrySchemaService(db_session)
    registry = schema_service.create_registry_for_actor(
        actor_user_id=system_admin.id,
        code="hardening-registry",
        name="Hardening Registry",
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
    _grant_access(
        db_session,
        user_id=child_admin.id,
        role_id=schema_role.id,
        organization_id=child.id,
        registry_id=registry.id,
        include_descendants=True,
        created_by=system_admin.id,
    )
    _grant_access(
        db_session,
        user_id=child_admin.id,
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
        "child_admin": child_admin,
        "root": root,
        "child": child,
        "sibling": sibling,
        "org_unit": org_unit,
        "registry": registry,
    }


def test_core_schema_migration_no_longer_uses_metadata_create_all_strategy() -> None:
    migration = (
        Path(__file__).resolve().parents[1] / "migrations/versions/0002_core_schema_v1.py"
    ).read_text(encoding="utf-8")

    assert "Base.metadata.create_all" not in migration
    assert "Base.metadata.drop_all" not in migration


def test_database_engine_and_sessionmaker_are_cached() -> None:
    database.dispose_cached_database_resources()
    url = "postgresql+psycopg://user:password@localhost:5432/reg_engine_cache_test"

    engine_a = database.create_database_engine(url)
    engine_b = database.create_database_engine(url)
    session_factory_a = database.create_session_factory(engine_a)
    session_factory_b = database.create_session_factory(engine_a)

    try:
        assert engine_a is engine_b
        assert session_factory_a is session_factory_b
    finally:
        database.dispose_cached_database_resources()


def test_field_type_naming_is_number_and_bool() -> None:
    assert "number" in FIELD_TYPES
    assert "bool" in FIELD_TYPES
    assert "decimal" not in FIELD_TYPES
    assert "boolean" not in FIELD_TYPES


def test_ref_field_types_save_to_dedicated_columns(db_session: Session) -> None:
    context = _hardening_context(db_session)
    schema_service = RegistrySchemaService(db_session)
    card_service = CardService(db_session)
    block = schema_service.create_block_for_actor(
        actor_user_id=context["registry_admin"].id,
        registry_id=context["registry"].id,
        code="refs",
        title="Refs",
    )
    fields = {
        field_type: schema_service.create_field_for_actor(
            actor_user_id=context["registry_admin"].id,
            block_id=block.id,
            code=f"{field_type}_field",
            label=field_type,
            field_type=field_type,
        )
        for field_type in [
            "organization_ref",
            "org_unit_ref",
            "user_ref",
            "card_ref",
            "registry_ref",
        ]
    }
    target_card = card_service.create_card_for_actor(
        actor_user_id=context["org_admin"].id,
        registry_id=context["registry"].id,
        organization_id=context["child"].id,
        display_name="Target Card",
    )
    card = card_service.create_card_for_actor(
        actor_user_id=context["org_admin"].id,
        registry_id=context["registry"].id,
        organization_id=context["child"].id,
        display_name="Ref Card",
    )

    values = {
        "organization_ref": card_service.set_field_value_for_actor(
            actor_user_id=context["org_admin"].id,
            card_id=card.id,
            field_id=fields["organization_ref"].id,
            value=context["child"].id,
        ),
        "org_unit_ref": card_service.set_field_value_for_actor(
            actor_user_id=context["org_admin"].id,
            card_id=card.id,
            field_id=fields["org_unit_ref"].id,
            value=context["org_unit"].id,
        ),
        "user_ref": card_service.set_field_value_for_actor(
            actor_user_id=context["org_admin"].id,
            card_id=card.id,
            field_id=fields["user_ref"].id,
            value=context["org_admin"].id,
        ),
        "card_ref": card_service.set_field_value_for_actor(
            actor_user_id=context["org_admin"].id,
            card_id=card.id,
            field_id=fields["card_ref"].id,
            value=target_card.id,
        ),
        "registry_ref": card_service.set_field_value_for_actor(
            actor_user_id=context["org_admin"].id,
            card_id=card.id,
            field_id=fields["registry_ref"].id,
            value=context["registry"].id,
        ),
    }

    assert values["organization_ref"].value_organization_id == context["child"].id
    assert values["org_unit_ref"].value_org_unit_id == context["org_unit"].id
    assert values["user_ref"].value_user_id == context["org_admin"].id
    assert values["card_ref"].value_card_id == target_card.id
    assert values["registry_ref"].value_registry_id == context["registry"].id


def test_optional_ref_field_types_can_be_cleared(db_session: Session) -> None:
    context = _hardening_context(db_session)
    schema_service = RegistrySchemaService(db_session)
    card_service = CardService(db_session)
    block = schema_service.create_block_for_actor(
        actor_user_id=context["registry_admin"].id,
        registry_id=context["registry"].id,
        code="clear_refs",
        title="Clear refs",
    )
    card_ref_field = schema_service.create_field_for_actor(
        actor_user_id=context["registry_admin"].id,
        block_id=block.id,
        code="card_ref_clear",
        label="Card ref clear",
        field_type="card_ref",
    )
    target_card = card_service.create_card_for_actor(
        actor_user_id=context["org_admin"].id,
        registry_id=context["registry"].id,
        organization_id=context["child"].id,
        display_name="Target card",
    )
    card = card_service.create_card_for_actor(
        actor_user_id=context["org_admin"].id,
        registry_id=context["registry"].id,
        organization_id=context["child"].id,
        display_name="Optional ref card",
    )

    saved = card_service.set_field_value_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=card.id,
        field_id=card_ref_field.id,
        value=target_card.id,
    )
    assert saved.value_card_id == target_card.id

    cleared = card_service.set_field_value_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=card.id,
        field_id=card_ref_field.id,
        value=None,
    )

    assert cleared.value_card_id is None


def test_repeatable_blocks_allow_multiple_instances_but_non_repeatable_stays_single(
    db_session: Session,
) -> None:
    context = _hardening_context(db_session)
    schema_service = RegistrySchemaService(db_session)
    card_service = CardService(db_session)
    repeatable = schema_service.create_block_for_actor(
        actor_user_id=context["registry_admin"].id,
        registry_id=context["registry"].id,
        code="addresses",
        title="Addresses",
        is_repeatable=True,
    )
    single = schema_service.create_block_for_actor(
        actor_user_id=context["registry_admin"].id,
        registry_id=context["registry"].id,
        code="identity",
        title="Identity",
        is_repeatable=False,
    )
    repeat_field = schema_service.create_field_for_actor(
        actor_user_id=context["registry_admin"].id,
        block_id=repeatable.id,
        code="line",
        label="Line",
        field_type="text",
    )
    card = card_service.create_card_for_actor(
        actor_user_id=context["org_admin"].id,
        registry_id=context["registry"].id,
        organization_id=context["child"].id,
        display_name="Repeatable Card",
    )

    instance_a = card_service.create_block_instance_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=card.id,
        block_id=repeatable.id,
    )
    instance_b = card_service.create_block_instance_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=card.id,
        block_id=repeatable.id,
    )
    single_instance = card_service.create_block_instance_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=card.id,
        block_id=single.id,
    )

    card_service.set_field_value_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=card.id,
        field_id=repeat_field.id,
        value="A",
        block_instance_id=instance_a.id,
    )
    card_service.set_field_value_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=card.id,
        field_id=repeat_field.id,
        value="B",
        block_instance_id=instance_b.id,
    )

    assert instance_a.id != instance_b.id
    assert [instance_a.ordinal, instance_b.ordinal] == [0, 1]
    with pytest.raises(CardServiceError):
        card_service.create_block_instance_for_actor(
            actor_user_id=context["org_admin"].id,
            card_id=card.id,
            block_id=single.id,
        )
    assert db_session.get(CardBlockInstance, single_instance.id) is not None


def test_card_read_is_nested_by_block_instance_and_handles_duplicate_field_codes(
    db_session: Session,
) -> None:
    context = _hardening_context(db_session)
    schema_service = RegistrySchemaService(db_session)
    card_service = CardService(db_session)
    hardware_block = schema_service.create_block_for_actor(
        actor_user_id=context["registry_admin"].id,
        registry_id=context["registry"].id,
        code="hardware",
        title="Hardware",
    )
    software_block = schema_service.create_block_for_actor(
        actor_user_id=context["registry_admin"].id,
        registry_id=context["registry"].id,
        code="software",
        title="Software",
    )
    hardware_status = schema_service.create_field_for_actor(
        actor_user_id=context["registry_admin"].id,
        block_id=hardware_block.id,
        code="status",
        label="Status",
        field_type="text",
    )
    software_status = schema_service.create_field_for_actor(
        actor_user_id=context["registry_admin"].id,
        block_id=software_block.id,
        code="status",
        label="Status",
        field_type="text",
    )
    card = card_service.create_card_for_actor(
        actor_user_id=context["org_admin"].id,
        registry_id=context["registry"].id,
        organization_id=context["child"].id,
        display_name="Nested Card",
    )
    card_service.set_field_value_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=card.id,
        field_id=hardware_status.id,
        value="in-stock",
    )
    card_service.set_field_value_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=card.id,
        field_id=software_status.id,
        value="licensed",
    )

    card_read = card_service.read_card_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=card.id,
    )

    assert card_read.blocks["hardware"].instances[0].fields["status"].value == "in-stock"
    assert card_read.blocks["software"].instances[0].fields["status"].value == "licensed"


def test_superseded_cards_are_readable_only_in_archive_scope_and_not_editable(
    db_session: Session,
) -> None:
    context = _hardening_context(db_session)
    schema_service = RegistrySchemaService(db_session)
    card_service = CardService(db_session)
    block = schema_service.create_block_for_actor(
        actor_user_id=context["registry_admin"].id,
        registry_id=context["registry"].id,
        code="main",
        title="Main",
        public_editable=True,
    )
    field = schema_service.create_field_for_actor(
        actor_user_id=context["registry_admin"].id,
        block_id=block.id,
        code="name",
        label="Name",
        field_type="text",
        public_editable=True,
    )
    old_card = card_service.create_card_for_actor(
        actor_user_id=context["org_admin"].id,
        registry_id=context["registry"].id,
        organization_id=context["child"].id,
        display_name="Old Card",
        public_edit_enabled=True,
    )

    card_service.transfer_card_for_actor(
        actor_user_id=context["system_admin"].id,
        card_id=old_card.id,
        target_organization_id=context["sibling"].id,
    )

    with pytest.raises(CardServiceError):
        card_service.read_card_for_actor(actor_user_id=context["org_admin"].id, card_id=old_card.id)

    archived_read = card_service.read_card_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=old_card.id,
        include_archive=True,
    )
    assert archived_read.card_id == old_card.id

    with pytest.raises(CardServiceError):
        card_service.set_field_value_for_actor(
            actor_user_id=context["org_admin"].id,
            card_id=old_card.id,
            field_id=field.id,
            value="blocked",
        )
    with pytest.raises(CardServiceError):
        card_service.transfer_card_for_actor(
            actor_user_id=context["system_admin"].id,
            card_id=old_card.id,
            target_organization_id=context["child"].id,
        )


def test_transfer_copies_dynamic_values_and_multi_select_items(db_session: Session) -> None:
    context = _hardening_context(db_session)
    schema_service = RegistrySchemaService(db_session)
    reference_service = ReferenceListService(db_session)
    card_service = CardService(db_session)
    block = schema_service.create_block_for_actor(
        actor_user_id=context["registry_admin"].id,
        registry_id=context["registry"].id,
        code="copy",
        title="Copy",
    )
    text_field = schema_service.create_field_for_actor(
        actor_user_id=context["registry_admin"].id,
        block_id=block.id,
        code="serial",
        label="Serial",
        field_type="text",
    )
    reference_list = reference_service.create_reference_list_for_actor(
        actor_user_id=context["registry_admin"].id,
        registry_id=context["registry"].id,
        code="copy-tags",
        name="Copy Tags",
    )
    tag_a = reference_service.create_reference_item_for_actor(
        actor_user_id=context["registry_admin"].id,
        list_id=reference_list.id,
        code="a",
        label="A",
    )
    tag_b = reference_service.create_reference_item_for_actor(
        actor_user_id=context["registry_admin"].id,
        list_id=reference_list.id,
        code="b",
        label="B",
    )
    multi_field = schema_service.create_field_for_actor(
        actor_user_id=context["registry_admin"].id,
        block_id=block.id,
        code="tags",
        label="Tags",
        field_type="multi_select",
        options_source_type="reference_list",
        options_source_id=reference_list.id,
    )
    old_card = card_service.create_card_for_actor(
        actor_user_id=context["org_admin"].id,
        registry_id=context["registry"].id,
        organization_id=context["child"].id,
        display_name="Transfer Copy",
    )
    card_service.set_field_value_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=old_card.id,
        field_id=text_field.id,
        value="SN-COPY",
    )
    card_service.set_field_value_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=old_card.id,
        field_id=multi_field.id,
        value=[tag_a.id, tag_b.id],
    )

    new_card = card_service.transfer_card_for_actor(
        actor_user_id=context["system_admin"].id,
        card_id=old_card.id,
        target_organization_id=context["sibling"].id,
    )

    copied_values = {
        value.field_id: value
        for value in db_session.scalars(select(FieldValue).where(FieldValue.card_id == new_card.id))
    }
    copied_items = db_session.scalars(
        select(FieldValueItem.reference_item_id).where(
            FieldValueItem.field_value_id == copied_values[multi_field.id].id
        )
    ).all()
    assert copied_values[text_field.id].value_text == "SN-COPY"
    assert copied_items == [tag_a.id, tag_b.id]


def test_reference_list_inheritance_allows_use_but_blocks_locked_descendant_edits(
    db_session: Session,
) -> None:
    context = _hardening_context(db_session)
    schema_service = RegistrySchemaService(db_session)
    reference_service = ReferenceListService(db_session)
    card_service = CardService(db_session)
    inherited_list = reference_service.create_reference_list_for_actor(
        actor_user_id=context["system_admin"].id,
        registry_id=context["registry"].id,
        owner_organization_id=context["root"].id,
        code="inherited",
        name="Inherited",
        inherit_to_descendants=True,
        locked_for_descendants=True,
    )
    inherited_item = reference_service.create_reference_item_for_actor(
        actor_user_id=context["system_admin"].id,
        list_id=inherited_list.id,
        code="one",
        label="One",
    )
    available = reference_service.list_available_reference_lists_for_actor(
        actor_user_id=context["child_admin"].id,
        registry_id=context["registry"].id,
        organization_id=context["child"].id,
    )
    block = schema_service.create_block_for_actor(
        actor_user_id=context["registry_admin"].id,
        registry_id=context["registry"].id,
        code="inheritance",
        title="Inheritance",
    )
    field = schema_service.create_field_for_actor(
        actor_user_id=context["registry_admin"].id,
        block_id=block.id,
        code="inherited_select",
        label="Inherited select",
        field_type="select",
        options_source_type="reference_list",
        options_source_id=inherited_list.id,
    )
    card = card_service.create_card_for_actor(
        actor_user_id=context["child_admin"].id,
        registry_id=context["registry"].id,
        organization_id=context["child"].id,
        display_name="Inherited List Card",
    )

    value = card_service.set_field_value_for_actor(
        actor_user_id=context["child_admin"].id,
        card_id=card.id,
        field_id=field.id,
        value=inherited_item.id,
    )

    assert inherited_list.id in {reference_list.id for reference_list in available}
    assert value.value_reference_item_id == inherited_item.id
    with pytest.raises(PermissionDeniedError):
        reference_service.create_reference_item_for_actor(
            actor_user_id=context["child_admin"].id,
            list_id=inherited_list.id,
            code="blocked",
            label="Blocked",
        )


def test_reference_list_update_metadata_fields_without_database(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    actor_user_id = UUID("11111111-1111-4111-8111-111111111111")
    list_id = UUID("22222222-2222-4222-8222-222222222222")
    root_id = UUID("33333333-3333-4333-8333-333333333333")
    reference_list = SimpleNamespace(
        id=list_id,
        registry_id=UUID("44444444-4444-4444-8444-444444444444"),
        name="Metadata",
        description=None,
        owner_organization_id=root_id,
        inherit_to_descendants=True,
        locked_for_descendants=True,
        managed_by_system_only=False,
    )

    class FakeSession:
        def __init__(self) -> None:
            self.flushed = False

        def flush(self) -> None:
            self.flushed = True

    class FakeAuditService:
        def __init__(self, session: FakeSession) -> None:
            self.session = session

        def record_user_event(self, **_kwargs: object) -> None:
            return None

    fake_session = FakeSession()
    service = ReferenceListService(fake_session)  # type: ignore[arg-type]
    monkeypatch.setattr(service, "_get_active_reference_list", lambda _list_id: reference_list)
    monkeypatch.setattr(
        service,
        "_require_reference_edit_permission",
        lambda _actor_user_id, _reference_list: None,
    )
    monkeypatch.setattr(
        service,
        "_require_reference_create_permission",
        lambda _actor_user_id, *, registry_id, owner_organization_id: None,
    )
    monkeypatch.setattr("app.services.references.AuditService", FakeAuditService)

    updated = service.update_reference_list_for_actor(
        actor_user_id=actor_user_id,
        list_id=list_id,
        owner_organization_id=None,
        inherit_to_descendants=False,
        locked_for_descendants=False,
        managed_by_system_only=True,
    )

    assert updated.owner_organization_id is None
    assert updated.inherit_to_descendants is False
    assert updated.locked_for_descendants is False
    assert updated.managed_by_system_only is True
    assert fake_session.flushed is True


def test_reference_list_update_can_change_existing_metadata_fields(db_session: Session) -> None:
    context = _hardening_context(db_session)
    reference_service = ReferenceListService(db_session)
    reference_list = reference_service.create_reference_list_for_actor(
        actor_user_id=context["system_admin"].id,
        registry_id=context["registry"].id,
        owner_organization_id=context["root"].id,
        code="metadata",
        name="Metadata",
        inherit_to_descendants=True,
        locked_for_descendants=True,
    )

    updated = reference_service.update_reference_list_for_actor(
        actor_user_id=context["system_admin"].id,
        list_id=reference_list.id,
        owner_organization_id=context["child"].id,
        inherit_to_descendants=False,
        locked_for_descendants=False,
        managed_by_system_only=True,
    )

    assert updated.owner_organization_id == context["child"].id
    assert updated.inherit_to_descendants is False
    assert updated.locked_for_descendants is False
    assert updated.managed_by_system_only is True


def test_reference_list_read_allows_registry_card_actor_without_edit_permission(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    actor_user_id = UUID("11111111-1111-4111-8111-111111111111")
    list_id = UUID("22222222-2222-4222-8222-222222222222")
    registry_id = UUID("33333333-3333-4333-8333-333333333333")
    reference_list = SimpleNamespace(
        id=list_id,
        registry_id=registry_id,
        owner_organization_id=None,
        managed_by_system_only=False,
    )

    class FakePermissionService:
        def __init__(self, session: object) -> None:
            self.session = session

        def is_superuser(self, user_id: UUID) -> bool:
            assert user_id == actor_user_id
            return False

        def has_permission(
            self,
            user_id: UUID,
            permission_code: str,
            *,
            organization_id: UUID | None = None,
            registry_id: UUID | None = None,
        ) -> bool:
            assert user_id == actor_user_id
            assert organization_id is None
            assert registry_id == reference_list.registry_id
            return permission_code == "cards.manage"

    service = ReferenceListService(session=object())  # type: ignore[arg-type]
    monkeypatch.setattr(service, "_get_active_reference_list", lambda object_id: reference_list)
    monkeypatch.setattr("app.services.references.PermissionService", FakePermissionService)

    assert (
        service.read_reference_list_for_actor(actor_user_id=actor_user_id, list_id=list_id)
        is reference_list
    )


def test_unique_indexes_handle_nullable_registry_and_organization_scope(
    db_session: Session,
) -> None:
    context = _hardening_context(db_session)
    second_registry = Registry(
        code="hardening-second-registry",
        name="Hardening Second Registry",
        created_by=context["system_admin"].id,
    )
    db_session.add(second_registry)
    db_session.flush()
    role = _create_role_with_permissions(db_session, "hardening_extra_role", ["cards.read"])

    _grant_access(
        db_session,
        user_id=context["org_admin"].id,
        role_id=role.id,
        organization_id=context["child"].id,
        registry_id=context["registry"].id,
        created_by=context["system_admin"].id,
    )
    _grant_access(
        db_session,
        user_id=context["org_admin"].id,
        role_id=role.id,
        organization_id=context["child"].id,
        registry_id=second_registry.id,
        created_by=context["system_admin"].id,
    )
    with pytest.raises(IntegrityError):
        _grant_access(
            db_session,
            user_id=context["org_admin"].id,
            role_id=role.id,
            organization_id=context["child"].id,
            registry_id=context["registry"].id,
            created_by=context["system_admin"].id,
        )

    db_session.rollback()
    duplicate_a = ReferenceList(code="global-dup", name="Global Dup A")
    duplicate_b = ReferenceList(code="global-dup", name="Global Dup B")
    db_session.add_all([duplicate_a, duplicate_b])
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_locked_blocks_and_fields_cannot_be_updated_or_archived_by_normal_methods(
    db_session: Session,
) -> None:
    context = _hardening_context(db_session)
    schema_service = RegistrySchemaService(db_session)
    block = schema_service.create_block_for_actor(
        actor_user_id=context["registry_admin"].id,
        registry_id=context["registry"].id,
        code="locked-block",
        title="Locked Block",
        is_locked=True,
    )
    field = schema_service.create_field_for_actor(
        actor_user_id=context["registry_admin"].id,
        block_id=block.id,
        code="locked_field",
        label="Locked Field",
        field_type="text",
        is_locked=True,
    )

    with pytest.raises(RegistrySchemaError):
        schema_service.update_block_for_actor(
            actor_user_id=context["registry_admin"].id,
            block_id=block.id,
            title="Blocked",
        )
    with pytest.raises(RegistrySchemaError):
        schema_service.archive_block_for_actor(
            actor_user_id=context["registry_admin"].id,
            block_id=block.id,
        )
    with pytest.raises(RegistrySchemaError):
        schema_service.update_field_for_actor(
            actor_user_id=context["registry_admin"].id,
            field_id=field.id,
            label="Blocked",
        )
    with pytest.raises(RegistrySchemaError):
        schema_service.archive_field_for_actor(
            actor_user_id=context["registry_admin"].id,
            field_id=field.id,
        )
