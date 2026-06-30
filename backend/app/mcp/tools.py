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
    if not isinstance(value, int):
        raise ValueError(f"Tool argument {key!r} must be an integer.")
    return value
