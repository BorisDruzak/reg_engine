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


@pytest.mark.parametrize("base_url", ["", "file:///tmp/reg_engine", "api.local"])
def test_mcp_api_client_rejects_non_http_base_urls(base_url: str) -> None:
    from app.mcp.api_client import RegEngineApiClient

    with pytest.raises(ValueError, match="http"):
        RegEngineApiClient(base_url=base_url, token=None, transport=RecordingTransport())


@pytest.mark.parametrize("base_url", ["http://api.local", "https://api.local/"])
def test_mcp_api_client_accepts_http_and_https_base_urls(base_url: str) -> None:
    from app.mcp.api_client import RegEngineApiClient

    RegEngineApiClient(base_url=base_url, token=None, transport=RecordingTransport())


def test_mcp_tool_definitions_are_read_only_and_call_existing_api_paths() -> None:
    from app.mcp.api_client import RegEngineApiClient
    from app.mcp.tools import MCP_TOOL_DEFINITIONS, call_tool

    tool_names = {tool["name"] for tool in MCP_TOOL_DEFINITIONS}
    assert {
        "reg_engine_health",
        "reg_engine_list_registries",
        "reg_engine_read_registry_schema",
        "reg_engine_list_cards",
        "reg_engine_read_card",
        "reg_engine_list_audit_events",
    } <= tool_names
    assert all(tool["annotations"]["readOnlyHint"] is True for tool in MCP_TOOL_DEFINITIONS)

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
