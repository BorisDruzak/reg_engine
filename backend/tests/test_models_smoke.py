from app.models import Base

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
