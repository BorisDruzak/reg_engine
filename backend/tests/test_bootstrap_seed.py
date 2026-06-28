import os
from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, delete, func, select, text
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import Session

from app.models import Permission, Role, User, role_permissions
from app.services.bootstrap import BootstrapService

EXPECTED_PERMISSIONS = {
    "organizations.manage",
    "registry.schema.manage",
    "cards.manage",
    "audit.read",
    "users.manage",
    "roles.read",
    "permissions.read",
    "access_grants.manage",
}

EXPECTED_ROLE_PERMISSIONS = {
    "system_admin": EXPECTED_PERMISSIONS,
    "registry_admin": {"registry.schema.manage", "cards.manage"},
    "org_admin": {"organizations.manage", "cards.manage"},
    "auditor": {"audit.read"},
}


def _require_test_database_url() -> str:
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is required for disposable PostgreSQL bootstrap tests.")

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


def _permissions_for_role(session: Session, role_code: str) -> set[str]:
    return set(
        session.scalars(
            select(Permission.code)
            .join(role_permissions, role_permissions.c.permission_id == Permission.id)
            .join(Role, Role.id == role_permissions.c.role_id)
            .where(Role.code == role_code)
        ).all()
    )


def test_bootstrap_seed_creates_expected_roles_permissions_and_is_idempotent(
    db_session: Session,
) -> None:
    service = BootstrapService(db_session)

    first = service.seed_defaults()
    second = service.seed_defaults()

    role_codes = set(db_session.scalars(select(Role.code)).all())
    permission_codes = set(db_session.scalars(select(Permission.code)).all())

    assert first.roles_created == 4
    assert first.permissions_created == len(EXPECTED_PERMISSIONS)
    assert second.roles_created == 0
    assert second.permissions_created == 0
    assert set(EXPECTED_ROLE_PERMISSIONS) <= role_codes
    assert permission_codes >= EXPECTED_PERMISSIONS

    for role in db_session.scalars(select(Role).where(Role.code.in_(EXPECTED_ROLE_PERMISSIONS))):
        assert role.is_system is True
        assert role.archived_at is None

    for role_code, expected_permissions in EXPECTED_ROLE_PERMISSIONS.items():
        assert expected_permissions <= _permissions_for_role(db_session, role_code)

    total_links = db_session.scalar(select(func.count()).select_from(role_permissions))
    distinct_links = db_session.scalar(
        select(func.count()).select_from(
            select(role_permissions.c.role_id, role_permissions.c.permission_id)
            .distinct()
            .subquery()
        )
    )
    assert total_links == distinct_links


def test_bootstrap_seed_repairs_missing_role_permission_link(db_session: Session) -> None:
    service = BootstrapService(db_session)
    service.seed_defaults()
    registry_admin = db_session.scalars(select(Role).where(Role.code == "registry_admin")).one()
    cards_manage = db_session.scalars(
        select(Permission).where(Permission.code == "cards.manage")
    ).one()
    db_session.execute(
        delete(role_permissions).where(
            role_permissions.c.role_id == registry_admin.id,
            role_permissions.c.permission_id == cards_manage.id,
        )
    )
    db_session.flush()

    result = service.seed_defaults()

    assert result.role_permission_links_created == 1
    assert "cards.manage" in _permissions_for_role(db_session, "registry_admin")


def test_create_superadmin_is_repeatable_and_case_insensitive(db_session: Session) -> None:
    service = BootstrapService(db_session)

    first = service.create_superadmin(
        email="ADMIN@example.test",
        display_name="Initial Admin",
        password_hash="hash-1",
    )
    second = service.create_superadmin(
        email="admin@example.test",
        display_name="Updated Admin",
        password_hash="hash-2",
    )

    users = list(
        db_session.scalars(select(User).where(func.lower(User.email) == "admin@example.test"))
    )
    assert first.id == second.id
    assert len(users) == 1
    assert users[0].email == "admin@example.test"
    assert users[0].display_name == "Updated Admin"
    assert users[0].password_hash == "hash-2"
    assert users[0].is_superuser is True
    assert users[0].status == "active"
    assert users[0].archived_at is None


def test_bootstrap_cli_seeds_and_creates_superadmin(migrated_test_engine: Engine) -> None:
    from app.cli.bootstrap import main

    database_url = migrated_test_engine.url.render_as_string(hide_password=False)

    seed_status = main(["seed", "--database-url", database_url])
    superadmin_status = main(
        [
            "create-superadmin",
            "--database-url",
            database_url,
            "--email",
            "cli-admin@example.test",
            "--display-name",
            "CLI Admin",
            "--password-hash",
            "cli-hash",
        ]
    )

    with Session(migrated_test_engine, expire_on_commit=False) as session:
        user = session.scalars(select(User).where(User.email == "cli-admin@example.test")).one()
        permission_count = session.scalar(
            select(func.count())
            .select_from(Permission)
            .where(Permission.code.in_(EXPECTED_PERMISSIONS))
        )

    assert seed_status == 0
    assert superadmin_status == 0
    assert permission_count == len(EXPECTED_PERMISSIONS)
    assert user.is_superuser is True
    assert user.password_hash == "cli-hash"
