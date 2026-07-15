import json
import os
from collections.abc import Iterator
from datetime import date
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

import app.services.cards as cards_module
from app.api.dependencies import get_db_session
from app.core.config import get_settings
from app.main import create_app
from app.models import (
    AccessGrant,
    AuditEvent,
    CardPublicFieldSetting,
    CardPublicLink,
    FieldValue,
    Permission,
    Role,
    User,
    role_permissions,
)
from app.services.cards import CardService, CardServiceError
from app.services.registry_schema import RegistrySchemaError, RegistrySchemaService


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
def api_client(db_session: Session) -> Iterator[TestClient]:
    previous_allow_dev_actor = os.environ.get("ALLOW_DEV_ACTOR_HEADER")
    os.environ["ALLOW_DEV_ACTOR_HEADER"] = "true"
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
        if previous_allow_dev_actor is None:
            os.environ.pop("ALLOW_DEV_ACTOR_HEADER", None)
        else:
            os.environ["ALLOW_DEV_ACTOR_HEADER"] = previous_allow_dev_actor
        get_settings.cache_clear()


def _actor_headers(user_id: UUID, **extra: str) -> dict[str, str]:
    return {"X-Actor-User-Id": str(user_id), **extra}


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


def _request_json(
    client: TestClient,
    method: str,
    path: str,
    *,
    actor_id: UUID,
    payload: dict[str, Any] | None = None,
    expected_status: int = 200,
    headers: dict[str, str] | None = None,
) -> dict[str, Any]:
    request_headers = _actor_headers(actor_id)
    if headers:
        request_headers.update(headers)
    response = client.request(method, path, json=payload, headers=request_headers)
    assert response.status_code == expected_status, response.text
    return response.json() if response.content else {}


def _post_json(
    client: TestClient,
    path: str,
    payload: dict[str, Any],
    *,
    actor_id: UUID,
    expected_status: int = 201,
    headers: dict[str, str] | None = None,
) -> dict[str, Any]:
    return _request_json(
        client,
        "POST",
        path,
        actor_id=actor_id,
        payload=payload,
        expected_status=expected_status,
        headers=headers,
    )


def test_dev_actor_header_disabled_by_default_blocks_protected_endpoints() -> None:
    os.environ.pop("ALLOW_DEV_ACTOR_HEADER", None)
    get_settings.cache_clear()
    app = create_app()

    def override_session() -> Iterator[None]:
        yield None

    app.dependency_overrides[get_db_session] = override_session
    with TestClient(app) as client:
        health = client.get("/api/v1/health")
        response = client.post(
            "/api/v1/organizations",
            json={"code": "blocked", "name": "Blocked"},
            headers={"X-Actor-User-Id": str(uuid4())},
        )

    get_settings.cache_clear()

    assert health.status_code == 200
    assert response.status_code == 401
    assert "dev actor" in response.json()["detail"].lower()


def test_phase_1g_routes_are_registered_without_database() -> None:
    app = create_app()
    openapi_paths = app.openapi()["paths"]
    paths = set(openapi_paths)

    expected_paths = {
        "/api/v1/organizations",
        "/api/v1/organizations/tree",
        "/api/v1/organizations/{organization_id}",
        "/api/v1/registries/{registry_id}",
        "/api/v1/registries/{registry_id}/schema",
        "/api/v1/registries/{registry_id}/card-templates",
        "/api/v1/card-templates/{template_id}",
        "/api/v1/blocks/{block_id}",
        "/api/v1/fields/{field_id}",
        "/api/v1/registries/{registry_id}/reference-lists",
        "/api/v1/reference-lists/{list_id}",
        "/api/v1/reference-lists/{list_id}/items",
        "/api/v1/reference-items/{item_id}",
        "/api/v1/registries/{registry_id}/cards",
        "/api/v1/organizations/{organization_id}/cards",
        "/api/v1/organizations/{organization_id}/cards/draft",
        "/api/v1/organizations/{organization_id}/cards/draft-public-link",
        "/api/v1/cards/{card_id}",
        "/api/v1/cards/{card_id}/blocks/{block_id}/instances",
        "/api/v1/cards/{card_id}/public-links",
        "/api/v1/public-links/{public_link_id}",
        "/api/v1/public-links/preview",
    }

    assert expected_paths <= paths
    assert "get" in openapi_paths["/api/v1/organizations/{organization_id}/cards"]


@pytest.mark.parametrize(
    ("service_error", "expected_detail"),
    [
        (CardServiceError("Card template was not found."), "Операция с карточкой недоступна."),
        (
            RegistrySchemaError("Default card registry is not configured for this organization."),
            "Операция со схемой реестра недоступна.",
        ),
    ],
)
def test_explicit_draft_endpoint_maps_domain_errors_to_russian_without_database(
    monkeypatch: pytest.MonkeyPatch,
    service_error: Exception,
    expected_detail: str,
) -> None:
    previous_allow_dev_actor = os.environ.get("ALLOW_DEV_ACTOR_HEADER")
    os.environ["ALLOW_DEV_ACTOR_HEADER"] = "true"
    get_settings.cache_clear()
    app = create_app()

    def override_session() -> Iterator[None]:
        yield None

    def raise_service_error(_self: CardService, **_kwargs: Any) -> None:
        raise service_error

    app.dependency_overrides[get_db_session] = override_session
    monkeypatch.setattr(CardService, "create_card_draft_for_actor", raise_service_error)
    try:
        with TestClient(app) as client:
            response = client.post(
                f"/api/v1/organizations/{uuid4()}/cards/draft",
                json={"card_template_id": str(uuid4())},
                headers=_actor_headers(uuid4()),
            )
    finally:
        if previous_allow_dev_actor is None:
            os.environ.pop("ALLOW_DEV_ACTOR_HEADER", None)
        else:
            os.environ["ALLOW_DEV_ACTOR_HEADER"] = previous_allow_dev_actor
        get_settings.cache_clear()

    assert response.status_code == 400, response.text
    assert response.json()["detail"] == expected_detail


def test_draft_public_link_endpoint_creates_draft_and_denies_unauthorized_actor(
    api_client: TestClient,
    db_session: Session,
) -> None:
    system_admin = _create_user(
        db_session,
        "phase1g-draft-public-link-system@example.test",
        is_superuser=True,
    )
    outsider = _create_user(db_session, "phase1g-draft-public-link-outsider@example.test")
    organization = _post_json(
        api_client,
        "/api/v1/organizations",
        {"code": "phase1g-draft-public-link", "name": "Draft public link organization"},
        actor_id=system_admin.id,
    )
    registry = RegistrySchemaService(db_session).resolve_default_registry_for_organization(
        UUID(organization["id"])
    )
    template = RegistrySchemaService(db_session).create_card_template_for_actor(
        actor_user_id=system_admin.id,
        registry_id=registry.id,
        code="phase1g-draft-public-link-template",
        name="Draft public link template",
        field_schema_json={"field_ids": []},
    )
    payload = {
        "display_name": "Draft public link card",
        "card_template_id": str(template.id),
        "public_access": {
            "public_view_enabled": True,
            "public_edit_enabled": False,
        },
    }

    created = _post_json(
        api_client,
        f"/api/v1/organizations/{organization['id']}/cards/draft-public-link",
        payload,
        actor_id=system_admin.id,
    )

    assert created["card"]["lifecycle_status"] == "draft"
    assert created["raw_token"]
    public_link = db_session.get(CardPublicLink, UUID(created["public_link_id"]))
    assert public_link is not None
    assert str(public_link.card_id) == created["card"]["id"]
    assert public_link.review_enabled is True

    block = RegistrySchemaService(db_session).create_block_for_actor(
        actor_user_id=system_admin.id,
        registry_id=registry.id,
        code="phase1g-draft-public-link-required",
        title="Draft public link required",
    )
    required_field = RegistrySchemaService(db_session).create_field_for_actor(
        actor_user_id=system_admin.id,
        block_id=block.id,
        code="required_value",
        label="Required value",
        field_type="text",
        required_mode="required",
    )
    required_template = RegistrySchemaService(db_session).create_card_template_for_actor(
        actor_user_id=system_admin.id,
        registry_id=registry.id,
        code="phase1g-draft-public-link-required-template",
        name="Draft public link required template",
        field_schema_json={"field_ids": [str(required_field.id)]},
    )
    required_created = _post_json(
        api_client,
        f"/api/v1/organizations/{organization['id']}/cards/draft-public-link",
        {**payload, "card_template_id": str(required_template.id)},
        actor_id=system_admin.id,
    )

    assert required_created["card"]["lifecycle_status"] == "draft"

    denied = api_client.post(
        f"/api/v1/organizations/{organization['id']}/cards/draft-public-link",
        json=payload,
        headers=_actor_headers(outsider.id),
    )

    assert denied.status_code == 403, denied.text


def test_explicit_draft_endpoint_creates_draft_and_denies_unauthorized_actor(
    api_client: TestClient,
    db_session: Session,
) -> None:
    system_admin = _create_user(
        db_session,
        "phase1g-explicit-draft-system@example.test",
        is_superuser=True,
    )
    outsider = _create_user(db_session, "phase1g-explicit-draft-outsider@example.test")
    organization = _post_json(
        api_client,
        "/api/v1/organizations",
        {"code": "phase1g-explicit-draft", "name": "Explicit draft organization"},
        actor_id=system_admin.id,
    )
    registry = RegistrySchemaService(db_session).resolve_default_registry_for_organization(
        UUID(organization["id"])
    )
    block = RegistrySchemaService(db_session).create_block_for_actor(
        actor_user_id=system_admin.id,
        registry_id=registry.id,
        code="phase1g-explicit-draft-block",
        title="Explicit draft block",
    )
    field = RegistrySchemaService(db_session).create_field_for_actor(
        actor_user_id=system_admin.id,
        block_id=block.id,
        code="explicit_draft_value",
        label="Explicit draft value",
        field_type="text",
    )
    template = RegistrySchemaService(db_session).create_card_template_for_actor(
        actor_user_id=system_admin.id,
        registry_id=registry.id,
        code="phase1g-explicit-draft-template",
        name="Explicit draft template",
        field_schema_json={"field_ids": [str(field.id)]},
    )
    payload = {
        "display_name": "Explicit draft card",
        "card_template_id": str(template.id),
        "public_access": {
            "public_view_enabled": True,
            "public_edit_enabled": False,
            "fields": [
                {
                    "field_id": str(field.id),
                    "public_visible": False,
                    "public_editable": False,
                }
            ],
        },
    }

    created = _post_json(
        api_client,
        f"/api/v1/organizations/{organization['id']}/cards/draft",
        payload,
        actor_id=system_admin.id,
    )

    card_id = UUID(created["id"])
    assert created["lifecycle_status"] == "draft"
    assert created["display_name"] == "Explicit draft card"
    public_links = db_session.scalars(
        select(CardPublicLink).where(CardPublicLink.card_id == card_id)
    ).all()
    assert public_links == []
    assert (
        db_session.scalar(
            select(CardPublicFieldSetting).where(CardPublicFieldSetting.card_id == card_id)
        )
        is not None
    )
    assert db_session.scalars(
        select(AuditEvent).where(
            AuditEvent.object_id == card_id,
            AuditEvent.object_type == "card",
            AuditEvent.action == "create",
        )
    ).all()
    public_link_audits = db_session.scalars(
        select(AuditEvent).where(AuditEvent.object_type == "card_public_link")
    ).all()
    assert not [
        event
        for event in public_link_audits
        if event.new_data_json is not None and event.new_data_json.get("card_id") == str(card_id)
    ]

    denied = api_client.post(
        f"/api/v1/organizations/{organization['id']}/cards/draft",
        json=payload,
        headers=_actor_headers(outsider.id),
    )

    assert denied.status_code == 403, denied.text


def test_phase_1g_rest_workflow_completion(
    api_client: TestClient,
    db_session: Session,
) -> None:
    system_admin = _create_user(
        db_session,
        "phase1g-workflow-system@example.test",
        is_superuser=True,
    )
    metadata_headers = {
        "X-Request-Id": "phase1g-workflow",
        "X-Forwarded-For": "192.0.2.10",
        "User-Agent": "phase1g-test-client",
    }

    root = _post_json(
        api_client,
        "/api/v1/organizations",
        {"code": "phase1g-root", "name": "Phase 1G Root"},
        actor_id=system_admin.id,
        headers=metadata_headers,
    )
    child = _post_json(
        api_client,
        "/api/v1/organizations",
        {"code": "phase1g-child", "name": "Phase 1G Child", "parent_id": root["id"]},
        actor_id=system_admin.id,
    )
    second_root_response = api_client.post(
        "/api/v1/organizations",
        json={"code": "phase1g-second-root", "name": "Phase 1G Second Root"},
        headers=_actor_headers(system_admin.id),
    )
    assert second_root_response.status_code == 400
    assert "one active root organization" in second_root_response.json()["detail"]
    archived_org = _post_json(
        api_client,
        "/api/v1/organizations",
        {"code": "phase1g-archive-org", "name": "Archive Org", "parent_id": root["id"]},
        actor_id=system_admin.id,
    )

    organizations = _request_json(
        api_client, "GET", "/api/v1/organizations", actor_id=system_admin.id
    )
    assert {item["id"] for item in organizations["items"]} >= {root["id"], child["id"]}

    tree = _request_json(api_client, "GET", "/api/v1/organizations/tree", actor_id=system_admin.id)
    assert any(item["id"] == root["id"] for item in tree["items"])

    updated_child = _request_json(
        api_client,
        "PATCH",
        f"/api/v1/organizations/{child['id']}",
        actor_id=system_admin.id,
        payload={"name": "Phase 1G Child Updated"},
    )
    assert updated_child["name"] == "Phase 1G Child Updated"

    archived_response = _request_json(
        api_client,
        "DELETE",
        f"/api/v1/organizations/{archived_org['id']}",
        actor_id=system_admin.id,
    )
    assert archived_response["is_active"] is False

    registry = _post_json(
        api_client,
        "/api/v1/registries",
        {"code": "phase1g-registry", "name": "Phase 1G Registry"},
        actor_id=system_admin.id,
    )
    main_block = _post_json(
        api_client,
        f"/api/v1/registries/{registry['id']}/blocks",
        {"code": "main", "title": "Main", "public_editable": True},
        actor_id=system_admin.id,
    )
    repeatable_block = _post_json(
        api_client,
        f"/api/v1/registries/{registry['id']}/blocks",
        {"code": "repeatable", "title": "Repeatable", "is_repeatable": True},
        actor_id=system_admin.id,
    )
    archive_block = _post_json(
        api_client,
        f"/api/v1/registries/{registry['id']}/blocks",
        {"code": "archive-block", "title": "Archive Block"},
        actor_id=system_admin.id,
    )
    text_field = _post_json(
        api_client,
        f"/api/v1/blocks/{main_block['id']}/fields",
        {
            "code": "status",
            "label": "Status",
            "field_type": "text",
            "public_editable": True,
        },
        actor_id=system_admin.id,
    )
    archive_field = _post_json(
        api_client,
        f"/api/v1/blocks/{main_block['id']}/fields",
        {"code": "archive-field", "label": "Archive Field", "field_type": "text"},
        actor_id=system_admin.id,
    )
    reference_list = _post_json(
        api_client,
        f"/api/v1/registries/{registry['id']}/reference-lists",
        {"code": "states", "name": "States", "owner_organization_id": root["id"]},
        actor_id=system_admin.id,
    )
    reference_item = _post_json(
        api_client,
        f"/api/v1/reference-lists/{reference_list['id']}/items",
        {"code": "ready", "label": "Ready"},
        actor_id=system_admin.id,
    )
    archive_item = _post_json(
        api_client,
        f"/api/v1/reference-lists/{reference_list['id']}/items",
        {"code": "archive", "label": "Archive"},
        actor_id=system_admin.id,
    )
    archive_list = _post_json(
        api_client,
        f"/api/v1/registries/{registry['id']}/reference-lists",
        {"code": "archive-list", "name": "Archive List"},
        actor_id=system_admin.id,
    )
    card = _post_json(
        api_client,
        f"/api/v1/registries/{registry['id']}/cards",
        {
            "organization_id": root["id"],
            "display_name": "Phase 1G Card",
            "public_edit_enabled": True,
        },
        actor_id=system_admin.id,
    )
    organization_card = _post_json(
        api_client,
        f"/api/v1/organizations/{root['id']}/cards",
        {
            "display_name": "Phase 1G Organization Card",
        },
        actor_id=system_admin.id,
    )

    registry_read = _request_json(
        api_client,
        "GET",
        f"/api/v1/registries/{registry['id']}",
        actor_id=system_admin.id,
    )
    assert registry_read["id"] == registry["id"]

    schema_read = _request_json(
        api_client,
        "GET",
        f"/api/v1/registries/{registry['id']}/schema",
        actor_id=system_admin.id,
    )
    assert {block["code"] for block in schema_read["blocks"]} >= {"main", "repeatable"}
    assert any(field["code"] == "status" for field in schema_read["fields"])

    updated_block = _request_json(
        api_client,
        "PATCH",
        f"/api/v1/blocks/{main_block['id']}",
        actor_id=system_admin.id,
        payload={"title": "Main Updated"},
    )
    assert updated_block["title"] == "Main Updated"
    archived_block = _request_json(
        api_client,
        "DELETE",
        f"/api/v1/blocks/{archive_block['id']}",
        actor_id=system_admin.id,
    )
    assert archived_block["is_active"] is False

    updated_field = _request_json(
        api_client,
        "PATCH",
        f"/api/v1/fields/{text_field['id']}",
        actor_id=system_admin.id,
        payload={"label": "Status Updated"},
    )
    assert updated_field["label"] == "Status Updated"
    archived_field = _request_json(
        api_client,
        "DELETE",
        f"/api/v1/fields/{archive_field['id']}",
        actor_id=system_admin.id,
    )
    assert archived_field["is_active"] is False
    reused_archived_field_code = _post_json(
        api_client,
        f"/api/v1/blocks/{main_block['id']}/fields",
        {
            "code": "archive-field",
            "label": "Replacement Archive Field",
            "field_type": "text",
        },
        actor_id=system_admin.id,
    )
    assert reused_archived_field_code["code"] == "archive-field"
    assert reused_archived_field_code["id"] != archive_field["id"]

    reference_lists = _request_json(
        api_client,
        "GET",
        f"/api/v1/registries/{registry['id']}/reference-lists?organization_id={root['id']}",
        actor_id=system_admin.id,
    )
    assert any(item["id"] == reference_list["id"] for item in reference_lists["items"])
    reference_list_read = _request_json(
        api_client,
        "GET",
        f"/api/v1/reference-lists/{reference_list['id']}",
        actor_id=system_admin.id,
    )
    assert reference_list_read["code"] == "states"
    updated_reference_list = _request_json(
        api_client,
        "PATCH",
        f"/api/v1/reference-lists/{reference_list['id']}",
        actor_id=system_admin.id,
        payload={
            "name": "States Updated",
            "owner_organization_id": None,
            "inherit_to_descendants": False,
            "locked_for_descendants": False,
            "managed_by_system_only": True,
        },
    )
    assert updated_reference_list["name"] == "States Updated"
    assert updated_reference_list["owner_organization_id"] is None
    assert updated_reference_list["inherit_to_descendants"] is False
    assert updated_reference_list["locked_for_descendants"] is False
    assert updated_reference_list["managed_by_system_only"] is True
    archived_reference_list = _request_json(
        api_client,
        "DELETE",
        f"/api/v1/reference-lists/{archive_list['id']}",
        actor_id=system_admin.id,
    )
    assert archived_reference_list["is_active"] is False

    reference_items = _request_json(
        api_client,
        "GET",
        f"/api/v1/reference-lists/{reference_list['id']}/items",
        actor_id=system_admin.id,
    )
    assert any(item["id"] == reference_item["id"] for item in reference_items["items"])
    reference_item_read = _request_json(
        api_client,
        "GET",
        f"/api/v1/reference-items/{reference_item['id']}",
        actor_id=system_admin.id,
    )
    assert reference_item_read["code"] == "ready"
    updated_reference_item = _request_json(
        api_client,
        "PATCH",
        f"/api/v1/reference-items/{reference_item['id']}",
        actor_id=system_admin.id,
        payload={"label": "Ready Updated"},
    )
    assert updated_reference_item["label"] == "Ready Updated"
    archived_reference_item = _request_json(
        api_client,
        "DELETE",
        f"/api/v1/reference-items/{archive_item['id']}",
        actor_id=system_admin.id,
    )
    assert archived_reference_item["is_active"] is False

    first_instance = _post_json(
        api_client,
        f"/api/v1/cards/{card['id']}/blocks/{repeatable_block['id']}/instances",
        {},
        actor_id=system_admin.id,
    )
    second_instance = _post_json(
        api_client,
        f"/api/v1/cards/{card['id']}/blocks/{repeatable_block['id']}/instances",
        {},
        actor_id=system_admin.id,
    )
    assert first_instance["ordinal"] == 0
    assert second_instance["ordinal"] == 1

    cards = _request_json(
        api_client,
        "GET",
        (f"/api/v1/registries/{registry['id']}/cards?organization_id={root['id']}&q=Phase%201G"),
        actor_id=system_admin.id,
    )
    assert any(item["id"] == card["id"] for item in cards["items"])
    organization_cards = _request_json(
        api_client,
        "GET",
        f"/api/v1/organizations/{root['id']}/cards?q=Phase%201G",
        actor_id=system_admin.id,
    )
    assert {item["id"] for item in organization_cards["items"]} == {organization_card["id"]}

    updated_card = _request_json(
        api_client,
        "PATCH",
        f"/api/v1/cards/{card['id']}",
        actor_id=system_admin.id,
        payload={"display_name": "Phase 1G Card Updated", "public_view_enabled": True},
    )
    assert updated_card["display_name"] == "Phase 1G Card Updated"
    assert updated_card["public_view_enabled"] is True

    public_link = _post_json(
        api_client,
        f"/api/v1/cards/{card['id']}/public-links",
        {},
        actor_id=system_admin.id,
    )
    public_links = _request_json(
        api_client,
        "GET",
        f"/api/v1/cards/{card['id']}/public-links",
        actor_id=system_admin.id,
    )
    assert public_links["items"][0]["id"] == public_link["id"]
    assert "raw_token" not in public_links["items"][0]
    disabled_link = _request_json(
        api_client,
        "DELETE",
        f"/api/v1/public-links/{public_link['id']}",
        actor_id=system_admin.id,
    )
    assert disabled_link["status"] == "disabled"

    archived_card = _request_json(
        api_client,
        "DELETE",
        f"/api/v1/cards/{card['id']}",
        actor_id=system_admin.id,
    )
    assert archived_card["lifecycle_status"] == "archived"
    archived_cards = _request_json(
        api_client,
        "GET",
        f"/api/v1/registries/{registry['id']}/cards?include_archive=true",
        actor_id=system_admin.id,
    )
    assert any(item["id"] == card["id"] for item in archived_cards["items"])


def test_organization_card_list_supports_tagged_organization_filters(
    api_client: TestClient,
    db_session: Session,
) -> None:
    system_admin = _create_user(
        db_session,
        "phase7d-org-filter-system@example.test",
        is_superuser=True,
    )
    branch_actor = _create_user(db_session, "phase7d-org-filter-actor@example.test")
    root = _post_json(
        api_client,
        "/api/v1/organizations",
        {"code": "phase7d-root", "name": "Phase 7D Root"},
        actor_id=system_admin.id,
    )
    branch = _post_json(
        api_client,
        "/api/v1/organizations",
        {"code": "phase7d-branch", "name": "Phase 7D Branch", "parent_id": root["id"]},
        actor_id=system_admin.id,
    )
    grandchild = _post_json(
        api_client,
        "/api/v1/organizations",
        {
            "code": "phase7d-grandchild",
            "name": "Phase 7D Grandchild",
            "parent_id": branch["id"],
        },
        actor_id=system_admin.id,
    )
    sibling = _post_json(
        api_client,
        "/api/v1/organizations",
        {"code": "phase7d-sibling", "name": "Phase 7D Sibling", "parent_id": root["id"]},
        actor_id=system_admin.id,
    )
    branch_card = _post_json(
        api_client,
        f"/api/v1/organizations/{branch['id']}/cards",
        {"display_name": "Phase 7D Branch Card"},
        actor_id=system_admin.id,
    )
    grandchild_card = _post_json(
        api_client,
        f"/api/v1/organizations/{grandchild['id']}/cards",
        {"display_name": "Phase 7D Grandchild Card"},
        actor_id=system_admin.id,
    )
    sibling_card = _post_json(
        api_client,
        f"/api/v1/organizations/{sibling['id']}/cards",
        {"display_name": "Phase 7D Sibling Card"},
        actor_id=system_admin.id,
    )
    card_role = _create_role_with_permissions(
        db_session,
        "phase7d_org_filter_card_role",
        ["cards.manage"],
    )
    _grant_access(
        db_session,
        user_id=branch_actor.id,
        role_id=card_role.id,
        organization_id=UUID(branch["id"]),
        registry_id=UUID(branch_card["registry_id"]),
        include_descendants=True,
        created_by=system_admin.id,
    )

    default_descendants_response = api_client.get(
        f"/api/v1/organizations/{branch['id']}/cards",
        params=[("organization_ids", branch["id"])],
        headers=_actor_headers(branch_actor.id),
    )
    assert default_descendants_response.status_code == 200, default_descendants_response.text
    assert {item["id"] for item in default_descendants_response.json()["items"]} == {
        branch_card["id"],
        grandchild_card["id"],
    }

    exact_branch_response = api_client.get(
        f"/api/v1/organizations/{branch['id']}/cards",
        params=[
            ("organization_ids", branch["id"]),
            ("include_descendant_organizations", "false"),
        ],
        headers=_actor_headers(branch_actor.id),
    )
    assert exact_branch_response.status_code == 200, exact_branch_response.text
    assert {item["id"] for item in exact_branch_response.json()["items"]} == {branch_card["id"]}

    mixed_scope_response = api_client.get(
        f"/api/v1/organizations/{branch['id']}/cards",
        params=[
            ("organization_ids", branch["id"]),
            ("organization_ids", sibling["id"]),
        ],
        headers=_actor_headers(branch_actor.id),
    )
    assert mixed_scope_response.status_code == 200, mixed_scope_response.text
    mixed_scope_ids = {item["id"] for item in mixed_scope_response.json()["items"]}
    assert branch_card["id"] in mixed_scope_ids
    assert grandchild_card["id"] in mixed_scope_ids
    assert sibling_card["id"] not in mixed_scope_ids

    inaccessible_only_response = api_client.get(
        f"/api/v1/organizations/{branch['id']}/cards",
        params=[("organization_ids", sibling["id"])],
        headers=_actor_headers(branch_actor.id),
    )
    assert inaccessible_only_response.status_code == 200, inaccessible_only_response.text
    assert inaccessible_only_response.json()["items"] == []


def test_organization_card_list_supports_text_and_field_filter_tags(
    api_client: TestClient,
    db_session: Session,
) -> None:
    system_admin = _create_user(
        db_session,
        "phase7e-field-filter-system@example.test",
        is_superuser=True,
    )
    root = _post_json(
        api_client,
        "/api/v1/organizations",
        {"code": "phase7e-root", "name": "Phase 7E Root"},
        actor_id=system_admin.id,
    )
    matching_card = _post_json(
        api_client,
        f"/api/v1/organizations/{root['id']}/cards",
        {"display_name": "Phase 7E First Card"},
        actor_id=system_admin.id,
    )
    other_card = _post_json(
        api_client,
        f"/api/v1/organizations/{root['id']}/cards",
        {"display_name": "Phase 7E Second Card"},
        actor_id=system_admin.id,
    )
    block = _post_json(
        api_client,
        f"/api/v1/registries/{matching_card['registry_id']}/blocks",
        {"code": "search", "title": "Search"},
        actor_id=system_admin.id,
    )
    text_field = _post_json(
        api_client,
        f"/api/v1/blocks/{block['id']}/fields",
        {
            "code": "person",
            "label": "Person",
            "field_type": "text",
            "is_list_display": True,
        },
        actor_id=system_admin.id,
    )
    reference_list = _post_json(
        api_client,
        f"/api/v1/registries/{matching_card['registry_id']}/reference-lists",
        {"code": "states", "name": "States", "owner_organization_id": root["id"]},
        actor_id=system_admin.id,
    )
    ready_item = _post_json(
        api_client,
        f"/api/v1/reference-lists/{reference_list['id']}/items",
        {"code": "ready", "label": "Ready"},
        actor_id=system_admin.id,
    )
    blocked_item = _post_json(
        api_client,
        f"/api/v1/reference-lists/{reference_list['id']}/items",
        {"code": "blocked", "label": "Blocked"},
        actor_id=system_admin.id,
    )
    select_field = _post_json(
        api_client,
        f"/api/v1/blocks/{block['id']}/fields",
        {
            "code": "state",
            "label": "State",
            "field_type": "select",
            "is_list_display": True,
            "options_source_type": "reference_list",
            "options_source_id": reference_list["id"],
        },
        actor_id=system_admin.id,
    )
    _request_json(
        api_client,
        "PATCH",
        f"/api/v1/cards/{matching_card['id']}/values",
        actor_id=system_admin.id,
        payload={
            "values": [
                {"field_id": text_field["id"], "value": "Иванов Иван"},
                {"field_id": select_field["id"], "value": ready_item["id"]},
            ],
        },
    )
    _request_json(
        api_client,
        "PATCH",
        f"/api/v1/cards/{other_card['id']}/values",
        actor_id=system_admin.id,
        payload={
            "values": [
                {"field_id": text_field["id"], "value": "Петров Петр"},
                {"field_id": select_field["id"], "value": blocked_item["id"]},
            ],
        },
    )

    text_query_response = api_client.get(
        f"/api/v1/organizations/{root['id']}/cards",
        params={"q": "Иванов"},
        headers=_actor_headers(system_admin.id),
    )
    assert text_query_response.status_code == 200, text_query_response.text
    assert {item["id"] for item in text_query_response.json()["items"]} == {matching_card["id"]}
    matching_summary = text_query_response.json()["items"][0]
    list_fields_by_code = {item["code"]: item for item in matching_summary["list_fields"]}
    assert list_fields_by_code["person"]["value"]
    assert list_fields_by_code["person"]["display_value"] == list_fields_by_code["person"]["value"]
    assert list_fields_by_code["state"]["value"] == ready_item["id"]
    assert list_fields_by_code["state"]["display_value"] == "Ready"

    field_filters = json.dumps(
        [
            {
                "field_id": text_field["id"],
                "field_type": "text",
                "operator": "contains",
                "value": "Иванов",
            },
            {
                "field_id": select_field["id"],
                "field_type": "select",
                "operator": "is",
                "value": ready_item["id"],
            },
        ],
        ensure_ascii=False,
    )
    field_filter_response = api_client.get(
        f"/api/v1/organizations/{root['id']}/cards",
        params={"filters": field_filters},
        headers=_actor_headers(system_admin.id),
    )
    assert field_filter_response.status_code == 200, field_filter_response.text
    assert {item["id"] for item in field_filter_response.json()["items"]} == {matching_card["id"]}


def test_phase_1g_denied_paths_enforce_service_permissions(
    api_client: TestClient,
    db_session: Session,
) -> None:
    system_admin = _create_user(db_session, "phase1g-denied-system@example.test", is_superuser=True)
    outsider = _create_user(db_session, "phase1g-denied-outsider@example.test")
    root = _post_json(
        api_client,
        "/api/v1/organizations",
        {"code": "phase1g-denied-root", "name": "Denied Root"},
        actor_id=system_admin.id,
    )
    registry = _post_json(
        api_client,
        "/api/v1/registries",
        {"code": "phase1g-denied-registry", "name": "Denied Registry"},
        actor_id=system_admin.id,
    )
    card_role = _create_role_with_permissions(
        db_session,
        "phase1g_denied_card_role",
        ["cards.manage"],
    )
    _grant_access(
        db_session,
        user_id=outsider.id,
        role_id=card_role.id,
        organization_id=UUID(root["id"]),
        registry_id=UUID(registry["id"]),
        created_by=system_admin.id,
    )

    allowed_schema = api_client.get(
        f"/api/v1/registries/{registry['id']}/schema",
        headers=_actor_headers(outsider.id),
    )
    assert allowed_schema.status_code == 200, allowed_schema.text

    denied_schema_mutation = api_client.post(
        f"/api/v1/registries/{registry['id']}/blocks",
        json={"code": "blocked", "title": "Blocked"},
        headers=_actor_headers(outsider.id),
    )
    assert denied_schema_mutation.status_code == 403, denied_schema_mutation.text

    denied_update = api_client.patch(
        f"/api/v1/organizations/{root['id']}",
        json={"name": "Should Not Update"},
        headers=_actor_headers(outsider.id),
    )
    assert denied_update.status_code == 403, denied_update.text


def test_public_link_api_hardening(
    api_client: TestClient,
    db_session: Session,
) -> None:
    system_admin = _create_user(db_session, "phase1g-public-system@example.test", is_superuser=True)
    root = _post_json(
        api_client,
        "/api/v1/organizations",
        {"code": "phase1g-public-root", "name": "Public Root"},
        actor_id=system_admin.id,
    )
    registry = _post_json(
        api_client,
        "/api/v1/registries",
        {"code": "phase1g-public-registry", "name": "Public Registry"},
        actor_id=system_admin.id,
    )
    block = _post_json(
        api_client,
        f"/api/v1/registries/{registry['id']}/blocks",
        {"code": "public", "title": "Public", "public_editable": True},
        actor_id=system_admin.id,
    )
    field = _post_json(
        api_client,
        f"/api/v1/blocks/{block['id']}/fields",
        {
            "code": "status",
            "label": "Status",
            "field_type": "text",
            "public_editable": True,
        },
        actor_id=system_admin.id,
    )
    card = _post_json(
        api_client,
        f"/api/v1/registries/{registry['id']}/cards",
        {
            "organization_id": root["id"],
            "display_name": "Public Card",
            "public_edit_enabled": True,
        },
        actor_id=system_admin.id,
    )

    invalid_ttl = api_client.post(
        f"/api/v1/cards/{card['id']}/public-links",
        json={"expires_in_days": 0},
        headers=_actor_headers(system_admin.id),
    )
    assert invalid_ttl.status_code == 422, invalid_ttl.text

    invalid_token = api_client.post(
        "/api/v1/public-links/edit",
        json={"raw_token": "invalid-token", "field_id": str(uuid4()), "value": "blocked"},
    )
    assert invalid_token.status_code in {400, 403}, invalid_token.text
    assert "field" not in invalid_token.json()["detail"].lower()

    public_link = _post_json(
        api_client,
        f"/api/v1/cards/{card['id']}/public-links",
        {},
        actor_id=system_admin.id,
    )
    stored_link = db_session.get(CardPublicLink, UUID(public_link["id"]))
    assert stored_link is not None
    stored_link.max_uses = 1
    db_session.flush()

    first_edit = api_client.post(
        "/api/v1/public-links/edit",
        json={"raw_token": public_link["raw_token"], "field_id": field["id"], "value": "first"},
    )
    assert first_edit.status_code == 200, first_edit.text
    second_edit = api_client.post(
        "/api/v1/public-links/edit",
        json={"raw_token": public_link["raw_token"], "field_id": field["id"], "value": "second"},
    )
    assert second_edit.status_code == 403, second_edit.text


def test_work_experience_field_persists_private_anchor_and_projects_api_reads(
    api_client: TestClient,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class ServerDate(date):
        @classmethod
        def today(cls) -> date:
            return cls(2026, 6, 28)

    monkeypatch.setattr(cards_module, "date", ServerDate)
    system_admin = _create_user(db_session, "experience-system@example.test", is_superuser=True)
    outsider = _create_user(db_session, "experience-outsider@example.test")
    root = _post_json(
        api_client,
        "/api/v1/organizations",
        {"code": "experience-root", "name": "Experience Root"},
        actor_id=system_admin.id,
    )
    registry = _post_json(
        api_client,
        "/api/v1/registries",
        {"code": "experience-registry", "name": "Experience Registry"},
        actor_id=system_admin.id,
    )
    block = _post_json(
        api_client,
        f"/api/v1/registries/{registry['id']}/blocks",
        {"code": "experience", "title": "Experience", "public_editable": True},
        actor_id=system_admin.id,
    )
    field = _post_json(
        api_client,
        f"/api/v1/blocks/{block['id']}/fields",
        {
            "code": "work_experience",
            "label": "Work experience",
            "field_type": "work_experience",
            "required_mode": "required",
            "public_editable": True,
        },
        actor_id=system_admin.id,
    )
    card = _post_json(
        api_client,
        f"/api/v1/registries/{registry['id']}/cards",
        {
            "organization_id": root["id"],
            "display_name": "Experience card",
            "public_edit_enabled": True,
        },
        actor_id=system_admin.id,
    )

    saved = api_client.patch(
        f"/api/v1/cards/{card['id']}/fields/{field['id']}",
        json={"value": {"days": 16, "months": 3, "years": 9}},
        headers=_actor_headers(system_admin.id),
    )
    assert saved.status_code == 200, saved.text
    expected_value = {
        "days": 16,
        "months": 3,
        "years": 9,
        "display": "16 дней 3 месяца 9 лет",
    }
    assert saved.json()["value"] == expected_value

    stored_value = db_session.scalar(
        select(FieldValue).where(
            FieldValue.card_id == UUID(card["id"]),
            FieldValue.field_id == UUID(field["id"]),
        )
    )
    assert stored_value is not None
    assert stored_value.value_json == {"anchor_date": "2017-03-12"}
    assert stored_value.value_text is None
    assert stored_value.value_number is None
    assert stored_value.value_date is None
    assert stored_value.value_datetime is None
    assert stored_value.value_bool is None
    assert stored_value.value_reference_item_id is None
    assert stored_value.value_card_id is None
    assert stored_value.value_user_id is None
    assert stored_value.value_organization_id is None
    assert stored_value.value_org_unit_id is None
    assert stored_value.value_registry_id is None
    assert stored_value.value_attachment_id is None

    admin_read = api_client.get(
        f"/api/v1/cards/{card['id']}", headers=_actor_headers(system_admin.id)
    )
    assert admin_read.status_code == 200, admin_read.text
    assert admin_read.json()["fields"]["work_experience"]["value"] == expected_value
    assert "anchor_date" not in admin_read.text

    denied_read = api_client.get(f"/api/v1/cards/{card['id']}", headers=_actor_headers(outsider.id))
    assert denied_read.status_code == 403, denied_read.text
    denied_write = api_client.patch(
        f"/api/v1/cards/{card['id']}/fields/{field['id']}",
        json={"value": {"days": 0, "months": 0, "years": 0}},
        headers=_actor_headers(outsider.id),
    )
    assert denied_write.status_code == 403, denied_write.text

    public_link = _post_json(
        api_client,
        f"/api/v1/cards/{card['id']}/public-links",
        {},
        actor_id=system_admin.id,
    )
    public_preview = api_client.post(
        "/api/v1/public-links/preview",
        json={"raw_token": public_link["raw_token"]},
    )
    assert public_preview.status_code == 200, public_preview.text
    public_field = public_preview.json()["blocks"][0]["instances"][0]["fields"][0]
    assert public_field["value"] == expected_value
    assert "anchor_date" not in public_preview.text

    class NextServerDate(date):
        @classmethod
        def today(cls) -> date:
            return cls(2026, 6, 29)

    monkeypatch.setattr(cards_module, "date", NextServerDate)
    next_day_read = api_client.get(
        f"/api/v1/cards/{card['id']}", headers=_actor_headers(system_admin.id)
    )
    assert next_day_read.status_code == 200, next_day_read.text
    assert next_day_read.json()["fields"]["work_experience"]["value"] == {
        "days": 17,
        "months": 3,
        "years": 9,
        "display": "17 дней 3 месяца 9 лет",
    }
    assert stored_value.value_json == {"anchor_date": "2017-03-12"}

    audit_event = db_session.scalar(
        select(AuditEvent).where(
            AuditEvent.object_type == "field_value",
            AuditEvent.object_id == stored_value.id,
            AuditEvent.action == "update",
        )
    )
    assert audit_event is not None


def test_reference_field_validation_returns_controlled_4xx(
    api_client: TestClient,
    db_session: Session,
) -> None:
    system_admin = _create_user(db_session, "phase1g-ref-system@example.test", is_superuser=True)
    root = _post_json(
        api_client,
        "/api/v1/organizations",
        {"code": "phase1g-ref-root", "name": "Ref Root"},
        actor_id=system_admin.id,
    )
    registry = _post_json(
        api_client,
        "/api/v1/registries",
        {"code": "phase1g-ref-registry", "name": "Ref Registry"},
        actor_id=system_admin.id,
    )
    block = _post_json(
        api_client,
        f"/api/v1/registries/{registry['id']}/blocks",
        {"code": "refs", "title": "Refs"},
        actor_id=system_admin.id,
    )
    fields = [
        _post_json(
            api_client,
            f"/api/v1/blocks/{block['id']}/fields",
            {"code": field_type, "label": field_type, "field_type": field_type},
            actor_id=system_admin.id,
        )
        for field_type in [
            "organization_ref",
            "org_unit_ref",
            "user_ref",
            "card_ref",
            "registry_ref",
        ]
    ]
    card = _post_json(
        api_client,
        f"/api/v1/registries/{registry['id']}/cards",
        {"organization_id": root["id"], "display_name": "Ref Card"},
        actor_id=system_admin.id,
    )

    for field in fields:
        response = api_client.patch(
            f"/api/v1/cards/{card['id']}/fields/{field['id']}",
            json={"value": str(uuid4())},
            headers=_actor_headers(system_admin.id),
        )
        assert response.status_code in {400, 422}, response.text
        detail = response.json()["detail"].lower()
        assert "integrity" not in detail
        assert "foreign key" not in detail
        assert "traceback" not in detail


def test_audit_request_metadata_and_integrity_error_mapping(
    api_client: TestClient,
    db_session: Session,
) -> None:
    system_admin = _create_user(db_session, "phase1g-audit-system@example.test", is_superuser=True)
    metadata_headers = {
        "X-Request-Id": "phase1g-audit-request",
        "X-Forwarded-For": "198.51.100.25",
        "User-Agent": "phase1g-audit-client",
    }

    organization = _post_json(
        api_client,
        "/api/v1/organizations",
        {"code": "phase1g-audit-root", "name": "Audit Root"},
        actor_id=system_admin.id,
        headers=metadata_headers,
    )
    event = db_session.scalars(
        select(AuditEvent).where(
            AuditEvent.object_type == "organization",
            AuditEvent.object_id == UUID(organization["id"]),
            AuditEvent.action == "create",
        )
    ).one()
    assert event.request_id == "phase1g-audit-request"
    assert event.user_agent == "phase1g-audit-client"
    assert str(event.ip_address) == "198.51.100.25"

    duplicate = api_client.post(
        "/api/v1/organizations",
        json={
            "code": "phase1g-audit-root",
            "name": "Duplicate Organization Code",
            "parent_id": organization["id"],
        },
        headers=_actor_headers(system_admin.id),
    )
    assert duplicate.status_code == 409, duplicate.text
    assert "duplicate key" not in duplicate.json()["detail"].lower()
    assert "uq_organizations_code" not in duplicate.json()["detail"].lower()
