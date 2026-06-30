from __future__ import annotations

import ast
import io
import json
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest
from fastapi import Request

from app.api.dependencies import get_request_metadata
from app.domain.constants import AUDIT_SOURCES
from app.mcp.api_client import ApiResponse
from app.services.audit import AuditService


class FakeAuditSession:
    def __init__(self, metadata: dict[str, str | None]) -> None:
        self.info: dict[str, object] = {"audit_metadata": metadata}
        self.added: list[object] = []
        self.flushed = False

    def add(self, item: object) -> None:
        self.added.append(item)

    def flush(self) -> None:
        self.flushed = True


class RecordingTransport:
    def __init__(self, payload: dict[str, Any] | None = None) -> None:
        self.payload = payload or {"items": [{"id": "card-1", "display_name": "Карточка"}]}
        self.requests: list[dict[str, object]] = []

    def request(
        self,
        *,
        method: str,
        url: str,
        headers: dict[str, str],
        body: bytes | None,
        timeout_seconds: float,
    ) -> ApiResponse:
        self.requests.append(
            {
                "method": method,
                "url": url,
                "headers": dict(headers),
                "body": body,
                "timeout_seconds": timeout_seconds,
            }
        )
        return ApiResponse(
            status_code=200,
            headers={"content-type": "application/json"},
            body=json.dumps(self.payload).encode("utf-8"),
        )


def test_audit_sources_include_mcp_and_request_metadata_can_set_it() -> None:
    assert "mcp" in AUDIT_SOURCES

    request = Request(
        {
            "type": "http",
            "headers": [(b"x-reg-engine-source", b"mcp")],
            "client": ("127.0.0.1", 12345),
        }
    )

    assert get_request_metadata(request).source == "mcp"


def test_audit_service_uses_mcp_source_from_request_metadata_for_user_events() -> None:
    session = FakeAuditSession({"source": "mcp", "request_id": "mcp-req"})

    event = AuditService(session).record_user_event(
        actor_user_id=uuid4(),
        action="read_probe",
        object_type="mcp",
    )

    assert event.source == "mcp"
    assert event.request_id == "mcp-req"
    assert session.flushed is True


def test_mcp_api_client_uses_get_bearer_token_and_mcp_source_header() -> None:
    from app.mcp.api_client import RegEngineApiClient

    transport = RecordingTransport({"items": []})
    client = RegEngineApiClient(
        base_url="https://registry.example.test/",
        token="test-token",
        transport=transport,
        timeout_seconds=7.5,
    )

    assert client.get_json("/api/v1/registries", {"include_archive": False}) == {"items": []}

    assert transport.requests == [
        {
            "method": "GET",
            "url": "https://registry.example.test/api/v1/registries?include_archive=false",
            "headers": {
                "Accept": "application/json",
                "Authorization": "Bearer test-token",
                "User-Agent": "reg-engine-mcp/0.1",
                "X-Reg-Engine-Source": "mcp",
            },
            "body": None,
            "timeout_seconds": 7.5,
        }
    ]


def test_mcp_api_client_supports_json_mutation_methods_without_exposing_tools() -> None:
    from app.mcp.api_client import RegEngineApiClient

    transport = RecordingTransport({"ok": True})
    client = RegEngineApiClient(
        base_url="https://registry.example.test/",
        token="test-token",
        transport=transport,
        timeout_seconds=7.5,
    )

    assert client.post_json("/api/v1/registries", {"name": "Реестр"}) == {"ok": True}
    assert client.patch_json("/api/v1/registries/registry-1", {"name": "Реестр 2"}) == {"ok": True}
    assert client.delete_json("/api/v1/registries/registry-1") == {"ok": True}

    assert [request["method"] for request in transport.requests] == ["POST", "PATCH", "DELETE"]
    assert transport.requests[0]["url"] == "https://registry.example.test/api/v1/registries"
    assert (
        transport.requests[1]["url"] == "https://registry.example.test/api/v1/registries/registry-1"
    )
    assert (
        transport.requests[2]["url"] == "https://registry.example.test/api/v1/registries/registry-1"
    )
    for request in transport.requests:
        assert request["headers"]["Accept"] == "application/json"
        assert request["headers"]["Authorization"] == "Bearer test-token"
        assert request["headers"]["User-Agent"] == "reg-engine-mcp/0.1"
        assert request["headers"]["X-Reg-Engine-Source"] == "mcp"
    assert transport.requests[0]["headers"]["Content-Type"] == "application/json"
    assert transport.requests[1]["headers"]["Content-Type"] == "application/json"
    assert "Content-Type" not in transport.requests[2]["headers"]
    post_body = transport.requests[0]["body"]
    patch_body = transport.requests[1]["body"]
    assert isinstance(post_body, bytes)
    assert isinstance(patch_body, bytes)
    assert json.loads(post_body.decode("utf-8")) == {"name": "Реестр"}
    assert json.loads(patch_body.decode("utf-8")) == {"name": "Реестр 2"}
    assert transport.requests[2]["body"] is None


@pytest.mark.parametrize("base_url", ["", "file:///tmp/reg_engine", "api.local"])
def test_mcp_api_client_rejects_non_http_base_urls(base_url: str) -> None:
    from app.mcp.api_client import RegEngineApiClient

    with pytest.raises(ValueError, match="http"):
        RegEngineApiClient(base_url=base_url, token=None, transport=RecordingTransport())


@pytest.mark.parametrize("base_url", ["http://api.local", "https://api.local/"])
def test_mcp_api_client_accepts_http_and_https_base_urls(base_url: str) -> None:
    from app.mcp.api_client import RegEngineApiClient

    RegEngineApiClient(base_url=base_url, token=None, transport=RecordingTransport())


def test_mcp_tool_definitions_keep_read_tools_read_only_and_call_existing_api_paths() -> None:
    from app.mcp.api_client import RegEngineApiClient
    from app.mcp.tools import MCP_TOOL_DEFINITIONS, call_tool

    tools_by_name = {tool["name"]: tool for tool in MCP_TOOL_DEFINITIONS}
    assert {
        "reg_engine_health",
        "reg_engine_list_registries",
        "reg_engine_read_registry_schema",
        "reg_engine_list_cards",
        "reg_engine_read_card",
        "reg_engine_list_audit_events",
    } <= tools_by_name.keys()
    write_tool_names = {
        "reg_engine_create_registry",
        "reg_engine_update_registry",
        "reg_engine_archive_registry",
        "reg_engine_create_form_block",
        "reg_engine_update_form_block",
        "reg_engine_archive_form_block",
        "reg_engine_create_form_field",
        "reg_engine_update_form_field",
        "reg_engine_archive_form_field",
        "reg_engine_create_card",
        "reg_engine_update_card",
        "reg_engine_archive_card",
        "reg_engine_set_card_field_value",
        "reg_engine_set_card_values",
        "reg_engine_create_card_block_instance",
        "reg_engine_archive_card_block_instance",
        "reg_engine_transfer_card",
        "reg_engine_create_report_template",
        "reg_engine_update_report_template",
        "reg_engine_archive_report_template",
        "reg_engine_generate_report_run",
        "reg_engine_archive_report_run",
        "reg_engine_create_document_template",
        "reg_engine_archive_document_template",
        "reg_engine_generate_document",
        "reg_engine_generate_pdf_document",
        "reg_engine_archive_generated_document",
    }
    read_only_tools = [
        tool for tool in MCP_TOOL_DEFINITIONS if tool["name"] not in write_tool_names
    ]
    assert all(tool["annotations"]["readOnlyHint"] is True for tool in read_only_tools)

    registry_id = str(uuid4())
    transport = RecordingTransport()
    client = RegEngineApiClient(
        base_url="http://api.local",
        token="token",
        transport=transport,
    )

    result = call_tool(
        "reg_engine_list_cards",
        {"registry_id": registry_id, "include_archive": True, "q": "Карточка"},
        client=client,
    )

    assert result["isError"] is False
    assert result["structuredContent"] == {"items": [{"id": "card-1", "display_name": "Карточка"}]}
    assert "Карточка" in result["content"][0]["text"]
    assert transport.requests[0]["method"] == "GET"
    assert (
        transport.requests[0]["url"] == f"http://api.local/api/v1/registries/{registry_id}/cards"
        "?include_archive=true&q=%D0%9A%D0%B0%D1%80%D1%82%D0%BE%D1%87%D0%BA%D0%B0"
    )


def test_mcp_create_registry_tool_posts_to_existing_api_boundary() -> None:
    from app.mcp.api_client import RegEngineApiClient
    from app.mcp.tools import MCP_TOOL_DEFINITIONS, call_tool

    tool = next(
        tool for tool in MCP_TOOL_DEFINITIONS if tool["name"] == "reg_engine_create_registry"
    )
    assert tool["annotations"]["readOnlyHint"] is False
    assert tool["inputSchema"]["required"] == ["code", "name"]
    assert tool["inputSchema"]["additionalProperties"] is False

    registry_id = str(uuid4())
    transport = RecordingTransport(
        {
            "id": registry_id,
            "code": "incidents",
            "name": "Инциденты",
            "description": "Операционный реестр",
            "lifecycle_status": "draft",
            "schema_version": 1,
        }
    )
    client = RegEngineApiClient(
        base_url="http://api.local",
        token="token",
        transport=transport,
    )

    result = call_tool(
        "reg_engine_create_registry",
        {
            "code": "incidents",
            "name": "Инциденты",
            "description": "Операционный реестр",
        },
        client=client,
    )

    assert result["isError"] is False
    assert result["structuredContent"]["id"] == registry_id
    assert transport.requests[0]["method"] == "POST"
    assert transport.requests[0]["url"] == "http://api.local/api/v1/registries"
    assert transport.requests[0]["headers"]["X-Reg-Engine-Source"] == "mcp"
    body = transport.requests[0]["body"]
    assert isinstance(body, bytes)
    assert json.loads(body.decode("utf-8")) == {
        "code": "incidents",
        "name": "Инциденты",
        "description": "Операционный реестр",
    }


def test_mcp_update_registry_tool_patches_existing_api_boundary() -> None:
    from app.mcp.api_client import RegEngineApiClient
    from app.mcp.tools import MCP_TOOL_DEFINITIONS, call_tool

    tool = next(
        tool for tool in MCP_TOOL_DEFINITIONS if tool["name"] == "reg_engine_update_registry"
    )
    assert tool["annotations"]["readOnlyHint"] is False
    assert tool["inputSchema"]["required"] == ["registry_id"]
    assert tool["inputSchema"]["additionalProperties"] is False

    registry_id = str(uuid4())
    transport = RecordingTransport(
        {
            "id": registry_id,
            "code": "incidents",
            "name": "Incidents updated",
            "description": "Updated text",
            "lifecycle_status": "active",
            "schema_version": 1,
        }
    )
    client = RegEngineApiClient(
        base_url="http://api.local",
        token="token",
        transport=transport,
    )

    result = call_tool(
        "reg_engine_update_registry",
        {
            "registry_id": registry_id,
            "name": "Incidents updated",
            "description": "Updated text",
            "lifecycle_status": "active",
        },
        client=client,
    )

    assert result["isError"] is False
    assert result["structuredContent"]["id"] == registry_id
    assert transport.requests[0]["method"] == "PATCH"
    assert transport.requests[0]["url"] == f"http://api.local/api/v1/registries/{registry_id}"
    assert transport.requests[0]["headers"]["X-Reg-Engine-Source"] == "mcp"
    body = transport.requests[0]["body"]
    assert isinstance(body, bytes)
    assert json.loads(body.decode("utf-8")) == {
        "name": "Incidents updated",
        "description": "Updated text",
        "lifecycle_status": "active",
    }


def test_mcp_archive_registry_tool_requires_confirmation_before_delete() -> None:
    from app.mcp.api_client import RegEngineApiClient
    from app.mcp.tools import MCP_TOOL_DEFINITIONS, call_tool

    tool = next(
        tool for tool in MCP_TOOL_DEFINITIONS if tool["name"] == "reg_engine_archive_registry"
    )
    assert tool["annotations"]["readOnlyHint"] is False
    assert tool["inputSchema"]["required"] == ["registry_id", "confirm_archive"]
    assert tool["inputSchema"]["additionalProperties"] is False

    registry_id = str(uuid4())
    transport = RecordingTransport(
        {
            "id": registry_id,
            "code": "incidents",
            "name": "Incidents",
            "description": None,
            "lifecycle_status": "archived",
            "schema_version": 1,
        }
    )
    client = RegEngineApiClient(
        base_url="http://api.local",
        token="token",
        transport=transport,
    )

    rejected = call_tool(
        "reg_engine_archive_registry",
        {"registry_id": registry_id, "confirm_archive": False},
        client=client,
    )

    assert rejected["isError"] is True
    assert "confirm_archive" in rejected["content"][0]["text"]
    assert transport.requests == []

    archived = call_tool(
        "reg_engine_archive_registry",
        {"registry_id": registry_id, "confirm_archive": True},
        client=client,
    )

    assert archived["isError"] is False
    assert archived["structuredContent"]["lifecycle_status"] == "archived"
    assert transport.requests[0]["method"] == "DELETE"
    assert transport.requests[0]["url"] == f"http://api.local/api/v1/registries/{registry_id}"
    assert transport.requests[0]["headers"]["X-Reg-Engine-Source"] == "mcp"
    assert transport.requests[0]["body"] is None


def test_mcp_create_form_block_tool_posts_to_existing_api_boundary() -> None:
    from app.mcp.api_client import RegEngineApiClient
    from app.mcp.tools import MCP_TOOL_DEFINITIONS, call_tool

    tool = next(
        tool for tool in MCP_TOOL_DEFINITIONS if tool["name"] == "reg_engine_create_form_block"
    )
    assert tool["annotations"]["readOnlyHint"] is False
    assert tool["inputSchema"]["required"] == ["registry_id", "code", "title"]
    assert tool["inputSchema"]["additionalProperties"] is False

    registry_id = str(uuid4())
    block_id = str(uuid4())
    transport = RecordingTransport(
        {
            "id": block_id,
            "registry_id": registry_id,
            "code": "main",
            "title": "Main block",
            "description": "Block description",
            "position": 10,
            "is_repeatable": True,
            "is_active": True,
            "public_visible": True,
            "public_editable": False,
        }
    )
    client = RegEngineApiClient(
        base_url="http://api.local",
        token="token",
        transport=transport,
    )

    result = call_tool(
        "reg_engine_create_form_block",
        {
            "registry_id": registry_id,
            "code": "main",
            "title": "Main block",
            "description": "Block description",
            "position": 10,
            "is_repeatable": True,
            "public_visible": True,
            "public_editable": False,
        },
        client=client,
    )

    assert result["isError"] is False
    assert result["structuredContent"]["id"] == block_id
    assert transport.requests[0]["method"] == "POST"
    assert (
        transport.requests[0]["url"] == f"http://api.local/api/v1/registries/{registry_id}/blocks"
    )
    body = transport.requests[0]["body"]
    assert isinstance(body, bytes)
    assert json.loads(body.decode("utf-8")) == {
        "code": "main",
        "title": "Main block",
        "description": "Block description",
        "position": 10,
        "is_repeatable": True,
        "public_visible": True,
        "public_editable": False,
    }


def test_mcp_update_and_archive_form_block_tools_use_existing_api_boundary() -> None:
    from app.mcp.api_client import RegEngineApiClient
    from app.mcp.tools import MCP_TOOL_DEFINITIONS, call_tool

    update_tool = next(
        tool for tool in MCP_TOOL_DEFINITIONS if tool["name"] == "reg_engine_update_form_block"
    )
    archive_tool = next(
        tool for tool in MCP_TOOL_DEFINITIONS if tool["name"] == "reg_engine_archive_form_block"
    )
    assert update_tool["annotations"]["readOnlyHint"] is False
    assert update_tool["inputSchema"]["required"] == ["block_id"]
    assert update_tool["inputSchema"]["additionalProperties"] is False
    assert archive_tool["annotations"]["readOnlyHint"] is False
    assert archive_tool["inputSchema"]["required"] == ["block_id", "confirm_archive"]
    assert archive_tool["inputSchema"]["additionalProperties"] is False

    block_id = str(uuid4())
    transport = RecordingTransport(
        {
            "id": block_id,
            "registry_id": str(uuid4()),
            "code": "main",
            "title": "Updated block",
            "description": "Updated description",
            "position": 20,
            "is_repeatable": False,
            "is_active": False,
            "public_visible": True,
            "public_editable": False,
        }
    )
    client = RegEngineApiClient(
        base_url="http://api.local",
        token="token",
        transport=transport,
    )

    empty_update = call_tool("reg_engine_update_form_block", {"block_id": block_id}, client=client)
    assert empty_update["isError"] is True
    assert transport.requests == []

    updated = call_tool(
        "reg_engine_update_form_block",
        {
            "block_id": block_id,
            "title": "Updated block",
            "description": "Updated description",
            "position": 20,
        },
        client=client,
    )
    assert updated["isError"] is False
    assert transport.requests[0]["method"] == "PATCH"
    assert transport.requests[0]["url"] == f"http://api.local/api/v1/blocks/{block_id}"
    update_body = transport.requests[0]["body"]
    assert isinstance(update_body, bytes)
    assert json.loads(update_body.decode("utf-8")) == {
        "title": "Updated block",
        "description": "Updated description",
        "position": 20,
    }

    rejected = call_tool(
        "reg_engine_archive_form_block",
        {"block_id": block_id, "confirm_archive": False},
        client=client,
    )
    assert rejected["isError"] is True
    assert len(transport.requests) == 1

    archived = call_tool(
        "reg_engine_archive_form_block",
        {"block_id": block_id, "confirm_archive": True},
        client=client,
    )
    assert archived["isError"] is False
    assert transport.requests[1]["method"] == "DELETE"
    assert transport.requests[1]["url"] == f"http://api.local/api/v1/blocks/{block_id}"
    assert transport.requests[1]["body"] is None


def test_mcp_create_form_field_tool_posts_to_existing_api_boundary() -> None:
    from app.mcp.api_client import RegEngineApiClient
    from app.mcp.tools import MCP_TOOL_DEFINITIONS, call_tool

    tool = next(
        tool for tool in MCP_TOOL_DEFINITIONS if tool["name"] == "reg_engine_create_form_field"
    )
    assert tool["annotations"]["readOnlyHint"] is False
    assert tool["inputSchema"]["required"] == ["block_id", "code", "label", "field_type"]
    assert tool["inputSchema"]["additionalProperties"] is False

    block_id = str(uuid4())
    field_id = str(uuid4())
    reference_list_id = str(uuid4())
    transport = RecordingTransport(
        {
            "id": field_id,
            "block_id": block_id,
            "code": "status",
            "label": "Status",
            "description": "Status description",
            "field_type": "select",
            "position": 5,
            "options_source_type": "reference_list",
            "options_source_id": reference_list_id,
            "is_active": True,
            "public_visible": True,
            "public_editable": True,
        }
    )
    client = RegEngineApiClient(
        base_url="http://api.local",
        token="token",
        transport=transport,
    )

    result = call_tool(
        "reg_engine_create_form_field",
        {
            "block_id": block_id,
            "code": "status",
            "label": "Status",
            "field_type": "select",
            "description": "Status description",
            "position": 5,
            "options_source_type": "reference_list",
            "options_source_id": reference_list_id,
            "public_visible": True,
            "public_editable": True,
        },
        client=client,
    )

    assert result["isError"] is False
    assert result["structuredContent"]["id"] == field_id
    assert transport.requests[0]["method"] == "POST"
    assert transport.requests[0]["url"] == f"http://api.local/api/v1/blocks/{block_id}/fields"
    body = transport.requests[0]["body"]
    assert isinstance(body, bytes)
    assert json.loads(body.decode("utf-8")) == {
        "code": "status",
        "label": "Status",
        "field_type": "select",
        "description": "Status description",
        "position": 5,
        "options_source_type": "reference_list",
        "options_source_id": reference_list_id,
        "public_visible": True,
        "public_editable": True,
    }


def test_mcp_update_and_archive_form_field_tools_use_existing_api_boundary() -> None:
    from app.mcp.api_client import RegEngineApiClient
    from app.mcp.tools import MCP_TOOL_DEFINITIONS, call_tool

    update_tool = next(
        tool for tool in MCP_TOOL_DEFINITIONS if tool["name"] == "reg_engine_update_form_field"
    )
    archive_tool = next(
        tool for tool in MCP_TOOL_DEFINITIONS if tool["name"] == "reg_engine_archive_form_field"
    )
    assert update_tool["annotations"]["readOnlyHint"] is False
    assert update_tool["inputSchema"]["required"] == ["field_id"]
    assert update_tool["inputSchema"]["additionalProperties"] is False
    assert archive_tool["annotations"]["readOnlyHint"] is False
    assert archive_tool["inputSchema"]["required"] == ["field_id", "confirm_archive"]
    assert archive_tool["inputSchema"]["additionalProperties"] is False

    field_id = str(uuid4())
    transport = RecordingTransport(
        {
            "id": field_id,
            "block_id": str(uuid4()),
            "code": "status",
            "label": "Updated status",
            "description": "Updated description",
            "field_type": "text",
            "position": 15,
            "options_source_type": None,
            "options_source_id": None,
            "is_active": False,
            "public_visible": True,
            "public_editable": False,
        }
    )
    client = RegEngineApiClient(
        base_url="http://api.local",
        token="token",
        transport=transport,
    )

    empty_update = call_tool("reg_engine_update_form_field", {"field_id": field_id}, client=client)
    assert empty_update["isError"] is True
    assert transport.requests == []

    updated = call_tool(
        "reg_engine_update_form_field",
        {
            "field_id": field_id,
            "label": "Updated status",
            "description": "Updated description",
            "position": 15,
            "is_active": False,
        },
        client=client,
    )
    assert updated["isError"] is False
    assert transport.requests[0]["method"] == "PATCH"
    assert transport.requests[0]["url"] == f"http://api.local/api/v1/fields/{field_id}"
    update_body = transport.requests[0]["body"]
    assert isinstance(update_body, bytes)
    assert json.loads(update_body.decode("utf-8")) == {
        "label": "Updated status",
        "description": "Updated description",
        "position": 15,
        "is_active": False,
    }

    rejected = call_tool(
        "reg_engine_archive_form_field",
        {"field_id": field_id, "confirm_archive": False},
        client=client,
    )
    assert rejected["isError"] is True
    assert len(transport.requests) == 1

    archived = call_tool(
        "reg_engine_archive_form_field",
        {"field_id": field_id, "confirm_archive": True},
        client=client,
    )
    assert archived["isError"] is False
    assert transport.requests[1]["method"] == "DELETE"
    assert transport.requests[1]["url"] == f"http://api.local/api/v1/fields/{field_id}"
    assert transport.requests[1]["body"] is None


def test_mcp_create_card_tool_posts_to_existing_api_boundary() -> None:
    from app.mcp.api_client import RegEngineApiClient
    from app.mcp.tools import MCP_TOOL_DEFINITIONS, call_tool

    tool = next(tool for tool in MCP_TOOL_DEFINITIONS if tool["name"] == "reg_engine_create_card")
    assert tool["annotations"]["readOnlyHint"] is False
    assert tool["inputSchema"]["required"] == ["registry_id", "organization_id", "display_name"]
    assert tool["inputSchema"]["additionalProperties"] is False

    registry_id = str(uuid4())
    organization_id = str(uuid4())
    org_unit_id = str(uuid4())
    card_id = str(uuid4())
    transport = RecordingTransport(
        {
            "id": card_id,
            "registry_id": registry_id,
            "organization_id": organization_id,
            "org_unit_id": org_unit_id,
            "display_name": "Card 1",
            "lifecycle_status": "active",
            "public_view_enabled": True,
            "public_edit_enabled": False,
        }
    )
    client = RegEngineApiClient(
        base_url="http://api.local",
        token="token",
        transport=transport,
    )

    result = call_tool(
        "reg_engine_create_card",
        {
            "registry_id": registry_id,
            "organization_id": organization_id,
            "display_name": "Card 1",
            "org_unit_id": org_unit_id,
            "public_view_enabled": True,
            "public_edit_enabled": False,
        },
        client=client,
    )

    assert result["isError"] is False
    assert result["structuredContent"]["id"] == card_id
    assert transport.requests[0]["method"] == "POST"
    assert transport.requests[0]["url"] == f"http://api.local/api/v1/registries/{registry_id}/cards"
    assert transport.requests[0]["headers"]["X-Reg-Engine-Source"] == "mcp"
    body = transport.requests[0]["body"]
    assert isinstance(body, bytes)
    assert json.loads(body.decode("utf-8")) == {
        "organization_id": organization_id,
        "display_name": "Card 1",
        "org_unit_id": org_unit_id,
        "public_view_enabled": True,
        "public_edit_enabled": False,
    }


def test_mcp_update_card_tool_patches_existing_api_boundary() -> None:
    from app.mcp.api_client import RegEngineApiClient
    from app.mcp.tools import MCP_TOOL_DEFINITIONS, call_tool

    tool = next(tool for tool in MCP_TOOL_DEFINITIONS if tool["name"] == "reg_engine_update_card")
    assert tool["annotations"]["readOnlyHint"] is False
    assert tool["inputSchema"]["required"] == ["card_id"]
    assert tool["inputSchema"]["additionalProperties"] is False

    card_id = str(uuid4())
    transport = RecordingTransport(
        {
            "id": card_id,
            "registry_id": str(uuid4()),
            "organization_id": str(uuid4()),
            "org_unit_id": None,
            "display_name": "Updated card",
            "lifecycle_status": "active",
            "public_view_enabled": False,
            "public_edit_enabled": True,
        }
    )
    client = RegEngineApiClient(
        base_url="http://api.local",
        token="token",
        transport=transport,
    )

    empty_update = call_tool("reg_engine_update_card", {"card_id": card_id}, client=client)
    assert empty_update["isError"] is True
    assert transport.requests == []

    updated = call_tool(
        "reg_engine_update_card",
        {
            "card_id": card_id,
            "display_name": "Updated card",
            "public_view_enabled": False,
            "public_edit_enabled": True,
        },
        client=client,
    )

    assert updated["isError"] is False
    assert updated["structuredContent"]["id"] == card_id
    assert transport.requests[0]["method"] == "PATCH"
    assert transport.requests[0]["url"] == f"http://api.local/api/v1/cards/{card_id}"
    assert transport.requests[0]["headers"]["X-Reg-Engine-Source"] == "mcp"
    body = transport.requests[0]["body"]
    assert isinstance(body, bytes)
    assert json.loads(body.decode("utf-8")) == {
        "display_name": "Updated card",
        "public_view_enabled": False,
        "public_edit_enabled": True,
    }


def test_mcp_archive_card_tool_requires_confirmation_before_delete() -> None:
    from app.mcp.api_client import RegEngineApiClient
    from app.mcp.tools import MCP_TOOL_DEFINITIONS, call_tool

    tool = next(tool for tool in MCP_TOOL_DEFINITIONS if tool["name"] == "reg_engine_archive_card")
    assert tool["annotations"]["readOnlyHint"] is False
    assert tool["inputSchema"]["required"] == ["card_id", "confirm_archive"]
    assert tool["inputSchema"]["additionalProperties"] is False

    card_id = str(uuid4())
    transport = RecordingTransport(
        {
            "id": card_id,
            "registry_id": str(uuid4()),
            "organization_id": str(uuid4()),
            "org_unit_id": None,
            "display_name": "Archived card",
            "lifecycle_status": "archived",
            "public_view_enabled": False,
            "public_edit_enabled": False,
        }
    )
    client = RegEngineApiClient(
        base_url="http://api.local",
        token="token",
        transport=transport,
    )

    rejected = call_tool(
        "reg_engine_archive_card",
        {"card_id": card_id, "confirm_archive": False},
        client=client,
    )
    assert rejected["isError"] is True
    assert "confirm_archive" in rejected["content"][0]["text"]
    assert transport.requests == []

    archived = call_tool(
        "reg_engine_archive_card",
        {"card_id": card_id, "confirm_archive": True},
        client=client,
    )

    assert archived["isError"] is False
    assert archived["structuredContent"]["lifecycle_status"] == "archived"
    assert transport.requests[0]["method"] == "DELETE"
    assert transport.requests[0]["url"] == f"http://api.local/api/v1/cards/{card_id}"
    assert transport.requests[0]["headers"]["X-Reg-Engine-Source"] == "mcp"
    assert transport.requests[0]["body"] is None


def test_mcp_set_card_field_value_tool_patches_existing_api_boundary() -> None:
    from app.mcp.api_client import RegEngineApiClient
    from app.mcp.tools import MCP_TOOL_DEFINITIONS, call_tool

    tool = next(
        tool for tool in MCP_TOOL_DEFINITIONS if tool["name"] == "reg_engine_set_card_field_value"
    )
    assert tool["annotations"]["readOnlyHint"] is False
    assert tool["inputSchema"]["required"] == ["card_id", "field_id", "value"]
    assert tool["inputSchema"]["additionalProperties"] is False

    card_id = str(uuid4())
    field_id = str(uuid4())
    block_instance_id = str(uuid4())
    field_value_id = str(uuid4())
    transport = RecordingTransport(
        {
            "id": field_value_id,
            "card_id": card_id,
            "block_instance_id": block_instance_id,
            "field_id": field_id,
            "value": {"text": "Значение"},
        }
    )
    client = RegEngineApiClient(
        base_url="http://api.local",
        token="token",
        transport=transport,
    )

    result = call_tool(
        "reg_engine_set_card_field_value",
        {
            "card_id": card_id,
            "field_id": field_id,
            "value": {"text": "Значение"},
            "block_instance_id": block_instance_id,
        },
        client=client,
    )

    assert result["isError"] is False
    assert result["structuredContent"]["id"] == field_value_id
    assert transport.requests[0]["method"] == "PATCH"
    assert (
        transport.requests[0]["url"] == f"http://api.local/api/v1/cards/{card_id}/fields/{field_id}"
    )
    assert transport.requests[0]["headers"]["X-Reg-Engine-Source"] == "mcp"
    body = transport.requests[0]["body"]
    assert isinstance(body, bytes)
    assert json.loads(body.decode("utf-8")) == {
        "value": {"text": "Значение"},
        "block_instance_id": block_instance_id,
    }


def test_mcp_set_card_values_tool_patches_existing_bulk_api_boundary() -> None:
    from app.mcp.api_client import RegEngineApiClient
    from app.mcp.tools import MCP_TOOL_DEFINITIONS, call_tool

    tool = next(
        tool for tool in MCP_TOOL_DEFINITIONS if tool["name"] == "reg_engine_set_card_values"
    )
    assert tool["annotations"]["readOnlyHint"] is False
    assert tool["inputSchema"]["required"] == ["card_id", "values"]
    assert tool["inputSchema"]["additionalProperties"] is False

    card_id = str(uuid4())
    first_field_id = str(uuid4())
    second_field_id = str(uuid4())
    block_instance_id = str(uuid4())
    first_value_id = str(uuid4())
    second_value_id = str(uuid4())
    transport = RecordingTransport(
        {
            "items": [
                {
                    "id": first_value_id,
                    "card_id": card_id,
                    "block_instance_id": block_instance_id,
                    "field_id": first_field_id,
                    "value": "Первое значение",
                },
                {
                    "id": second_value_id,
                    "card_id": card_id,
                    "block_instance_id": block_instance_id,
                    "field_id": second_field_id,
                    "value": None,
                },
            ]
        }
    )
    client = RegEngineApiClient(
        base_url="http://api.local",
        token="token",
        transport=transport,
    )

    empty_bulk = call_tool(
        "reg_engine_set_card_values", {"card_id": card_id, "values": []}, client=client
    )
    assert empty_bulk["isError"] is True
    assert transport.requests == []

    result = call_tool(
        "reg_engine_set_card_values",
        {
            "card_id": card_id,
            "values": [
                {
                    "field_id": first_field_id,
                    "value": "Первое значение",
                    "block_instance_id": block_instance_id,
                },
                {"field_id": second_field_id, "value": None},
            ],
        },
        client=client,
    )

    assert result["isError"] is False
    assert result["structuredContent"]["items"][0]["id"] == first_value_id
    assert transport.requests[0]["method"] == "PATCH"
    assert transport.requests[0]["url"] == f"http://api.local/api/v1/cards/{card_id}/values"
    assert transport.requests[0]["headers"]["X-Reg-Engine-Source"] == "mcp"
    body = transport.requests[0]["body"]
    assert isinstance(body, bytes)
    assert json.loads(body.decode("utf-8")) == {
        "values": [
            {
                "field_id": first_field_id,
                "value": "Первое значение",
                "block_instance_id": block_instance_id,
            },
            {"field_id": second_field_id, "value": None},
        ]
    }


def test_mcp_create_card_block_instance_tool_posts_to_existing_api_boundary() -> None:
    from app.mcp.api_client import RegEngineApiClient
    from app.mcp.tools import MCP_TOOL_DEFINITIONS, call_tool

    tool = next(
        tool
        for tool in MCP_TOOL_DEFINITIONS
        if tool["name"] == "reg_engine_create_card_block_instance"
    )
    assert tool["annotations"]["readOnlyHint"] is False
    assert tool["inputSchema"]["required"] == ["card_id", "block_id"]
    assert tool["inputSchema"]["additionalProperties"] is False

    card_id = str(uuid4())
    block_id = str(uuid4())
    block_instance_id = str(uuid4())
    transport = RecordingTransport(
        {
            "id": block_instance_id,
            "card_id": card_id,
            "block_id": block_id,
            "ordinal": 2,
        }
    )
    client = RegEngineApiClient(
        base_url="http://api.local",
        token="token",
        transport=transport,
    )

    result = call_tool(
        "reg_engine_create_card_block_instance",
        {"card_id": card_id, "block_id": block_id},
        client=client,
    )

    assert result["isError"] is False
    assert result["structuredContent"]["id"] == block_instance_id
    assert transport.requests[0]["method"] == "POST"
    assert (
        transport.requests[0]["url"]
        == f"http://api.local/api/v1/cards/{card_id}/blocks/{block_id}/instances"
    )
    assert transport.requests[0]["headers"]["X-Reg-Engine-Source"] == "mcp"
    body = transport.requests[0]["body"]
    assert isinstance(body, bytes)
    assert json.loads(body.decode("utf-8")) == {}


def test_mcp_archive_card_block_instance_tool_requires_confirmation_before_delete() -> None:
    from app.mcp.api_client import RegEngineApiClient
    from app.mcp.tools import MCP_TOOL_DEFINITIONS, call_tool

    tool = next(
        tool
        for tool in MCP_TOOL_DEFINITIONS
        if tool["name"] == "reg_engine_archive_card_block_instance"
    )
    assert tool["annotations"]["readOnlyHint"] is False
    assert tool["inputSchema"]["required"] == ["block_instance_id", "confirm_archive"]
    assert tool["inputSchema"]["additionalProperties"] is False

    block_instance_id = str(uuid4())
    card_id = str(uuid4())
    block_id = str(uuid4())
    transport = RecordingTransport(
        {
            "id": block_instance_id,
            "card_id": card_id,
            "block_id": block_id,
            "ordinal": 2,
        }
    )
    client = RegEngineApiClient(
        base_url="http://api.local",
        token="token",
        transport=transport,
    )

    rejected = call_tool(
        "reg_engine_archive_card_block_instance",
        {"block_instance_id": block_instance_id, "confirm_archive": False},
        client=client,
    )
    assert rejected["isError"] is True
    assert "confirm_archive" in rejected["content"][0]["text"]
    assert transport.requests == []

    archived = call_tool(
        "reg_engine_archive_card_block_instance",
        {"block_instance_id": block_instance_id, "confirm_archive": True},
        client=client,
    )

    assert archived["isError"] is False
    assert archived["structuredContent"]["id"] == block_instance_id
    assert transport.requests[0]["method"] == "DELETE"
    assert (
        transport.requests[0]["url"]
        == f"http://api.local/api/v1/card-block-instances/{block_instance_id}"
    )
    assert transport.requests[0]["headers"]["X-Reg-Engine-Source"] == "mcp"
    assert transport.requests[0]["body"] is None


def test_mcp_transfer_card_tool_requires_confirmation_before_post() -> None:
    from app.mcp.api_client import RegEngineApiClient
    from app.mcp.tools import MCP_TOOL_DEFINITIONS, call_tool

    tool = next(tool for tool in MCP_TOOL_DEFINITIONS if tool["name"] == "reg_engine_transfer_card")
    assert tool["annotations"]["readOnlyHint"] is False
    assert tool["inputSchema"]["required"] == [
        "card_id",
        "target_organization_id",
        "confirm_transfer",
    ]
    assert tool["inputSchema"]["additionalProperties"] is False

    card_id = str(uuid4())
    new_card_id = str(uuid4())
    registry_id = str(uuid4())
    target_organization_id = str(uuid4())
    transport = RecordingTransport(
        {
            "id": new_card_id,
            "registry_id": registry_id,
            "organization_id": target_organization_id,
            "org_unit_id": None,
            "display_name": "Transferred card",
            "lifecycle_status": "active",
            "public_view_enabled": False,
            "public_edit_enabled": False,
        }
    )
    client = RegEngineApiClient(
        base_url="http://api.local",
        token="token",
        transport=transport,
    )

    rejected = call_tool(
        "reg_engine_transfer_card",
        {
            "card_id": card_id,
            "target_organization_id": target_organization_id,
            "confirm_transfer": False,
        },
        client=client,
    )
    assert rejected["isError"] is True
    assert "confirm_transfer" in rejected["content"][0]["text"]
    assert transport.requests == []

    transferred = call_tool(
        "reg_engine_transfer_card",
        {
            "card_id": card_id,
            "target_organization_id": target_organization_id,
            "confirm_transfer": True,
        },
        client=client,
    )

    assert transferred["isError"] is False
    assert transferred["structuredContent"]["id"] == new_card_id
    assert transferred["structuredContent"]["organization_id"] == target_organization_id
    assert transport.requests[0]["method"] == "POST"
    assert transport.requests[0]["url"] == f"http://api.local/api/v1/cards/{card_id}/transfer"
    assert transport.requests[0]["headers"]["X-Reg-Engine-Source"] == "mcp"
    body = transport.requests[0]["body"]
    assert isinstance(body, bytes)
    assert json.loads(body.decode("utf-8")) == {"target_organization_id": target_organization_id}


def test_mcp_create_report_template_tool_posts_to_existing_api_boundary() -> None:
    from app.mcp.api_client import RegEngineApiClient
    from app.mcp.tools import MCP_TOOL_DEFINITIONS, call_tool

    tool = next(
        tool for tool in MCP_TOOL_DEFINITIONS if tool["name"] == "reg_engine_create_report_template"
    )
    assert tool["annotations"]["readOnlyHint"] is False
    assert tool["inputSchema"]["required"] == [
        "registry_id",
        "code",
        "name",
        "report_type",
    ]
    assert tool["inputSchema"]["additionalProperties"] is False

    registry_id = str(uuid4())
    template_id = str(uuid4())
    parameters_schema = {
        "type": "object",
        "properties": {"date_from": {"type": "string", "format": "date"}},
    }
    default_parameters = {"date_from": "2026-01-01"}
    transport = RecordingTransport(
        {
            "id": template_id,
            "registry_id": registry_id,
            "code": "cards_summary",
            "name": "Cards summary",
            "description": "Summary report",
            "report_type": "cards_json",
            "parameters_schema_json": parameters_schema,
            "default_parameters_json": default_parameters,
            "output_format": "json",
            "is_active": True,
            "created_at": "2026-01-01T00:00:00Z",
            "archived_at": None,
        }
    )
    client = RegEngineApiClient(
        base_url="http://api.local",
        token="token",
        transport=transport,
    )

    result = call_tool(
        "reg_engine_create_report_template",
        {
            "registry_id": registry_id,
            "code": "cards_summary",
            "name": "Cards summary",
            "description": "Summary report",
            "report_type": "cards_json",
            "parameters_schema_json": parameters_schema,
            "default_parameters_json": default_parameters,
            "output_format": "json",
        },
        client=client,
    )

    assert result["isError"] is False
    assert result["structuredContent"]["id"] == template_id
    assert transport.requests[0]["method"] == "POST"
    assert (
        transport.requests[0]["url"]
        == f"http://api.local/api/v1/registries/{registry_id}/report-templates"
    )
    assert transport.requests[0]["headers"]["X-Reg-Engine-Source"] == "mcp"
    body = transport.requests[0]["body"]
    assert isinstance(body, bytes)
    assert json.loads(body.decode("utf-8")) == {
        "code": "cards_summary",
        "name": "Cards summary",
        "description": "Summary report",
        "report_type": "cards_json",
        "parameters_schema_json": parameters_schema,
        "default_parameters_json": default_parameters,
        "output_format": "json",
    }


def test_mcp_update_report_template_tool_patches_existing_api_boundary() -> None:
    from app.mcp.api_client import RegEngineApiClient
    from app.mcp.tools import MCP_TOOL_DEFINITIONS, call_tool

    tool = next(
        tool for tool in MCP_TOOL_DEFINITIONS if tool["name"] == "reg_engine_update_report_template"
    )
    assert tool["annotations"]["readOnlyHint"] is False
    assert tool["inputSchema"]["required"] == ["template_id"]
    assert tool["inputSchema"]["additionalProperties"] is False

    template_id = str(uuid4())
    parameters_schema = {"type": "object", "properties": {"status": {"type": "string"}}}
    transport = RecordingTransport(
        {
            "id": template_id,
            "registry_id": str(uuid4()),
            "code": "cards_summary",
            "name": "Updated report",
            "description": "Updated description",
            "report_type": "cards_json",
            "parameters_schema_json": parameters_schema,
            "default_parameters_json": {"status": "active"},
            "output_format": "csv",
            "is_active": True,
            "created_at": "2026-01-01T00:00:00Z",
            "archived_at": None,
        }
    )
    client = RegEngineApiClient(
        base_url="http://api.local",
        token="token",
        transport=transport,
    )

    empty_update = call_tool(
        "reg_engine_update_report_template", {"template_id": template_id}, client=client
    )
    assert empty_update["isError"] is True
    assert transport.requests == []

    updated = call_tool(
        "reg_engine_update_report_template",
        {
            "template_id": template_id,
            "name": "Updated report",
            "description": "Updated description",
            "report_type": "cards_json",
            "parameters_schema_json": parameters_schema,
            "default_parameters_json": {"status": "active"},
            "output_format": "csv",
        },
        client=client,
    )

    assert updated["isError"] is False
    assert updated["structuredContent"]["id"] == template_id
    assert transport.requests[0]["method"] == "PATCH"
    assert transport.requests[0]["url"] == f"http://api.local/api/v1/report-templates/{template_id}"
    assert transport.requests[0]["headers"]["X-Reg-Engine-Source"] == "mcp"
    body = transport.requests[0]["body"]
    assert isinstance(body, bytes)
    assert json.loads(body.decode("utf-8")) == {
        "name": "Updated report",
        "description": "Updated description",
        "report_type": "cards_json",
        "parameters_schema_json": parameters_schema,
        "default_parameters_json": {"status": "active"},
        "output_format": "csv",
    }


def test_mcp_archive_report_template_tool_requires_confirmation_before_delete() -> None:
    from app.mcp.api_client import RegEngineApiClient
    from app.mcp.tools import MCP_TOOL_DEFINITIONS, call_tool

    tool = next(
        tool
        for tool in MCP_TOOL_DEFINITIONS
        if tool["name"] == "reg_engine_archive_report_template"
    )
    assert tool["annotations"]["readOnlyHint"] is False
    assert tool["inputSchema"]["required"] == ["template_id", "confirm_archive"]
    assert tool["inputSchema"]["additionalProperties"] is False

    template_id = str(uuid4())
    transport = RecordingTransport(
        {
            "id": template_id,
            "registry_id": str(uuid4()),
            "code": "cards_summary",
            "name": "Archived report",
            "description": None,
            "report_type": "cards_json",
            "parameters_schema_json": None,
            "default_parameters_json": None,
            "output_format": "json",
            "is_active": False,
            "created_at": "2026-01-01T00:00:00Z",
            "archived_at": "2026-01-02T00:00:00Z",
        }
    )
    client = RegEngineApiClient(
        base_url="http://api.local",
        token="token",
        transport=transport,
    )

    rejected = call_tool(
        "reg_engine_archive_report_template",
        {"template_id": template_id, "confirm_archive": False},
        client=client,
    )
    assert rejected["isError"] is True
    assert "confirm_archive" in rejected["content"][0]["text"]
    assert transport.requests == []

    archived = call_tool(
        "reg_engine_archive_report_template",
        {"template_id": template_id, "confirm_archive": True},
        client=client,
    )

    assert archived["isError"] is False
    assert archived["structuredContent"]["id"] == template_id
    assert transport.requests[0]["method"] == "DELETE"
    assert transport.requests[0]["url"] == f"http://api.local/api/v1/report-templates/{template_id}"
    assert transport.requests[0]["headers"]["X-Reg-Engine-Source"] == "mcp"
    assert transport.requests[0]["body"] is None


def test_mcp_generate_report_run_tool_posts_to_existing_api_boundary() -> None:
    from app.mcp.api_client import RegEngineApiClient
    from app.mcp.tools import MCP_TOOL_DEFINITIONS, call_tool

    tool = next(
        tool for tool in MCP_TOOL_DEFINITIONS if tool["name"] == "reg_engine_generate_report_run"
    )
    assert tool["annotations"]["readOnlyHint"] is False
    assert tool["inputSchema"]["required"] == ["template_id"]
    assert tool["inputSchema"]["additionalProperties"] is False

    template_id = str(uuid4())
    run_id = str(uuid4())
    registry_id = str(uuid4())
    parameters = {"date_from": "2026-01-01", "status": "active"}
    transport = RecordingTransport(
        {
            "id": run_id,
            "report_template_id": template_id,
            "registry_id": registry_id,
            "card_id": None,
            "report_type": "cards_json",
            "run_status": "completed",
            "parameters_json": parameters,
            "summary_json": {"rows": 12},
            "row_count": 12,
            "output_filename": "report.json",
            "output_content_type": "application/json",
            "generated_by": str(uuid4()),
            "started_at": "2026-01-01T00:00:00Z",
            "finished_at": "2026-01-01T00:00:01Z",
            "created_at": "2026-01-01T00:00:00Z",
            "archived_at": None,
        }
    )
    client = RegEngineApiClient(
        base_url="http://api.local",
        token="token",
        transport=transport,
    )

    empty_parameters = call_tool(
        "reg_engine_generate_report_run",
        {"template_id": template_id},
        client=client,
    )
    assert empty_parameters["isError"] is False
    assert transport.requests[0]["method"] == "POST"
    assert (
        transport.requests[0]["url"]
        == f"http://api.local/api/v1/report-templates/{template_id}/runs"
    )
    empty_body = transport.requests[0]["body"]
    assert isinstance(empty_body, bytes)
    assert json.loads(empty_body.decode("utf-8")) == {}

    generated = call_tool(
        "reg_engine_generate_report_run",
        {"template_id": template_id, "parameters": parameters},
        client=client,
    )

    assert generated["isError"] is False
    assert generated["structuredContent"]["id"] == run_id
    assert transport.requests[1]["method"] == "POST"
    assert (
        transport.requests[1]["url"]
        == f"http://api.local/api/v1/report-templates/{template_id}/runs"
    )
    assert transport.requests[1]["headers"]["X-Reg-Engine-Source"] == "mcp"
    body = transport.requests[1]["body"]
    assert isinstance(body, bytes)
    assert json.loads(body.decode("utf-8")) == {"parameters": parameters}


def test_mcp_archive_report_run_tool_requires_confirmation_before_delete() -> None:
    from app.mcp.api_client import RegEngineApiClient
    from app.mcp.tools import MCP_TOOL_DEFINITIONS, call_tool

    tool = next(
        tool for tool in MCP_TOOL_DEFINITIONS if tool["name"] == "reg_engine_archive_report_run"
    )
    assert tool["annotations"]["readOnlyHint"] is False
    assert tool["inputSchema"]["required"] == ["report_run_id", "confirm_archive"]
    assert tool["inputSchema"]["additionalProperties"] is False

    report_run_id = str(uuid4())
    transport = RecordingTransport(
        {
            "id": report_run_id,
            "report_template_id": str(uuid4()),
            "registry_id": str(uuid4()),
            "card_id": None,
            "report_type": "cards_json",
            "run_status": "completed",
            "parameters_json": None,
            "summary_json": {"rows": 12},
            "row_count": 12,
            "output_filename": "report.json",
            "output_content_type": "application/json",
            "generated_by": str(uuid4()),
            "started_at": "2026-01-01T00:00:00Z",
            "finished_at": "2026-01-01T00:00:01Z",
            "created_at": "2026-01-01T00:00:00Z",
            "archived_at": "2026-01-02T00:00:00Z",
        }
    )
    client = RegEngineApiClient(
        base_url="http://api.local",
        token="token",
        transport=transport,
    )

    rejected = call_tool(
        "reg_engine_archive_report_run",
        {"report_run_id": report_run_id, "confirm_archive": False},
        client=client,
    )
    assert rejected["isError"] is True
    assert "confirm_archive" in rejected["content"][0]["text"]
    assert transport.requests == []

    archived = call_tool(
        "reg_engine_archive_report_run",
        {"report_run_id": report_run_id, "confirm_archive": True},
        client=client,
    )

    assert archived["isError"] is False
    assert archived["structuredContent"]["id"] == report_run_id
    assert transport.requests[0]["method"] == "DELETE"
    assert transport.requests[0]["url"] == f"http://api.local/api/v1/report-runs/{report_run_id}"
    assert transport.requests[0]["headers"]["X-Reg-Engine-Source"] == "mcp"
    assert transport.requests[0]["body"] is None


def test_mcp_list_document_templates_tool_gets_existing_api_boundary() -> None:
    from app.mcp.api_client import RegEngineApiClient
    from app.mcp.tools import MCP_TOOL_DEFINITIONS, call_tool

    tool = next(
        tool
        for tool in MCP_TOOL_DEFINITIONS
        if tool["name"] == "reg_engine_list_document_templates"
    )
    assert tool["annotations"]["readOnlyHint"] is True
    assert tool["inputSchema"]["required"] == ["registry_id"]
    assert tool["inputSchema"]["additionalProperties"] is False

    registry_id = str(uuid4())
    template_id = str(uuid4())
    transport = RecordingTransport(
        {
            "items": [
                {
                    "id": template_id,
                    "registry_id": registry_id,
                    "code": "summary",
                    "name": "Summary",
                    "current_version_number": 1,
                    "archived_at": None,
                }
            ]
        }
    )
    client = RegEngineApiClient(
        base_url="http://api.local",
        token="token",
        transport=transport,
    )

    result = call_tool(
        "reg_engine_list_document_templates",
        {"registry_id": registry_id, "include_archive": True},
        client=client,
    )

    assert result["isError"] is False
    assert result["structuredContent"]["items"][0]["id"] == template_id
    assert transport.requests[0]["method"] == "GET"
    assert (
        transport.requests[0]["url"]
        == f"http://api.local/api/v1/registries/{registry_id}/document-templates"
        "?include_archive=true"
    )
    assert transport.requests[0]["headers"]["X-Reg-Engine-Source"] == "mcp"
    assert transport.requests[0]["body"] is None


def test_mcp_list_document_template_versions_tool_gets_existing_api_boundary() -> None:
    from app.mcp.api_client import RegEngineApiClient
    from app.mcp.tools import MCP_TOOL_DEFINITIONS, call_tool

    tool = next(
        tool
        for tool in MCP_TOOL_DEFINITIONS
        if tool["name"] == "reg_engine_list_document_template_versions"
    )
    assert tool["annotations"]["readOnlyHint"] is True
    assert tool["inputSchema"]["required"] == ["template_id"]
    assert tool["inputSchema"]["additionalProperties"] is False

    template_id = str(uuid4())
    version_id = str(uuid4())
    transport = RecordingTransport(
        {
            "items": [
                {
                    "id": version_id,
                    "template_id": template_id,
                    "version_number": 1,
                    "template_format": "docx_text_v1",
                    "archived_at": None,
                }
            ]
        }
    )
    client = RegEngineApiClient(
        base_url="http://api.local",
        token="token",
        transport=transport,
    )

    result = call_tool(
        "reg_engine_list_document_template_versions",
        {"template_id": template_id, "include_archive": True},
        client=client,
    )

    assert result["isError"] is False
    assert result["structuredContent"]["items"][0]["id"] == version_id
    assert transport.requests[0]["method"] == "GET"
    assert (
        transport.requests[0]["url"]
        == f"http://api.local/api/v1/document-templates/{template_id}/versions"
        "?include_archive=true"
    )
    assert transport.requests[0]["headers"]["X-Reg-Engine-Source"] == "mcp"
    assert transport.requests[0]["body"] is None


def test_mcp_list_generated_documents_tool_gets_existing_api_boundary() -> None:
    from app.mcp.api_client import RegEngineApiClient
    from app.mcp.tools import MCP_TOOL_DEFINITIONS, call_tool

    tool = next(
        tool
        for tool in MCP_TOOL_DEFINITIONS
        if tool["name"] == "reg_engine_list_generated_documents"
    )
    assert tool["annotations"]["readOnlyHint"] is True
    assert tool["inputSchema"]["required"] == ["card_id"]
    assert tool["inputSchema"]["additionalProperties"] is False

    card_id = str(uuid4())
    generated_document_id = str(uuid4())
    transport = RecordingTransport(
        {
            "items": [
                {
                    "id": generated_document_id,
                    "card_id": card_id,
                    "title": "Summary",
                    "output_filename": "summary.docx",
                    "render_status": "completed",
                    "archived_at": None,
                }
            ]
        }
    )
    client = RegEngineApiClient(
        base_url="http://api.local",
        token="token",
        transport=transport,
    )

    result = call_tool(
        "reg_engine_list_generated_documents",
        {"card_id": card_id, "include_archive": True},
        client=client,
    )

    assert result["isError"] is False
    assert result["structuredContent"]["items"][0]["id"] == generated_document_id
    assert transport.requests[0]["method"] == "GET"
    assert (
        transport.requests[0]["url"]
        == f"http://api.local/api/v1/cards/{card_id}/generated-documents"
        "?include_archive=true"
    )
    assert transport.requests[0]["headers"]["X-Reg-Engine-Source"] == "mcp"
    assert transport.requests[0]["body"] is None


def test_mcp_read_generated_document_tool_gets_existing_api_boundary() -> None:
    from app.mcp.api_client import RegEngineApiClient
    from app.mcp.tools import MCP_TOOL_DEFINITIONS, call_tool

    tool = next(
        tool
        for tool in MCP_TOOL_DEFINITIONS
        if tool["name"] == "reg_engine_read_generated_document"
    )
    assert tool["annotations"]["readOnlyHint"] is True
    assert tool["inputSchema"]["required"] == ["generated_document_id"]
    assert tool["inputSchema"]["additionalProperties"] is False

    generated_document_id = str(uuid4())
    transport = RecordingTransport(
        {
            "id": generated_document_id,
            "card_id": str(uuid4()),
            "template_id": str(uuid4()),
            "title": "Summary",
            "output_filename": "summary.docx",
            "render_status": "completed",
            "archived_at": None,
        }
    )
    client = RegEngineApiClient(
        base_url="http://api.local",
        token="token",
        transport=transport,
    )

    result = call_tool(
        "reg_engine_read_generated_document",
        {"generated_document_id": generated_document_id, "include_archive": True},
        client=client,
    )

    assert result["isError"] is False
    assert result["structuredContent"]["id"] == generated_document_id
    assert transport.requests[0]["method"] == "GET"
    assert (
        transport.requests[0]["url"]
        == f"http://api.local/api/v1/generated-documents/{generated_document_id}"
        "?include_archive=true"
    )
    assert transport.requests[0]["headers"]["X-Reg-Engine-Source"] == "mcp"
    assert transport.requests[0]["body"] is None


def test_mcp_create_document_template_tool_posts_to_existing_api_boundary() -> None:
    from app.mcp.api_client import RegEngineApiClient
    from app.mcp.tools import MCP_TOOL_DEFINITIONS, call_tool

    tool = next(
        tool
        for tool in MCP_TOOL_DEFINITIONS
        if tool["name"] == "reg_engine_create_document_template"
    )
    assert tool["annotations"]["readOnlyHint"] is False
    assert tool["inputSchema"]["required"] == [
        "registry_id",
        "code",
        "name",
        "template_body",
    ]
    assert tool["inputSchema"]["additionalProperties"] is False

    registry_id = str(uuid4())
    template_id = str(uuid4())
    template_body = "Карточка: {{ card.display_name }}"
    transport = RecordingTransport(
        {
            "id": template_id,
            "registry_id": registry_id,
            "code": "summary",
            "name": "Summary",
            "description": "Document summary",
            "template_format": "docx_text_v1",
            "output_filename_template": "{{ card.display_name }}.docx",
            "output_content_type": (
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            ),
            "is_active": True,
            "current_version_id": str(uuid4()),
            "current_version_number": 1,
            "created_at": "2026-01-01T00:00:00Z",
            "archived_at": None,
        }
    )
    client = RegEngineApiClient(
        base_url="http://api.local",
        token="token",
        transport=transport,
    )

    result = call_tool(
        "reg_engine_create_document_template",
        {
            "registry_id": registry_id,
            "code": "summary",
            "name": "Summary",
            "description": "Document summary",
            "template_body": template_body,
            "output_filename_template": "{{ card.display_name }}.docx",
        },
        client=client,
    )

    assert result["isError"] is False
    assert result["structuredContent"]["id"] == template_id
    assert transport.requests[0]["method"] == "POST"
    assert (
        transport.requests[0]["url"]
        == f"http://api.local/api/v1/registries/{registry_id}/document-templates"
    )
    assert transport.requests[0]["headers"]["X-Reg-Engine-Source"] == "mcp"
    body = transport.requests[0]["body"]
    assert isinstance(body, bytes)
    assert json.loads(body.decode("utf-8")) == {
        "code": "summary",
        "name": "Summary",
        "description": "Document summary",
        "template_body": template_body,
        "output_filename_template": "{{ card.display_name }}.docx",
    }


def test_mcp_archive_document_template_tool_requires_confirmation_before_delete() -> None:
    from app.mcp.api_client import RegEngineApiClient
    from app.mcp.tools import MCP_TOOL_DEFINITIONS, call_tool

    tool = next(
        tool
        for tool in MCP_TOOL_DEFINITIONS
        if tool["name"] == "reg_engine_archive_document_template"
    )
    assert tool["annotations"]["readOnlyHint"] is False
    assert tool["inputSchema"]["required"] == ["template_id", "confirm_archive"]
    assert tool["inputSchema"]["additionalProperties"] is False

    template_id = str(uuid4())
    transport = RecordingTransport(
        {
            "id": template_id,
            "registry_id": str(uuid4()),
            "code": "summary",
            "name": "Summary",
            "description": None,
            "template_format": "docx_text_v1",
            "output_filename_template": "{{ card.display_name }}.docx",
            "output_content_type": (
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            ),
            "is_active": False,
            "current_version_id": str(uuid4()),
            "current_version_number": 1,
            "created_at": "2026-01-01T00:00:00Z",
            "archived_at": "2026-01-02T00:00:00Z",
        }
    )
    client = RegEngineApiClient(
        base_url="http://api.local",
        token="token",
        transport=transport,
    )

    rejected = call_tool(
        "reg_engine_archive_document_template",
        {"template_id": template_id, "confirm_archive": False},
        client=client,
    )
    assert rejected["isError"] is True
    assert "confirm_archive" in rejected["content"][0]["text"]
    assert transport.requests == []

    archived = call_tool(
        "reg_engine_archive_document_template",
        {"template_id": template_id, "confirm_archive": True},
        client=client,
    )

    assert archived["isError"] is False
    assert archived["structuredContent"]["id"] == template_id
    assert transport.requests[0]["method"] == "DELETE"
    assert (
        transport.requests[0]["url"] == f"http://api.local/api/v1/document-templates/{template_id}"
    )
    assert transport.requests[0]["headers"]["X-Reg-Engine-Source"] == "mcp"
    assert transport.requests[0]["body"] is None


def test_mcp_generate_document_tool_posts_to_existing_api_boundary() -> None:
    from app.mcp.api_client import RegEngineApiClient
    from app.mcp.tools import MCP_TOOL_DEFINITIONS, call_tool

    tool = next(
        tool for tool in MCP_TOOL_DEFINITIONS if tool["name"] == "reg_engine_generate_document"
    )
    assert tool["annotations"]["readOnlyHint"] is False
    assert tool["inputSchema"]["required"] == ["card_id", "template_id"]
    assert tool["inputSchema"]["additionalProperties"] is False

    card_id = str(uuid4())
    template_id = str(uuid4())
    generated_document_id = str(uuid4())
    transport = RecordingTransport(
        {
            "id": generated_document_id,
            "card_id": card_id,
            "template_id": template_id,
            "template_version_id": str(uuid4()),
            "stored_file_id": str(uuid4()),
            "title": "Summary",
            "output_filename": "summary.docx",
            "content_type": (
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            ),
            "render_status": "completed",
            "created_at": "2026-01-01T00:00:00Z",
            "archived_at": None,
        }
    )
    client = RegEngineApiClient(
        base_url="http://api.local",
        token="token",
        transport=transport,
    )

    without_title = call_tool(
        "reg_engine_generate_document",
        {"card_id": card_id, "template_id": template_id},
        client=client,
    )
    assert without_title["isError"] is False
    assert transport.requests[0]["method"] == "POST"
    assert (
        transport.requests[0]["url"]
        == f"http://api.local/api/v1/cards/{card_id}/generated-documents"
    )
    empty_title_body = transport.requests[0]["body"]
    assert isinstance(empty_title_body, bytes)
    assert json.loads(empty_title_body.decode("utf-8")) == {"template_id": template_id}

    generated = call_tool(
        "reg_engine_generate_document",
        {"card_id": card_id, "template_id": template_id, "title": "Summary"},
        client=client,
    )

    assert generated["isError"] is False
    assert generated["structuredContent"]["id"] == generated_document_id
    assert transport.requests[1]["method"] == "POST"
    assert (
        transport.requests[1]["url"]
        == f"http://api.local/api/v1/cards/{card_id}/generated-documents"
    )
    assert transport.requests[1]["headers"]["X-Reg-Engine-Source"] == "mcp"
    body = transport.requests[1]["body"]
    assert isinstance(body, bytes)
    assert json.loads(body.decode("utf-8")) == {
        "template_id": template_id,
        "title": "Summary",
    }


def test_mcp_generate_pdf_document_tool_posts_to_existing_api_boundary() -> None:
    from app.mcp.api_client import RegEngineApiClient
    from app.mcp.tools import MCP_TOOL_DEFINITIONS, call_tool

    tool = next(
        tool for tool in MCP_TOOL_DEFINITIONS if tool["name"] == "reg_engine_generate_pdf_document"
    )
    assert tool["annotations"]["readOnlyHint"] is False
    assert tool["inputSchema"]["required"] == ["card_id", "template_id"]
    assert tool["inputSchema"]["additionalProperties"] is False

    card_id = str(uuid4())
    template_id = str(uuid4())
    generated_document_id = str(uuid4())
    transport = RecordingTransport(
        {
            "id": generated_document_id,
            "card_id": card_id,
            "template_id": template_id,
            "template_version_id": str(uuid4()),
            "stored_file_id": str(uuid4()),
            "title": "Summary PDF",
            "output_filename": "summary.pdf",
            "content_type": "application/pdf",
            "render_status": "completed",
            "created_at": "2026-01-01T00:00:00Z",
            "archived_at": None,
        }
    )
    client = RegEngineApiClient(
        base_url="http://api.local",
        token="token",
        transport=transport,
    )

    generated = call_tool(
        "reg_engine_generate_pdf_document",
        {"card_id": card_id, "template_id": template_id, "title": "Summary PDF"},
        client=client,
    )

    assert generated["isError"] is False
    assert generated["structuredContent"]["id"] == generated_document_id
    assert transport.requests[0]["method"] == "POST"
    assert (
        transport.requests[0]["url"]
        == f"http://api.local/api/v1/cards/{card_id}/generated-documents/pdf"
    )
    assert transport.requests[0]["headers"]["X-Reg-Engine-Source"] == "mcp"
    body = transport.requests[0]["body"]
    assert isinstance(body, bytes)
    assert json.loads(body.decode("utf-8")) == {
        "template_id": template_id,
        "title": "Summary PDF",
    }


def test_mcp_archive_generated_document_tool_requires_confirmation_before_delete() -> None:
    from app.mcp.api_client import RegEngineApiClient
    from app.mcp.tools import MCP_TOOL_DEFINITIONS, call_tool

    tool = next(
        tool
        for tool in MCP_TOOL_DEFINITIONS
        if tool["name"] == "reg_engine_archive_generated_document"
    )
    assert tool["annotations"]["readOnlyHint"] is False
    assert tool["inputSchema"]["required"] == [
        "generated_document_id",
        "confirm_archive",
    ]
    assert tool["inputSchema"]["additionalProperties"] is False

    generated_document_id = str(uuid4())
    transport = RecordingTransport(
        {
            "id": generated_document_id,
            "card_id": str(uuid4()),
            "template_id": str(uuid4()),
            "template_version_id": str(uuid4()),
            "stored_file_id": str(uuid4()),
            "title": "Archived summary",
            "output_filename": "summary.docx",
            "content_type": (
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            ),
            "render_status": "completed",
            "created_at": "2026-01-01T00:00:00Z",
            "archived_at": "2026-01-02T00:00:00Z",
        }
    )
    client = RegEngineApiClient(
        base_url="http://api.local",
        token="token",
        transport=transport,
    )

    rejected = call_tool(
        "reg_engine_archive_generated_document",
        {"generated_document_id": generated_document_id, "confirm_archive": False},
        client=client,
    )
    assert rejected["isError"] is True
    assert "confirm_archive" in rejected["content"][0]["text"]
    assert transport.requests == []

    archived = call_tool(
        "reg_engine_archive_generated_document",
        {"generated_document_id": generated_document_id, "confirm_archive": True},
        client=client,
    )

    assert archived["isError"] is False
    assert archived["structuredContent"]["id"] == generated_document_id
    assert transport.requests[0]["method"] == "DELETE"
    assert (
        transport.requests[0]["url"]
        == f"http://api.local/api/v1/generated-documents/{generated_document_id}"
    )
    assert transport.requests[0]["headers"]["X-Reg-Engine-Source"] == "mcp"
    assert transport.requests[0]["body"] is None


def test_mcp_tool_argument_errors_are_returned_as_tool_errors() -> None:
    from app.mcp.api_client import RegEngineApiClient
    from app.mcp.tools import call_tool

    client = RegEngineApiClient(
        base_url="http://api.local",
        token=None,
        transport=RecordingTransport(),
    )

    result = call_tool("reg_engine_read_card", {}, client=client)

    assert result["isError"] is True
    assert "card_id" in result["content"][0]["text"]


def test_mcp_json_rpc_handler_supports_initialize_list_and_call() -> None:
    from app.mcp.api_client import RegEngineApiClient
    from app.mcp.server import MCP_PROTOCOL_VERSION, McpJsonRpcHandler

    transport = RecordingTransport({"status": "ok", "service": "reg_engine"})
    client = RegEngineApiClient(base_url="http://api.local", token=None, transport=transport)
    handler = McpJsonRpcHandler(api_client=client)

    initialize = handler.handle(
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {"protocolVersion": MCP_PROTOCOL_VERSION},
        }
    )
    assert initialize["result"]["protocolVersion"] == MCP_PROTOCOL_VERSION
    assert initialize["result"]["capabilities"] == {"tools": {"listChanged": False}}

    listed = handler.handle({"jsonrpc": "2.0", "id": 2, "method": "tools/list"})
    assert listed["result"]["tools"][0]["name"] == "reg_engine_health"

    called = handler.handle(
        {
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {"name": "reg_engine_health", "arguments": {}},
        }
    )
    assert called["result"]["structuredContent"] == {"status": "ok", "service": "reg_engine"}


def test_mcp_json_rpc_handler_returns_invalid_params_for_bad_tool_call_params() -> None:
    from app.mcp.api_client import RegEngineApiClient
    from app.mcp.server import McpJsonRpcHandler

    client = RegEngineApiClient(
        base_url="http://api.local",
        token=None,
        transport=RecordingTransport(),
    )
    handler = McpJsonRpcHandler(api_client=client)

    response = handler.handle({"jsonrpc": "2.0", "id": 7, "method": "tools/call", "params": {}})

    assert response is not None
    assert response["error"]["code"] == -32602
    assert "name" in response["error"]["message"]


def test_mcp_stdio_parse_error_does_not_crash_and_continues() -> None:
    from app.mcp.api_client import RegEngineApiClient
    from app.mcp.server import MCP_PROTOCOL_VERSION, McpJsonRpcHandler, serve_stdio

    client = RegEngineApiClient(
        base_url="http://api.local",
        token=None,
        transport=RecordingTransport(),
    )
    handler = McpJsonRpcHandler(api_client=client)
    input_stream = io.StringIO(
        'not-json\n{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n'
    )
    output_stream = io.StringIO()

    serve_stdio(input_stream=input_stream, output_stream=output_stream, handler=handler)

    responses = [json.loads(line) for line in output_stream.getvalue().splitlines()]
    assert responses[0]["id"] is None
    assert responses[0]["error"]["code"] == -32700
    assert responses[1]["id"] == 1
    assert responses[1]["result"]["protocolVersion"] == MCP_PROTOCOL_VERSION


def test_mcp_package_does_not_import_database_models_or_service_layer() -> None:
    mcp_dir = Path(__file__).resolve().parents[1] / "app" / "mcp"
    assert mcp_dir.exists()

    forbidden_imports = {
        "alembic",
        "psycopg",
        "sqlalchemy",
        "app.core.database",
        "app.models",
        "app.services",
    }

    for path in mcp_dir.glob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        imported_modules: set[str] = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imported_modules.update(alias.name for alias in node.names)
            elif isinstance(node, ast.ImportFrom) and node.module:
                imported_modules.add(node.module)

        for module_name in imported_modules:
            assert not any(
                module_name == forbidden or module_name.startswith(f"{forbidden}.")
                for forbidden in forbidden_imports
            ), f"{path} imports forbidden module {module_name}"
