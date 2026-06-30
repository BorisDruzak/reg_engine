from __future__ import annotations

import json
import os
import re
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Protocol
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

MCP_SOURCE_HEADER = "X-Reg-Engine-Source"
MCP_USER_AGENT = "reg-engine-mcp/0.1"
SENSITIVE_ERROR_MARKERS = (
    "traceback",
    "psycopg",
    "sqlalchemy",
    "integrityerror",
    "programmingerror",
    "/var/",
    "/opt/",
    "c:/",
    "c:\\",
    "storage",
    "stored_file",
    "checksum",
    "secret",
    "private",
)


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
            raise RegEngineApiError("Registry Engine API request failed.") from exc


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
        return self._request_json(method="GET", path=path, query=query)

    def get_bytes(
        self,
        path: str,
        query: Mapping[str, object | None] | None = None,
    ) -> ApiResponse:
        response = self.transport.request(
            method="GET",
            url=self._url(path, query),
            headers=self._headers_with_accept(accept="*/*"),
            body=None,
            timeout_seconds=self.timeout_seconds,
        )
        if response.status_code >= 400:
            raise RegEngineApiError(
                _api_error_message(response.body),
                status_code=response.status_code,
            )
        return response

    def post_json(self, path: str, payload: Mapping[str, Any]) -> Any:
        return self._request_json(method="POST", path=path, payload=payload)

    def patch_json(self, path: str, payload: Mapping[str, Any]) -> Any:
        return self._request_json(method="PATCH", path=path, payload=payload)

    def delete_json(self, path: str, query: Mapping[str, object | None] | None = None) -> Any:
        return self._request_json(method="DELETE", path=path, query=query)

    def _request_json(
        self,
        *,
        method: str,
        path: str,
        query: Mapping[str, object | None] | None = None,
        payload: Mapping[str, Any] | None = None,
    ) -> Any:
        body = _json_body(payload) if payload is not None else None
        response = self.transport.request(
            method=method,
            url=self._url(path, query),
            headers=self._headers(has_body=body is not None),
            body=body,
            timeout_seconds=self.timeout_seconds,
        )
        if response.status_code >= 400:
            raise RegEngineApiError(
                _api_error_message(response.body),
                status_code=response.status_code,
            )
        return json.loads(response.body.decode("utf-8")) if response.body else None

    def _url(self, path: str, query: Mapping[str, object | None] | None) -> str:
        normalized_path = path if path.startswith("/") else f"/{path}"
        filtered_query = {
            key: _query_value(value) for key, value in (query or {}).items() if value is not None
        }
        suffix = f"?{urlencode(filtered_query)}" if filtered_query else ""
        return f"{self.base_url}{normalized_path}{suffix}"

    def _headers(self, *, has_body: bool = False) -> dict[str, str]:
        return self._headers_with_accept(
            accept="application/json",
            has_body=has_body,
        )

    def _headers_with_accept(
        self,
        *,
        accept: str,
        has_body: bool = False,
    ) -> dict[str, str]:
        headers = {
            "Accept": accept,
            "User-Agent": MCP_USER_AGENT,
            MCP_SOURCE_HEADER: "mcp",
        }
        if has_body:
            headers["Content-Type"] = "application/json"
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


def _json_body(payload: Mapping[str, Any]) -> bytes:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def _api_error_message(body: bytes) -> str:
    if not body:
        return "Registry Engine API request failed."
    try:
        payload = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return "Registry Engine API request failed."
    detail = payload.get("detail") if isinstance(payload, dict) else None
    message = _safe_detail_message(detail)
    return message or "Registry Engine API request failed."


def _safe_detail_message(detail: object) -> str | None:
    if detail is None:
        return None
    if isinstance(detail, str):
        return None if _looks_sensitive(detail) else detail
    if isinstance(detail, dict):
        for key in ("message", "error"):
            value = detail.get(key)
            if isinstance(value, str) and not _looks_sensitive(value):
                return value
        return None
    if isinstance(detail, list):
        messages: list[str] = []
        for item in detail[:3]:
            if not isinstance(item, dict):
                continue
            message = item.get("msg")
            if not isinstance(message, str) or _looks_sensitive(message):
                continue
            location = item.get("loc")
            if isinstance(location, list) and location:
                location_text = ".".join(str(part) for part in location)
                messages.append(f"{location_text}: {message}")
            else:
                messages.append(message)
        return "; ".join(messages) if messages else None
    return None


def _looks_sensitive(message: str) -> bool:
    lowered = message.lower()
    if any(marker in lowered for marker in SENSITIVE_ERROR_MARKERS):
        return True
    return bool(re.search(r"[a-z]:[\\/]", lowered))
