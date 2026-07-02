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
    "card_templates",
    "cards",
    "document_templates",
    "document_template_versions",
    "field_value_items",
    "field_values",
    "form_blocks",
    "form_fields",
    "generated_documents",
    "org_units",
    "organization_closure",
    "organizations",
    "permissions",
    "reference_items",
    "reference_lists",
    "registries",
    "report_runs",
    "report_templates",
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
        assert f"CREATE TABLE {table_name}" in sql or f"CREATE TABLE public.{table_name}" in sql
    assert "0008_file_ref_field_values" in sql
    assert "0009_document_template_versions" in sql
    assert "0010_reports" in sql
    assert "0011_mcp_audit_source" in sql
    assert "0015_audit_created_at_default" in sql
    assert "0016_default_registry_tree" in sql
    assert "0017_registry_card_title_label" in sql
    assert "0018_card_templates" in sql
    assert "0019_base_card_templates" in sql
    assert "owner_organization_id UUID" in sql
    assert "is_default_for_owner_tree BOOLEAN DEFAULT false NOT NULL" in sql
    assert "card_title_label VARCHAR DEFAULT" in sql
    assert "ALTER TABLE public.cards ALTER COLUMN card_template_id SET NOT NULL" in sql
    assert "ck_registries_default_owner_requires_owner" in sql
    assert "ck_registries_ck_registries_default_owner_requires_owner" not in sql
    assert (
        "CREATE TABLE document_template_versions" in sql
        or "CREATE TABLE public.document_template_versions" in sql
    )
    assert "template_version_id UUID" in sql
    assert "'docx_binary_v1'" in sql
    assert "value_attachment_id UUID" in sql
    assert "fk_field_values_value_attachment_id_card_attachments" in sql
    assert "CREATE TABLE report_templates" in sql or "CREATE TABLE public.report_templates" in sql
    assert "CREATE TABLE report_runs" in sql or "CREATE TABLE public.report_runs" in sql
    assert "ix_field_values_field_attachment" in sql
    assert "'file_ref'" in sql
    assert "'mcp'" in sql
    assert "ALTER TABLE public.audit_events ALTER COLUMN created_at SET DEFAULT now()" in sql
    assert "CREATE TABLE employees" not in sql


def test_alembic_revision_ids_fit_version_table_limit() -> None:
    versions_dir = Path(__file__).resolve().parents[1] / "migrations" / "versions"

    for migration_path in versions_dir.glob("*.py"):
        namespace: dict[str, object] = {}
        exec(migration_path.read_text(encoding="utf-8"), namespace)
        revision = namespace["revision"]
        assert isinstance(revision, str)
        assert len(revision) <= 32
