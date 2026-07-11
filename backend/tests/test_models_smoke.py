from sqlalchemy import Boolean, CheckConstraint, DateTime, Text
from sqlalchemy.dialects.postgresql import JSONB

from app.domain.constants import DOCUMENT_TEMPLATE_FORMATS, FIELD_TYPES, PUBLIC_LINK_STATUSES
from app.models import Base

EXPECTED_TABLES = {
    "access_grants",
    "audit_events",
    "card_block_instances",
    "card_attachments",
    "card_public_field_settings",
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

FORBIDDEN_HR_COLUMNS = {
    "birth_date",
    "education",
    "experience",
    "qualification",
    "awards",
    "service_history",
    "dismissal_date",
    "dismissal_reason",
}


def test_metadata_contains_all_core_schema_v1_tables() -> None:
    assert set(Base.metadata.tables) == EXPECTED_TABLES


def test_no_hardcoded_employee_table_or_hr_columns() -> None:
    assert "employees" not in Base.metadata.tables

    actual_columns = {
        column.name for table in Base.metadata.tables.values() for column in table.columns
    }

    assert actual_columns.isdisjoint(FORBIDDEN_HR_COLUMNS)


def test_card_template_metadata_is_registered() -> None:
    card_templates = Base.metadata.tables["card_templates"]
    cards = Base.metadata.tables["cards"]

    for column_name in {
        "registry_id",
        "code",
        "name",
        "description",
        "position",
        "field_schema_json",
        "default_values_json",
        "is_active",
        "created_by",
        "updated_by",
        "archived_at",
        "archived_by",
    }:
        assert column_name in card_templates.c

    assert "card_template_id" in cards.c
    assert cards.c.card_template_id.nullable is False
    assert {
        (foreign_key.column.table.name, foreign_key.column.name)
        for foreign_key in cards.c.card_template_id.foreign_keys
    } == {("card_templates", "id")}


def test_dynamic_values_use_typed_columns() -> None:
    field_values = Base.metadata.tables["field_values"]

    for column_name in {
        "value_text",
        "value_number",
        "value_date",
        "value_datetime",
        "value_bool",
        "value_json",
        "value_reference_item_id",
    }:
        assert column_name in field_values.c


def test_file_ref_database_foundation_metadata_is_registered() -> None:
    assert "file_ref" in FIELD_TYPES
    assert "static_text" in FIELD_TYPES

    field_values = Base.metadata.tables["field_values"]

    assert "value_attachment_id" in field_values.c
    assert {
        index.name: [column.name for column in index.columns] for index in field_values.indexes
    }["ix_field_values_field_attachment"] == ["field_id", "value_attachment_id"]
    assert {
        (foreign_key.column.table.name, foreign_key.column.name)
        for foreign_key in field_values.c.value_attachment_id.foreign_keys
    } == {("card_attachments", "id")}

    form_fields = Base.metadata.tables["form_fields"]
    field_type_checks = {
        constraint.name: str(constraint.sqltext)
        for constraint in form_fields.constraints
        if isinstance(constraint, CheckConstraint)
    }

    assert "file_ref" in field_type_checks["ck_form_fields_field_type"]
    assert "static_text" in field_type_checks["ck_form_fields_field_type"]


def test_schema_layout_metadata_is_registered() -> None:
    form_blocks = Base.metadata.tables["form_blocks"]
    form_fields = Base.metadata.tables["form_fields"]

    assert "layout_columns" in form_blocks.c
    assert "display_config_json" in form_blocks.c
    assert "display_config_json" in form_fields.c

    block_checks = {
        constraint.name: str(constraint.sqltext)
        for constraint in form_blocks.constraints
        if isinstance(constraint, CheckConstraint)
    }
    assert "layout_columns >= 1" in block_checks["ck_form_blocks_layout_columns"]
    assert "layout_columns <= 3" in block_checks["ck_form_blocks_layout_columns"]


def test_attachment_metadata_tables_use_required_columns() -> None:
    stored_files = Base.metadata.tables["stored_files"]
    card_attachments = Base.metadata.tables["card_attachments"]

    for column_name in {
        "storage_backend",
        "storage_key",
        "original_filename",
        "content_type",
        "content_length_bytes",
        "checksum_sha256",
        "scanner_status",
        "created_by",
        "archived_at",
        "archived_by",
        "archive_reason",
    }:
        assert column_name in stored_files.c

    for column_name in {
        "card_id",
        "stored_file_id",
        "title",
        "description",
        "position",
        "created_by",
        "archived_at",
        "archived_by",
        "archive_reason",
    }:
        assert column_name in card_attachments.c


def test_generated_document_metadata_tables_use_required_columns() -> None:
    document_templates = Base.metadata.tables["document_templates"]
    document_template_versions = Base.metadata.tables["document_template_versions"]
    generated_documents = Base.metadata.tables["generated_documents"]

    assert "card_print_layout_v1" in DOCUMENT_TEMPLATE_FORMATS

    for column_name in {
        "registry_id",
        "card_template_id",
        "code",
        "name",
        "description",
        "template_format",
        "template_body",
        "output_filename_template",
        "output_content_type",
        "is_active",
        "created_by",
        "updated_by",
        "archived_at",
        "archived_by",
        "archive_reason",
    }:
        assert column_name in document_templates.c

    for column_name in {
        "template_id",
        "version_number",
        "template_format",
        "template_body",
        "layout_json",
        "stored_file_id",
        "original_filename",
        "content_type",
        "content_length_bytes",
        "created_by",
        "archived_at",
        "archived_by",
        "archive_reason",
    }:
        assert column_name in document_template_versions.c

    for column_name in {
        "card_id",
        "template_id",
        "template_version_id",
        "stored_file_id",
        "title",
        "output_filename",
        "content_type",
        "render_status",
        "generated_by",
        "archived_at",
        "archived_by",
        "archive_reason",
    }:
        assert column_name in generated_documents.c

    assert {
        (foreign_key.column.table.name, foreign_key.column.name)
        for foreign_key in document_templates.c.card_template_id.foreign_keys
    } == {("card_templates", "id")}


def test_report_metadata_tables_use_required_columns() -> None:
    report_templates = Base.metadata.tables["report_templates"]
    report_runs = Base.metadata.tables["report_runs"]

    for column_name in {
        "registry_id",
        "code",
        "name",
        "description",
        "report_type",
        "parameters_schema_json",
        "default_parameters_json",
        "output_format",
        "is_active",
        "created_by",
        "updated_by",
        "archived_at",
        "archived_by",
        "archive_reason",
    }:
        assert column_name in report_templates.c

    for column_name in {
        "report_template_id",
        "registry_id",
        "card_id",
        "stored_file_id",
        "report_type",
        "run_status",
        "parameters_json",
        "summary_json",
        "row_count",
        "output_filename",
        "output_content_type",
        "generated_by",
        "started_at",
        "finished_at",
        "archived_at",
        "archived_by",
        "archive_reason",
    }:
        assert column_name in report_runs.c


def test_audit_source_metadata_allows_mcp() -> None:
    audit_events = Base.metadata.tables["audit_events"]
    source_checks = {
        constraint.name: str(constraint.sqltext)
        for constraint in audit_events.constraints
        if isinstance(constraint, CheckConstraint)
    }

    assert "mcp" in source_checks["ck_audit_events_source"]


def test_public_link_attachment_limit_columns_are_explicit() -> None:
    card_public_links = Base.metadata.tables["card_public_links"]

    for column_name in {
        "max_attachment_uploads",
        "attachment_upload_count",
    }:
        assert column_name in card_public_links.c


def test_public_link_review_lifecycle_metadata_is_registered() -> None:
    card_public_links = Base.metadata.tables["card_public_links"]

    assert PUBLIC_LINK_STATUSES == (
        "active",
        "submitted",
        "changes_requested",
        "approved",
        "disabled",
        "expired",
    )
    for column_name in {
        "submitted_at",
        "reviewed_at",
        "reviewed_by",
        "review_comment",
        "baseline_snapshot_json",
        "submission_summary_json",
        "review_enabled",
    }:
        assert column_name in card_public_links.c

    for column_name in {"submitted_at", "reviewed_at"}:
        column = card_public_links.c[column_name]
        assert isinstance(column.type, DateTime)
        assert column.type.timezone is True
        assert column.nullable is True

    assert isinstance(card_public_links.c.review_comment.type, Text)
    assert isinstance(card_public_links.c.baseline_snapshot_json.type, JSONB)
    assert isinstance(card_public_links.c.submission_summary_json.type, JSONB)
    assert {
        (foreign_key.column.table.name, foreign_key.column.name)
        for foreign_key in card_public_links.c.reviewed_by.foreign_keys
    } == {("users", "id")}

    review_enabled = card_public_links.c.review_enabled
    assert isinstance(review_enabled.type, Boolean)
    assert review_enabled.nullable is False
    assert review_enabled.server_default is not None
    assert str(review_enabled.server_default.arg) == "false"

    status_checks = {
        constraint.name: str(constraint.sqltext)
        for constraint in card_public_links.constraints
        if isinstance(constraint, CheckConstraint)
    }
    for status in PUBLIC_LINK_STATUSES:
        assert status in status_checks["ck_card_public_links_status"]

    assert {
        index.name: [column.name for column in index.columns] for index in card_public_links.indexes
    }["ix_card_public_links_card_status_submitted"] == [
        "card_id",
        "status",
        "submitted_at",
    ]


def test_registry_default_owner_metadata_is_registered() -> None:
    registries = Base.metadata.tables["registries"]

    assert "owner_organization_id" in registries.c
    assert "is_default_for_owner_tree" in registries.c
    assert {
        (foreign_key.column.table.name, foreign_key.column.name)
        for foreign_key in registries.c.owner_organization_id.foreign_keys
    } == {("organizations", "id")}
