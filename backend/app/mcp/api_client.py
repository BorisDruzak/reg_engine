from __future__ import annotations

import json
import os
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Protocol
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

MCP_SOURCE_HEADER = "X-Reg-Engine-Source"
MCP_USER_AGENT = "reg-engine-mcp/0.1"


@dataclass(frozen=True)
class ApiResponse:
    status_code: int
    headers: Mapping[str, str]
    body: bytes


class RegEngineApiError(RuntimeError):
    def __init__(self, message: str, *, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class HttpTransport(Protocol):
    def request(
        self,
        *,
        method: str,
        url: str,
        headers: dict[str, str],
        body: bytes | None,
        timeout_seconds: float,
    ) -> ApiResponse: ...


class UrllibHttpTransport:
    def request(
        self,
        *,
        method: str,
        url: str,
        headers: dict[str, str],
        body: bytes | None,
        timeout_seconds: float,
    ) -> ApiResponse:
        request = Request(url, data=body, headers=headers, method=method)
        try:
            with urlopen(request, timeout=timeout_seconds) as response:
                return ApiResponse(
                    status_code=response.status,
                    headers=dict(response.headers.items()),
                    body=response.read(),
                )
        except HTTPError as exc:
            return ApiResponse(
                status_code=exc.code,
                headers=dict(exc.headers.items()),
                body=exc.read(),
            )
        except URLError as exc:
            raise RegEngineApiError(f"Registry Engine API request failed: {exc}") from exc


class RegEngineApiClient:
    def __init__(
        self,
        *,
        base_url: str,
        token: str | None,
        transport: HttpTransport | None = None,
        timeout_seconds: float = 30.0,
    ) -> None:
        self.base_url = _validate_base_url(base_url)
        self.token = token.strip() if token is not None and token.strip() else None
        self.transport = transport or UrllibHttpTransport()
        self.timeout_seconds = timeout_seconds

    def get_json(self, path: str, query: Mapping[str, object | None] | None = None) -> Any:
        response = self.transport.request(
            method="GET",
            url=self._url(path, query),
            headers=self._headers(),
            body=None,
            timeout_seconds=self.timeout_seconds,
        )
        if response.status_code >= 400:
            raise RegEngineApiError(
                _api_error_message(response.body),
                status_code=response.status_code,
            )
        return json.loads(response.body.decode("utf-8"))

    def _url(self, path: str, query: Mapping[str, object | None] | None) -> str:
        normalized_path = path if path.startswith("/") else f"/{path}"
        filtered_query = {
            key: _query_value(value) for key, value in (query or {}).items() if value is not None
        }
        suffix = f"?{urlencode(filtered_query)}" if filtered_query else ""
        return f"{self.base_url}{normalized_path}{suffix}"

    def _headers(self) -> dict[str, str]:
        headers = {
            "Accept": "application/json",
            "User-Agent": MCP_USER_AGENT,
            MCP_SOURCE_HEADER: "mcp",
        }
        if self.token is not None:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers


def create_api_client_from_env() -> RegEngineApiClient:
    return RegEngineApiClient(
        base_url=os.environ.get("REG_ENGINE_API_BASE_URL", "http://127.0.0.1:8000"),
        token=os.environ.get("REG_ENGINE_API_TOKEN"),
        timeout_seconds=float(os.environ.get("REG_ENGINE_MCP_TIMEOUT_SECONDS", "30")),
    )


def _validate_base_url(base_url: str) -> str:
    normalized = base_url.strip().rstrip("/")
    parsed = urlparse(normalized)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("REG_ENGINE_API_BASE_URL must be an http(s) URL.")
    return normalized


def _query_value(value: object) -> str:
    if isinstance(value, bool):
        return str(value).lower()
    return str(value)


def _api_error_message(body: bytes) -> str:
    if not body:
        return "Registry Engine API request failed."
    try:
        payload = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return "Registry Engine API request failed."
    detail = payload.get("detail") if isinstance(payload, dict) else None
    return str(detail) if detail else "Registry Engine API request failed."
