USER_STATUSES = ("active", "inactive", "blocked")

REGISTRY_STATUSES = ("active", "archived")

CARD_LIFECYCLE_STATUSES = ("draft", "active", "archived", "superseded")

FIELD_TYPES = (
    "text",
    "textarea",
    "integer",
    "decimal",
    "date",
    "datetime",
    "boolean",
    "select",
    "multi_select",
    "organization_ref",
    "org_unit_ref",
    "user_ref",
    "card_ref",
    "registry_ref",
)

REQUIRED_MODES = ("not_required", "required_for_new_cards", "required_on_publish")

PUBLIC_LINK_STATUSES = ("active", "disabled", "expired")

CARD_RELATION_TYPES = ("transferred_to", "copied_to", "replaced_by", "related_to")

AUDIT_ACTOR_TYPES = ("user", "public_link", "system")

AUDIT_SOURCES = ("web", "api", "public_link", "system", "future_mcp", "future_import")

SEED_ROLES = (
    ("system_admin", "System administrator", "Full system access", True),
    ("org_admin", "Organization administrator", "Organization subtree administrator", True),
)

SEED_PERMISSIONS = (
    "registry.view",
    "registry.manage_schema",
    "organization.view",
    "organization.manage",
    "organization.create_child",
    "organization.manage_admins",
    "org_unit.view",
    "org_unit.manage",
    "card.list",
    "card.view",
    "card.create",
    "card.edit",
    "card.archive",
    "card.transfer",
    "card.public_link.manage",
    "reference_list.view",
    "reference_list.manage",
    "audit.view",
)
