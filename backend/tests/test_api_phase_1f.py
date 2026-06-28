import os
from collections.abc import Iterator
from pathlib import Path
from typing import Any
from uuid import UUID

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import Session

from app.main import create_app
from app.models import (
    AccessGrant,
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
        pytest.skip("TEST_DATABASE_URL is required for disposable PostgreSQL API tests.")

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
    from app.api.dependencies import get_db_session
    from app.core.config import get_settings

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


def _actor_headers(user_id: UUID) -> dict[str, str]:
    return {"X-Actor-User-Id": str(user_id)}


def _create_user(
    session: Session,
    email: str,
    *,
    is_superuser: bool = False,
) -> User:
    user = User(email=email, display_name=email, is_superuser=is_superuser)
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
        permission = Permission(code=f"{role_code}.{permission_code}", description=permission_code)
        permission.code = permission_code
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


def _post_json(
    client: TestClient,
    path: str,
    payload: dict[str, Any],
    *,
    actor_id: UUID | None,
    expected_status: int = 201,
) -> dict[str, Any]:
    headers = _actor_headers(actor_id) if actor_id is not None else {}
    response = client.post(path, json=payload, headers=headers)
    assert response.status_code == expected_status, response.text
    return response.json()


def test_api_healthcheck_remains_independent_from_database() -> None:
    app = create_app()
    with TestClient(app) as client:
        response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "reg_engine"}


def test_phase_1f_api_routes_are_registered_without_database() -> None:
    app = create_app()
    paths = set(app.openapi()["paths"])

    assert "/api/v1/organizations" in paths
    assert "/api/v1/registries" in paths
    assert "/api/v1/registries/{registry_id}/blocks" in paths
    assert "/api/v1/blocks/{block_id}/fields" in paths
    assert "/api/v1/registries/{registry_id}/cards" in paths
    assert "/api/v1/cards/{card_id}" in paths
    assert "/api/v1/cards/{card_id}/public-links" in paths
    assert "/api/v1/public-links/preview" in paths
    assert "/api/v1/public-links/edit" in paths
    assert "/api/v1/audit-events" in paths


def test_api_lists_registries_visible_to_actor(
    api_client: TestClient,
    db_session: Session,
) -> None:
    system_admin = _create_user(
        db_session,
        "api-registry-list-system@example.test",
        is_superuser=True,
    )
    card_admin = _create_user(db_session, "api-registry-list-card-admin@example.test")
    outsider = _create_user(db_session, "api-registry-list-outsider@example.test")
    card_role = _create_role_with_permissions(
        db_session,
        "api_registry_list_card_admin",
        ["cards.manage"],
    )
    registry = _post_json(
        api_client,
        "/api/v1/registries",
        {"code": "api-registry-list", "name": "API Registry List"},
        actor_id=system_admin.id,
    )
    block = _post_json(
        api_client,
        f"/api/v1/registries/{registry['id']}/blocks",
        {"code": "main", "title": "Main"},
        actor_id=system_admin.id,
    )
    _post_json(
        api_client,
        f"/api/v1/blocks/{block['id']}/fields",
        {"code": "status", "label": "Status", "field_type": "text"},
        actor_id=system_admin.id,
    )
    _grant_access(
        db_session,
        user_id=card_admin.id,
        role_id=card_role.id,
        registry_id=UUID(registry["id"]),
        created_by=system_admin.id,
    )

    admin_response = api_client.get(
        "/api/v1/registries",
        headers=_actor_headers(system_admin.id),
    )
    card_admin_response = api_client.get(
        "/api/v1/registries",
        headers=_actor_headers(card_admin.id),
    )
    card_admin_schema_response = api_client.get(
        f"/api/v1/registries/{registry['id']}/schema",
        headers=_actor_headers(card_admin.id),
    )
    outsider_schema_response = api_client.get(
        f"/api/v1/registries/{registry['id']}/schema",
        headers=_actor_headers(outsider.id),
    )
    outsider_response = api_client.get(
        "/api/v1/registries",
        headers=_actor_headers(outsider.id),
    )

    assert admin_response.status_code == 200, admin_response.text
    assert any(item["id"] == registry["id"] for item in admin_response.json()["items"])
    assert card_admin_response.status_code == 200, card_admin_response.text
    assert [item["id"] for item in card_admin_response.json()["items"]] == [registry["id"]]
    assert card_admin_schema_response.status_code == 200, card_admin_schema_response.text
    assert card_admin_schema_response.json()["fields"][0]["code"] == "status"
    assert outsider_response.status_code == 200, outsider_response.text
    assert outsider_response.json()["items"] == []
    assert outsider_schema_response.status_code == 403, outsider_schema_response.text


def test_api_can_create_schema_cards_public_links_transfer_and_read_audit(
    api_client: TestClient,
    db_session: Session,
) -> None:
    system_admin = _create_user(
        db_session,
        "api-system@example.test",
        is_superuser=True,
    )
    headers = _actor_headers(system_admin.id)

    root = _post_json(
        api_client,
        "/api/v1/organizations",
        {"code": "api-root", "name": "API Root"},
        actor_id=system_admin.id,
    )
    target = _post_json(
        api_client,
        "/api/v1/organizations",
        {"code": "api-target", "name": "API Target"},
        actor_id=system_admin.id,
    )
    registry = _post_json(
        api_client,
        "/api/v1/registries",
        {"code": "api-assets", "name": "API Assets"},
        actor_id=system_admin.id,
    )
    block = _post_json(
        api_client,
        f"/api/v1/registries/{registry['id']}/blocks",
        {
            "code": "main",
            "title": "Main",
            "public_visible": True,
            "public_editable": True,
        },
        actor_id=system_admin.id,
    )
    reference_list = _post_json(
        api_client,
        f"/api/v1/registries/{registry['id']}/reference-lists",
        {"code": "states", "name": "States"},
        actor_id=system_admin.id,
    )
    reference_item = _post_json(
        api_client,
        f"/api/v1/reference-lists/{reference_list['id']}/items",
        {"code": "ready", "label": "Ready"},
        actor_id=system_admin.id,
    )
    status_field = _post_json(
        api_client,
        f"/api/v1/blocks/{block['id']}/fields",
        {
            "code": "status",
            "label": "Status",
            "field_type": "text",
            "public_visible": True,
            "public_editable": True,
        },
        actor_id=system_admin.id,
    )
    state_field = _post_json(
        api_client,
        f"/api/v1/blocks/{block['id']}/fields",
        {
            "code": "state",
            "label": "State",
            "field_type": "select",
            "options_source_type": "reference_list",
            "options_source_id": reference_list["id"],
        },
        actor_id=system_admin.id,
    )
    card = _post_json(
        api_client,
        f"/api/v1/registries/{registry['id']}/cards",
        {
            "organization_id": root["id"],
            "display_name": "API Card",
            "public_edit_enabled": True,
        },
        actor_id=system_admin.id,
    )

    text_value = api_client.patch(
        f"/api/v1/cards/{card['id']}/fields/{status_field['id']}",
        json={"value": "drafted"},
        headers=headers,
    )
    assert text_value.status_code == 200, text_value.text
    select_value = api_client.patch(
        f"/api/v1/cards/{card['id']}/fields/{state_field['id']}",
        json={"value": reference_item["id"]},
        headers=headers,
    )
    assert select_value.status_code == 200, select_value.text

    card_read = api_client.get(f"/api/v1/cards/{card['id']}", headers=headers)
    assert card_read.status_code == 200, card_read.text
    card_payload = card_read.json()
    assert card_payload["blocks"]["main"]["instances"][0]["fields"]["status"]["value"] == "drafted"
    assert (
        card_payload["blocks"]["main"]["instances"][0]["fields"]["state"]["value"]
        == reference_item["id"]
    )

    public_link = _post_json(
        api_client,
        f"/api/v1/cards/{card['id']}/public-links",
        {},
        actor_id=system_admin.id,
    )
    assert public_link["raw_token"]
    assert "token_hash" not in public_link
    stored_link = db_session.scalars(select(CardPublicLink)).one()
    assert stored_link.token_hash != public_link["raw_token"]

    public_edit = api_client.post(
        "/api/v1/public-links/edit",
        json={
            "raw_token": public_link["raw_token"],
            "field_id": status_field["id"],
            "value": "published",
        },
    )
    assert public_edit.status_code == 200, public_edit.text
    assert public_edit.json()["value"] == "published"

    transfer = _post_json(
        api_client,
        f"/api/v1/cards/{card['id']}/transfer",
        {"target_organization_id": target["id"]},
        actor_id=system_admin.id,
    )
    assert transfer["id"] != card["id"]
    archived_old = api_client.get(
        f"/api/v1/cards/{card['id']}?include_archive=true",
        headers=headers,
    )
    assert archived_old.status_code == 200, archived_old.text

    audit_response = api_client.get(
        "/api/v1/audit-events?object_type=card",
        headers=headers,
    )
    assert audit_response.status_code == 200, audit_response.text
    audit_actions = {event["action"] for event in audit_response.json()["items"]}
    assert {"create", "transfer"} <= audit_actions


def test_api_card_visibility_uses_organization_scope(
    api_client: TestClient, db_session: Session
) -> None:
    system_admin = _create_user(
        db_session,
        "api-visibility-system@example.test",
        is_superuser=True,
    )
    org_admin = _create_user(db_session, "api-org-admin@example.test")
    outsider = _create_user(db_session, "api-outsider@example.test")
    card_role = _create_role_with_permissions(db_session, "api_card_admin", ["cards.manage"])

    organization_service = OrganizationService(db_session)
    root = organization_service.create_root_for_actor(
        actor_user_id=system_admin.id,
        code="api-visibility-root",
        name="API Visibility Root",
    )
    child = organization_service.create_child(
        parent_id=root.id,
        code="api-visibility-child",
        name="API Visibility Child",
        created_by=system_admin.id,
    )
    sibling = organization_service.create_child(
        parent_id=root.id,
        code="api-visibility-sibling",
        name="API Visibility Sibling",
        created_by=system_admin.id,
    )
    registry = RegistrySchemaService(db_session).create_registry_for_actor(
        actor_user_id=system_admin.id,
        code="api-visibility-registry",
        name="API Visibility Registry",
    )
    block = RegistrySchemaService(db_session).create_block_for_actor(
        actor_user_id=system_admin.id,
        registry_id=registry.id,
        code="visible",
        title="Visible",
    )
    field = RegistrySchemaService(db_session).create_field_for_actor(
        actor_user_id=system_admin.id,
        block_id=block.id,
        code="status",
        label="Status",
        field_type="text",
    )
    card = CardService(db_session).create_card_for_actor(
        actor_user_id=system_admin.id,
        registry_id=registry.id,
        organization_id=child.id,
        display_name="Visible Card",
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
        user_id=outsider.id,
        role_id=card_role.id,
        organization_id=sibling.id,
        registry_id=registry.id,
        include_descendants=True,
        created_by=system_admin.id,
    )

    allowed_read = api_client.get(f"/api/v1/cards/{card.id}", headers=_actor_headers(org_admin.id))
    assert allowed_read.status_code == 200, allowed_read.text
    denied_read = api_client.get(f"/api/v1/cards/{card.id}", headers=_actor_headers(outsider.id))
    assert denied_read.status_code == 403, denied_read.text
    denied_write = api_client.patch(
        f"/api/v1/cards/{card.id}/fields/{field.id}",
        json={"value": "blocked"},
        headers=_actor_headers(outsider.id),
    )
    assert denied_write.status_code == 403, denied_write.text


def test_api_public_link_respects_card_public_edit_enabled(
    api_client: TestClient,
    db_session: Session,
) -> None:
    system_admin = _create_user(
        db_session,
        "api-public-disabled-system@example.test",
        is_superuser=True,
    )
    organization = OrganizationService(db_session).create_root_for_actor(
        actor_user_id=system_admin.id,
        code="api-public-disabled-root",
        name="API Public Disabled Root",
    )
    registry = RegistrySchemaService(db_session).create_registry_for_actor(
        actor_user_id=system_admin.id,
        code="api-public-disabled-registry",
        name="API Public Disabled Registry",
    )
    block = RegistrySchemaService(db_session).create_block_for_actor(
        actor_user_id=system_admin.id,
        registry_id=registry.id,
        code="public",
        title="Public",
        public_editable=True,
    )
    field = RegistrySchemaService(db_session).create_field_for_actor(
        actor_user_id=system_admin.id,
        block_id=block.id,
        code="status",
        label="Status",
        field_type="text",
        public_editable=True,
    )
    card = CardService(db_session).create_card_for_actor(
        actor_user_id=system_admin.id,
        registry_id=registry.id,
        organization_id=organization.id,
        display_name="Public Disabled Card",
        public_edit_enabled=False,
    )

    public_link = _post_json(
        api_client,
        f"/api/v1/cards/{card.id}/public-links",
        {},
        actor_id=system_admin.id,
    )
    public_edit = api_client.post(
        "/api/v1/public-links/edit",
        json={
            "raw_token": public_link["raw_token"],
            "field_id": str(field.id),
            "value": "blocked",
        },
    )

    assert public_edit.status_code == 403, public_edit.text


def test_api_public_link_preview_returns_public_edit_schema(
    api_client: TestClient,
    db_session: Session,
) -> None:
    system_admin = _create_user(
        db_session,
        "api-public-preview-system@example.test",
        is_superuser=True,
    )
    organization = OrganizationService(db_session).create_root_for_actor(
        actor_user_id=system_admin.id,
        code="api-public-preview-root",
        name="API Public Preview Root",
    )
    registry = RegistrySchemaService(db_session).create_registry_for_actor(
        actor_user_id=system_admin.id,
        code="api-public-preview-registry",
        name="API Public Preview Registry",
    )
    public_block = RegistrySchemaService(db_session).create_block_for_actor(
        actor_user_id=system_admin.id,
        registry_id=registry.id,
        code="public",
        title="Public",
        public_editable=True,
    )
    private_block = RegistrySchemaService(db_session).create_block_for_actor(
        actor_user_id=system_admin.id,
        registry_id=registry.id,
        code="private",
        title="Private",
        public_editable=False,
    )
    status_field = RegistrySchemaService(db_session).create_field_for_actor(
        actor_user_id=system_admin.id,
        block_id=public_block.id,
        code="status",
        label="Status",
        field_type="text",
        public_editable=True,
    )
    RegistrySchemaService(db_session).create_field_for_actor(
        actor_user_id=system_admin.id,
        block_id=private_block.id,
        code="secret",
        label="Secret",
        field_type="text",
        public_editable=True,
    )
    card = CardService(db_session).create_card_for_actor(
        actor_user_id=system_admin.id,
        registry_id=registry.id,
        organization_id=organization.id,
        display_name="Public Preview Card",
        public_edit_enabled=True,
    )
    CardService(db_session).set_field_value_for_actor(
        actor_user_id=system_admin.id,
        card_id=card.id,
        field_id=status_field.id,
        value="drafted",
    )

    public_link = _post_json(
        api_client,
        f"/api/v1/cards/{card.id}/public-links",
        {},
        actor_id=system_admin.id,
    )
    preview = api_client.post(
        "/api/v1/public-links/preview",
        json={"raw_token": public_link["raw_token"]},
    )

    assert preview.status_code == 200, preview.text
    payload = preview.json()
    assert payload["card_id"] == str(card.id)
    assert payload["display_name"] == "Public Preview Card"
    assert "raw_token" not in payload
    assert "token_hash" not in payload
    assert [block["code"] for block in payload["blocks"]] == ["public"]
    assert payload["blocks"][0]["instances"][0]["fields"][0]["field_id"] == str(status_field.id)
    assert payload["blocks"][0]["instances"][0]["fields"][0]["value"] == "drafted"
    assert "secret" not in str(payload)

    disabled_card = CardService(db_session).create_card_for_actor(
        actor_user_id=system_admin.id,
        registry_id=registry.id,
        organization_id=organization.id,
        display_name="Public Preview Disabled",
        public_edit_enabled=False,
    )
    disabled_link = _post_json(
        api_client,
        f"/api/v1/cards/{disabled_card.id}/public-links",
        {},
        actor_id=system_admin.id,
    )
    disabled_preview = api_client.post(
        "/api/v1/public-links/preview",
        json={"raw_token": disabled_link["raw_token"]},
    )
    assert disabled_preview.status_code == 403, disabled_preview.text
