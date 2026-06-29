from __future__ import annotations

import json
import sys
from typing import Any, TextIO

from app.mcp.api_client import RegEngineApiClient, create_api_client_from_env
from app.mcp.tools import MCP_TOOL_DEFINITIONS, call_tool

MCP_PROTOCOL_VERSION = "2025-11-25"
SERVER_INFO = {"name": "reg-engine-mcp", "version": "0.1.0"}


class McpJsonRpcHandler:
    def __init__(self, *, api_client: RegEngineApiClient | None = None) -> None:
        self.api_client = api_client or create_api_client_from_env()

    def handle(self, message: dict[str, Any]) -> dict[str, Any] | None:
        request_id = message.get("id")
        method = message.get("method")

        try:
            if method == "initialize":
                return _response(request_id, self._initialize_result())
            if method == "notifications/initialized":
                return None
            if method == "ping":
                return _response(request_id, {})
            if method == "tools/list":
                return _response(request_id, {"tools": MCP_TOOL_DEFINITIONS})
            if method == "tools/call":
                return _response(request_id, self._call_tool_result(message))
        except ValueError as exc:
            return _error(request_id, -32602, str(exc))
        except Exception as exc:
            return _error(request_id, -32603, str(exc))

        return _error(request_id, -32601, f"Unsupported MCP method: {method}")

    def _initialize_result(self) -> dict[str, Any]:
        return {
            "protocolVersion": MCP_PROTOCOL_VERSION,
            "capabilities": {"tools": {"listChanged": False}},
            "serverInfo": SERVER_INFO,
        }

    def _call_tool_result(self, message: dict[str, Any]) -> dict[str, Any]:
        params = message.get("params")
        if not isinstance(params, dict):
            raise ValueError("tools/call params must be an object.")

        raw_name = params.get("name")
        if not isinstance(raw_name, str) or not raw_name:
            raise ValueError("tools/call params.name is required.")

        raw_arguments = params.get("arguments")
        if raw_arguments is not None and not isinstance(raw_arguments, dict):
            raise ValueError("tools/call params.arguments must be an object.")

        return call_tool(raw_name, raw_arguments, client=self.api_client)


def serve_stdio(
    *,
    input_stream: TextIO = sys.stdin,
    output_stream: TextIO = sys.stdout,
    handler: McpJsonRpcHandler | None = None,
) -> None:
    rpc_handler = handler or McpJsonRpcHandler()
    for line in input_stream:
        if not line.strip():
            continue
        try:
            message = json.loads(line)
        except json.JSONDecodeError:
            _write_response(output_stream, _error(None, -32700, "Parse error."))
            continue
        if not isinstance(message, dict):
            _write_response(
                output_stream,
                _error(None, -32600, "JSON-RPC request must be an object."),
            )
            continue
        response = rpc_handler.handle(message)
        if response is None:
            continue
        _write_response(output_stream, response)


def main() -> None:
    serve_stdio()


def _response(request_id: object, result: dict[str, Any]) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def _error(request_id: object, code: int, message: str) -> dict[str, Any]:
    return {
        "jsonrpc": "2.0",
        "id": request_id,
        "error": {"code": code, "message": message},
    }


def _write_response(output_stream: TextIO, response: dict[str, Any]) -> None:
    output_stream.write(json.dumps(response, ensure_ascii=False) + "\n")
    output_stream.flush()


if __name__ == "__main__":
    main()
