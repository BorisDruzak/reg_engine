import os
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import CheckConstraint, Index, UniqueConstraint, create_engine, inspect, text
from sqlalchemy.engine import Engine, make_url

from app.models import Base

EXPECTED_TABLES = {
    "access_grants",
    "audit_events",
    "card_block_instances",
    "card_public_links",
    "card_relations",
    "cards",
    "field_value_items",
    "field_values",
    "form_blocks",
    "form_fields",
    "org_units",
    "organization_closure",
    "organizations",
    "permissions",
    "reference_items",
    "reference_lists",
    "registries",
    "role_permissions",
    "roles",
    "users",
}

FORBIDDEN_HR_COLUMNS = {
    "awards",
    "birth_date",
    "dismissal_date",
    "dismissal_reason",
    "education",
    "experience",
    "qualification",
    "service_history",
}


def _require_test_database_url() -> str:
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is required for disposable PostgreSQL smoke tests.")

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


def _metadata_contract_gaps(engine: Engine) -> dict[str, Any]:
    inspector = inspect(engine)
    actual_tables = set(inspector.get_table_names(schema="public"))
    missing_columns: dict[str, list[str]] = {}
    missing_unique_constraints: dict[str, list[str]] = {}
    missing_check_constraints: dict[str, list[str]] = {}
    missing_indexes: dict[str, list[str]] = {}

    for table_name, table in Base.metadata.tables.items():
        if table_name not in actual_tables:
            continue

        actual_columns = {
            column["name"] for column in inspector.get_columns(table_name, schema="public")
        }
        expected_columns = {column.name for column in table.columns}
        if missing := sorted(expected_columns - actual_columns):
            missing_columns[table_name] = missing

        actual_unique = {
            constraint["name"] or ""
            for constraint in inspector.get_unique_constraints(table_name, schema="public")
        }
        expected_unique = {
            constraint.name or ""
            for constraint in table.constraints
            if isinstance(constraint, UniqueConstraint)
        }
        if missing := sorted(expected_unique - actual_unique):
            missing_unique_constraints[table_name] = missing

        actual_checks = {
            constraint["name"] or ""
            for constraint in inspector.get_check_constraints(table_name, schema="public")
        }
        expected_checks = {
            constraint.name or ""
            for constraint in table.constraints
            if isinstance(constraint, CheckConstraint)
        }
        if missing := sorted(expected_checks - actual_checks):
            missing_check_constraints[table_name] = missing

        actual_indexes = {
            index["name"] or "" for index in inspector.get_indexes(table_name, schema="public")
        }
        expected_indexes = {index.name or "" for index in table.indexes if isinstance(index, Index)}
        if missing := sorted(expected_indexes - actual_indexes):
            missing_indexes[table_name] = missing

    actual_columns = {
        column["name"]
        for table_name in actual_tables
        for column in inspector.get_columns(table_name, schema="public")
    }

    return {
        "missing_tables": sorted(EXPECTED_TABLES - actual_tables),
        "employees_present": "employees" in actual_tables,
        "forbidden_hr_columns": sorted(FORBIDDEN_HR_COLUMNS & actual_columns),
        "missing_columns": missing_columns,
        "missing_unique_constraints": missing_unique_constraints,
        "missing_check_constraints": missing_check_constraints,
        "missing_indexes": missing_indexes,
    }


def _insert_returning_id(connection: Any, table_name: str, **values: Any) -> Any:
    table = Base.metadata.tables[table_name]
    return connection.execute(table.insert().values(**values).returning(table.c.id)).scalar_one()


def test_alembic_upgrade_head_records_current_head(migrated_test_engine: Engine) -> None:
    with migrated_test_engine.connect() as connection:
        version = connection.execute(text("select version_num from alembic_version")).scalar_one()

    assert version == "0003_reconcile_core_schema_v1"


def test_disposable_database_matches_core_schema_metadata(migrated_test_engine: Engine) -> None:
    gaps = _metadata_contract_gaps(migrated_test_engine)

    assert gaps == {
        "missing_tables": [],
        "employees_present": False,
        "forbidden_hr_columns": [],
        "missing_columns": {},
        "missing_unique_constraints": {},
        "missing_check_constraints": {},
        "missing_indexes": {},
    }

    with migrated_test_engine.connect() as connection:
        pgcrypto = connection.execute(
            text("select extname from pg_extension where extname = 'pgcrypto'")
        ).scalar_one_or_none()

    assert pgcrypto == "pgcrypto"


def test_core_model_insert_smoke(migrated_test_engine: Engine) -> None:
    expires_at = datetime.now(UTC) + timedelta(days=7)

    with migrated_test_engine.begin() as connection:
        user_id = _insert_returning_id(
            connection,
            "users",
            email="admin@example.test",
            display_name="Admin",
        )
        role_id = _insert_returning_id(connection, "roles", code="org_admin", name="Org admin")
        permission_id = _insert_returning_id(
            connection,
            "permissions",
            code="cards.read",
            description="Read cards",
        )
        connection.execute(
            Base.metadata.tables["role_permissions"]
            .insert()
            .values(
                role_id=role_id,
                permission_id=permission_id,
            )
        )

        organization_id = _insert_returning_id(
            connection,
            "organizations",
            code="root",
            name="Root organization",
            created_by=user_id,
        )
        child_organization_id = _insert_returning_id(
            connection,
            "organizations",
            parent_id=organization_id,
            code="child",
            name="Child organization",
            created_by=user_id,
        )
        connection.execute(
            Base.metadata.tables["organization_closure"].insert(),
            [
                {
                    "ancestor_id": organization_id,
                    "descendant_id": organization_id,
                    "depth": 0,
                },
                {
                    "ancestor_id": child_organization_id,
                    "descendant_id": child_organization_id,
                    "depth": 0,
                },
                {
                    "ancestor_id": organization_id,
                    "descendant_id": child_organization_id,
                    "depth": 1,
                },
            ],
        )
        org_unit_id = _insert_returning_id(
            connection,
            "org_units",
            organization_id=organization_id,
            code="hq",
            name="Headquarters",
            created_by=user_id,
        )

        registry_id = _insert_returning_id(
            connection,
            "registries",
            code="assets",
            name="Assets",
            created_by=user_id,
        )
        _insert_returning_id(
            connection,
            "access_grants",
            user_id=user_id,
            role_id=role_id,
            registry_id=registry_id,
            organization_id=organization_id,
            created_by=user_id,
        )

        reference_list_id = _insert_returning_id(
            connection,
            "reference_lists",
            registry_id=registry_id,
            owner_organization_id=organization_id,
            code="asset_types",
            name="Asset types",
            created_by=user_id,
        )
        reference_item_id = _insert_returning_id(
            connection,
            "reference_items",
            list_id=reference_list_id,
            code="laptop",
            label="Laptop",
            created_by=user_id,
        )
        block_id = _insert_returning_id(
            connection,
            "form_blocks",
            registry_id=registry_id,
            code="main",
            title="Main",
            created_by=user_id,
        )
        text_field_id = _insert_returning_id(
            connection,
            "form_fields",
            block_id=block_id,
            code="serial_number",
            label="Serial number",
            field_type="text",
            created_by=user_id,
        )
        multi_select_field_id = _insert_returning_id(
            connection,
            "form_fields",
            block_id=block_id,
            code="asset_type",
            label="Asset type",
            field_type="multi_select",
            options_source_type="reference_list",
            options_source_id=reference_list_id,
            created_by=user_id,
        )

        card_id = _insert_returning_id(
            connection,
            "cards",
            registry_id=registry_id,
            organization_id=organization_id,
            org_unit_id=org_unit_id,
            display_name="Asset 1",
            created_by=user_id,
        )
        target_card_id = _insert_returning_id(
            connection,
            "cards",
            registry_id=registry_id,
            organization_id=child_organization_id,
            display_name="Asset 2",
            created_by=user_id,
        )
        block_instance_id = _insert_returning_id(
            connection,
            "card_block_instances",
            card_id=card_id,
            block_id=block_id,
            created_by=user_id,
        )
        _insert_returning_id(
            connection,
            "field_values",
            card_id=card_id,
            block_instance_id=block_instance_id,
            field_id=text_field_id,
            value_text="SN-001",
            created_by=user_id,
            updated_by=user_id,
        )
        multi_value_id = _insert_returning_id(
            connection,
            "field_values",
            card_id=card_id,
            block_instance_id=block_instance_id,
            field_id=multi_select_field_id,
            created_by=user_id,
            updated_by=user_id,
        )
        _insert_returning_id(
            connection,
            "field_value_items",
            field_value_id=multi_value_id,
            reference_item_id=reference_item_id,
        )
        _insert_returning_id(
            connection,
            "card_relations",
            source_card_id=card_id,
            target_card_id=target_card_id,
            relation_type="related_to",
            created_by=user_id,
        )
        public_link_id = _insert_returning_id(
            connection,
            "card_public_links",
            card_id=card_id,
            token_hash="token-hash",
            expires_at=expires_at,
            created_by=user_id,
        )
        _insert_returning_id(
            connection,
            "audit_events",
            actor_type="user",
            actor_user_id=user_id,
            actor_public_link_id=public_link_id,
            action="create",
            object_type="card",
            object_id=card_id,
            source="api",
        )

        for table_name in EXPECTED_TABLES:
            count = connection.execute(
                text(f"select count(*) from {table_name}")  # noqa: S608
            ).scalar_one()
            assert count > 0, table_name
