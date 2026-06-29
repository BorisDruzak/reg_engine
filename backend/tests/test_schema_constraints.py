from sqlalchemy import CheckConstraint, Index, UniqueConstraint

from app.models import Base


def _constraint_names(table_name: str, constraint_type: type) -> set[str]:
    return {
        constraint.name or ""
        for constraint in Base.metadata.tables[table_name].constraints
        if isinstance(constraint, constraint_type)
    }


def _index_names(table_name: str) -> set[str]:
    return {
        index.name or ""
        for index in Base.metadata.tables[table_name].indexes
        if isinstance(index, Index)
    }


def test_important_unique_constraints_exist() -> None:
    expected_constraints = {
        "users": {"uq_users_email"},
        "roles": {"uq_roles_code"},
        "permissions": {"uq_permissions_code"},
        "org_units": {"uq_org_units_organization_id_code"},
        "registries": {"uq_registries_code"},
        "form_blocks": {"uq_form_blocks_registry_id_code"},
        "form_fields": {"uq_form_fields_block_id_code"},
        "reference_lists": {"uq_reference_lists_registry_owner_code"},
        "reference_items": {"uq_reference_items_list_id_code"},
        "card_block_instances": {"uq_card_block_instances_card_id_block_id_ordinal"},
        "document_templates": {"uq_document_templates_registry_id_code"},
        "document_template_versions": {"uq_document_template_versions_template_version"},
        "report_templates": {"uq_report_templates_registry_id_code"},
        "stored_files": {"uq_stored_files_storage_key"},
        "field_value_items": {"uq_field_value_items_value_item"},
        "card_relations": {"uq_card_relations_source_target_type"},
        "card_public_links": {"uq_card_public_links_token_hash"},
    }

    for table_name, names in expected_constraints.items():
        assert names <= _constraint_names(table_name, UniqueConstraint)


def test_important_check_constraints_exist() -> None:
    expected_constraints = {
        "users": {"ck_users_status"},
        "registries": {"ck_registries_status"},
        "form_fields": {"ck_form_fields_field_type", "ck_form_fields_required_mode"},
        "cards": {"ck_cards_lifecycle_status"},
        "stored_files": {
            "ck_stored_files_content_length_positive",
            "ck_stored_files_scanner_status",
        },
        "card_attachments": {"ck_card_attachments_position_non_negative"},
        "document_templates": {"ck_document_templates_template_format"},
        "document_template_versions": {
            "ck_document_template_versions_template_format",
            "ck_document_template_versions_version_number_positive",
            "ck_document_template_versions_storage_for_binary",
        },
        "generated_documents": {"ck_generated_documents_render_status"},
        "report_templates": {
            "ck_report_templates_report_type",
            "ck_report_templates_output_format",
        },
        "report_runs": {
            "ck_report_runs_report_type",
            "ck_report_runs_status",
            "ck_report_runs_row_count_non_negative",
        },
        "card_public_links": {
            "ck_card_public_links_status",
            "ck_card_public_links_max_attachment_uploads_non_negative",
            "ck_card_public_links_attachment_upload_count_non_negative",
        },
        "audit_events": {"ck_audit_events_actor_type", "ck_audit_events_source"},
    }

    for table_name, names in expected_constraints.items():
        assert names <= _constraint_names(table_name, CheckConstraint)


def test_important_indexes_exist() -> None:
    expected_indexes = {
        "organization_closure": {"ix_organization_closure_descendant_id"},
        "org_units": {"ix_org_units_organization_id", "ix_org_units_parent_id"},
        "access_grants": {"ix_access_grants_user_id", "ix_access_grants_organization_id"},
        "form_blocks": {"ix_form_blocks_registry_id"},
        "form_fields": {"ix_form_fields_block_id"},
        "reference_lists": {
            "ix_reference_lists_registry_id",
            "ix_reference_lists_owner_organization_id",
            "uq_reference_lists_registry_owner_code_scope",
        },
        "reference_items": {"ix_reference_items_list_id", "ix_reference_items_parent_id"},
        "cards": {
            "ix_cards_registry_id",
            "ix_cards_organization_id",
            "ix_cards_org_unit_id",
            "ix_cards_lifecycle_status",
        },
        "field_values": {"ix_field_values_card_id", "ix_field_values_field_id"},
        "field_value_items": {
            "ix_field_value_items_field_value_id",
            "ix_field_value_items_reference_item_id",
        },
        "stored_files": {
            "ix_stored_files_checksum_sha256",
            "ix_stored_files_created_by",
        },
        "card_attachments": {
            "ix_card_attachments_card_id",
            "ix_card_attachments_stored_file_id",
            "ix_card_attachments_card_archive",
        },
        "document_templates": {
            "ix_document_templates_registry_id",
            "ix_document_templates_registry_archive",
        },
        "document_template_versions": {
            "ix_document_template_versions_template_id",
            "ix_document_template_versions_stored_file_id",
            "ix_document_template_versions_template_active",
        },
        "generated_documents": {
            "ix_generated_documents_card_id",
            "ix_generated_documents_template_id",
            "ix_generated_documents_template_version_id",
            "ix_generated_documents_stored_file_id",
            "ix_generated_documents_card_archive",
        },
        "report_templates": {
            "ix_report_templates_registry_id",
            "ix_report_templates_registry_archive",
        },
        "report_runs": {
            "ix_report_runs_template_id",
            "ix_report_runs_registry_id",
            "ix_report_runs_card_id",
            "ix_report_runs_stored_file_id",
            "ix_report_runs_registry_created_at",
        },
        "card_relations": {
            "ix_card_relations_source_card_id",
            "ix_card_relations_target_card_id",
        },
        "card_public_links": {
            "ix_card_public_links_card_id",
            "ix_card_public_links_token_hash",
        },
        "audit_events": {
            "ix_audit_events_object",
            "ix_audit_events_actor_user_id",
            "ix_audit_events_created_at",
        },
    }

    expected_indexes["access_grants"].add("uq_access_grants_user_role_registry_organization_scope")

    for table_name, names in expected_indexes.items():
        assert names <= _index_names(table_name)
