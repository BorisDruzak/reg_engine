"""create core schema v1

Revision ID: 0002_core_schema_v1
Revises: 0001_database_foundation
Create Date: 2026-06-27
"""

# ruff: noqa: E501

from collections.abc import Sequence

from alembic import op

revision: str = "0002_core_schema_v1"
down_revision: str | None = "0001_database_foundation"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


TABLE_DDL: tuple[str, ...] = (
    "CREATE TABLE permissions (\n\tcode VARCHAR NOT NULL, \n\tdescription VARCHAR, \n\tid UUID DEFAULT gen_random_uuid() NOT NULL, \n\tCONSTRAINT pk_permissions PRIMARY KEY (id), \n\tCONSTRAINT uq_permissions_code UNIQUE (code)\n)",
    "CREATE TABLE roles (\n\tcode VARCHAR NOT NULL, \n\tname VARCHAR NOT NULL, \n\tdescription VARCHAR, \n\tis_system BOOLEAN DEFAULT 'false' NOT NULL, \n\tid UUID DEFAULT gen_random_uuid() NOT NULL, \n\tcreated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, \n\tupdated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, \n\tarchived_at TIMESTAMP WITH TIME ZONE, \n\tCONSTRAINT pk_roles PRIMARY KEY (id), \n\tCONSTRAINT uq_roles_code UNIQUE (code)\n)",
    "CREATE TABLE users (\n\temail VARCHAR NOT NULL, \n\tpassword_hash VARCHAR, \n\tdisplay_name VARCHAR NOT NULL, \n\tstatus VARCHAR DEFAULT 'active' NOT NULL, \n\tis_superuser BOOLEAN DEFAULT 'false' NOT NULL, \n\tlast_login_at TIMESTAMP WITH TIME ZONE, \n\tid UUID DEFAULT gen_random_uuid() NOT NULL, \n\tcreated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, \n\tupdated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, \n\tarchived_at TIMESTAMP WITH TIME ZONE, \n\tCONSTRAINT pk_users PRIMARY KEY (id), \n\tCONSTRAINT uq_users_email UNIQUE (email), \n\tCONSTRAINT ck_users_status CHECK (status in ('active', 'disabled', 'archived'))\n)",
    "CREATE TABLE organizations (\n\tparent_id UUID, \n\tcode VARCHAR NOT NULL, \n\tname VARCHAR NOT NULL, \n\ttype VARCHAR DEFAULT 'organization' NOT NULL, \n\tis_active BOOLEAN DEFAULT 'true' NOT NULL, \n\tcreated_by UUID, \n\tid UUID DEFAULT gen_random_uuid() NOT NULL, \n\tcreated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, \n\tupdated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, \n\tarchived_at TIMESTAMP WITH TIME ZONE, \n\tCONSTRAINT pk_organizations PRIMARY KEY (id), \n\tCONSTRAINT uq_organizations_code UNIQUE (code), \n\tCONSTRAINT ck_organizations_parent_not_self CHECK (parent_id is null or parent_id <> id), \n\tCONSTRAINT fk_organizations_parent_id_organizations FOREIGN KEY(parent_id) REFERENCES organizations (id), \n\tCONSTRAINT fk_organizations_created_by_users FOREIGN KEY(created_by) REFERENCES users (id)\n)",
    "CREATE TABLE registries (\n\tcode VARCHAR NOT NULL, \n\tname VARCHAR NOT NULL, \n\tdescription VARCHAR, \n\tlifecycle_status VARCHAR DEFAULT 'active' NOT NULL, \n\tschema_version INTEGER DEFAULT '1' NOT NULL, \n\tdisplay_name_field_id UUID, \n\tdisplay_name_template VARCHAR, \n\tcreated_by UUID, \n\tid UUID DEFAULT gen_random_uuid() NOT NULL, \n\tcreated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, \n\tupdated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, \n\tarchived_at TIMESTAMP WITH TIME ZONE, \n\tCONSTRAINT pk_registries PRIMARY KEY (id), \n\tCONSTRAINT uq_registries_code UNIQUE (code), \n\tCONSTRAINT ck_registries_status CHECK (lifecycle_status in ('draft', 'active', 'archived')), \n\tCONSTRAINT fk_registries_created_by_users FOREIGN KEY(created_by) REFERENCES users (id)\n)",
    "CREATE TABLE role_permissions (\n\trole_id UUID NOT NULL, \n\tpermission_id UUID NOT NULL, \n\tCONSTRAINT pk_role_permissions PRIMARY KEY (role_id, permission_id), \n\tCONSTRAINT fk_role_permissions_role_id_roles FOREIGN KEY(role_id) REFERENCES roles (id), \n\tCONSTRAINT fk_role_permissions_permission_id_permissions FOREIGN KEY(permission_id) REFERENCES permissions (id)\n)",
    "CREATE TABLE access_grants (\n\tuser_id UUID NOT NULL, \n\trole_id UUID NOT NULL, \n\tregistry_id UUID, \n\torganization_id UUID, \n\tinclude_descendants BOOLEAN DEFAULT 'true' NOT NULL, \n\tvalid_from TIMESTAMP WITH TIME ZONE, \n\tvalid_to TIMESTAMP WITH TIME ZONE, \n\tcreated_by UUID, \n\tid UUID DEFAULT gen_random_uuid() NOT NULL, \n\tcreated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, \n\tarchived_at TIMESTAMP WITH TIME ZONE, \n\tCONSTRAINT pk_access_grants PRIMARY KEY (id), \n\tCONSTRAINT fk_access_grants_user_id_users FOREIGN KEY(user_id) REFERENCES users (id), \n\tCONSTRAINT fk_access_grants_role_id_roles FOREIGN KEY(role_id) REFERENCES roles (id), \n\tCONSTRAINT fk_access_grants_registry_id_registries FOREIGN KEY(registry_id) REFERENCES registries (id), \n\tCONSTRAINT fk_access_grants_organization_id_organizations FOREIGN KEY(organization_id) REFERENCES organizations (id), \n\tCONSTRAINT fk_access_grants_created_by_users FOREIGN KEY(created_by) REFERENCES users (id)\n)",
    "CREATE TABLE form_blocks (\n\tregistry_id UUID NOT NULL, \n\tcode VARCHAR NOT NULL, \n\ttitle VARCHAR NOT NULL, \n\tdescription VARCHAR, \n\tposition INTEGER DEFAULT '0' NOT NULL, \n\tis_repeatable BOOLEAN DEFAULT 'false' NOT NULL, \n\tmin_instances INTEGER, \n\tmax_instances INTEGER, \n\tis_system BOOLEAN DEFAULT 'false' NOT NULL, \n\tis_locked BOOLEAN DEFAULT 'false' NOT NULL, \n\tis_active BOOLEAN DEFAULT 'true' NOT NULL, \n\tis_admin_only BOOLEAN DEFAULT 'false' NOT NULL, \n\tpublic_visible BOOLEAN DEFAULT 'true' NOT NULL, \n\tpublic_editable BOOLEAN DEFAULT 'false' NOT NULL, \n\tdisplay_mode VARCHAR DEFAULT 'section' NOT NULL, \n\tcreated_by UUID, \n\tid UUID DEFAULT gen_random_uuid() NOT NULL, \n\tcreated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, \n\tupdated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, \n\tarchived_at TIMESTAMP WITH TIME ZONE, \n\tCONSTRAINT pk_form_blocks PRIMARY KEY (id), \n\tCONSTRAINT uq_form_blocks_registry_id_code UNIQUE (registry_id, code), \n\tCONSTRAINT ck_form_blocks_min_non_negative CHECK (min_instances is null or min_instances >= 0), \n\tCONSTRAINT ck_form_blocks_max_non_negative CHECK (max_instances is null or max_instances >= 0), \n\tCONSTRAINT fk_form_blocks_registry_id_registries FOREIGN KEY(registry_id) REFERENCES registries (id), \n\tCONSTRAINT fk_form_blocks_created_by_users FOREIGN KEY(created_by) REFERENCES users (id)\n)",
    "CREATE TABLE org_units (\n\torganization_id UUID NOT NULL, \n\tparent_id UUID, \n\tcode VARCHAR NOT NULL, \n\tname VARCHAR NOT NULL, \n\ttype VARCHAR, \n\tis_active BOOLEAN DEFAULT 'true' NOT NULL, \n\tcreated_by UUID, \n\tid UUID DEFAULT gen_random_uuid() NOT NULL, \n\tcreated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, \n\tupdated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, \n\tarchived_at TIMESTAMP WITH TIME ZONE, \n\tCONSTRAINT pk_org_units PRIMARY KEY (id), \n\tCONSTRAINT uq_org_units_organization_id_code UNIQUE (organization_id, code), \n\tCONSTRAINT fk_org_units_organization_id_organizations FOREIGN KEY(organization_id) REFERENCES organizations (id), \n\tCONSTRAINT fk_org_units_parent_id_org_units FOREIGN KEY(parent_id) REFERENCES org_units (id), \n\tCONSTRAINT fk_org_units_created_by_users FOREIGN KEY(created_by) REFERENCES users (id)\n)",
    "CREATE TABLE organization_closure (\n\tancestor_id UUID NOT NULL, \n\tdescendant_id UUID NOT NULL, \n\tdepth INTEGER NOT NULL, \n\tCONSTRAINT pk_organization_closure PRIMARY KEY (ancestor_id, descendant_id), \n\tCONSTRAINT ck_organization_closure_depth_non_negative CHECK (depth >= 0), \n\tCONSTRAINT fk_organization_closure_ancestor_id_organizations FOREIGN KEY(ancestor_id) REFERENCES organizations (id), \n\tCONSTRAINT fk_organization_closure_descendant_id_organizations FOREIGN KEY(descendant_id) REFERENCES organizations (id)\n)",
    "CREATE TABLE reference_lists (\n\tregistry_id UUID, \n\towner_organization_id UUID, \n\tcode VARCHAR NOT NULL, \n\tname VARCHAR NOT NULL, \n\tdescription VARCHAR, \n\tscope_mode VARCHAR DEFAULT 'global' NOT NULL, \n\tinherit_to_descendants BOOLEAN DEFAULT 'true' NOT NULL, \n\tlocked_for_descendants BOOLEAN DEFAULT 'true' NOT NULL, \n\tmanaged_by_system_only BOOLEAN DEFAULT 'false' NOT NULL, \n\tis_active BOOLEAN DEFAULT 'true' NOT NULL, \n\tcreated_by UUID, \n\tid UUID DEFAULT gen_random_uuid() NOT NULL, \n\tcreated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, \n\tupdated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, \n\tarchived_at TIMESTAMP WITH TIME ZONE, \n\tCONSTRAINT pk_reference_lists PRIMARY KEY (id), \n\tCONSTRAINT uq_reference_lists_registry_owner_code UNIQUE (registry_id, owner_organization_id, code), \n\tCONSTRAINT fk_reference_lists_registry_id_registries FOREIGN KEY(registry_id) REFERENCES registries (id), \n\tCONSTRAINT fk_reference_lists_owner_organization_id_organizations FOREIGN KEY(owner_organization_id) REFERENCES organizations (id), \n\tCONSTRAINT fk_reference_lists_created_by_users FOREIGN KEY(created_by) REFERENCES users (id)\n)",
    "CREATE TABLE cards (\n\tregistry_id UUID NOT NULL, \n\torganization_id UUID NOT NULL, \n\torg_unit_id UUID, \n\tdisplay_name VARCHAR NOT NULL, \n\tlifecycle_status VARCHAR DEFAULT 'draft' NOT NULL, \n\tpublic_view_enabled BOOLEAN DEFAULT 'false' NOT NULL, \n\tpublic_edit_enabled BOOLEAN DEFAULT 'false' NOT NULL, \n\tcreated_by UUID, \n\tupdated_by UUID, \n\tarchived_by UUID, \n\tarchive_reason VARCHAR, \n\tid UUID DEFAULT gen_random_uuid() NOT NULL, \n\tcreated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, \n\tupdated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, \n\tarchived_at TIMESTAMP WITH TIME ZONE, \n\tCONSTRAINT pk_cards PRIMARY KEY (id), \n\tCONSTRAINT ck_cards_lifecycle_status CHECK (lifecycle_status in ('draft', 'active', 'archived', 'superseded')), \n\tCONSTRAINT fk_cards_registry_id_registries FOREIGN KEY(registry_id) REFERENCES registries (id), \n\tCONSTRAINT fk_cards_organization_id_organizations FOREIGN KEY(organization_id) REFERENCES organizations (id), \n\tCONSTRAINT fk_cards_org_unit_id_org_units FOREIGN KEY(org_unit_id) REFERENCES org_units (id), \n\tCONSTRAINT fk_cards_created_by_users FOREIGN KEY(created_by) REFERENCES users (id), \n\tCONSTRAINT fk_cards_updated_by_users FOREIGN KEY(updated_by) REFERENCES users (id), \n\tCONSTRAINT fk_cards_archived_by_users FOREIGN KEY(archived_by) REFERENCES users (id)\n)",
    "CREATE TABLE form_fields (\n\tblock_id UUID NOT NULL, \n\tcode VARCHAR NOT NULL, \n\tlabel VARCHAR NOT NULL, \n\tdescription VARCHAR, \n\tfield_type VARCHAR NOT NULL, \n\tposition INTEGER DEFAULT '0' NOT NULL, \n\trequired_mode VARCHAR DEFAULT 'not_required' NOT NULL, \n\tdefault_value_json JSONB, \n\tvalidation_json JSONB, \n\toptions_source_type VARCHAR, \n\toptions_source_id UUID, \n\toptions_config_json JSONB, \n\tis_system BOOLEAN DEFAULT 'false' NOT NULL, \n\tis_locked BOOLEAN DEFAULT 'false' NOT NULL, \n\tis_active BOOLEAN DEFAULT 'true' NOT NULL, \n\tis_searchable BOOLEAN DEFAULT 'false' NOT NULL, \n\tis_filterable BOOLEAN DEFAULT 'false' NOT NULL, \n\tis_sortable BOOLEAN DEFAULT 'false' NOT NULL, \n\tis_list_display BOOLEAN DEFAULT 'false' NOT NULL, \n\tis_exportable BOOLEAN DEFAULT 'true' NOT NULL, \n\tsensitivity_level VARCHAR DEFAULT 'normal' NOT NULL, \n\tpublic_visible BOOLEAN DEFAULT 'true' NOT NULL, \n\tpublic_editable BOOLEAN DEFAULT 'false' NOT NULL, \n\treplaces_field_id UUID, \n\tcreated_by UUID, \n\tid UUID DEFAULT gen_random_uuid() NOT NULL, \n\tcreated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, \n\tupdated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, \n\tarchived_at TIMESTAMP WITH TIME ZONE, \n\tCONSTRAINT pk_form_fields PRIMARY KEY (id), \n\tCONSTRAINT uq_form_fields_block_id_code UNIQUE (block_id, code), \n\tCONSTRAINT ck_form_fields_field_type CHECK (field_type in ('text', 'number', 'date', 'datetime', 'bool', 'json', 'select', 'multi_select', 'card_ref', 'user_ref', 'organization_ref', 'org_unit_ref', 'registry_ref')), \n\tCONSTRAINT ck_form_fields_required_mode CHECK (required_mode in ('not_required', 'required', 'required_on_publish')), \n\tCONSTRAINT fk_form_fields_block_id_form_blocks FOREIGN KEY(block_id) REFERENCES form_blocks (id), \n\tCONSTRAINT fk_form_fields_replaces_field_id_form_fields FOREIGN KEY(replaces_field_id) REFERENCES form_fields (id), \n\tCONSTRAINT fk_form_fields_created_by_users FOREIGN KEY(created_by) REFERENCES users (id)\n)",
    "CREATE TABLE reference_items (\n\tlist_id UUID NOT NULL, \n\tparent_id UUID, \n\tcode VARCHAR NOT NULL, \n\tlabel VARCHAR NOT NULL, \n\tdescription VARCHAR, \n\tposition INTEGER DEFAULT '0' NOT NULL, \n\tis_active BOOLEAN DEFAULT 'true' NOT NULL, \n\tcreated_by UUID, \n\tid UUID DEFAULT gen_random_uuid() NOT NULL, \n\tcreated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, \n\tupdated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, \n\tarchived_at TIMESTAMP WITH TIME ZONE, \n\tCONSTRAINT pk_reference_items PRIMARY KEY (id), \n\tCONSTRAINT uq_reference_items_list_id_code UNIQUE (list_id, code), \n\tCONSTRAINT fk_reference_items_list_id_reference_lists FOREIGN KEY(list_id) REFERENCES reference_lists (id), \n\tCONSTRAINT fk_reference_items_parent_id_reference_items FOREIGN KEY(parent_id) REFERENCES reference_items (id), \n\tCONSTRAINT fk_reference_items_created_by_users FOREIGN KEY(created_by) REFERENCES users (id)\n)",
    "CREATE TABLE card_block_instances (\n\tcard_id UUID NOT NULL, \n\tblock_id UUID NOT NULL, \n\tordinal INTEGER DEFAULT '0' NOT NULL, \n\tcreated_by UUID, \n\tid UUID DEFAULT gen_random_uuid() NOT NULL, \n\tcreated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, \n\tupdated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, \n\tarchived_at TIMESTAMP WITH TIME ZONE, \n\tCONSTRAINT pk_card_block_instances PRIMARY KEY (id), \n\tCONSTRAINT uq_card_block_instances_card_id_block_id_ordinal UNIQUE (card_id, block_id, ordinal), \n\tCONSTRAINT fk_card_block_instances_card_id_cards FOREIGN KEY(card_id) REFERENCES cards (id), \n\tCONSTRAINT fk_card_block_instances_block_id_form_blocks FOREIGN KEY(block_id) REFERENCES form_blocks (id), \n\tCONSTRAINT fk_card_block_instances_created_by_users FOREIGN KEY(created_by) REFERENCES users (id)\n)",
    "CREATE TABLE card_public_links (\n\tcard_id UUID NOT NULL, \n\ttoken_hash VARCHAR NOT NULL, \n\tstatus VARCHAR DEFAULT 'active' NOT NULL, \n\tcan_view BOOLEAN DEFAULT 'true' NOT NULL, \n\tcan_edit BOOLEAN DEFAULT 'true' NOT NULL, \n\texpires_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\tmax_uses INTEGER, \n\tused_count INTEGER DEFAULT '0' NOT NULL, \n\tallowed_blocks_json JSONB, \n\tallowed_fields_json JSONB, \n\tcreated_by UUID, \n\tdisabled_at TIMESTAMP WITH TIME ZONE, \n\tid UUID DEFAULT gen_random_uuid() NOT NULL, \n\tcreated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, \n\tCONSTRAINT pk_card_public_links PRIMARY KEY (id), \n\tCONSTRAINT uq_card_public_links_token_hash UNIQUE (token_hash), \n\tCONSTRAINT ck_card_public_links_status CHECK (status in ('active', 'disabled', 'expired')), \n\tCONSTRAINT ck_card_public_links_used_count_non_negative CHECK (used_count >= 0), \n\tCONSTRAINT fk_card_public_links_card_id_cards FOREIGN KEY(card_id) REFERENCES cards (id), \n\tCONSTRAINT fk_card_public_links_created_by_users FOREIGN KEY(created_by) REFERENCES users (id)\n)",
    "CREATE TABLE card_relations (\n\tsource_card_id UUID NOT NULL, \n\ttarget_card_id UUID NOT NULL, \n\trelation_type VARCHAR NOT NULL, \n\tdescription VARCHAR, \n\tcreated_by UUID, \n\tid UUID DEFAULT gen_random_uuid() NOT NULL, \n\tcreated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, \n\tCONSTRAINT pk_card_relations PRIMARY KEY (id), \n\tCONSTRAINT uq_card_relations_source_target_type UNIQUE (source_card_id, target_card_id, relation_type), \n\tCONSTRAINT ck_card_relations_relation_type CHECK (relation_type in ('related_to', 'transferred_to', 'duplicates')), \n\tCONSTRAINT fk_card_relations_source_card_id_cards FOREIGN KEY(source_card_id) REFERENCES cards (id), \n\tCONSTRAINT fk_card_relations_target_card_id_cards FOREIGN KEY(target_card_id) REFERENCES cards (id), \n\tCONSTRAINT fk_card_relations_created_by_users FOREIGN KEY(created_by) REFERENCES users (id)\n)",
    "CREATE TABLE audit_events (\n\tactor_type VARCHAR NOT NULL, \n\tactor_user_id UUID, \n\tactor_public_link_id UUID, \n\taction VARCHAR NOT NULL, \n\tobject_type VARCHAR NOT NULL, \n\tobject_id UUID, \n\told_data_json JSONB, \n\tnew_data_json JSONB, \n\tsource VARCHAR NOT NULL, \n\tip_address INET, \n\tuser_agent VARCHAR, \n\trequest_id VARCHAR, \n\tid UUID DEFAULT gen_random_uuid() NOT NULL, \n\tcreated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, \n\tCONSTRAINT pk_audit_events PRIMARY KEY (id), \n\tCONSTRAINT ck_audit_events_actor_type CHECK (actor_type in ('user', 'public_link', 'system')), \n\tCONSTRAINT ck_audit_events_source CHECK (source in ('api', 'public_link', 'system')), \n\tCONSTRAINT fk_audit_events_actor_user_id_users FOREIGN KEY(actor_user_id) REFERENCES users (id), \n\tCONSTRAINT fk_audit_events_actor_public_link_id_card_public_links FOREIGN KEY(actor_public_link_id) REFERENCES card_public_links (id)\n)",
    "CREATE TABLE field_values (\n\tcard_id UUID NOT NULL, \n\tblock_instance_id UUID NOT NULL, \n\tfield_id UUID NOT NULL, \n\tvalue_text VARCHAR, \n\tvalue_number NUMERIC, \n\tvalue_date DATE, \n\tvalue_datetime TIMESTAMP WITH TIME ZONE, \n\tvalue_bool BOOLEAN, \n\tvalue_json JSONB, \n\tvalue_reference_item_id UUID, \n\tvalue_card_id UUID, \n\tvalue_user_id UUID, \n\tvalue_organization_id UUID, \n\tvalue_org_unit_id UUID, \n\tvalue_registry_id UUID, \n\tcreated_by UUID, \n\tupdated_by UUID, \n\tid UUID DEFAULT gen_random_uuid() NOT NULL, \n\tcreated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, \n\tupdated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, \n\tCONSTRAINT pk_field_values PRIMARY KEY (id), \n\tCONSTRAINT uq_field_values_card_block_field UNIQUE (card_id, block_instance_id, field_id), \n\tCONSTRAINT fk_field_values_card_id_cards FOREIGN KEY(card_id) REFERENCES cards (id), \n\tCONSTRAINT fk_field_values_block_instance_id_card_block_instances FOREIGN KEY(block_instance_id) REFERENCES card_block_instances (id), \n\tCONSTRAINT fk_field_values_field_id_form_fields FOREIGN KEY(field_id) REFERENCES form_fields (id), \n\tCONSTRAINT fk_field_values_value_reference_item_id_reference_items FOREIGN KEY(value_reference_item_id) REFERENCES reference_items (id), \n\tCONSTRAINT fk_field_values_value_card_id_cards FOREIGN KEY(value_card_id) REFERENCES cards (id), \n\tCONSTRAINT fk_field_values_value_user_id_users FOREIGN KEY(value_user_id) REFERENCES users (id), \n\tCONSTRAINT fk_field_values_value_organization_id_organizations FOREIGN KEY(value_organization_id) REFERENCES organizations (id), \n\tCONSTRAINT fk_field_values_value_org_unit_id_org_units FOREIGN KEY(value_org_unit_id) REFERENCES org_units (id), \n\tCONSTRAINT fk_field_values_value_registry_id_registries FOREIGN KEY(value_registry_id) REFERENCES registries (id), \n\tCONSTRAINT fk_field_values_created_by_users FOREIGN KEY(created_by) REFERENCES users (id), \n\tCONSTRAINT fk_field_values_updated_by_users FOREIGN KEY(updated_by) REFERENCES users (id)\n)",
    "CREATE TABLE field_value_items (\n\tfield_value_id UUID NOT NULL, \n\treference_item_id UUID NOT NULL, \n\tposition INTEGER DEFAULT '0' NOT NULL, \n\tid UUID DEFAULT gen_random_uuid() NOT NULL, \n\tCONSTRAINT pk_field_value_items PRIMARY KEY (id), \n\tCONSTRAINT uq_field_value_items_value_item UNIQUE (field_value_id, reference_item_id), \n\tCONSTRAINT fk_field_value_items_field_value_id_field_values FOREIGN KEY(field_value_id) REFERENCES field_values (id), \n\tCONSTRAINT fk_field_value_items_reference_item_id_reference_items FOREIGN KEY(reference_item_id) REFERENCES reference_items (id)\n)",
)


INDEX_DDL: tuple[str, ...] = (
    "CREATE UNIQUE INDEX ix_users_email_lower ON users (lower(email))",
    "CREATE INDEX ix_users_is_superuser ON users (is_superuser)",
    "CREATE INDEX ix_users_status ON users (status)",
    "CREATE INDEX ix_organizations_archived_at ON organizations (archived_at)",
    "CREATE INDEX ix_organizations_code ON organizations (code)",
    "CREATE INDEX ix_organizations_is_active ON organizations (is_active)",
    "CREATE INDEX ix_organizations_parent_id ON organizations (parent_id)",
    "CREATE INDEX ix_registries_code ON registries (code)",
    "CREATE INDEX ix_role_permissions_permission_id ON role_permissions (permission_id)",
    "CREATE INDEX ix_role_permissions_role_id ON role_permissions (role_id)",
    "CREATE INDEX ix_access_grants_include_descendants ON access_grants (include_descendants)",
    "CREATE INDEX ix_access_grants_organization_id ON access_grants (organization_id)",
    "CREATE INDEX ix_access_grants_registry_id ON access_grants (registry_id)",
    "CREATE INDEX ix_access_grants_role_id ON access_grants (role_id)",
    "CREATE INDEX ix_access_grants_user_id ON access_grants (user_id)",
    "CREATE INDEX ix_access_grants_valid_range ON access_grants (valid_from, valid_to)",
    "CREATE UNIQUE INDEX uq_access_grants_user_role_registry_organization_scope ON access_grants (user_id, role_id, coalesce(registry_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid))",
    "CREATE INDEX ix_form_blocks_registry_id ON form_blocks (registry_id)",
    "CREATE INDEX ix_org_units_is_active ON org_units (is_active)",
    "CREATE INDEX ix_org_units_organization_id ON org_units (organization_id)",
    "CREATE INDEX ix_org_units_parent_id ON org_units (parent_id)",
    "CREATE INDEX ix_organization_closure_descendant_id ON organization_closure (descendant_id)",
    "CREATE INDEX ix_reference_lists_owner_organization_id ON reference_lists (owner_organization_id)",
    "CREATE INDEX ix_reference_lists_registry_id ON reference_lists (registry_id)",
    "CREATE UNIQUE INDEX uq_reference_lists_registry_owner_code_scope ON reference_lists (coalesce(registry_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(owner_organization_id, '00000000-0000-0000-0000-000000000000'::uuid), code)",
    "CREATE INDEX ix_cards_display_name_lower ON cards (lower(display_name))",
    "CREATE INDEX ix_cards_lifecycle_status ON cards (lifecycle_status)",
    "CREATE INDEX ix_cards_org_unit_id ON cards (org_unit_id)",
    "CREATE INDEX ix_cards_organization_id ON cards (organization_id)",
    "CREATE INDEX ix_cards_registry_id ON cards (registry_id)",
    "CREATE INDEX ix_cards_registry_organization_status ON cards (registry_id, organization_id, lifecycle_status)",
    "CREATE INDEX ix_form_fields_block_id ON form_fields (block_id)",
    "CREATE INDEX ix_reference_items_list_id ON reference_items (list_id)",
    "CREATE INDEX ix_reference_items_parent_id ON reference_items (parent_id)",
    "CREATE INDEX ix_card_block_instances_block_id ON card_block_instances (block_id)",
    "CREATE INDEX ix_card_block_instances_card_block ON card_block_instances (card_id, block_id)",
    "CREATE INDEX ix_card_block_instances_card_id ON card_block_instances (card_id)",
    "CREATE INDEX ix_card_public_links_card_id ON card_public_links (card_id)",
    "CREATE INDEX ix_card_public_links_expires_at ON card_public_links (expires_at)",
    "CREATE INDEX ix_card_public_links_token_hash ON card_public_links (token_hash)",
    "CREATE INDEX ix_card_relations_source_card_id ON card_relations (source_card_id)",
    "CREATE INDEX ix_card_relations_target_card_id ON card_relations (target_card_id)",
    "CREATE INDEX ix_audit_events_action ON audit_events (action)",
    "CREATE INDEX ix_audit_events_actor_public_link_id ON audit_events (actor_public_link_id)",
    "CREATE INDEX ix_audit_events_actor_user_id ON audit_events (actor_user_id)",
    "CREATE INDEX ix_audit_events_created_at ON audit_events (created_at)",
    "CREATE INDEX ix_audit_events_object ON audit_events (object_type, object_id)",
    "CREATE INDEX ix_audit_events_request_id ON audit_events (request_id)",
    "CREATE INDEX ix_audit_events_source ON audit_events (source)",
    "CREATE INDEX ix_field_values_block_instance_id ON field_values (block_instance_id)",
    "CREATE INDEX ix_field_values_card_id ON field_values (card_id)",
    "CREATE INDEX ix_field_values_field_bool ON field_values (field_id, value_bool)",
    "CREATE INDEX ix_field_values_field_card ON field_values (field_id, value_card_id)",
    "CREATE INDEX ix_field_values_field_date ON field_values (field_id, value_date)",
    "CREATE INDEX ix_field_values_field_datetime ON field_values (field_id, value_datetime)",
    "CREATE INDEX ix_field_values_field_id ON field_values (field_id)",
    "CREATE INDEX ix_field_values_field_number ON field_values (field_id, value_number)",
    "CREATE INDEX ix_field_values_field_org_unit ON field_values (field_id, value_org_unit_id)",
    "CREATE INDEX ix_field_values_field_organization ON field_values (field_id, value_organization_id)",
    "CREATE INDEX ix_field_values_field_reference_item ON field_values (field_id, value_reference_item_id)",
    "CREATE INDEX ix_field_values_field_text ON field_values (field_id, value_text)",
    "CREATE INDEX ix_field_values_field_user ON field_values (field_id, value_user_id)",
    "CREATE INDEX ix_field_value_items_field_value_id ON field_value_items (field_value_id)",
    "CREATE INDEX ix_field_value_items_reference_item_id ON field_value_items (reference_item_id)",
)


ALTER_DDL: tuple[str, ...] = (
    "ALTER TABLE registries ADD CONSTRAINT fk_registries_display_name_field_id_form_fields FOREIGN KEY(display_name_field_id) REFERENCES form_fields (id)",
)


DROP_DDL: tuple[str, ...] = (
    "DROP TABLE IF EXISTS public.field_value_items CASCADE",
    "DROP TABLE IF EXISTS public.field_values CASCADE",
    "DROP TABLE IF EXISTS public.audit_events CASCADE",
    "DROP TABLE IF EXISTS public.card_relations CASCADE",
    "DROP TABLE IF EXISTS public.card_public_links CASCADE",
    "DROP TABLE IF EXISTS public.card_block_instances CASCADE",
    "DROP TABLE IF EXISTS public.reference_items CASCADE",
    "DROP TABLE IF EXISTS public.form_fields CASCADE",
    "DROP TABLE IF EXISTS public.cards CASCADE",
    "DROP TABLE IF EXISTS public.reference_lists CASCADE",
    "DROP TABLE IF EXISTS public.organization_closure CASCADE",
    "DROP TABLE IF EXISTS public.org_units CASCADE",
    "DROP TABLE IF EXISTS public.form_blocks CASCADE",
    "DROP TABLE IF EXISTS public.access_grants CASCADE",
    "DROP TABLE IF EXISTS public.role_permissions CASCADE",
    "DROP TABLE IF EXISTS public.registries CASCADE",
    "DROP TABLE IF EXISTS public.organizations CASCADE",
    "DROP TABLE IF EXISTS public.users CASCADE",
    "DROP TABLE IF EXISTS public.roles CASCADE",
    "DROP TABLE IF EXISTS public.permissions CASCADE",
)


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
    for statement in TABLE_DDL:
        op.execute(statement)
    for statement in INDEX_DDL:
        op.execute(statement)
    for statement in ALTER_DDL:
        op.execute(statement)


def downgrade() -> None:
    for statement in DROP_DDL:
        op.execute(statement)
