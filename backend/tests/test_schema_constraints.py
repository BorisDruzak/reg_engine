from sqlalchemy import CheckConstraint, ForeignKeyConstraint, PrimaryKeyConstraint, UniqueConstraint

from app.models import Base


def _table_constraint_names(table_name: str, constraint_type: type[object]) -> set[str]:
    table = Base.metadata.tables[table_name]
    return {
        constraint.name or ""
        for constraint in table.constraints
        if isinstance(constraint, constraint_type)
    }


def _table_index_names(table_name: str) -> set[str]:
    return {index.name or "" for index in Base.metadata.tables[table_name].indexes}


def test_organization_closure_has_composite_primary_key() -> None:
    closure = Base.metadata.tables["organization_closure"]
    primary_key = next(
        constraint
        for constraint in closure.constraints
        if isinstance(constraint, PrimaryKeyConstraint)
    )

    assert {column.name for column in primary_key.columns} == {"ancestor_id", "descendant_id"}


def test_core_schema_unique_constraints_are_declared() -> None:
    assert "uq_users_email" in _table_constraint_names("users", UniqueConstraint)
    assert "uq_roles_code" in _table_constraint_names("roles", UniqueConstraint)
    assert "uq_permissions_code" in _table_constraint_names("permissions", UniqueConstraint)
    assert "uq_organizations_code" in _table_constraint_names("organizations", UniqueConstraint)
    assert "uq_org_units_organization_id_code" in _table_constraint_names(
        "org_units", UniqueConstraint
    )
    assert "uq_registries_code" in _table_constraint_names("registries", UniqueConstraint)
    assert "uq_form_blocks_registry_id_code" in _table_constraint_names(
        "form_blocks", UniqueConstraint
    )
    assert "uq_form_fields_block_id_code" in _table_constraint_names(
        "form_fields", UniqueConstraint
    )
    assert "uq_reference_items_list_id_code" in _table_constraint_names(
        "reference_items", UniqueConstraint
    )
    assert "uq_field_values_card_block_field" in _table_constraint_names(
        "field_values", UniqueConstraint
    )
    assert "uq_field_value_items_value_item" in _table_constraint_names(
        "field_value_items", UniqueConstraint
    )


def test_core_schema_check_constraints_are_declared_for_stable_statuses() -> None:
    assert "ck_users_status" in _table_constraint_names("users", CheckConstraint)
    assert "ck_registries_lifecycle_status" in _table_constraint_names(
        "registries", CheckConstraint
    )
    assert "ck_cards_lifecycle_status" in _table_constraint_names("cards", CheckConstraint)
    assert "ck_card_public_links_status" in _table_constraint_names(
        "card_public_links", CheckConstraint
    )


def test_required_query_indexes_are_declared() -> None:
    assert "ix_organizations_parent_id" in _table_index_names("organizations")
    assert "ix_organization_closure_descendant_id" in _table_index_names("organization_closure")
    assert "ix_access_grants_user_id" in _table_index_names("access_grants")
    assert "ix_cards_registry_organization_status" in _table_index_names("cards")
    assert "ix_cards_display_name_lower" in _table_index_names("cards")
    assert "ix_field_values_field_text" in _table_index_names("field_values")
    assert "ix_card_public_links_token_hash" in _table_index_names("card_public_links")
    assert "ix_audit_events_object" in _table_index_names("audit_events")


def test_field_values_reference_core_entities_with_foreign_keys() -> None:
    field_values = Base.metadata.tables["field_values"]
    foreign_key_targets = {
        element.target_fullname
        for constraint in field_values.constraints
        if isinstance(constraint, ForeignKeyConstraint)
        for element in constraint.elements
    }

    assert "reference_items.id" in foreign_key_targets
    assert "cards.id" in foreign_key_targets
    assert "users.id" in foreign_key_targets
    assert "organizations.id" in foreign_key_targets
    assert "org_units.id" in foreign_key_targets
    assert "registries.id" in foreign_key_targets
