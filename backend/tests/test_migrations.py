from io import StringIO
from pathlib import Path

from alembic import command
from alembic.config import Config

from app.models import Base


def _alembic_config(stdout: StringIO) -> Config:
    backend_root = Path(__file__).resolve().parents[1]
    config = Config(str(backend_root / "alembic.ini"), stdout=stdout)
    config.set_main_option("script_location", str(backend_root / "migrations"))
    config.attributes["output_buffer"] = stdout
    return config


EXPECTED_TABLES = {
    "access_grants",
    "audit_events",
    "card_block_instances",
    "card_attachments",
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
    "stored_files",
    "users",
}


def test_base_metadata_contains_core_schema_v1_tables() -> None:
    assert set(Base.metadata.tables) == EXPECTED_TABLES


def test_alembic_can_render_core_schema_upgrade_sql() -> None:
    stdout = StringIO()
    command.upgrade(_alembic_config(stdout), "head", sql=True)

    sql = stdout.getvalue()

    assert "CREATE EXTENSION IF NOT EXISTS pgcrypto" in sql
    assert "CREATE TABLE alembic_version" in sql
    for table_name in EXPECTED_TABLES:
        assert f"CREATE TABLE {table_name}" in sql
    assert "CREATE TABLE employees" not in sql


def test_alembic_revision_ids_fit_version_table_limit() -> None:
    versions_dir = Path(__file__).resolve().parents[1] / "migrations" / "versions"

    for migration_path in versions_dir.glob("*.py"):
        namespace: dict[str, object] = {}
        exec(migration_path.read_text(encoding="utf-8"), namespace)
        revision = namespace["revision"]
        assert isinstance(revision, str)
        assert len(revision) <= 32
