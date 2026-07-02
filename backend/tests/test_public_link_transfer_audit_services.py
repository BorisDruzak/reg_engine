import os
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import UUID

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import Session

from app.models import (
    AccessGrant,
    AuditEvent,
    Card,
    CardPublicLink,
    CardRelation,
    FieldValue,
    Permission,
    ReferenceItem,
    ReferenceList,
    Role,
    User,
    role_permissions,
)
from app.services.audit import AuditService
from app.services.cards import CardService, InvalidFieldValueError
from app.services.organizations import OrganizationService
from app.services.permissions import PermissionDeniedError
from app.services.public_links import PublicLinkService, PublicLinkToken, hash_public_token
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


def _phase_1e_context(db_session: Session) -> dict[str, Any]:
    system_admin = _create_user(db_session, "phase1e-system@example.test", is_superuser=True)
    registry_admin = _create_user(db_session, "phase1e-registry-admin@example.test")
    source_admin = _create_user(db_session, "phase1e-source-admin@example.test")
    target_admin = _create_user(db_session, "phase1e-target-admin@example.test")
    schema_role = _create_role_with_permissions(
        db_session,
        "phase1e_schema_admin",
        ["registry.schema.manage"],
    )
    card_role = _create_role_with_permissions(
        db_session,
        "phase1e_card_admin",
        ["cards.manage"],
    )

    organization_service = OrganizationService(db_session)
    root = organization_service.create_root_for_actor(
        actor_user_id=system_admin.id,
        code="phase1e-root",
        name="Phase 1E Root",
    )
    source_org = organization_service.create_child(
        parent_id=root.id,
        code="phase1e-source",
        name="Phase 1E Source",
        created_by=system_admin.id,
    )
    target_org = organization_service.create_child(
        parent_id=root.id,
        code="phase1e-target",
        name="Phase 1E Target",
        created_by=system_admin.id,
    )

    schema_service = RegistrySchemaService(db_session)
    registry = schema_service.create_registry_for_actor(
        actor_user_id=system_admin.id,
        code="phase1e-assets",
        name="Phase 1E Assets",
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
        user_id=source_admin.id,
        role_id=card_role.id,
        organization_id=source_org.id,
        registry_id=registry.id,
        include_descendants=True,
        created_by=system_admin.id,
    )
    _grant_access(
        db_session,
        user_id=target_admin.id,
        role_id=card_role.id,
        organization_id=target_org.id,
        registry_id=registry.id,
        include_descendants=True,
        created_by=system_admin.id,
    )

    block = schema_service.create_block_for_actor(
        actor_user_id=registry_admin.id,
        registry_id=registry.id,
        code="public",
        title="Public",
        public_editable=True,
    )
    public_field = schema_service.create_field_for_actor(
        actor_user_id=registry_admin.id,
        block_id=block.id,
        code="serial_number",
        label="Serial number",
        field_type="text",
        public_editable=True,
    )
    private_field = schema_service.create_field_for_actor(
        actor_user_id=registry_admin.id,
        block_id=block.id,
        code="internal_note",
        label="Internal note",
        field_type="text",
        public_editable=False,
    )
    card = CardService(db_session).create_card_for_actor(
        actor_user_id=source_admin.id,
        registry_id=registry.id,
        organization_id=source_org.id,
        display_name="Phase 1E Card",
        public_edit_enabled=True,
    )

    return {
        "system_admin": system_admin,
        "registry_admin": registry_admin,
        "source_admin": source_admin,
        "target_admin": target_admin,
        "root": root,
        "source_org": source_org,
        "target_org": target_org,
        "registry": registry,
        "block": block,
        "public_field": public_field,
        "private_field": private_field,
        "card": card,
    }


def _audit_actions(db_session: Session) -> set[tuple[str, str]]:
    return set(db_session.execute(select(AuditEvent.object_type, AuditEvent.action)).all())


def test_admin_can_create_public_link_with_raw_token_once_and_default_expiry(
    db_session: Session,
) -> None:
    context = _phase_1e_context(db_session)
    before = datetime.now(UTC)

    created = PublicLinkService(db_session).create_public_link_for_actor(
        actor_user_id=context["source_admin"].id,
        card_id=context["card"].id,
    )

    assert isinstance(created, PublicLinkToken)
    assert created.raw_token
    assert created.public_link.token_hash == hash_public_token(created.raw_token)
    assert created.public_link.token_hash != created.raw_token
    assert created.public_link.expires_at >= before + timedelta(days=7) - timedelta(seconds=2)
    assert created.public_link.expires_at <= before + timedelta(days=7, seconds=2)
    assert db_session.get(CardPublicLink, created.public_link.id).token_hash != created.raw_token
    assert ("card_public_link", "create") in _audit_actions(db_session)


def test_public_link_edits_only_public_editable_fields_and_respects_card_toggle(
    db_session: Session,
) -> None:
    context = _phase_1e_context(db_session)
    public_link_service = PublicLinkService(db_session)
    created = public_link_service.create_public_link_for_actor(
        actor_user_id=context["source_admin"].id,
        card_id=context["card"].id,
    )

    value = public_link_service.edit_card_field_with_token(
        raw_token=created.raw_token,
        field_id=context["public_field"].id,
        value="SN-PUBLIC",
    )

    assert value.value_text == "SN-PUBLIC"
    assert created.public_link.used_count == 1
    assert ("field_value", "public_link.update") in _audit_actions(db_session)

    with pytest.raises(PermissionDeniedError):
        public_link_service.edit_card_field_with_token(
            raw_token=created.raw_token,
            field_id=context["private_field"].id,
            value="hidden",
        )

    context["card"].public_edit_enabled = False
    db_session.flush()
    with pytest.raises(PermissionDeniedError):
        public_link_service.edit_card_field_with_token(
            raw_token=created.raw_token,
            field_id=context["public_field"].id,
            value="blocked",
        )


def test_public_link_preview_includes_visible_static_text_without_editing(
    db_session: Session,
) -> None:
    context = _phase_1e_context(db_session)
    static_field = RegistrySchemaService(db_session).create_field_for_actor(
        actor_user_id=context["registry_admin"].id,
        block_id=context["block"].id,
        code="instruction",
        label="Instruction",
        field_type="static_text",
        options_config_json={"static_text": "Read before editing."},
        display_config_json={
            "column_span": 2,
            "label_position": "left",
            "separator_style": "line",
        },
        public_visible=True,
        public_editable=True,
    )
    public_link_service = PublicLinkService(db_session)
    created = public_link_service.create_public_link_for_actor(
        actor_user_id=context["source_admin"].id,
        card_id=context["card"].id,
    )

    preview = public_link_service.preview_public_link(raw_token=created.raw_token)
    preview_block = next(block for block in preview.blocks if block.block_id == context["block"].id)
    preview_field = next(
        field
        for instance in preview_block.instances
        for field in instance.fields
        if field.field_id == static_field.id
    )

    assert preview_block.layout_columns == 1
    assert preview_field.field_type == "static_text"
    assert preview_field.options_config_json == {"static_text": "Read before editing."}
    assert preview_field.display_config_json == {
        "column_span": 2,
        "label_position": "left",
        "separator_style": "line",
    }
    with pytest.raises(PermissionDeniedError, match="static text"):
        public_link_service.edit_card_field_with_token(
            raw_token=created.raw_token,
            field_id=static_field.id,
            value="changed",
        )


def test_public_link_uses_card_organization_effective_reference_list(
    db_session: Session,
) -> None:
    context = _phase_1e_context(db_session)
    schema_service = RegistrySchemaService(db_session)
    reference_service = ReferenceListService(db_session)
    root_list = reference_service.create_reference_list_for_actor(
        actor_user_id=context["system_admin"].id,
        registry_id=context["registry"].id,
        owner_organization_id=context["root"].id,
        code="departments",
        name="Root departments",
        inherit_to_descendants=True,
        locked_for_descendants=True,
    )
    root_item = reference_service.create_reference_item_for_actor(
        actor_user_id=context["system_admin"].id,
        list_id=root_list.id,
        code="root",
        label="Root department",
    )
    source_list = reference_service.create_reference_list_for_actor(
        actor_user_id=context["system_admin"].id,
        registry_id=context["registry"].id,
        owner_organization_id=context["source_org"].id,
        code="departments",
        name="Source departments",
        inherit_to_descendants=True,
        locked_for_descendants=False,
    )
    source_item = reference_service.create_reference_item_for_actor(
        actor_user_id=context["system_admin"].id,
        list_id=source_list.id,
        code="source",
        label="Source department",
    )
    public_select_field = schema_service.create_field_for_actor(
        actor_user_id=context["registry_admin"].id,
        block_id=context["block"].id,
        code="department",
        label="Department",
        field_type="select",
        options_source_type="reference_list",
        options_source_id=root_list.id,
        options_config_json={
            "reference_resolution": "by_card_organization",
            "allow_owner_override": True,
        },
        public_editable=True,
    )
    public_link_service = PublicLinkService(db_session)
    created = public_link_service.create_public_link_for_actor(
        actor_user_id=context["source_admin"].id,
        card_id=context["card"].id,
    )

    preview = public_link_service.preview_public_link(raw_token=created.raw_token)
    preview_field = next(
        field
        for block in preview.blocks
        for instance in block.instances
        for field in instance.fields
        if field.field_id == public_select_field.id
    )
    field_value = public_link_service.edit_card_field_with_token(
        raw_token=created.raw_token,
        field_id=public_select_field.id,
        value=source_item.id,
    )

    assert [option.id for option in preview_field.options] == [source_item.id]
    assert field_value.value_reference_item_id == source_item.id
    with pytest.raises(InvalidFieldValueError, match="effective reference list"):
        public_link_service.edit_card_field_with_token(
            raw_token=created.raw_token,
            field_id=public_select_field.id,
            value=root_item.id,
        )


def test_transfer_creates_new_card_supersedes_old_and_preserves_archive_scope(
    db_session: Session,
) -> None:
    context = _phase_1e_context(db_session)
    card_service = CardService(db_session)

    transferred = card_service.transfer_card_for_actor(
        actor_user_id=context["system_admin"].id,
        card_id=context["card"].id,
        target_organization_id=context["target_org"].id,
    )

    old_card = db_session.get(Card, context["card"].id)
    relation = db_session.scalars(
        select(CardRelation).where(
            CardRelation.source_card_id == old_card.id,
            CardRelation.target_card_id == transferred.id,
            CardRelation.relation_type == "transferred_to",
        )
    ).one()
    visible_archive_ids = {
        card.id
        for card in card_service.list_visible_cards(
            actor_user_id=context["source_admin"].id,
            registry_id=context["registry"].id,
            include_archive=True,
        )
    }
    visible_active_ids = {
        card.id
        for card in card_service.list_visible_cards(
            actor_user_id=context["source_admin"].id,
            registry_id=context["registry"].id,
        )
    }

    assert transferred.id != context["card"].id
    assert transferred.organization_id == context["target_org"].id
    assert old_card.lifecycle_status == "superseded"
    assert relation.created_by == context["system_admin"].id
    assert old_card.id in visible_archive_ids
    assert old_card.id not in visible_active_ids
    assert transferred.id not in visible_archive_ids
    assert ("card", "transfer") in _audit_actions(db_session)


def test_audit_events_are_written_for_core_create_update_archive_actions(
    db_session: Session,
) -> None:
    context = _phase_1e_context(db_session)
    organization_service = OrganizationService(db_session)
    schema_service = RegistrySchemaService(db_session)
    reference_service = ReferenceListService(db_session)
    card_service = CardService(db_session)
    public_link_service = PublicLinkService(db_session)

    audit_org = organization_service.create_child_for_actor(
        actor_user_id=context["system_admin"].id,
        parent_id=context["root"].id,
        code="phase1e-audit-org",
        name="Phase 1E Audit Org",
    )
    organization_service.update_organization_for_actor(
        actor_user_id=context["system_admin"].id,
        organization_id=audit_org.id,
        name="Phase 1E Audit Org Updated",
    )
    organization_service.archive_organization_for_actor(
        actor_user_id=context["system_admin"].id,
        organization_id=audit_org.id,
    )
    block = schema_service.update_block_for_actor(
        actor_user_id=context["registry_admin"].id,
        block_id=context["block"].id,
        title="Public Updated",
    )
    schema_service.archive_field_for_actor(
        actor_user_id=context["registry_admin"].id,
        field_id=context["private_field"].id,
    )
    reference_list = reference_service.create_reference_list_for_actor(
        actor_user_id=context["registry_admin"].id,
        registry_id=context["registry"].id,
        code="phase1e-list",
        name="Phase 1E List",
    )
    reference_service.update_reference_list_for_actor(
        actor_user_id=context["registry_admin"].id,
        list_id=reference_list.id,
        name="Phase 1E List Updated",
    )
    reference_item = reference_service.create_reference_item_for_actor(
        actor_user_id=context["registry_admin"].id,
        list_id=reference_list.id,
        code="one",
        label="One",
    )
    reference_service.archive_reference_item_for_actor(
        actor_user_id=context["registry_admin"].id,
        item_id=reference_item.id,
    )
    reference_service.archive_reference_list_for_actor(
        actor_user_id=context["registry_admin"].id,
        list_id=reference_list.id,
    )
    card = card_service.update_card_for_actor(
        actor_user_id=context["source_admin"].id,
        card_id=context["card"].id,
        display_name="Phase 1E Card Updated",
    )
    field_value = card_service.set_field_value_for_actor(
        actor_user_id=context["source_admin"].id,
        card_id=card.id,
        field_id=context["public_field"].id,
        value="SN-AUDIT",
    )
    public_link = public_link_service.create_public_link_for_actor(
        actor_user_id=context["source_admin"].id,
        card_id=context["card"].id,
    )
    public_link_service.disable_public_link_for_actor(
        actor_user_id=context["source_admin"].id,
        public_link_id=public_link.public_link.id,
    )
    card_service.archive_card_for_actor(
        actor_user_id=context["source_admin"].id,
        card_id=card.id,
    )

    actions = _audit_actions(db_session)

    assert block.title == "Public Updated"
    assert db_session.get(ReferenceList, reference_list.id) is not None
    assert db_session.get(ReferenceItem, reference_item.id) is not None
    assert db_session.get(FieldValue, field_value.id) is not None
    assert ("organization", "create") in actions
    assert ("organization", "update") in actions
    assert ("organization", "archive") in actions
    assert ("form_block", "update") in actions
    assert ("form_field", "archive") in actions
    assert ("reference_list", "create") in actions
    assert ("reference_list", "update") in actions
    assert ("reference_list", "archive") in actions
    assert ("reference_item", "create") in actions
    assert ("reference_item", "archive") in actions
    assert ("card", "create") in actions
    assert ("card", "update") in actions
    assert ("card", "archive") in actions
    assert ("field_value", "update") in actions
    assert ("card_public_link", "create") in actions
    assert ("card_public_link", "disable") in actions

    AuditService(db_session).record_system_event(
        action="maintenance",
        object_type="card",
        object_id=context["card"].id,
    )
    assert ("card", "maintenance") in _audit_actions(db_session)
