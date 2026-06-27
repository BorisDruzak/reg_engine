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
