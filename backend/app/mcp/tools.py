from __future__ import annotations

import json
from typing import Any

from app.mcp.api_client import RegEngineApiClient, RegEngineApiError

McpToolDefinition = dict[str, Any]
McpToolResult = dict[str, Any]


MCP_TOOL_DEFINITIONS: list[McpToolDefinition] = [
    {
        "name": "reg_engine_health",
        "title": "Registry Engine health",
        "description": "Read the Registry Engine API health status.",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
        "annotations": {"readOnlyHint": True},
    },
    {
        "name": "reg_engine_list_organizations",
        "title": "List organizations",
        "description": "List organizations visible to the authenticated API user.",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
        "annotations": {"readOnlyHint": True},
    },
    {
        "name": "reg_engine_list_registries",
        "title": "List registries",
        "description": "List registries visible to the authenticated API user.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "include_archive": {
                    "type": "boolean",
                    "description": "Include archived registries.",
                }
            },
            "additionalProperties": False,
        },
        "annotations": {"readOnlyHint": True},
    },
    {
        "name": "reg_engine_read_registry_schema",
        "title": "Read registry schema",
        "description": "Read schema blocks and fields for a registry.",
        "inputSchema": {
            "type": "object",
            "properties": {"registry_id": {"type": "string"}},
            "required": ["registry_id"],
            "additionalProperties": False,
        },
        "annotations": {"readOnlyHint": True},
    },
    {
        "name": "reg_engine_list_cards",
        "title": "List cards",
        "description": "List cards visible to the authenticated API user.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "registry_id": {"type": "string"},
                "organization_id": {"type": "string"},
                "include_archive": {"type": "boolean"},
                "q": {"type": "string"},
            },
            "required": ["registry_id"],
            "additionalProperties": False,
        },
        "annotations": {"readOnlyHint": True},
    },
    {
        "name": "reg_engine_read_card",
        "title": "Read card",
        "description": "Read one card using backend card visibility rules.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "card_id": {"type": "string"},
                "include_archive": {"type": "boolean"},
            },
            "required": ["card_id"],
            "additionalProperties": False,
        },
        "annotations": {"readOnlyHint": True},
    },
    {
        "name": "reg_engine_list_audit_events",
        "title": "List audit events",
        "description": "List audit events visible to a system admin API user.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "object_type": {"type": "string"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 100},
            },
            "additionalProperties": False,
        },
        "annotations": {"readOnlyHint": True},
    },
    {
        "name": "reg_engine_list_report_templates",
        "title": "List report templates",
        "description": "List report templates for a registry.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "registry_id": {"type": "string"},
                "include_archive": {"type": "boolean"},
            },
            "required": ["registry_id"],
            "additionalProperties": False,
        },
        "annotations": {"readOnlyHint": True},
    },
    {
        "name": "reg_engine_list_report_runs",
        "title": "List report runs",
        "description": "List report runs for a registry.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "registry_id": {"type": "string"},
                "include_archive": {"type": "boolean"},
            },
            "required": ["registry_id"],
            "additionalProperties": False,
        },
        "annotations": {"readOnlyHint": True},
    },
    {
        "name": "reg_engine_read_report_run",
        "title": "Read report run",
        "description": "Read safe report run metadata.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "report_run_id": {"type": "string"},
                "include_archive": {"type": "boolean"},
            },
            "required": ["report_run_id"],
            "additionalProperties": False,
        },
        "annotations": {"readOnlyHint": True},
    },
    {
        "name": "reg_engine_create_registry",
        "title": "Create registry",
        "description": (
            "Create a registry through the Registry Engine API. Requires the "
            "authenticated API user to be a system admin."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "code": {"type": "string"},
                "name": {"type": "string"},
                "description": {"type": "string"},
            },
            "required": ["code", "name"],
            "additionalProperties": False,
        },
        "annotations": {"readOnlyHint": False},
    },
    {
        "name": "reg_engine_update_registry",
        "title": "Update registry",
        "description": "Update registry settings through the Registry Engine API.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "registry_id": {"type": "string"},
                "name": {"type": "string"},
                "description": {"type": "string"},
                "lifecycle_status": {"type": "string"},
            },
            "required": ["registry_id"],
            "additionalProperties": False,
        },
        "annotations": {"readOnlyHint": False},
    },
    {
        "name": "reg_engine_archive_registry",
        "title": "Archive registry",
        "description": (
            "Archive a registry through the Registry Engine API. Requires confirm_archive=true."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "registry_id": {"type": "string"},
                "confirm_archive": {"type": "boolean"},
            },
            "required": ["registry_id", "confirm_archive"],
            "additionalProperties": False,
        },
        "annotations": {"readOnlyHint": False},
    },
    {
        "name": "reg_engine_create_form_block",
        "title": "Create form block",
        "description": "Create a form block through the Registry Engine API.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "registry_id": {"type": "string"},
                "code": {"type": "string"},
                "title": {"type": "string"},
                "description": {"type": "string"},
                "position": {"type": "integer"},
                "is_repeatable": {"type": "boolean"},
                "public_visible": {"type": "boolean"},
                "public_editable": {"type": "boolean"},
            },
            "required": ["registry_id", "code", "title"],
            "additionalProperties": False,
        },
        "annotations": {"readOnlyHint": False},
    },
    {
        "name": "reg_engine_update_form_block",
        "title": "Update form block",
        "description": "Update form block settings through the Registry Engine API.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "block_id": {"type": "string"},
                "title": {"type": "string"},
                "description": {"type": "string"},
                "position": {"type": "integer"},
            },
            "required": ["block_id"],
            "additionalProperties": False,
        },
        "annotations": {"readOnlyHint": False},
    },
    {
        "name": "reg_engine_archive_form_block",
        "title": "Archive form block",
        "description": (
            "Archive a form block through the Registry Engine API. Requires confirm_archive=true."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "block_id": {"type": "string"},
                "confirm_archive": {"type": "boolean"},
            },
            "required": ["block_id", "confirm_archive"],
            "additionalProperties": False,
        },
        "annotations": {"readOnlyHint": False},
    },
    {
        "name": "reg_engine_create_form_field",
        "title": "Create form field",
        "description": "Create a form field through the Registry Engine API.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "block_id": {"type": "string"},
                "code": {"type": "string"},
                "label": {"type": "string"},
                "field_type": {"type": "string"},
                "description": {"type": "string"},
                "position": {"type": "integer"},
                "options_source_type": {"type": "string"},
                "options_source_id": {"type": "string"},
                "public_visible": {"type": "boolean"},
                "public_editable": {"type": "boolean"},
            },
            "required": ["block_id", "code", "label", "field_type"],
            "additionalProperties": False,
        },
        "annotations": {"readOnlyHint": False},
    },
    {
        "name": "reg_engine_update_form_field",
        "title": "Update form field",
        "description": "Update form field settings through the Registry Engine API.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "field_id": {"type": "string"},
                "label": {"type": "string"},
                "description": {"type": "string"},
                "position": {"type": "integer"},
                "is_active": {"type": "boolean"},
            },
            "required": ["field_id"],
            "additionalProperties": False,
        },
        "annotations": {"readOnlyHint": False},
    },
    {
        "name": "reg_engine_archive_form_field",
        "title": "Archive form field",
        "description": (
            "Archive a form field through the Registry Engine API. Requires confirm_archive=true."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "field_id": {"type": "string"},
                "confirm_archive": {"type": "boolean"},
            },
            "required": ["field_id", "confirm_archive"],
            "additionalProperties": False,
        },
        "annotations": {"readOnlyHint": False},
    },
    {
        "name": "reg_engine_create_card",
        "title": "Create card",
        "description": "Create a card through the Registry Engine API.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "registry_id": {"type": "string"},
                "organization_id": {"type": "string"},
                "display_name": {"type": "string"},
                "org_unit_id": {"type": "string"},
                "public_view_enabled": {"type": "boolean"},
                "public_edit_enabled": {"type": "boolean"},
            },
            "required": ["registry_id", "organization_id", "display_name"],
            "additionalProperties": False,
        },
        "annotations": {"readOnlyHint": False},
    },
    {
        "name": "reg_engine_update_card",
        "title": "Update card",
        "description": "Update card metadata through the Registry Engine API.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "card_id": {"type": "string"},
                "display_name": {"type": "string"},
                "public_view_enabled": {"type": "boolean"},
                "public_edit_enabled": {"type": "boolean"},
            },
            "required": ["card_id"],
            "additionalProperties": False,
        },
        "annotations": {"readOnlyHint": False},
    },
    {
        "name": "reg_engine_archive_card",
        "title": "Archive card",
        "description": (
            "Archive a card through the Registry Engine API. Requires confirm_archive=true."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "card_id": {"type": "string"},
                "confirm_archive": {"type": "boolean"},
            },
            "required": ["card_id", "confirm_archive"],
            "additionalProperties": False,
        },
        "annotations": {"readOnlyHint": False},
    },
    {
        "name": "reg_engine_set_card_field_value",
        "title": "Set card field value",
        "description": "Set one card field value through the Registry Engine API.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "card_id": {"type": "string"},
                "field_id": {"type": "string"},
                "value": {},
                "block_instance_id": {"type": "string"},
            },
            "required": ["card_id", "field_id", "value"],
            "additionalProperties": False,
        },
        "annotations": {"readOnlyHint": False},
    },
    {
        "name": "reg_engine_set_card_values",
        "title": "Set card values",
        "description": "Set multiple card field values through the Registry Engine API.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "card_id": {"type": "string"},
                "values": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "field_id": {"type": "string"},
                            "value": {},
                            "block_instance_id": {"type": "string"},
                        },
                        "required": ["field_id", "value"],
                        "additionalProperties": False,
                    },
                },
            },
            "required": ["card_id", "values"],
            "additionalProperties": False,
        },
        "annotations": {"readOnlyHint": False},
    },
    {
        "name": "reg_engine_create_card_block_instance",
        "title": "Create card block instance",
        "description": "Create a card block instance through the Registry Engine API.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "card_id": {"type": "string"},
                "block_id": {"type": "string"},
            },
            "required": ["card_id", "block_id"],
            "additionalProperties": False,
        },
        "annotations": {"readOnlyHint": False},
    },
    {
        "name": "reg_engine_archive_card_block_instance",
        "title": "Archive card block instance",
        "description": (
            "Archive a card block instance through the Registry Engine API. "
            "Requires confirm_archive=true."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "block_instance_id": {"type": "string"},
                "confirm_archive": {"type": "boolean"},
            },
            "required": ["block_instance_id", "confirm_archive"],
            "additionalProperties": False,
        },
        "annotations": {"readOnlyHint": False},
    },
    {
        "name": "reg_engine_transfer_card",
        "title": "Transfer card",
        "description": (
            "Transfer a card to another organization through the Registry Engine API. "
            "Requires confirm_transfer=true."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "card_id": {"type": "string"},
                "target_organization_id": {"type": "string"},
                "confirm_transfer": {"type": "boolean"},
            },
            "required": ["card_id", "target_organization_id", "confirm_transfer"],
            "additionalProperties": False,
        },
        "annotations": {"readOnlyHint": False},
    },
    {
        "name": "reg_engine_create_report_template",
        "title": "Create report template",
        "description": "Create a report template through the Registry Engine API.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "registry_id": {"type": "string"},
                "code": {"type": "string"},
                "name": {"type": "string"},
                "report_type": {"type": "string"},
                "description": {"type": "string"},
                "parameters_schema_json": {"type": "object"},
                "default_parameters_json": {"type": "object"},
                "output_format": {"type": "string"},
            },
            "required": ["registry_id", "code", "name", "report_type"],
            "additionalProperties": False,
        },
        "annotations": {"readOnlyHint": False},
    },
    {
        "name": "reg_engine_update_report_template",
        "title": "Update report template",
        "description": "Update report template settings through the Registry Engine API.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "template_id": {"type": "string"},
                "name": {"type": "string"},
                "description": {"type": "string"},
                "report_type": {"type": "string"},
                "parameters_schema_json": {"type": "object"},
                "default_parameters_json": {"type": "object"},
                "output_format": {"type": "string"},
            },
            "required": ["template_id"],
            "additionalProperties": False,
        },
        "annotations": {"readOnlyHint": False},
    },
    {
        "name": "reg_engine_archive_report_template",
        "title": "Archive report template",
        "description": (
            "Archive a report template through the Registry Engine API. "
            "Requires confirm_archive=true."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "template_id": {"type": "string"},
                "confirm_archive": {"type": "boolean"},
            },
            "required": ["template_id", "confirm_archive"],
            "additionalProperties": False,
        },
        "annotations": {"readOnlyHint": False},
    },
    {
        "name": "reg_engine_generate_report_run",
        "title": "Generate report run",
        "description": "Generate a report run through the Registry Engine API.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "template_id": {"type": "string"},
                "parameters": {"type": "object"},
            },
            "required": ["template_id"],
            "additionalProperties": False,
        },
        "annotations": {"readOnlyHint": False},
    },
    {
        "name": "reg_engine_archive_report_run",
        "title": "Archive report run",
        "description": (
            "Archive a report run through the Registry Engine API. Requires confirm_archive=true."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "report_run_id": {"type": "string"},
                "confirm_archive": {"type": "boolean"},
            },
            "required": ["report_run_id", "confirm_archive"],
            "additionalProperties": False,
        },
        "annotations": {"readOnlyHint": False},
    },
]


def call_tool(
    name: str,
    arguments: dict[str, Any] | None,
    *,
    client: RegEngineApiClient,
) -> McpToolResult:
    args = arguments or {}
    try:
        payload = _call_tool_or_raise(name, args, client)
    except (RegEngineApiError, ValueError) as exc:
        return {
            "content": [{"type": "text", "text": str(exc)}],
            "isError": True,
        }
    return {
        "content": [{"type": "text", "text": json.dumps(payload, ensure_ascii=False, indent=2)}],
        "structuredContent": payload,
        "isError": False,
    }


def _call_tool_or_raise(
    name: str,
    arguments: dict[str, Any],
    client: RegEngineApiClient,
) -> Any:
    if name == "reg_engine_health":
        return client.get_json("/api/v1/health")
    if name == "reg_engine_list_organizations":
        return client.get_json("/api/v1/organizations")
    if name == "reg_engine_list_registries":
        return client.get_json(
            "/api/v1/registries",
            {"include_archive": _bool_arg(arguments, "include_archive", False)},
        )
    if name == "reg_engine_read_registry_schema":
        registry_id = _required_str_arg(arguments, "registry_id")
        return client.get_json(f"/api/v1/registries/{registry_id}/schema")
    if name == "reg_engine_list_cards":
        registry_id = _required_str_arg(arguments, "registry_id")
        return client.get_json(
            f"/api/v1/registries/{registry_id}/cards",
            {
                "organization_id": _optional_str_arg(arguments, "organization_id"),
                "include_archive": _bool_arg(arguments, "include_archive", False),
                "q": _optional_str_arg(arguments, "q"),
            },
        )
    if name == "reg_engine_read_card":
        card_id = _required_str_arg(arguments, "card_id")
        return client.get_json(
            f"/api/v1/cards/{card_id}",
            {"include_archive": _bool_arg(arguments, "include_archive", False)},
        )
    if name == "reg_engine_list_audit_events":
        return client.get_json(
            "/api/v1/audit-events",
            {
                "object_type": _optional_str_arg(arguments, "object_type"),
                "limit": _int_arg(arguments, "limit", 50),
            },
        )
    if name == "reg_engine_list_report_templates":
        registry_id = _required_str_arg(arguments, "registry_id")
        return client.get_json(
            f"/api/v1/registries/{registry_id}/report-templates",
            {"include_archive": _bool_arg(arguments, "include_archive", False)},
        )
    if name == "reg_engine_list_report_runs":
        registry_id = _required_str_arg(arguments, "registry_id")
        return client.get_json(
            f"/api/v1/registries/{registry_id}/report-runs",
            {"include_archive": _bool_arg(arguments, "include_archive", False)},
        )
    if name == "reg_engine_read_report_run":
        report_run_id = _required_str_arg(arguments, "report_run_id")
        return client.get_json(
            f"/api/v1/report-runs/{report_run_id}",
            {"include_archive": _bool_arg(arguments, "include_archive", False)},
        )
    if name == "reg_engine_create_registry":
        payload: dict[str, Any] = {
            "code": _required_str_arg(arguments, "code"),
            "name": _required_str_arg(arguments, "name"),
        }
        description = _optional_str_arg(arguments, "description")
        if description is not None:
            payload["description"] = description
        return client.post_json("/api/v1/registries", payload)
    if name == "reg_engine_update_registry":
        registry_id = _required_str_arg(arguments, "registry_id")
        payload = {}
        for key in ("name", "description", "lifecycle_status"):
            value = _optional_str_arg(arguments, key)
            if value is not None:
                payload[key] = value
        if not payload:
            raise ValueError("At least one registry update field is required.")
        return client.patch_json(f"/api/v1/registries/{registry_id}", payload)
    if name == "reg_engine_archive_registry":
        registry_id = _required_str_arg(arguments, "registry_id")
        if _bool_arg(arguments, "confirm_archive", False) is not True:
            raise ValueError("Tool argument 'confirm_archive' must be true.")
        return client.delete_json(f"/api/v1/registries/{registry_id}")
    if name == "reg_engine_create_form_block":
        registry_id = _required_str_arg(arguments, "registry_id")
        block_payload: dict[str, Any] = {
            "code": _required_str_arg(arguments, "code"),
            "title": _required_str_arg(arguments, "title"),
        }
        _add_optional_str(block_payload, arguments, "description")
        _add_optional_int(block_payload, arguments, "position")
        _add_optional_bool(block_payload, arguments, "is_repeatable")
        _add_optional_bool(block_payload, arguments, "public_visible")
        _add_optional_bool(block_payload, arguments, "public_editable")
        return client.post_json(f"/api/v1/registries/{registry_id}/blocks", block_payload)
    if name == "reg_engine_update_form_block":
        block_id = _required_str_arg(arguments, "block_id")
        block_update_payload: dict[str, Any] = {}
        _add_optional_str(block_update_payload, arguments, "title")
        _add_optional_str(block_update_payload, arguments, "description")
        _add_optional_int(block_update_payload, arguments, "position")
        if not block_update_payload:
            raise ValueError("At least one form block update field is required.")
        return client.patch_json(f"/api/v1/blocks/{block_id}", block_update_payload)
    if name == "reg_engine_archive_form_block":
        block_id = _required_str_arg(arguments, "block_id")
        if _bool_arg(arguments, "confirm_archive", False) is not True:
            raise ValueError("Tool argument 'confirm_archive' must be true.")
        return client.delete_json(f"/api/v1/blocks/{block_id}")
    if name == "reg_engine_create_form_field":
        block_id = _required_str_arg(arguments, "block_id")
        field_payload: dict[str, Any] = {
            "code": _required_str_arg(arguments, "code"),
            "label": _required_str_arg(arguments, "label"),
            "field_type": _required_str_arg(arguments, "field_type"),
        }
        _add_optional_str(field_payload, arguments, "description")
        _add_optional_int(field_payload, arguments, "position")
        _add_optional_str(field_payload, arguments, "options_source_type")
        _add_optional_str(field_payload, arguments, "options_source_id")
        _add_optional_bool(field_payload, arguments, "public_visible")
        _add_optional_bool(field_payload, arguments, "public_editable")
        return client.post_json(f"/api/v1/blocks/{block_id}/fields", field_payload)
    if name == "reg_engine_update_form_field":
        field_id = _required_str_arg(arguments, "field_id")
        field_update_payload: dict[str, Any] = {}
        _add_optional_str(field_update_payload, arguments, "label")
        _add_optional_str(field_update_payload, arguments, "description")
        _add_optional_int(field_update_payload, arguments, "position")
        _add_optional_bool(field_update_payload, arguments, "is_active")
        if not field_update_payload:
            raise ValueError("At least one form field update field is required.")
        return client.patch_json(f"/api/v1/fields/{field_id}", field_update_payload)
    if name == "reg_engine_archive_form_field":
        field_id = _required_str_arg(arguments, "field_id")
        if _bool_arg(arguments, "confirm_archive", False) is not True:
            raise ValueError("Tool argument 'confirm_archive' must be true.")
        return client.delete_json(f"/api/v1/fields/{field_id}")
    if name == "reg_engine_create_card":
        registry_id = _required_str_arg(arguments, "registry_id")
        card_payload: dict[str, Any] = {
            "organization_id": _required_str_arg(arguments, "organization_id"),
            "display_name": _required_str_arg(arguments, "display_name"),
        }
        _add_optional_str(card_payload, arguments, "org_unit_id")
        _add_optional_bool(card_payload, arguments, "public_view_enabled")
        _add_optional_bool(card_payload, arguments, "public_edit_enabled")
        return client.post_json(f"/api/v1/registries/{registry_id}/cards", card_payload)
    if name == "reg_engine_update_card":
        card_id = _required_str_arg(arguments, "card_id")
        card_update_payload: dict[str, Any] = {}
        _add_optional_str(card_update_payload, arguments, "display_name")
        _add_optional_bool(card_update_payload, arguments, "public_view_enabled")
        _add_optional_bool(card_update_payload, arguments, "public_edit_enabled")
        if not card_update_payload:
            raise ValueError("At least one card update field is required.")
        return client.patch_json(f"/api/v1/cards/{card_id}", card_update_payload)
    if name == "reg_engine_archive_card":
        card_id = _required_str_arg(arguments, "card_id")
        if _bool_arg(arguments, "confirm_archive", False) is not True:
            raise ValueError("Tool argument 'confirm_archive' must be true.")
        return client.delete_json(f"/api/v1/cards/{card_id}")
    if name == "reg_engine_set_card_field_value":
        card_id = _required_str_arg(arguments, "card_id")
        field_id = _required_str_arg(arguments, "field_id")
        field_value_payload: dict[str, Any] = {"value": _required_json_arg(arguments, "value")}
        _add_optional_str(field_value_payload, arguments, "block_instance_id")
        return client.patch_json(
            f"/api/v1/cards/{card_id}/fields/{field_id}",
            field_value_payload,
        )
    if name == "reg_engine_set_card_values":
        card_id = _required_str_arg(arguments, "card_id")
        return client.patch_json(
            f"/api/v1/cards/{card_id}/values",
            {"values": _required_bulk_values_arg(arguments)},
        )
    if name == "reg_engine_create_card_block_instance":
        card_id = _required_str_arg(arguments, "card_id")
        block_id = _required_str_arg(arguments, "block_id")
        return client.post_json(f"/api/v1/cards/{card_id}/blocks/{block_id}/instances", {})
    if name == "reg_engine_archive_card_block_instance":
        block_instance_id = _required_str_arg(arguments, "block_instance_id")
        if _bool_arg(arguments, "confirm_archive", False) is not True:
            raise ValueError("Tool argument 'confirm_archive' must be true.")
        return client.delete_json(f"/api/v1/card-block-instances/{block_instance_id}")
    if name == "reg_engine_transfer_card":
        card_id = _required_str_arg(arguments, "card_id")
        target_organization_id = _required_str_arg(arguments, "target_organization_id")
        if _bool_arg(arguments, "confirm_transfer", False) is not True:
            raise ValueError("Tool argument 'confirm_transfer' must be true.")
        return client.post_json(
            f"/api/v1/cards/{card_id}/transfer",
            {"target_organization_id": target_organization_id},
        )
    if name == "reg_engine_create_report_template":
        registry_id = _required_str_arg(arguments, "registry_id")
        report_template_payload: dict[str, Any] = {
            "code": _required_str_arg(arguments, "code"),
            "name": _required_str_arg(arguments, "name"),
            "report_type": _required_str_arg(arguments, "report_type"),
        }
        _add_optional_str(report_template_payload, arguments, "description")
        _add_optional_dict(report_template_payload, arguments, "parameters_schema_json")
        _add_optional_dict(report_template_payload, arguments, "default_parameters_json")
        _add_optional_str(report_template_payload, arguments, "output_format")
        return client.post_json(
            f"/api/v1/registries/{registry_id}/report-templates",
            report_template_payload,
        )
    if name == "reg_engine_update_report_template":
        template_id = _required_str_arg(arguments, "template_id")
        report_template_update_payload: dict[str, Any] = {}
        _add_optional_str(report_template_update_payload, arguments, "name")
        _add_optional_str(report_template_update_payload, arguments, "description")
        _add_optional_str(report_template_update_payload, arguments, "report_type")
        _add_optional_dict(
            report_template_update_payload,
            arguments,
            "parameters_schema_json",
        )
        _add_optional_dict(
            report_template_update_payload,
            arguments,
            "default_parameters_json",
        )
        _add_optional_str(report_template_update_payload, arguments, "output_format")
        if not report_template_update_payload:
            raise ValueError("At least one report template update field is required.")
        return client.patch_json(
            f"/api/v1/report-templates/{template_id}",
            report_template_update_payload,
        )
    if name == "reg_engine_archive_report_template":
        template_id = _required_str_arg(arguments, "template_id")
        if _bool_arg(arguments, "confirm_archive", False) is not True:
            raise ValueError("Tool argument 'confirm_archive' must be true.")
        return client.delete_json(f"/api/v1/report-templates/{template_id}")
    if name == "reg_engine_generate_report_run":
        template_id = _required_str_arg(arguments, "template_id")
        report_run_payload: dict[str, Any] = {}
        _add_optional_dict(report_run_payload, arguments, "parameters")
        return client.post_json(
            f"/api/v1/report-templates/{template_id}/runs",
            report_run_payload,
        )
    if name == "reg_engine_archive_report_run":
        report_run_id = _required_str_arg(arguments, "report_run_id")
        if _bool_arg(arguments, "confirm_archive", False) is not True:
            raise ValueError("Tool argument 'confirm_archive' must be true.")
        return client.delete_json(f"/api/v1/report-runs/{report_run_id}")
    raise ValueError(f"Unknown MCP tool: {name}")


def _required_str_arg(arguments: dict[str, Any], key: str) -> str:
    value = arguments.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"Tool argument {key!r} is required.")
    return value.strip()


def _optional_str_arg(arguments: dict[str, Any], key: str) -> str | None:
    value = arguments.get(key)
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError(f"Tool argument {key!r} must be a string.")
    return value


def _bool_arg(arguments: dict[str, Any], key: str, default: bool) -> bool:
    value = arguments.get(key, default)
    if not isinstance(value, bool):
        raise ValueError(f"Tool argument {key!r} must be a boolean.")
    return value


def _int_arg(arguments: dict[str, Any], key: str, default: int) -> int:
    value = arguments.get(key, default)
    if not isinstance(value, int) or isinstance(value, bool):
        raise ValueError(f"Tool argument {key!r} must be an integer.")
    return value


def _optional_int_arg(arguments: dict[str, Any], key: str) -> int | None:
    value = arguments.get(key)
    if value is None:
        return None
    if not isinstance(value, int) or isinstance(value, bool):
        raise ValueError(f"Tool argument {key!r} must be an integer.")
    return value


def _optional_bool_arg(arguments: dict[str, Any], key: str) -> bool | None:
    value = arguments.get(key)
    if value is None:
        return None
    if not isinstance(value, bool):
        raise ValueError(f"Tool argument {key!r} must be a boolean.")
    return value


def _optional_dict_arg(arguments: dict[str, Any], key: str) -> dict[str, Any] | None:
    value = arguments.get(key)
    if value is None:
        return None
    if not isinstance(value, dict):
        raise ValueError(f"Tool argument {key!r} must be an object.")
    return value


def _required_json_arg(arguments: dict[str, Any], key: str) -> Any:
    if key not in arguments:
        raise ValueError(f"Tool argument {key!r} is required.")
    return arguments[key]


def _required_bulk_values_arg(arguments: dict[str, Any]) -> list[dict[str, Any]]:
    values = arguments.get("values")
    if not isinstance(values, list):
        raise ValueError("Tool argument 'values' must be an array.")
    if not values:
        raise ValueError("Tool argument 'values' must not be empty.")
    return [_bulk_value_payload(value, index) for index, value in enumerate(values, start=1)]


def _bulk_value_payload(value: object, index: int) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"Tool argument 'values[{index}]' must be an object.")
    payload: dict[str, Any] = {
        "field_id": _required_str_arg(value, "field_id"),
        "value": _required_json_arg(value, "value"),
    }
    _add_optional_str(payload, value, "block_instance_id")
    return payload


def _add_optional_str(payload: dict[str, Any], arguments: dict[str, Any], key: str) -> None:
    value = _optional_str_arg(arguments, key)
    if value is not None:
        payload[key] = value


def _add_optional_int(payload: dict[str, Any], arguments: dict[str, Any], key: str) -> None:
    value = _optional_int_arg(arguments, key)
    if value is not None:
        payload[key] = value


def _add_optional_bool(payload: dict[str, Any], arguments: dict[str, Any], key: str) -> None:
    value = _optional_bool_arg(arguments, key)
    if value is not None:
        payload[key] = value


def _add_optional_dict(payload: dict[str, Any], arguments: dict[str, Any], key: str) -> None:
    value = _optional_dict_arg(arguments, key)
    if value is not None:
        payload[key] = value
