import os
from collections.abc import Iterator
from pathlib import Path
from uuid import UUID

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import Session

from app.api.dependencies import get_db_session
from app.core.config import get_settings
from app.main import create_app
from app.models import AccessGrant, AuditEvent, Permission, Role, User, role_permissions
from app.services.auth import hash_password
from app.services.bootstrap import BootstrapService
from app.services.organizations import OrganizationService
from app.services.references import ReferenceListService
from app.services.registry_schema import RegistrySchemaService


def _require_test_database_url() -> str:
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is required for disposable PostgreSQL access API tests.")

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
    previous_secret = os.environ.get("AUTH_TOKEN_SECRET")
    os.environ.pop("ALLOW_DEV_ACTOR_HEADER", None)
    os.environ["AUTH_TOKEN_SECRET"] = "phase-1j-test-secret"
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
        if previous_secret is None:
            os.environ.pop("AUTH_TOKEN_SECRET", None)
        else:
            os.environ["AUTH_TOKEN_SECRET"] = previous_secret
        get_settings.cache_clear()


def _create_user(
    session: Session,
    email: str,
    *,
    password: str = "secret-pass",
    is_superuser: bool = False,
) -> User:
    user = User(
        email=email,
        display_name=email,
        password_hash=hash_password(password),
        is_superuser=is_superuser,
    )
    session.add(user)
    session.flush()
    return user


def _auth_headers(client: TestClient, email: str, password: str = "secret-pass") -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _create_role_with_existing_permissions(
    session: Session,
    *,
    code: str,
    permission_codes: list[str],
) -> Role:
    role = Role(code=code, name=code)
    session.add(role)
    session.flush()
    permissions = list(
        session.scalars(select(Permission).where(Permission.code.in_(permission_codes))).all()
    )
    assert {permission.code for permission in permissions} == set(permission_codes)
    for permission in permissions:
        session.execute(
            role_permissions.insert().values(role_id=role.id, permission_id=permission.id)
        )
    session.flush()
    return role


def _grant_access(
    session: Session,
    *,
    user_id: UUID,
    role_id: UUID,
    organization_id: UUID | None = None,
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


def test_phase_1j_routes_are_registered_without_database() -> None:
    app = create_app()
    paths = set(app.openapi()["paths"])

    assert {
        "/api/v1/users",
        "/api/v1/users/{user_id}",
        "/api/v1/roles",
        "/api/v1/permissions",
        "/api/v1/access-grants",
        "/api/v1/access-grants/{grant_id}",
    } <= paths


def test_bootstrap_exposes_only_the_three_business_roles(db_session: Session) -> None:
    BootstrapService(db_session).seed_defaults()

    assert {
        role.code for role in db_session.scalars(select(Role).where(Role.archived_at.is_(None)))
    } == {
        "administrator",
        "organization_administrator",
        "subordinate_organization_administrator",
    }

    created_user = _create_user(db_session, "phase1j-business-role@example.test")
    assert created_user.can_manage_access is False


def test_system_admin_user_role_permission_and_grant_workflow(
    api_client: TestClient,
    db_session: Session,
) -> None:
    BootstrapService(db_session).seed_defaults()
    system_admin = _create_user(db_session, "phase1j-system@example.test", is_superuser=True)
    headers = _auth_headers(api_client, "phase1j-system@example.test")
    organization = OrganizationService(db_session).create_root_for_actor(
        actor_user_id=system_admin.id,
        code="phase1j-system-root",
        name="Phase 1J System Root",
    )
    subordinate_org_admin_role = db_session.scalars(
        select(Role).where(Role.code == "subordinate_organization_administrator")
    ).one()

    created_user = api_client.post(
        "/api/v1/users",
        json={
            "email": "phase1j-created@example.test",
            "display_name": "Phase 1J Created",
            "password": "created-pass",
        },
        headers=headers,
    )
    assert created_user.status_code == 201, created_user.text
    created_payload = created_user.json()
    assert created_payload["email"] == "phase1j-created@example.test"
    assert "password_hash" not in created_payload
    assert _auth_headers(api_client, "phase1j-created@example.test", "created-pass")

    patched_login = api_client.patch(
        f"/api/v1/users/{created_payload['id']}",
        json={"email": "phase1j_created-admin"},
        headers=headers,
    )
    assert patched_login.status_code == 200, patched_login.text
    assert patched_login.json()["email"] == "phase1j_created-admin"
    assert _auth_headers(api_client, "phase1j_created-admin", "created-pass")

    patched_user = api_client.patch(
        f"/api/v1/users/{created_payload['id']}",
        json={"display_name": "Phase 1J Updated", "status": "disabled"},
        headers=headers,
    )
    assert patched_user.status_code == 200, patched_user.text
    assert patched_user.json()["display_name"] == "Phase 1J Updated"
    assert patched_user.json()["status"] == "disabled"

    roles = api_client.get("/api/v1/roles", headers=headers)
    permissions = api_client.get("/api/v1/permissions", headers=headers)
    assert roles.status_code == 200, roles.text
    assert permissions.status_code == 200, permissions.text
    assert "subordinate_organization_administrator" in {
        role["code"] for role in roles.json()["items"]
    }
    assert "access_grants.manage" in {
        permission["code"] for permission in permissions.json()["items"]
    }

    grant = api_client.post(
        "/api/v1/access-grants",
        json={
            "user_id": created_payload["id"],
            "role_id": str(subordinate_org_admin_role.id),
            "organization_id": str(organization.id),
            "include_descendants": True,
        },
        headers=headers,
    )
    assert grant.status_code == 201, grant.text
    grant_payload = grant.json()
    assert grant_payload["user_id"] == created_payload["id"]

    grants = api_client.get(
        f"/api/v1/access-grants?user_id={created_payload['id']}",
        headers=headers,
    )
    assert grants.status_code == 200, grants.text
    assert any(item["id"] == grant_payload["id"] for item in grants.json()["items"])

    revoked = api_client.delete(f"/api/v1/access-grants/{grant_payload['id']}", headers=headers)
    assert revoked.status_code == 200, revoked.text
    assert revoked.json()["archived_at"] is not None

    archived_user = api_client.delete(f"/api/v1/users/{created_payload['id']}", headers=headers)
    assert archived_user.status_code == 200, archived_user.text
    assert archived_user.json()["status"] == "archived"
    assert archived_user.json()["archived_at"] is not None

    audit_actions = {
        (event.action, event.object_type) for event in db_session.scalars(select(AuditEvent)).all()
    }
    assert ("create", "user") in audit_actions
    assert ("archive", "access_grant") in audit_actions


def test_scoped_admin_access_grant_boundaries(
    api_client: TestClient,
    db_session: Session,
) -> None:
    BootstrapService(db_session).seed_defaults()
    system_admin = _create_user(
        db_session, "phase1j-boundary-system@example.test", is_superuser=True
    )
    scoped_admin = _create_user(db_session, "phase1j-scoped@example.test")
    sibling_user = _create_user(db_session, "phase1j-sibling-user@example.test")
    organization_service = OrganizationService(db_session)
    root = organization_service.create_root_for_actor(
        actor_user_id=system_admin.id,
        code="phase1j-boundary-root",
        name="Phase 1J Boundary Root",
    )
    child = organization_service.create_child(
        parent_id=root.id,
        code="phase1j-boundary-child",
        name="Phase 1J Boundary Child",
        created_by=system_admin.id,
    )
    grandchild = organization_service.create_child(
        parent_id=child.id,
        code="phase1j-boundary-grandchild",
        name="Phase 1J Boundary Grandchild",
        created_by=system_admin.id,
    )
    sibling = organization_service.create_child(
        parent_id=root.id,
        code="phase1j-boundary-sibling",
        name="Phase 1J Boundary Sibling",
        created_by=system_admin.id,
    )
    scoped_role = _create_role_with_existing_permissions(
        db_session,
        code="phase1j_scoped_access_manager",
        permission_codes=[
            "users.manage",
            "roles.read",
            "permissions.read",
            "access_grants.manage",
        ],
    )
    subordinate_org_admin_role = db_session.scalars(
        select(Role).where(Role.code == "subordinate_organization_administrator")
    ).one()
    _grant_access(
        db_session,
        user_id=scoped_admin.id,
        role_id=scoped_role.id,
        organization_id=child.id,
        include_descendants=True,
        created_by=system_admin.id,
    )
    _grant_access(
        db_session,
        user_id=sibling_user.id,
        role_id=subordinate_org_admin_role.id,
        organization_id=sibling.id,
        include_descendants=True,
        created_by=system_admin.id,
    )
    headers = _auth_headers(api_client, "phase1j-scoped@example.test")

    roles = api_client.get("/api/v1/roles", headers=headers)
    permissions = api_client.get("/api/v1/permissions", headers=headers)
    assert roles.status_code == 200, roles.text
    assert permissions.status_code == 200, permissions.text

    created_user = api_client.post(
        "/api/v1/users",
        json={
            "email": "phase1j-branch-user@example.test",
            "display_name": "Phase 1J Branch User",
            "password": "branch-pass",
        },
        headers=headers,
    )
    assert created_user.status_code == 201, created_user.text

    create_superuser = api_client.post(
        "/api/v1/users",
        json={
            "email": "phase1j-bad-super@example.test",
            "display_name": "Bad Super",
            "password": "bad-pass",
            "is_superuser": True,
        },
        headers=headers,
    )
    assert create_superuser.status_code == 403, create_superuser.text

    allowed_grant = api_client.post(
        "/api/v1/access-grants",
        json={
            "user_id": created_user.json()["id"],
            "role_id": str(subordinate_org_admin_role.id),
            "organization_id": str(grandchild.id),
            "include_descendants": True,
        },
        headers=headers,
    )
    assert allowed_grant.status_code == 201, allowed_grant.text

    sibling_grant = api_client.post(
        "/api/v1/access-grants",
        json={
            "user_id": created_user.json()["id"],
            "role_id": str(subordinate_org_admin_role.id),
            "organization_id": str(sibling.id),
            "include_descendants": True,
        },
        headers=headers,
    )
    global_grant = api_client.post(
        "/api/v1/access-grants",
        json={
            "user_id": created_user.json()["id"],
            "role_id": str(subordinate_org_admin_role.id),
            "organization_id": None,
            "include_descendants": True,
        },
        headers=headers,
    )
    assert sibling_grant.status_code == 403, sibling_grant.text
    assert global_grant.status_code == 403, global_grant.text

    users = api_client.get("/api/v1/users", headers=headers)
    assert users.status_code == 200, users.text
    visible_user_ids = {item["id"] for item in users.json()["items"]}
    assert created_user.json()["id"] in visible_user_ids
    assert str(sibling_user.id) not in visible_user_ids


def test_system_admin_creates_subordinate_user_profile_with_multiple_scope_roots(
    api_client: TestClient,
    db_session: Session,
) -> None:
    BootstrapService(db_session).seed_defaults()
    system_admin = _create_user(db_session, "profile-system@example.test", is_superuser=True)
    organization_service = OrganizationService(db_session)
    root = organization_service.create_root_for_actor(
        actor_user_id=system_admin.id,
        code="profile-root",
        name="Profile root",
    )
    root_a = organization_service.create_child(
        parent_id=root.id,
        code="profile-root-a",
        name="Profile root A",
        created_by=system_admin.id,
    )
    root_b = organization_service.create_child(
        parent_id=root.id,
        code="profile-root-b",
        name="Profile root B",
        created_by=system_admin.id,
    )
    headers = _auth_headers(api_client, "profile-system@example.test")

    response = api_client.post(
        "/api/v1/users",
        json={
            "email": "profile-branch@example.test",
            "display_name": "Profile branch administrator",
            "password": "branch-pass",
            "role_code": "subordinate_organization_administrator",
            "organization_ids": [str(root_a.id), str(root_b.id)],
        },
        headers=headers,
    )

    assert response.status_code == 201, response.text
    payload = response.json()
    assert payload["role_code"] == "subordinate_organization_administrator"
    assert set(payload["organization_ids"]) == {str(root_a.id), str(root_b.id)}
    assert payload["can_manage_access"] is False


def test_non_superuser_cannot_enable_access_management_or_assign_global_role(
    api_client: TestClient,
    db_session: Session,
) -> None:
    BootstrapService(db_session).seed_defaults()
    system_admin = _create_user(
        db_session,
        "profile-boundary-system@example.test",
        is_superuser=True,
    )
    scoped_actor = _create_user(db_session, "profile-boundary-actor@example.test")
    managed_user = _create_user(db_session, "profile-boundary-user@example.test")
    organization_service = OrganizationService(db_session)
    root = organization_service.create_root_for_actor(
        actor_user_id=system_admin.id,
        code="profile-boundary-root",
        name="Profile boundary root",
    )
    access_manager_role = _create_role_with_existing_permissions(
        db_session,
        code="profile_access_manager",
        permission_codes=["users.manage", "access_grants.manage"],
    )
    _grant_access(
        db_session,
        user_id=scoped_actor.id,
        role_id=access_manager_role.id,
        organization_id=root.id,
        include_descendants=True,
        created_by=system_admin.id,
    )
    subordinate_role = db_session.scalars(
        select(Role).where(Role.code == "subordinate_organization_administrator")
    ).one()
    _grant_access(
        db_session,
        user_id=managed_user.id,
        role_id=subordinate_role.id,
        organization_id=root.id,
        include_descendants=True,
        created_by=system_admin.id,
    )
    headers = _auth_headers(api_client, "profile-boundary-actor@example.test")

    access_flag_response = api_client.patch(
        f"/api/v1/users/{managed_user.id}",
        json={"can_manage_access": True},
        headers=headers,
    )
    global_role_response = api_client.patch(
        f"/api/v1/users/{managed_user.id}",
        json={
            "role_code": "organization_administrator",
            "organization_ids": [],
        },
        headers=headers,
    )

    assert access_flag_response.status_code == 403, access_flag_response.text
    assert global_role_response.status_code == 403, global_role_response.text


def test_subordinate_admin_reads_schema_and_references_but_cannot_mutate_them(
    api_client: TestClient,
    db_session: Session,
) -> None:
    BootstrapService(db_session).seed_defaults()
    system_admin = _create_user(db_session, "readonly-system@example.test", is_superuser=True)
    subordinate = _create_user(db_session, "readonly-subordinate@example.test")
    organization = OrganizationService(db_session).create_root_for_actor(
        actor_user_id=system_admin.id,
        code="readonly-root",
        name="Read-only root",
    )
    registry = RegistrySchemaService(db_session).create_registry_for_actor(
        actor_user_id=system_admin.id,
        code="readonly-registry",
        name="Read-only registry",
    )
    ReferenceListService(db_session).create_reference_list_for_actor(
        actor_user_id=system_admin.id,
        registry_id=registry.id,
        code="readonly-reference",
        name="Read-only reference",
    )
    subordinate_role = db_session.scalars(
        select(Role).where(Role.code == "subordinate_organization_administrator")
    ).one()
    _grant_access(
        db_session,
        user_id=subordinate.id,
        role_id=subordinate_role.id,
        organization_id=organization.id,
        include_descendants=True,
        created_by=system_admin.id,
    )
    headers = _auth_headers(api_client, "readonly-subordinate@example.test")

    schema_response = api_client.get(f"/api/v1/registries/{registry.id}/schema", headers=headers)
    references_response = api_client.get(
        f"/api/v1/registries/{registry.id}/reference-lists",
        headers=headers,
    )
    create_block_response = api_client.post(
        f"/api/v1/registries/{registry.id}/blocks",
        json={"code": "forbidden_block", "title": "Forbidden block", "position": 1},
        headers=headers,
    )
    create_reference_response = api_client.post(
        f"/api/v1/registries/{registry.id}/reference-lists",
        json={"code": "forbidden_reference", "name": "Forbidden reference"},
        headers=headers,
    )

    assert schema_response.status_code == 200, schema_response.text
    assert references_response.status_code == 200, references_response.text
    assert create_block_response.status_code == 403, create_block_response.text
    assert create_reference_response.status_code == 403, create_reference_response.text
