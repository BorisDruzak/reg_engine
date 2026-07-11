import os
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine, make_url


def _require_test_database_url() -> str:
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is required for disposable PostgreSQL migration tests.")

    database_name = make_url(database_url).database or ""
    if database_name == "reg_engine" or not database_name.endswith("_test"):
        pytest.fail("TEST_DATABASE_URL must point to a disposable database ending with '_test'.")
    return database_url


def _alembic_config() -> Config:
    backend_root = Path(__file__).resolve().parents[1]
    config = Config(str(backend_root / "alembic.ini"))
    config.set_main_option("script_location", str(backend_root / "migrations"))
    return config


def _run_upgrade(database_url: str, revision: str) -> None:
    previous_url = os.environ.get("TEST_DATABASE_URL")
    os.environ["TEST_DATABASE_URL"] = database_url
    try:
        command.upgrade(_alembic_config(), revision)
    finally:
        if previous_url is None:
            os.environ.pop("TEST_DATABASE_URL", None)
        else:
            os.environ["TEST_DATABASE_URL"] = previous_url


def _reset_public_schema(engine: Engine) -> None:
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
        connection.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
        connection.execute(text("CREATE SCHEMA public"))


def test_three_role_migration_archives_legacy_roles_and_converts_org_scope() -> None:
    database_url = _require_test_database_url()
    engine = create_engine(database_url)
    _reset_public_schema(engine)
    _run_upgrade(database_url, "0024_card_public_access")

    with engine.begin() as connection:
        user_id = connection.scalar(
            text(
                """
                INSERT INTO public.users (email, display_name, status, is_superuser)
                VALUES ('legacy-org-admin@example.test', 'Legacy Org Admin', 'active', false)
                RETURNING id
                """
            )
        )
        organization_id = connection.scalar(
            text(
                """
                INSERT INTO public.organizations (code, name, type, is_active)
                VALUES ('legacy-root', 'Legacy root', 'organization', true)
                RETURNING id
                """
            )
        )
        old_org_admin_id = connection.scalar(
            text(
                """
                INSERT INTO public.roles (code, name, description, is_system)
                VALUES ('org_admin', 'Legacy org admin', 'Legacy scoped role.', true)
                RETURNING id
                """
            )
        )
        old_auditor_id = connection.scalar(
            text(
                """
                INSERT INTO public.roles (code, name, description, is_system)
                VALUES ('auditor', 'Legacy auditor', 'Legacy read-only role.', true)
                RETURNING id
                """
            )
        )
        old_grant_id = connection.scalar(
            text(
                """
                INSERT INTO public.access_grants (
                    user_id,
                    role_id,
                    organization_id,
                    include_descendants
                )
                VALUES (:user_id, :role_id, :organization_id, true)
                RETURNING id
                """
            ),
            {
                "user_id": user_id,
                "role_id": old_org_admin_id,
                "organization_id": organization_id,
            },
        )
        connection.execute(
            text(
                """
                INSERT INTO public.access_grants (user_id, role_id, include_descendants)
                VALUES (:user_id, :role_id, true)
                """
            ),
            {"user_id": user_id, "role_id": old_auditor_id},
        )

    _run_upgrade(database_url, "head")

    with engine.connect() as connection:
        active_role_codes = set(
            connection.scalars(text("SELECT code FROM public.roles WHERE archived_at IS NULL"))
        )
        assert active_role_codes == {
            "administrator",
            "organization_administrator",
            "subordinate_organization_administrator",
        }
        assert (
            connection.scalar(
                text("SELECT can_manage_access FROM public.users WHERE id = :user_id"),
                {"user_id": user_id},
            )
            is False
        )
        assert (
            connection.scalar(
                text("SELECT archived_at IS NOT NULL FROM public.roles WHERE id = :role_id"),
                {"role_id": old_org_admin_id},
            )
            is True
        )
        assert (
            connection.scalar(
                text("SELECT archived_at IS NOT NULL FROM public.roles WHERE id = :role_id"),
                {"role_id": old_auditor_id},
            )
            is True
        )
        assert (
            connection.scalar(
                text(
                    "SELECT archived_at IS NOT NULL FROM public.access_grants WHERE id = :grant_id"
                ),
                {"grant_id": old_grant_id},
            )
            is True
        )
        replacement = (
            connection.execute(
                text(
                    """
                SELECT access_grant.organization_id, access_grant.include_descendants
                FROM public.access_grants AS access_grant
                JOIN public.roles AS role ON role.id = access_grant.role_id
                WHERE access_grant.user_id = :user_id
                  AND role.code = 'subordinate_organization_administrator'
                  AND access_grant.archived_at IS NULL
                """
                ),
                {"user_id": user_id},
            )
            .mappings()
            .one()
        )
        assert replacement == {
            "organization_id": organization_id,
            "include_descendants": True,
        }
        assert (
            connection.scalar(
                text(
                    """
                SELECT count(*)
                FROM public.access_grants AS access_grant
                JOIN public.roles AS role ON role.id = access_grant.role_id
                WHERE access_grant.user_id = :user_id
                  AND role.code = 'auditor'
                  AND access_grant.archived_at IS NULL
                """
                ),
                {"user_id": user_id},
            )
            == 0
        )

    engine.dispose()
