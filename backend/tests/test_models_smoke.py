from sqlalchemy import CheckConstraint

from app.domain.constants import FIELD_TYPES
from app.models import Base

EXPECTED_TABLES = {
    "access_grants",
    "audit_events",
    "card_block_instances",
    "card_attachments",
    "card_public_links",
    "card_relations",
    "cards",
    "document_templates",
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
    generated_documents = Base.metadata.tables["generated_documents"]

    for column_name in {
        "registry_id",
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
        "card_id",
        "template_id",
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


def test_public_link_attachment_limit_columns_are_explicit() -> None:
    card_public_links = Base.metadata.tables["card_public_links"]

    for column_name in {
        "max_attachment_uploads",
        "attachment_upload_count",
    }:
        assert column_name in card_public_links.c
