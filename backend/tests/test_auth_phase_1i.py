import os
from collections.abc import Iterator
from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import Session

from app.api.dependencies import get_db_session
from app.core.config import get_settings
from app.main import create_app
from app.models import User
from app.services.auth import hash_password


def _require_test_database_url() -> str:
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is required for disposable PostgreSQL auth tests.")

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
    os.environ["AUTH_TOKEN_SECRET"] = "phase-1i-test-secret"
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
    password: str,
    *,
    is_superuser: bool = False,
    status: str = "active",
) -> User:
    user = User(
        email=email,
        display_name=email,
        password_hash=hash_password(password),
        is_superuser=is_superuser,
        status=status,
    )
    session.add(user)
    session.flush()
    return user


def test_password_hashing_uses_non_plaintext_verifiable_hash() -> None:
    password_hash = hash_password("secret-pass")

    assert password_hash != "secret-pass"
    assert password_hash.startswith("pbkdf2_sha256$")


def test_login_me_and_protected_endpoint_use_bearer_token_without_dev_header(
    api_client: TestClient,
    db_session: Session,
) -> None:
    user = _create_user(db_session, "auth-admin@example.test", "secret-pass", is_superuser=True)

    login = api_client.post(
        "/api/v1/auth/login",
        json={"email": "AUTH-ADMIN@example.test", "password": "secret-pass"},
    )
    assert login.status_code == 200, login.text
    token_payload = login.json()
    assert token_payload["token_type"] == "bearer"
    assert token_payload["access_token"]
    assert token_payload["user"]["id"] == str(user.id)

    auth_headers = {"Authorization": f"Bearer {token_payload['access_token']}"}
    me = api_client.get("/api/v1/auth/me", headers=auth_headers)
    assert me.status_code == 200, me.text
    assert me.json()["email"] == "auth-admin@example.test"

    root = api_client.post(
        "/api/v1/organizations",
        json={"code": "phase1i-auth-root", "name": "Phase 1I Auth Root"},
        headers=auth_headers,
    )
    assert root.status_code == 201, root.text
    assert root.json()["code"] == "phase1i-auth-root"


def test_invalid_login_disabled_user_and_bad_token_are_rejected(
    api_client: TestClient,
    db_session: Session,
) -> None:
    _create_user(db_session, "auth-user@example.test", "secret-pass")
    _create_user(db_session, "auth-disabled@example.test", "secret-pass", status="disabled")

    wrong_password = api_client.post(
        "/api/v1/auth/login",
        json={"email": "auth-user@example.test", "password": "wrong"},
    )
    disabled = api_client.post(
        "/api/v1/auth/login",
        json={"email": "auth-disabled@example.test", "password": "secret-pass"},
    )
    bad_token = api_client.get("/api/v1/auth/me", headers={"Authorization": "Bearer invalid"})

    assert wrong_password.status_code == 401, wrong_password.text
    assert disabled.status_code == 401, disabled.text
    assert bad_token.status_code == 401, bad_token.text


def test_logout_requires_bearer_token_and_returns_placeholder_status(
    api_client: TestClient,
    db_session: Session,
) -> None:
    _create_user(db_session, "auth-logout@example.test", "secret-pass")
    login = api_client.post(
        "/api/v1/auth/login",
        json={"email": "auth-logout@example.test", "password": "secret-pass"},
    )
    token = login.json()["access_token"]

    missing = api_client.post("/api/v1/auth/logout")
    logout = api_client.post("/api/v1/auth/logout", headers={"Authorization": f"Bearer {token}"})

    assert missing.status_code == 401, missing.text
    assert logout.status_code == 200, logout.text
    assert logout.json() == {"status": "ok"}


def test_dev_actor_header_still_requires_explicit_opt_in(db_session: Session) -> None:
    os.environ.pop("ALLOW_DEV_ACTOR_HEADER", None)
    os.environ["AUTH_TOKEN_SECRET"] = "phase-1i-test-secret"
    get_settings.cache_clear()
    app = create_app()

    def override_session() -> Iterator[Session]:
        yield db_session

    app.dependency_overrides[get_db_session] = override_session
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/organizations",
            json={"code": "phase1i-dev-header", "name": "Dev Header"},
            headers={"X-Actor-User-Id": str(uuid4())},
        )

    get_settings.cache_clear()

    assert response.status_code == 401
    assert "production auth" in response.json()["detail"].lower()
