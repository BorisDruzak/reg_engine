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


def _render_upgrade_sql(revision: str) -> str:
    stdout = StringIO()
    command.upgrade(_alembic_config(stdout), revision, sql=True)
    return stdout.getvalue()


def _render_downgrade_sql(start_revision: str, end_revision: str) -> str:
    stdout = StringIO()
    command.downgrade(
        _alembic_config(stdout),
        f"{start_revision}:{end_revision}",
        sql=True,
    )
    return stdout.getvalue()


EXPECTED_TABLES = {
    "access_grants",
    "audit_events",
    "card_block_instances",
    "card_attachments",
    "card_public_field_settings",
    "card_public_links",
    "card_creation_link_cards",
    "card_creation_link_organizations",
    "card_creation_links",
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
    assert "0020_schema_layout_static_text" in sql
    assert "0022_card_print_layout_templates" in sql
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
    assert "'card_print_layout_v1'" in sql
    assert "ALTER TABLE public.document_templates ADD COLUMN card_template_id UUID" in sql
    assert "ALTER TABLE public.document_template_versions ADD COLUMN layout_json JSONB" in sql
    assert "fk_document_templates_card_template_id_card_templates" in sql
    assert "ck_document_templates_ck_document_templates_template_format" not in sql
    assert "ck_document_template_versions_ck_document_template_versions_template_format" not in sql
    assert (
        "ck_document_template_versions_ck_document_template_versions_layout_for_card_print"
        not in sql
    )
    assert "fk_document_templates_fk_document_templates_card_template_id_card_templates" not in sql
    assert "value_attachment_id UUID" in sql
    assert "fk_field_values_value_attachment_id_card_attachments" in sql
    assert "CREATE TABLE report_templates" in sql or "CREATE TABLE public.report_templates" in sql
    assert "CREATE TABLE report_runs" in sql or "CREATE TABLE public.report_runs" in sql
    assert "ix_field_values_field_attachment" in sql
    assert "'file_ref'" in sql
    assert "'static_text'" in sql
    assert "layout_columns INTEGER DEFAULT '1' NOT NULL" in sql
    assert "display_config_json JSONB" in sql
    assert "ALTER TABLE public.form_blocks ADD COLUMN display_config_json JSONB" in sql
    assert "'mcp'" in sql
    assert "ALTER TABLE public.audit_events ALTER COLUMN created_at SET DEFAULT now()" in sql
    assert "CREATE TABLE employees" not in sql


def test_card_public_access_migration_creates_field_scope_table() -> None:
    sql = _render_upgrade_sql("head")

    assert (
        "CREATE TABLE card_public_field_settings" in sql
        or "CREATE TABLE public.card_public_field_settings" in sql
    )
    assert "uq_card_public_field_settings_card_field" in sql


def test_card_creation_link_migration_creates_normalized_tables_and_indefinite_links() -> None:
    sql = _render_upgrade_sql("head")

    assert "0027_card_creation_links" in sql
    assert (
        "CREATE TABLE card_creation_links" in sql
        or "CREATE TABLE public.card_creation_links" in sql
    )
    assert (
        "CREATE TABLE card_creation_link_organizations" in sql
        or "CREATE TABLE public.card_creation_link_organizations" in sql
    )
    assert (
        "CREATE TABLE card_creation_link_cards" in sql
        or "CREATE TABLE public.card_creation_link_cards" in sql
    )
    assert "uq_card_creation_links_token_hash" in sql
    assert "ALTER COLUMN expires_at DROP NOT NULL" in sql


def test_alembic_revision_ids_fit_version_table_limit() -> None:
    versions_dir = Path(__file__).resolve().parents[1] / "migrations" / "versions"

    for migration_path in versions_dir.glob("*.py"):
        namespace: dict[str, object] = {}
        exec(migration_path.read_text(encoding="utf-8"), namespace)
        revision = namespace["revision"]
        assert isinstance(revision, str)
        assert len(revision) <= 32


def test_public_link_review_migration_adds_lifecycle_columns() -> None:
    sql = _render_upgrade_sql("0023_public_link_review")

    assert "0023_public_link_review" in sql
    assert "submitted_at TIMESTAMP WITH TIME ZONE" in sql
    assert "reviewed_at TIMESTAMP WITH TIME ZONE" in sql
    assert "reviewed_by UUID" in sql
    assert "review_comment TEXT" in sql
    assert "baseline_snapshot_json JSONB" in sql
    assert "submission_summary_json JSONB" in sql
    assert "review_enabled BOOLEAN DEFAULT false NOT NULL" in sql
    assert "fk_card_public_links_reviewed_by_users" in sql
    assert "ck_card_public_links_status" in sql
    assert "'submitted'" in sql
    assert "'changes_requested'" in sql
    assert "'approved'" in sql
    assert "ix_card_public_links_card_status_submitted" in sql


def test_public_link_review_migration_downgrade_maps_new_statuses_before_constraint() -> None:
    sql = _render_downgrade_sql(
        "0023_public_link_review",
        "0022_card_print_layout_templates",
    )

    status_mapping_position = sql.index("UPDATE public.card_public_links")
    old_constraint_position = sql.index("CHECK (status in ('active', 'disabled', 'expired'))")

    assert status_mapping_position < old_constraint_position
    assert "status IN ('submitted', 'changes_requested', 'approved')" in sql
    assert "DROP INDEX public.ix_card_public_links_card_status_submitted" in sql
    assert "DROP CONSTRAINT fk_card_public_links_reviewed_by_users" in sql
    for column_name in {
        "submitted_at",
        "reviewed_at",
        "reviewed_by",
        "review_comment",
        "baseline_snapshot_json",
        "submission_summary_json",
        "review_enabled",
    }:
        assert f"DROP COLUMN {column_name}" in sql
