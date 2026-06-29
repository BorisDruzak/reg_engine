import os
from collections.abc import Iterator
from ipaddress import ip_address
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import pytest
from alembic import command
from alembic.config import Config
from fastapi import Request
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import Session

from app.api.dependencies import get_db_session
from app.core.config import get_settings
from app.main import create_app
from app.models import (
    AccessGrant,
    AuditEvent,
    CardBlockInstance,
    FormBlock,
    Permission,
    Role,
    User,
    role_permissions,
)


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
        if transaction.is_active:
            transaction.rollback()
        connection.close()


@pytest.fixture()
def api_client(db_session: Session, tmp_path: Path) -> Iterator[TestClient]:
    previous_allow_dev_actor = os.environ.get("ALLOW_DEV_ACTOR_HEADER")
    previous_storage_root = os.environ.get("REG_ENGINE_STORAGE_ROOT")
    previous_max_bytes = os.environ.get("REG_ENGINE_MAX_ATTACHMENT_BYTES")
    previous_allowed_types = os.environ.get("REG_ENGINE_ATTACHMENT_ALLOWED_TYPES")
    os.environ["ALLOW_DEV_ACTOR_HEADER"] = "true"
    os.environ["REG_ENGINE_STORAGE_ROOT"] = str(tmp_path)
    os.environ["REG_ENGINE_MAX_ATTACHMENT_BYTES"] = "1024"
    os.environ.pop("REG_ENGINE_ATTACHMENT_ALLOWED_TYPES", None)
    get_settings.cache_clear()
    app = create_app()

    def override_session(request: Request) -> Iterator[Session]:
        forwarded_for = request.headers.get("x-forwarded-for")
        raw_ip = (
            forwarded_for.split(",", maxsplit=1)[0].strip()
            if forwarded_for
            else (request.client.host if request.client else None)
        )
        try:
            normalized_ip = str(ip_address(raw_ip)) if raw_ip else None
        except ValueError:
            normalized_ip = None
        db_session.info["audit_metadata"] = {
            "ip_address": normalized_ip,
            "user_agent": request.headers.get("user-agent"),
            "request_id": request.headers.get("x-request-id"),
        }
        yield db_session

    app.dependency_overrides[get_db_session] = override_session
    try:
        with TestClient(app) as client:
            yield client
    finally:
        _restore_env("ALLOW_DEV_ACTOR_HEADER", previous_allow_dev_actor)
        _restore_env("REG_ENGINE_STORAGE_ROOT", previous_storage_root)
        _restore_env("REG_ENGINE_MAX_ATTACHMENT_BYTES", previous_max_bytes)
        _restore_env("REG_ENGINE_ATTACHMENT_ALLOWED_TYPES", previous_allowed_types)
        get_settings.cache_clear()


def _restore_env(name: str, value: str | None) -> None:
    if value is None:
        os.environ.pop(name, None)
    else:
        os.environ[name] = value


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


def _request_json(
    client: TestClient,
    method: str,
    path: str,
    *,
    actor_id: UUID,
    payload: dict[str, Any] | None = None,
    expected_status: int = 200,
) -> dict[str, Any]:
    response = client.request(method, path, json=payload, headers=_actor_headers(actor_id))
    assert response.status_code == expected_status, response.text
    return response.json() if response.content else {}


def _post_json(
    client: TestClient,
    path: str,
    payload: dict[str, Any],
    *,
    actor_id: UUID,
    expected_status: int = 201,
) -> dict[str, Any]:
    return _request_json(
        client,
        "POST",
        path,
        actor_id=actor_id,
        payload=payload,
        expected_status=expected_status,
    )


def test_phase_2k_org_unit_routes_are_registered_without_database() -> None:
    app = create_app()
    paths = set(app.openapi()["paths"])

    assert "/api/v1/organizations/{organization_id}/org-units" in paths
    assert "/api/v1/org-units/{org_unit_id}" in paths


def test_phase_2k_registry_update_archive_routes_are_registered_without_database() -> None:
    app = create_app()
    registry_path = app.openapi()["paths"]["/api/v1/registries/{registry_id}"]

    assert "patch" in registry_path
    assert "delete" in registry_path


def test_phase_2k_block_instance_archive_route_is_registered_without_database() -> None:
    app = create_app()
    paths = set(app.openapi()["paths"])

    assert "/api/v1/card-block-instances/{block_instance_id}" in paths


def test_phase_2k_bulk_card_values_route_is_registered_without_database() -> None:
    app = create_app()
    paths = app.openapi()["paths"]

    assert "/api/v1/cards/{card_id}/values" in paths
    assert "patch" in paths["/api/v1/cards/{card_id}/values"]


def test_system_admin_can_manage_org_units(
    api_client: TestClient,
    db_session: Session,
) -> None:
    system_admin = _create_user(
        db_session,
        "phase2k-org-unit-system@example.test",
        is_superuser=True,
    )
    organization = _post_json(
        api_client,
        "/api/v1/organizations",
        {"code": "phase2k-org-unit-root", "name": "Org Unit Root"},
        actor_id=system_admin.id,
    )

    org_unit = _post_json(
        api_client,
        f"/api/v1/organizations/{organization['id']}/org-units",
        {"code": "finance", "name": "Finance", "unit_type": "department"},
        actor_id=system_admin.id,
    )
    assert org_unit["organization_id"] == organization["id"]
    assert org_unit["parent_id"] is None
    assert org_unit["code"] == "finance"
    assert org_unit["name"] == "Finance"
    assert org_unit["type"] == "department"
    assert org_unit["is_active"] is True

    child_unit = _post_json(
        api_client,
        f"/api/v1/organizations/{organization['id']}/org-units",
        {
            "parent_id": org_unit["id"],
            "code": "finance-payroll",
            "name": "Payroll",
        },
        actor_id=system_admin.id,
    )
    assert child_unit["parent_id"] == org_unit["id"]

    units = _request_json(
        api_client,
        "GET",
        f"/api/v1/organizations/{organization['id']}/org-units",
        actor_id=system_admin.id,
    )
    assert [item["code"] for item in units["items"]] == ["finance", "finance-payroll"]

    read_unit = _request_json(
        api_client,
        "GET",
        f"/api/v1/org-units/{org_unit['id']}",
        actor_id=system_admin.id,
    )
    assert read_unit["id"] == org_unit["id"]

    updated_unit = _request_json(
        api_client,
        "PATCH",
        f"/api/v1/org-units/{org_unit['id']}",
        actor_id=system_admin.id,
        payload={"name": "Finance Department", "unit_type": "division"},
    )
    assert updated_unit["name"] == "Finance Department"
    assert updated_unit["type"] == "division"

    archived_unit = _request_json(
        api_client,
        "DELETE",
        f"/api/v1/org-units/{child_unit['id']}",
        actor_id=system_admin.id,
    )
    assert archived_unit["is_active"] is False

    active_units = _request_json(
        api_client,
        "GET",
        f"/api/v1/organizations/{organization['id']}/org-units",
        actor_id=system_admin.id,
    )
    assert [item["code"] for item in active_units["items"]] == ["finance"]

    audit_actions = {
        event.action
        for event in db_session.scalars(
            select(AuditEvent).where(AuditEvent.object_type == "org_unit")
        )
    }
    assert {"create", "update", "archive"} <= audit_actions


def test_org_admin_can_manage_units_in_descendant_scope_but_not_siblings(
    api_client: TestClient,
    db_session: Session,
) -> None:
    system_admin = _create_user(
        db_session,
        "phase2k-org-unit-scope-system@example.test",
        is_superuser=True,
    )
    org_admin = _create_user(db_session, "phase2k-org-unit-scope-admin@example.test")
    outsider = _create_user(db_session, "phase2k-org-unit-scope-outsider@example.test")
    role = _create_role_with_permissions(
        db_session,
        "phase2k_org_unit_org_admin",
        ["organizations.manage"],
    )
    root = _post_json(
        api_client,
        "/api/v1/organizations",
        {"code": "phase2k-org-unit-scope-root", "name": "Root"},
        actor_id=system_admin.id,
    )
    branch = _post_json(
        api_client,
        "/api/v1/organizations",
        {"parent_id": root["id"], "code": "phase2k-org-unit-branch", "name": "Branch"},
        actor_id=system_admin.id,
    )
    sibling = _post_json(
        api_client,
        "/api/v1/organizations",
        {"parent_id": root["id"], "code": "phase2k-org-unit-sibling", "name": "Sibling"},
        actor_id=system_admin.id,
    )
    _grant_access(
        db_session,
        user_id=org_admin.id,
        role_id=role.id,
        organization_id=UUID(branch["id"]),
        include_descendants=True,
        created_by=system_admin.id,
    )

    scoped_unit = _post_json(
        api_client,
        f"/api/v1/organizations/{branch['id']}/org-units",
        {"code": "branch-unit", "name": "Branch Unit"},
        actor_id=org_admin.id,
    )

    visible_units = _request_json(
        api_client,
        "GET",
        f"/api/v1/organizations/{branch['id']}/org-units",
        actor_id=org_admin.id,
    )
    assert [item["id"] for item in visible_units["items"]] == [scoped_unit["id"]]

    sibling_response = api_client.post(
        f"/api/v1/organizations/{sibling['id']}/org-units",
        json={"code": "blocked", "name": "Blocked"},
        headers=_actor_headers(org_admin.id),
    )
    assert sibling_response.status_code == 403, sibling_response.text

    outsider_response = api_client.get(
        f"/api/v1/org-units/{scoped_unit['id']}",
        headers=_actor_headers(outsider.id),
    )
    assert outsider_response.status_code == 403, outsider_response.text


def test_registry_admin_can_update_and_archive_registry(
    api_client: TestClient,
    db_session: Session,
) -> None:
    system_admin = _create_user(
        db_session,
        "phase2k-registry-system@example.test",
        is_superuser=True,
    )
    registry_admin = _create_user(db_session, "phase2k-registry-admin@example.test")
    role = _create_role_with_permissions(
        db_session,
        "phase2k_registry_admin",
        ["registry.schema.manage"],
    )
    registry = _post_json(
        api_client,
        "/api/v1/registries",
        {
            "code": "phase2k-registry-update",
            "name": "Registry Before",
            "description": "Before",
        },
        actor_id=system_admin.id,
    )
    _grant_access(
        db_session,
        user_id=registry_admin.id,
        role_id=role.id,
        organization_id=None,
        registry_id=UUID(registry["id"]),
        created_by=system_admin.id,
    )

    updated = _request_json(
        api_client,
        "PATCH",
        f"/api/v1/registries/{registry['id']}",
        actor_id=registry_admin.id,
        payload={
            "name": "Registry After",
            "description": "After",
            "lifecycle_status": "draft",
        },
    )
    assert updated["name"] == "Registry After"
    assert updated["description"] == "After"
    assert updated["lifecycle_status"] == "draft"

    archived = _request_json(
        api_client,
        "DELETE",
        f"/api/v1/registries/{registry['id']}",
        actor_id=registry_admin.id,
    )
    assert archived["id"] == registry["id"]
    assert archived["lifecycle_status"] == "archived"

    normal_list = _request_json(api_client, "GET", "/api/v1/registries", actor_id=system_admin.id)
    assert registry["id"] not in {item["id"] for item in normal_list["items"]}

    archive_list = _request_json(
        api_client,
        "GET",
        "/api/v1/registries?include_archive=true",
        actor_id=system_admin.id,
    )
    assert registry["id"] in {item["id"] for item in archive_list["items"]}

    archive_read = _request_json(
        api_client,
        "GET",
        f"/api/v1/registries/{registry['id']}?include_archive=true",
        actor_id=registry_admin.id,
    )
    assert archive_read["lifecycle_status"] == "archived"

    audit_actions = {
        event.action
        for event in db_session.scalars(
            select(AuditEvent).where(
                AuditEvent.object_type == "registry",
                AuditEvent.object_id == UUID(registry["id"]),
            )
        )
    }
    assert {"create", "update", "archive"} <= audit_actions


def test_registry_update_and_archive_require_schema_permission(
    api_client: TestClient,
    db_session: Session,
) -> None:
    system_admin = _create_user(
        db_session,
        "phase2k-registry-denied-system@example.test",
        is_superuser=True,
    )
    card_admin = _create_user(db_session, "phase2k-registry-denied-card-admin@example.test")
    role = _create_role_with_permissions(
        db_session,
        "phase2k_registry_card_admin",
        ["cards.manage"],
    )
    registry = _post_json(
        api_client,
        "/api/v1/registries",
        {"code": "phase2k-registry-denied", "name": "Denied Registry"},
        actor_id=system_admin.id,
    )
    _grant_access(
        db_session,
        user_id=card_admin.id,
        role_id=role.id,
        organization_id=None,
        registry_id=UUID(registry["id"]),
        created_by=system_admin.id,
    )

    read_response = api_client.get(
        f"/api/v1/registries/{registry['id']}",
        headers=_actor_headers(card_admin.id),
    )
    assert read_response.status_code == 200, read_response.text

    update_response = api_client.patch(
        f"/api/v1/registries/{registry['id']}",
        json={"name": "Blocked"},
        headers=_actor_headers(card_admin.id),
    )
    assert update_response.status_code == 403, update_response.text

    archive_response = api_client.delete(
        f"/api/v1/registries/{registry['id']}",
        headers=_actor_headers(card_admin.id),
    )
    assert archive_response.status_code == 403, archive_response.text


def test_repeatable_block_instance_archive_hides_normal_read_and_preserves_archive_scope(
    api_client: TestClient,
    db_session: Session,
) -> None:
    system_admin = _create_user(
        db_session,
        "phase2k-block-instance-system@example.test",
        is_superuser=True,
    )
    organization = _post_json(
        api_client,
        "/api/v1/organizations",
        {"code": "phase2k-block-instance-root", "name": "Root"},
        actor_id=system_admin.id,
    )
    registry = _post_json(
        api_client,
        "/api/v1/registries",
        {"code": "phase2k-block-instance-registry", "name": "Registry"},
        actor_id=system_admin.id,
    )
    block = _post_json(
        api_client,
        f"/api/v1/registries/{registry['id']}/blocks",
        {"code": "history", "title": "History", "is_repeatable": True},
        actor_id=system_admin.id,
    )
    field = _post_json(
        api_client,
        f"/api/v1/blocks/{block['id']}/fields",
        {"code": "note", "label": "Note", "field_type": "text"},
        actor_id=system_admin.id,
    )
    card = _post_json(
        api_client,
        f"/api/v1/registries/{registry['id']}/cards",
        {"organization_id": organization["id"], "display_name": "Card"},
        actor_id=system_admin.id,
    )
    first_instance = _post_json(
        api_client,
        f"/api/v1/cards/{card['id']}/blocks/{block['id']}/instances",
        {},
        actor_id=system_admin.id,
    )
    second_instance = _post_json(
        api_client,
        f"/api/v1/cards/{card['id']}/blocks/{block['id']}/instances",
        {},
        actor_id=system_admin.id,
    )
    _request_json(
        api_client,
        "PATCH",
        f"/api/v1/cards/{card['id']}/fields/{field['id']}",
        actor_id=system_admin.id,
        payload={"block_instance_id": first_instance["id"], "value": "first"},
    )
    _request_json(
        api_client,
        "PATCH",
        f"/api/v1/cards/{card['id']}/fields/{field['id']}",
        actor_id=system_admin.id,
        payload={"block_instance_id": second_instance["id"], "value": "second"},
    )

    archived = _request_json(
        api_client,
        "DELETE",
        f"/api/v1/card-block-instances/{second_instance['id']}",
        actor_id=system_admin.id,
    )
    assert archived["id"] == second_instance["id"]
    assert db_session.get(CardBlockInstance, UUID(second_instance["id"])).archived_at is not None

    normal_read = _request_json(
        api_client,
        "GET",
        f"/api/v1/cards/{card['id']}",
        actor_id=system_admin.id,
    )
    normal_instance_ids = [
        item["block_instance_id"] for item in normal_read["blocks"]["history"]["instances"]
    ]
    assert second_instance["id"] not in normal_instance_ids

    archive_read = _request_json(
        api_client,
        "GET",
        f"/api/v1/cards/{card['id']}?include_archive=true",
        actor_id=system_admin.id,
    )
    archive_instances = archive_read["blocks"]["history"]["instances"]
    assert second_instance["id"] in {item["block_instance_id"] for item in archive_instances}
    archived_values = {
        item["block_instance_id"]: item["fields"]["note"]["value"] for item in archive_instances
    }
    assert archived_values[second_instance["id"]] == "second"

    replacement_instance = _post_json(
        api_client,
        f"/api/v1/cards/{card['id']}/blocks/{block['id']}/instances",
        {},
        actor_id=system_admin.id,
    )
    assert replacement_instance["ordinal"] == 2

    audit_actions = {
        event.action
        for event in db_session.scalars(
            select(AuditEvent).where(
                AuditEvent.object_type == "card_block_instance",
                AuditEvent.object_id == UUID(second_instance["id"]),
            )
        )
    }
    assert "archive" in audit_actions


def test_block_instance_archive_rejects_non_repeatable_and_system_blocks(
    api_client: TestClient,
    db_session: Session,
) -> None:
    system_admin = _create_user(
        db_session,
        "phase2k-block-instance-guard-system@example.test",
        is_superuser=True,
    )
    organization = _post_json(
        api_client,
        "/api/v1/organizations",
        {"code": "phase2k-block-instance-guard-root", "name": "Root"},
        actor_id=system_admin.id,
    )
    registry = _post_json(
        api_client,
        "/api/v1/registries",
        {"code": "phase2k-block-instance-guard-registry", "name": "Registry"},
        actor_id=system_admin.id,
    )
    non_repeatable_block = _post_json(
        api_client,
        f"/api/v1/registries/{registry['id']}/blocks",
        {"code": "main", "title": "Main"},
        actor_id=system_admin.id,
    )
    system_block = _post_json(
        api_client,
        f"/api/v1/registries/{registry['id']}/blocks",
        {"code": "system-history", "title": "System History", "is_repeatable": True},
        actor_id=system_admin.id,
    )
    stored_system_block = db_session.get(FormBlock, UUID(system_block["id"]))
    stored_system_block.is_system = True
    db_session.flush()
    card = _post_json(
        api_client,
        f"/api/v1/registries/{registry['id']}/cards",
        {"organization_id": organization["id"], "display_name": "Card"},
        actor_id=system_admin.id,
    )
    non_repeatable_instance = _post_json(
        api_client,
        f"/api/v1/cards/{card['id']}/blocks/{non_repeatable_block['id']}/instances",
        {},
        actor_id=system_admin.id,
    )
    system_instance = _post_json(
        api_client,
        f"/api/v1/cards/{card['id']}/blocks/{system_block['id']}/instances",
        {},
        actor_id=system_admin.id,
    )

    non_repeatable_response = api_client.delete(
        f"/api/v1/card-block-instances/{non_repeatable_instance['id']}",
        headers=_actor_headers(system_admin.id),
    )
    assert non_repeatable_response.status_code == 400, non_repeatable_response.text

    system_response = api_client.delete(
        f"/api/v1/card-block-instances/{system_instance['id']}",
        headers=_actor_headers(system_admin.id),
    )
    assert system_response.status_code == 400, system_response.text


def test_bulk_card_values_update_saves_multiple_values(
    api_client: TestClient,
    db_session: Session,
) -> None:
    system_admin = _create_user(
        db_session,
        "phase2k-bulk-system@example.test",
        is_superuser=True,
    )
    organization = _post_json(
        api_client,
        "/api/v1/organizations",
        {"code": "phase2k-bulk-root", "name": "Root"},
        actor_id=system_admin.id,
    )
    registry = _post_json(
        api_client,
        "/api/v1/registries",
        {"code": "phase2k-bulk-registry", "name": "Registry"},
        actor_id=system_admin.id,
    )
    block = _post_json(
        api_client,
        f"/api/v1/registries/{registry['id']}/blocks",
        {"code": "main", "title": "Main"},
        actor_id=system_admin.id,
    )
    first_field = _post_json(
        api_client,
        f"/api/v1/blocks/{block['id']}/fields",
        {"code": "first", "label": "First", "field_type": "text"},
        actor_id=system_admin.id,
    )
    second_field = _post_json(
        api_client,
        f"/api/v1/blocks/{block['id']}/fields",
        {"code": "second", "label": "Second", "field_type": "text"},
        actor_id=system_admin.id,
    )
    card = _post_json(
        api_client,
        f"/api/v1/registries/{registry['id']}/cards",
        {"organization_id": organization["id"], "display_name": "Card"},
        actor_id=system_admin.id,
    )

    response = _request_json(
        api_client,
        "PATCH",
        f"/api/v1/cards/{card['id']}/values",
        actor_id=system_admin.id,
        payload={
            "values": [
                {"field_id": first_field["id"], "value": "first value"},
                {"field_id": second_field["id"], "value": "second value"},
            ]
        },
    )

    assert [item["field_id"] for item in response["items"]] == [
        first_field["id"],
        second_field["id"],
    ]
    card_read = _request_json(
        api_client,
        "GET",
        f"/api/v1/cards/{card['id']}",
        actor_id=system_admin.id,
    )
    assert card_read["fields"]["main.first"]["value"] == "first value"
    assert card_read["fields"]["main.second"]["value"] == "second value"


def test_bulk_card_values_update_rolls_back_on_partial_validation_failure(
    api_client: TestClient,
    db_session: Session,
) -> None:
    system_admin = _create_user(
        db_session,
        "phase2k-bulk-rollback-system@example.test",
        is_superuser=True,
    )
    organization = _post_json(
        api_client,
        "/api/v1/organizations",
        {"code": "phase2k-bulk-rollback-root", "name": "Root"},
        actor_id=system_admin.id,
    )
    registry = _post_json(
        api_client,
        "/api/v1/registries",
        {"code": "phase2k-bulk-rollback-registry", "name": "Registry"},
        actor_id=system_admin.id,
    )
    block = _post_json(
        api_client,
        f"/api/v1/registries/{registry['id']}/blocks",
        {"code": "main", "title": "Main"},
        actor_id=system_admin.id,
    )
    text_field = _post_json(
        api_client,
        f"/api/v1/blocks/{block['id']}/fields",
        {"code": "text", "label": "Text", "field_type": "text"},
        actor_id=system_admin.id,
    )
    organization_ref_field = _post_json(
        api_client,
        f"/api/v1/blocks/{block['id']}/fields",
        {"code": "organization", "label": "Organization", "field_type": "organization_ref"},
        actor_id=system_admin.id,
    )
    card = _post_json(
        api_client,
        f"/api/v1/registries/{registry['id']}/cards",
        {"organization_id": organization["id"], "display_name": "Card"},
        actor_id=system_admin.id,
    )
    _request_json(
        api_client,
        "PATCH",
        f"/api/v1/cards/{card['id']}/fields/{text_field['id']}",
        actor_id=system_admin.id,
        payload={"value": "old value"},
    )

    response = api_client.patch(
        f"/api/v1/cards/{card['id']}/values",
        json={
            "values": [
                {"field_id": text_field["id"], "value": "new value"},
                {"field_id": organization_ref_field["id"], "value": str(uuid4())},
            ]
        },
        headers=_actor_headers(system_admin.id),
    )
    assert response.status_code == 400, response.text

    card_read = _request_json(
        api_client,
        "GET",
        f"/api/v1/cards/{card['id']}",
        actor_id=system_admin.id,
    )
    assert card_read["fields"]["main.text"]["value"] == "old value"
    assert card_read["fields"]["main.organization"]["value"] is None


def test_bulk_card_values_update_requires_card_permission(
    api_client: TestClient,
    db_session: Session,
) -> None:
    system_admin = _create_user(
        db_session,
        "phase2k-bulk-denied-system@example.test",
        is_superuser=True,
    )
    outsider = _create_user(db_session, "phase2k-bulk-denied-outsider@example.test")
    organization = _post_json(
        api_client,
        "/api/v1/organizations",
        {"code": "phase2k-bulk-denied-root", "name": "Root"},
        actor_id=system_admin.id,
    )
    registry = _post_json(
        api_client,
        "/api/v1/registries",
        {"code": "phase2k-bulk-denied-registry", "name": "Registry"},
        actor_id=system_admin.id,
    )
    block = _post_json(
        api_client,
        f"/api/v1/registries/{registry['id']}/blocks",
        {"code": "main", "title": "Main"},
        actor_id=system_admin.id,
    )
    field = _post_json(
        api_client,
        f"/api/v1/blocks/{block['id']}/fields",
        {"code": "text", "label": "Text", "field_type": "text"},
        actor_id=system_admin.id,
    )
    card = _post_json(
        api_client,
        f"/api/v1/registries/{registry['id']}/cards",
        {"organization_id": organization["id"], "display_name": "Card"},
        actor_id=system_admin.id,
    )

    response = api_client.patch(
        f"/api/v1/cards/{card['id']}/values",
        json={"values": [{"field_id": field["id"], "value": "blocked"}]},
        headers=_actor_headers(outsider.id),
    )

    assert response.status_code == 403, response.text


def _create_file_ref_api_setup(
    api_client: TestClient,
    actor_id: UUID,
    suffix: str,
) -> dict[str, Any]:
    organization = _post_json(
        api_client,
        "/api/v1/organizations",
        {"code": f"phase2j4-file-ref-{suffix}-org", "name": f"File Ref {suffix} Org"},
        actor_id=actor_id,
    )
    registry = _post_json(
        api_client,
        "/api/v1/registries",
        {"code": f"phase2j4-file-ref-{suffix}-registry", "name": f"File Ref {suffix} Registry"},
        actor_id=actor_id,
    )
    block = _post_json(
        api_client,
        f"/api/v1/registries/{registry['id']}/blocks",
        {"code": "documents", "title": "Documents"},
        actor_id=actor_id,
    )
    field = _post_json(
        api_client,
        f"/api/v1/blocks/{block['id']}/fields",
        {"code": "supporting_file", "label": "Supporting File", "field_type": "file_ref"},
        actor_id=actor_id,
    )
    card = _post_json(
        api_client,
        f"/api/v1/registries/{registry['id']}/cards",
        {"organization_id": organization["id"], "display_name": f"File Ref {suffix} Card"},
        actor_id=actor_id,
    )
    return {
        "organization": organization,
        "registry": registry,
        "block": block,
        "field": field,
        "card": card,
    }


def _upload_card_attachment(
    api_client: TestClient,
    *,
    card_id: str,
    actor_id: UUID,
    filename: str = "evidence.txt",
    content: bytes = b"file-ref evidence",
    title: str = "Evidence",
) -> dict[str, Any]:
    response = api_client.post(
        f"/api/v1/cards/{card_id}/attachments",
        headers=_actor_headers(actor_id),
        files={"file": (filename, content, "text/plain")},
        data={"title": title},
    )
    assert response.status_code == 201, response.text
    return response.json()


def _assert_file_ref_metadata(
    value: dict[str, Any],
    attachment: dict[str, Any],
    *,
    archived: bool,
) -> None:
    assert value["attachment_id"] == attachment["id"]
    assert value["title"] == attachment["title"]
    assert value["original_filename"] == attachment["original_filename"]
    assert value["content_type"] == attachment["content_type"]
    assert value["content_length_bytes"] == attachment["content_length_bytes"]
    assert value["scanner_status"] == attachment["scanner_status"]
    if archived:
        assert value["archived_at"] is not None
    else:
        assert value["archived_at"] is None
    forbidden_keys = {"stored_file_id", "checksum_sha256", "storage_key", "storage_root", "path"}
    assert forbidden_keys.isdisjoint(value)


def test_file_ref_api_sets_clears_and_reads_safe_metadata(
    api_client: TestClient,
    db_session: Session,
) -> None:
    system_admin = _create_user(
        db_session,
        "phase2j4-file-ref-api-system@example.test",
        is_superuser=True,
    )
    setup = _create_file_ref_api_setup(api_client, system_admin.id, "set-clear")
    attachment = _upload_card_attachment(
        api_client,
        card_id=setup["card"]["id"],
        actor_id=system_admin.id,
    )

    updated = _request_json(
        api_client,
        "PATCH",
        f"/api/v1/cards/{setup['card']['id']}/fields/{setup['field']['id']}",
        actor_id=system_admin.id,
        payload={"value": attachment["id"]},
    )
    _assert_file_ref_metadata(updated["value"], attachment, archived=False)

    card_read = _request_json(
        api_client,
        "GET",
        f"/api/v1/cards/{setup['card']['id']}",
        actor_id=system_admin.id,
    )
    flat_value = card_read["fields"]["documents.supporting_file"]["value"]
    block_value = card_read["blocks"]["documents"]["instances"][0]["fields"]["supporting_file"][
        "value"
    ]
    _assert_file_ref_metadata(flat_value, attachment, archived=False)
    _assert_file_ref_metadata(block_value, attachment, archived=False)

    cleared = _request_json(
        api_client,
        "PATCH",
        f"/api/v1/cards/{setup['card']['id']}/fields/{setup['field']['id']}",
        actor_id=system_admin.id,
        payload={"value": None},
    )
    assert cleared["value"] is None

    cleared_read = _request_json(
        api_client,
        "GET",
        f"/api/v1/cards/{setup['card']['id']}",
        actor_id=system_admin.id,
    )
    assert cleared_read["fields"]["documents.supporting_file"]["value"] is None


def test_file_ref_api_rejects_wrong_card_and_reads_archived_reference_metadata(
    api_client: TestClient,
    db_session: Session,
) -> None:
    system_admin = _create_user(
        db_session,
        "phase2j4-file-ref-api-guards-system@example.test",
        is_superuser=True,
    )
    setup = _create_file_ref_api_setup(api_client, system_admin.id, "guards")
    other_card = _post_json(
        api_client,
        f"/api/v1/registries/{setup['registry']['id']}/cards",
        {"organization_id": setup["organization"]["id"], "display_name": "Other File Ref Card"},
        actor_id=system_admin.id,
    )
    other_attachment = _upload_card_attachment(
        api_client,
        card_id=other_card["id"],
        actor_id=system_admin.id,
        filename="other.txt",
        title="Other Evidence",
    )

    wrong_card_response = api_client.patch(
        f"/api/v1/cards/{setup['card']['id']}/fields/{setup['field']['id']}",
        headers=_actor_headers(system_admin.id),
        json={"value": other_attachment["id"]},
    )
    assert wrong_card_response.status_code == 400, wrong_card_response.text

    attachment = _upload_card_attachment(
        api_client,
        card_id=setup["card"]["id"],
        actor_id=system_admin.id,
        filename="archivable.txt",
        title="Archivable Evidence",
    )
    _request_json(
        api_client,
        "PATCH",
        f"/api/v1/cards/{setup['card']['id']}/fields/{setup['field']['id']}",
        actor_id=system_admin.id,
        payload={"value": attachment["id"]},
    )

    archived_attachment = _request_json(
        api_client,
        "DELETE",
        f"/api/v1/attachments/{attachment['id']}",
        actor_id=system_admin.id,
    )
    assert archived_attachment["archived_at"] is not None

    card_read = _request_json(
        api_client,
        "GET",
        f"/api/v1/cards/{setup['card']['id']}",
        actor_id=system_admin.id,
    )
    _assert_file_ref_metadata(
        card_read["fields"]["documents.supporting_file"]["value"],
        archived_attachment,
        archived=True,
    )

    archived_set_response = api_client.patch(
        f"/api/v1/cards/{setup['card']['id']}/fields/{setup['field']['id']}",
        headers=_actor_headers(system_admin.id),
        json={"value": attachment["id"]},
    )
    assert archived_set_response.status_code == 400, archived_set_response.text
