from io import StringIO
from pathlib import Path

from alembic import command
from alembic.config import Config


def _alembic_config(stdout: StringIO) -> Config:
    backend_root = Path(__file__).resolve().parents[1]
    config = Config(str(backend_root / "alembic.ini"), stdout=stdout)
    config.set_main_option("script_location", str(backend_root / "migrations"))
    config.attributes["output_buffer"] = stdout
    return config


def test_alembic_can_render_core_schema_upgrade_sql() -> None:
    stdout = StringIO()
    command.upgrade(_alembic_config(stdout), "head", sql=True)

    sql = stdout.getvalue()

    assert "CREATE EXTENSION IF NOT EXISTS pgcrypto" in sql
    assert "CREATE TABLE organizations" in sql
    assert "CREATE TABLE organization_closure" in sql
    assert "CREATE TABLE field_values" in sql
    assert "CREATE TABLE audit_events" in sql
    assert "CREATE TABLE employees" not in sql


def test_alembic_uses_timestamptz_for_datetime_columns() -> None:
    stdout = StringIO()
    command.upgrade(_alembic_config(stdout), "head", sql=True)

    assert "TIMESTAMP WITHOUT TIME ZONE" not in stdout.getvalue()
