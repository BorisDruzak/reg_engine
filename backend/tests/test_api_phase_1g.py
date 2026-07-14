import json
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
    CardPublicLink,
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
        "/api/v1/cards/{card_id}",
        "/api/v1/cards/{card_id}/blocks/{block_id}/instances",
        "/api/v1/cards/{card_id}/public-links",
        "/api/v1/public-links/{public_link_id}",
        "/api/v1/public-links/preview",
    }

    assert expected_paths <= paths
    assert "get" in openapi_paths["/api/v1/organizations/{organization_id}/cards"]


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
    list_fields_by_code = {
        item["code"]: item for item in matching_summary["list_fields"]
    }
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
