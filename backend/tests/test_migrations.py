import importlib
import json
import os
import re
from io import StringIO
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Engine, make_url

from app.models import Base


def test_document_display_placeholder_migration_rewrites_only_card_tokens(monkeypatch):
    migration = importlib.import_module("migrations.versions.0036_card_display_placeholders")
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.exec_driver_sql("ATTACH DATABASE ':memory:' AS public")
        connection.connection.driver_connection.create_function(
            "regexp_replace",
            4,
            lambda value, pattern, replacement, flags: (
                re.sub(pattern.replace(r"\m", r"\b").replace(r"\M", r"\b"), replacement, value)
                if value is not None
                else None
            ),
        )
        connection.exec_driver_sql(
            "CREATE TABLE public.document_templates "
            "(template_body TEXT, output_filename_template TEXT)"
        )
        connection.exec_driver_sql(
            "CREATE TABLE public.document_template_versions (template_body TEXT, layout_json TEXT)"
        )
        connection.exec_driver_sql("CREATE TABLE public.card_templates (field_schema_json TEXT)")
        body = "{{ card.display_name }} / {{ user.display_name }} / {{ card.display_name_extra }}"
        layout = json.dumps(
            {"items": [{"key": "card.display_name"}, {"text": "{{ user.display_name }}"}]}
        )
        connection.execute(
            text(
                "INSERT INTO public.document_templates "
                "VALUES (:body, '{{ card.display_name }}.docx')"
            ),
            {"body": body},
        )
        connection.execute(
            text("INSERT INTO public.document_template_versions VALUES (:body, :layout)"),
            {"body": body, "layout": layout},
        )
        connection.execute(
            text("INSERT INTO public.card_templates VALUES (:layout)"), {"layout": layout}
        )
        defaults = []

        class Operations:
            def execute(self, statement):
                connection.execute(text(str(statement).replace(" AS JSONB)", " AS TEXT)")))

            def alter_column(self, table, column, **kwargs):
                defaults.append((table, column, kwargs["server_default"]))

        monkeypatch.setattr(migration, "op", Operations())
        migration.upgrade()
        expected_body = (
            "{{ card.display_value }} / {{ user.display_name }} / {{ card.display_name_extra }}"
        )
        assert (
            connection.scalar(text("SELECT template_body FROM public.document_templates"))
            == expected_body
        )
        assert (
            connection.scalar(text("SELECT template_body FROM public.document_template_versions"))
            == expected_body
        )
        for table, column in [
            ("document_template_versions", "layout_json"),
            ("card_templates", "field_schema_json"),
        ]:
            value = json.loads(connection.scalar(text(f"SELECT {column} FROM public.{table}")))
            assert value["items"] == [
                {"key": "card.display_value"},
                {"text": "{{ user.display_name }}"},
            ]
        assert defaults[-1] == (
            "document_templates",
            "output_filename_template",
            "{{ card.display_value }}.docx",
        )
        migration.downgrade()
        assert (
            connection.scalar(text("SELECT template_body FROM public.document_templates")) == body
        )
        assert defaults[-1][2] == "{{ card.display_name }}.docx"
    engine.dispose()


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


def _require_test_database_url() -> str:
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is required for disposable PostgreSQL migration tests.")

    database_name = make_url(database_url).database or ""
    if database_name == "reg_engine" or not database_name.endswith("_test"):
        pytest.fail("TEST_DATABASE_URL must point to a disposable database ending with '_test'.")

    return database_url


def _run_online_upgrade(database_url: str, revision: str) -> None:
    previous_url = os.environ.get("TEST_DATABASE_URL")
    os.environ["TEST_DATABASE_URL"] = database_url
    try:
        command.upgrade(_alembic_config(StringIO()), revision)
    finally:
        if previous_url is None:
            os.environ.pop("TEST_DATABASE_URL", None)
        else:
            os.environ["TEST_DATABASE_URL"] = previous_url


def _run_online_downgrade(database_url: str, revision: str) -> None:
    previous_url = os.environ.get("TEST_DATABASE_URL")
    os.environ["TEST_DATABASE_URL"] = database_url
    try:
        command.downgrade(_alembic_config(StringIO()), revision)
    finally:
        if previous_url is None:
            os.environ.pop("TEST_DATABASE_URL", None)
        else:
            os.environ["TEST_DATABASE_URL"] = previous_url


def _reset_public_schema(engine: Engine) -> None:
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
        connection.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
        connection.execute(text("CREATE SCHEMA public"))


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
    "card_change_notification_subscriptions",
    "card_change_notifications",
    "card_event_changes",
    "card_events",
    "card_export_templates",
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
    "public_link_change_notification_subscriptions",
    "reference_items",
    "reference_edit_links",
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


def test_card_event_first_activation_backfill_preserves_known_history(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from alembic.migration import MigrationContext
    from alembic.operations import Operations

    migration = importlib.import_module("migrations.versions.0035_card_first_activation")
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text("ATTACH DATABASE ':memory:' AS public"))
        connection.execute(
            text("CREATE TABLE public.cards (id INTEGER PRIMARY KEY, lifecycle_status TEXT)")
        )
        connection.execute(
            text(
                "CREATE TABLE public.audit_events "
                "(card_id INTEGER, created_at DATETIME, new_data_json JSON)"
            )
        )
        connection.execute(
            text("CREATE TABLE public.card_events (card_id INTEGER, created_at DATETIME)")
        )
        connection.execute(
            text(
                "INSERT INTO public.cards VALUES "
                "(1, 'active'), (2, 'draft'), (3, 'draft'), (4, 'dismissed')"
            )
        )
        connection.execute(
            text("INSERT INTO public.audit_events VALUES (2, '2026-09-01 12:00:00', :data)"),
            {"data": '{"lifecycle_status":"active"}'},
        )
        monkeypatch.setattr(migration, "op", Operations(MigrationContext.configure(connection)))
        migration.upgrade()
        rows = connection.execute(
            text("SELECT id, activated_at FROM public.cards ORDER BY id")
        ).all()
        assert rows[0].activated_at is not None
        assert rows[1].activated_at == "2026-09-01 12:00:00"
        assert rows[2].activated_at is None
        assert rows[3].activated_at is not None
        migration.downgrade()
        assert "activated_at" not in {
            column["name"] for column in inspect(connection).get_columns("cards", schema="public")
        }
    engine.dispose()


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
    assert "0030_work_experience_field" in sql
    assert "0031_card_audit_history" in sql
    assert "0032_card_change_notifications" in sql
    assert "0034_card_events_exports_fio" in sql
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
    assert "'work_experience'" in sql
    assert "layout_columns INTEGER DEFAULT '1' NOT NULL" in sql
    assert "display_config_json JSONB" in sql
    assert "ALTER TABLE public.form_blocks ADD COLUMN display_config_json JSONB" in sql
    assert "'mcp'" in sql
    assert "ALTER TABLE public.audit_events ALTER COLUMN created_at SET DEFAULT now()" in sql
    assert "CREATE TABLE employees" not in sql


def test_card_events_export_templates_and_dismissed_lifecycle_are_migrated() -> None:
    sql = _render_upgrade_sql("head")

    for table_name in {"card_events", "card_event_changes", "card_export_templates"}:
        assert f"CREATE TABLE public.{table_name}" in sql or f"CREATE TABLE {table_name}" in sql

    assert "'dismissed'" in sql
    assert "DROP INDEX public.ix_cards_display_name_lower" in sql
    assert "DROP COLUMN display_name" in sql
    assert "DROP COLUMN card_title_label" in sql


def test_title_keys_are_removed_from_existing_audit_snapshots() -> None:
    sql = _render_upgrade_sql("head")

    assert "old_data_json - 'display_name'" in sql
    assert "new_data_json - 'display_name'" in sql


def test_registry_display_configuration_is_removed_from_migration_head() -> None:
    sql = _render_upgrade_sql("head")
    assert "DROP CONSTRAINT fk_registries_display_name_field_id_form_fields" in sql
    assert "DROP COLUMN display_name_field_id" in sql
    assert "DROP COLUMN display_name_template" in sql


def test_fio_label_is_normalized_to_the_required_technical_code() -> None:
    sql = _render_upgrade_sql("head")

    assert "SET code = 'fio'" in sql
    assert "f.label = 'ФИО'" in sql
    assert "f.archived_at IS NULL" in sql


def test_fio_code_normalization_migrates_existing_active_field() -> None:
    database_url = _require_test_database_url()
    engine = create_engine(database_url)
    try:
        _reset_public_schema(engine)
        _run_online_upgrade(database_url, "0037_remove_display_config")
        with engine.begin() as connection:
            registry_id = connection.scalar(
                text(
                    "INSERT INTO public.registries (code, name) "
                    "VALUES ('fio-normalization', 'Реестр') RETURNING id"
                )
            )
            block_id = connection.scalar(
                text(
                    "INSERT INTO public.form_blocks (registry_id, code, label) "
                    "VALUES (:registry_id, 'main', 'Основной блок') RETURNING id"
                ),
                {"registry_id": registry_id},
            )
            field_id = connection.scalar(
                text(
                    "INSERT INTO public.form_fields (block_id, code, label, field_type) "
                    "VALUES (:block_id, 'novoe_pole_2', 'ФИО', 'text') RETURNING id"
                ),
                {"block_id": block_id},
            )
        _run_online_upgrade(database_url, "head")
        with engine.connect() as connection:
            assert (
                connection.scalar(
                    text("SELECT code FROM public.form_fields WHERE id = :id"), {"id": field_id}
                )
                == "fio"
            )
    finally:
        engine.dispose()


def test_registry_display_configuration_upgrade_downgrade_preserves_registry() -> None:
    database_url = _require_test_database_url()
    engine = create_engine(database_url)
    try:
        _reset_public_schema(engine)
        _run_online_upgrade(database_url, "0036_card_display_placeholders")
        with engine.begin() as connection:
            registry_id = connection.scalar(
                text(
                    "INSERT INTO public.registries (code, name, display_name_template) "
                    "VALUES ('display-cleanup', 'Реестр', 'Obsolete display setting') RETURNING id"
                )
            )
        _run_online_upgrade(database_url, "head")
        with engine.connect() as connection:
            columns = {item["name"] for item in inspect(connection).get_columns("registries")}
            assert not {"display_name_field_id", "display_name_template"} & columns
            assert (
                connection.scalar(
                    text("SELECT name FROM public.registries WHERE id = :id"), {"id": registry_id}
                )
                == "Реестр"
            )
        _run_online_downgrade(database_url, "0036_card_display_placeholders")
        with engine.connect() as connection:
            columns = {item["name"] for item in inspect(connection).get_columns("registries")}
            assert {"display_name_field_id", "display_name_template"} <= columns
            assert (
                connection.scalar(
                    text("SELECT display_name_template FROM public.registries WHERE id = :id"),
                    {"id": registry_id},
                )
                is None
            )
        _run_online_upgrade(database_url, "head")
    finally:
        engine.dispose()


def test_card_events_migration_downgrade_maps_dismissed_cards_to_archived() -> None:
    sql = _render_downgrade_sql(
        "0034_card_events_exports_fio",
        "0033_card_creator_actor_name",
    )

    status_mapping_position = sql.index("UPDATE public.cards")
    old_constraint_position = sql.index(
        "lifecycle_status in ('draft', 'active', 'archived', 'superseded')"
    )

    assert status_mapping_position < old_constraint_position
    assert "SET lifecycle_status = 'archived'" in sql
    assert "WHERE lifecycle_status = 'dismissed'" in sql


def test_card_events_migration_downgrade_archives_dismissed_cards() -> None:
    database_url = _require_test_database_url()
    engine = create_engine(database_url)

    try:
        _reset_public_schema(engine)
        _run_online_upgrade(database_url, "0034_card_events_exports_fio")

        with engine.begin() as connection:
            organization_id = connection.execute(
                text(
                    "INSERT INTO public.organizations (code, name) "
                    "VALUES ('downgrade-org', 'Downgrade organization') RETURNING id"
                )
            ).scalar_one()
            registry_id = connection.execute(
                text(
                    "INSERT INTO public.registries (code, name) "
                    "VALUES ('downgrade-registry', 'Downgrade registry') RETURNING id"
                )
            ).scalar_one()
            template_id = connection.execute(
                text(
                    "INSERT INTO public.card_templates (registry_id, code, name) "
                    "VALUES (:registry_id, 'downgrade-template', 'Downgrade template') "
                    "RETURNING id"
                ),
                {"registry_id": registry_id},
            ).scalar_one()
            card_id = connection.execute(
                text(
                    "INSERT INTO public.cards "
                    "(registry_id, card_template_id, organization_id, lifecycle_status) "
                    "VALUES (:registry_id, :template_id, :organization_id, 'dismissed') "
                    "RETURNING id"
                ),
                {
                    "registry_id": registry_id,
                    "template_id": template_id,
                    "organization_id": organization_id,
                },
            ).scalar_one()

        _run_online_downgrade(database_url, "0033_card_creator_actor_name")

        with engine.connect() as connection:
            lifecycle_status = connection.execute(
                text("SELECT lifecycle_status FROM public.cards WHERE id = :card_id"),
                {"card_id": card_id},
            ).scalar_one()

        assert lifecycle_status == "archived"
    finally:
        engine.dispose()


def test_card_events_migration_removes_title_keys_from_audit_snapshots() -> None:
    database_url = _require_test_database_url()
    engine = create_engine(database_url)

    try:
        _reset_public_schema(engine)
        _run_online_upgrade(database_url, "0033_card_creator_actor_name")

        with engine.begin() as connection:
            event_id = connection.execute(
                text(
                    "INSERT INTO public.audit_events "
                    "(actor_type, action, object_type, source, old_data_json, new_data_json) "
                    "VALUES ('system', 'test', 'card', 'system', "
                    "CAST(:old_data AS jsonb), CAST(:new_data AS jsonb)) RETURNING id"
                ),
                {
                    "old_data": json.dumps({"display_name": "Old title", "x": 1}),
                    "new_data": json.dumps({"display_name": "New title", "y": 2}),
                },
            ).scalar_one()

        _run_online_upgrade(database_url, "0034_card_events_exports_fio")

        with engine.connect() as connection:
            old_data, new_data = connection.execute(
                text(
                    "SELECT old_data_json, new_data_json FROM public.audit_events "
                    "WHERE id = :event_id"
                ),
                {"event_id": event_id},
            ).one()

        assert old_data == {"x": 1}
        assert new_data == {"y": 2}
    finally:
        engine.dispose()


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


def test_org_unit_hierarchy_migration_adds_type_and_management_root_constraints() -> None:
    sql = _render_upgrade_sql("0028_org_unit_hierarchy")

    assert "0028_org_unit_hierarchy" in sql
    assert "ALTER COLUMN type SET NOT NULL" in sql
    assert "ADD CONSTRAINT ck_org_units_type CHECK" in sql
    assert "ADD CONSTRAINT ck_org_units_management_is_root CHECK" in sql


def test_org_unit_hierarchy_migration_downgrade_restores_nullable_type() -> None:
    sql = _render_downgrade_sql(
        "0028_org_unit_hierarchy",
        "0027_card_creation_links",
    )

    assert "DROP CONSTRAINT ck_org_units_management_is_root" in sql
    assert "DROP CONSTRAINT ck_org_units_type" in sql
    assert "ALTER COLUMN type DROP NOT NULL" in sql


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


def test_work_experience_field_migration_replaces_constraint_and_guards_downgrade() -> None:
    upgrade_sql = _render_upgrade_sql("0030_work_experience_field")
    downgrade_sql = _render_downgrade_sql(
        "0030_work_experience_field",
        "0029_public_reference_edit_links",
    )

    assert "DROP CONSTRAINT IF EXISTS ck_form_fields_field_type" in upgrade_sql
    assert "'work_experience'" in upgrade_sql
    assert "Cannot downgrade while work_experience form fields exist" in downgrade_sql


def test_card_audit_history_migration_adds_retention_classification() -> None:
    upgrade_sql = _render_upgrade_sql("0031_card_audit_history")
    downgrade_sql = _render_downgrade_sql(
        "0031_card_audit_history",
        "0030_work_experience_field",
    )

    assert "card_id UUID" in upgrade_sql
    assert "attributed_user_id UUID" in upgrade_sql
    assert "retention_class VARCHAR DEFAULT 'technical' NOT NULL" in upgrade_sql
    assert "UPDATE public.audit_events SET retention_class = 'technical'" in upgrade_sql
    assert "ck_audit_events_retention_class" in upgrade_sql
    assert "ix_audit_events_card_history" in upgrade_sql
    assert "ix_audit_events_retention" in upgrade_sql
    assert "DROP COLUMN retention_class" in downgrade_sql
    assert "DROP COLUMN attributed_user_id" in downgrade_sql
    assert "DROP COLUMN card_id" in downgrade_sql


def test_card_change_notifications_migration_creates_subscription_and_inbox_tables() -> None:
    sql = _render_upgrade_sql("0032_card_change_notifications")

    for table_name in {
        "card_change_notification_subscriptions",
        "public_link_change_notification_subscriptions",
        "card_change_notifications",
    }:
        assert f"CREATE TABLE public.{table_name}" in sql or f"CREATE TABLE {table_name}" in sql

    assert "REFERENCES users (id)" in sql
    assert "REFERENCES cards (id)" in sql
    assert "REFERENCES card_public_links (id)" in sql
    assert "changes_json JSONB NOT NULL" in sql
    assert "uq_card_change_notification_subscription" in sql
    assert "uq_public_link_change_notification_subscription" in sql
    assert "ix_card_change_notifications_inbox" in sql
    assert (
        "CREATE INDEX ix_card_change_notifications_inbox ON public.card_change_notifications "
        "(user_id, read_at, created_at)"
    ) in sql


def test_card_change_notifications_migration_upgrades_empty_disposable_database() -> None:
    database_url = _require_test_database_url()
    engine = create_engine(database_url)

    try:
        _reset_public_schema(engine)
        _run_online_upgrade(database_url, "0032_card_change_notifications")

        inspector = inspect(engine)
        actual_tables = set(inspector.get_table_names(schema="public"))
        expected_foreign_keys = {
            "card_change_notification_subscriptions": {
                ("users", ("user_id",)),
                ("cards", ("card_id",)),
            },
            "public_link_change_notification_subscriptions": {
                ("users", ("user_id",)),
                ("card_public_links", ("public_link_id",)),
            },
            "card_change_notifications": {
                ("users", ("user_id",)),
                ("cards", ("card_id",)),
            },
        }

        assert set(expected_foreign_keys) <= actual_tables
        for table_name, expected_keys in expected_foreign_keys.items():
            foreign_keys = inspector.get_foreign_keys(table_name, schema="public")
            assert {
                (foreign_key["referred_table"], tuple(foreign_key["constrained_columns"]))
                for foreign_key in foreign_keys
            } == expected_keys
            assert all(
                foreign_key.get("options", {}).get("ondelete") is None
                for foreign_key in foreign_keys
            )
    finally:
        engine.dispose()
