USER_STATUSES = ("active", "disabled", "archived")
REGISTRY_STATUSES = ("draft", "active", "archived")
CARD_LIFECYCLE_STATUSES = ("draft", "active", "archived", "superseded")
FIELD_TYPES = (
    "text",
    "number",
    "date",
    "datetime",
    "bool",
    "json",
    "select",
    "multi_select",
    "card_ref",
    "user_ref",
    "organization_ref",
    "org_unit_ref",
    "registry_ref",
    "file_ref",
    "static_text",
)
REQUIRED_MODES = ("not_required", "required", "required_on_publish")
PUBLIC_LINK_STATUSES = (
    "active",
    "submitted",
    "changes_requested",
    "approved",
    "disabled",
    "expired",
)
CARD_RELATION_TYPES = ("related_to", "transferred_to", "duplicates")
AUDIT_ACTOR_TYPES = ("user", "public_link", "reference_edit_link", "system")
AUDIT_SOURCES = ("api", "public_link", "reference_edit_link", "system", "mcp")
MALWARE_SCANNER_STATUSES = ("deferred", "pending", "clean", "blocked", "error")
DOCUMENT_TEMPLATE_FORMATS = ("docx_text_v1", "docx_binary_v1", "card_print_layout_v1")
GENERATED_DOCUMENT_STATUSES = ("generated",)
REPORT_TYPES = ("registry_cards", "card_detail", "period_summary")
REPORT_OUTPUT_FORMATS = ("json", "csv", "xlsx", "pdf")
REPORT_RUN_STATUSES = ("generated", "failed")
