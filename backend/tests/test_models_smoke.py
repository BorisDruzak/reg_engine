from app.models import Base

CORE_SCHEMA_TABLES = {
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


def test_core_schema_metadata_contains_all_phase_1b_tables() -> None:
    assert set(Base.metadata.tables) >= CORE_SCHEMA_TABLES


def test_core_schema_does_not_define_hardcoded_employee_table() -> None:
    assert "employees" not in Base.metadata.tables


def test_field_values_use_typed_value_columns() -> None:
    field_values = Base.metadata.tables["field_values"]

    expected_columns = {
        "value_text",
        "value_number",
        "value_date",
        "value_datetime",
        "value_bool",
        "value_json",
        "value_reference_item_id",
        "value_card_id",
        "value_user_id",
        "value_organization_id",
        "value_org_unit_id",
        "value_registry_id",
    }

    assert expected_columns <= set(field_values.columns.keys())


def test_cards_keep_registry_and_organization_scope_columns() -> None:
    cards = Base.metadata.tables["cards"]

    assert {"registry_id", "organization_id", "org_unit_id"} <= set(cards.columns.keys())
