import os
from collections.abc import Iterator
from ipaddress import ip_address
from pathlib import Path
from typing import Any
from uuid import UUID

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
from app.models import AccessGrant, AuditEvent, Permission, Role, User, role_permissions


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
    organization_id: UUID,
    include_descendants: bool = True,
    created_by: UUID | None = None,
) -> AccessGrant:
    grant = AccessGrant(
        user_id=user_id,
        role_id=role_id,
        organization_id=organization_id,
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
