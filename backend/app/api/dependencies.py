from collections.abc import Generator
from dataclasses import dataclass
from ipaddress import ip_address
from typing import Annotated, NoReturn
from uuid import UUID

from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_session
from app.services.cards import CardServiceError, InvalidFieldValueError
from app.services.organizations import OrganizationNotFoundError
from app.services.permissions import PermissionDeniedError
from app.services.public_links import PublicLinkError
from app.services.references import ReferenceListError
from app.services.registry_schema import RegistrySchemaError


@dataclass(frozen=True)
class RequestMetadata:
    ip_address: str | None
    user_agent: str | None
    request_id: str | None


def get_request_metadata(request: Request) -> RequestMetadata:
    forwarded_for = request.headers.get("x-forwarded-for")
    raw_ip = forwarded_for.split(",", maxsplit=1)[0].strip() if forwarded_for else None
    if raw_ip is None and request.client is not None:
        raw_ip = request.client.host
    return RequestMetadata(
        ip_address=_normalize_ip_address(raw_ip),
        user_agent=request.headers.get("user-agent"),
        request_id=request.headers.get("x-request-id"),
    )


def get_db_session(
    request_metadata: Annotated[RequestMetadata, Depends(get_request_metadata)],
) -> Generator[Session, None, None]:
    for session in get_session():
        session.info["audit_metadata"] = request_metadata
        try:
            yield session
            session.commit()
        except IntegrityError as exc:
            session.rollback()
            _raise_integrity_http_error(exc)
        except Exception:
            session.rollback()
            raise


def get_actor_user_id(
    x_actor_user_id: Annotated[UUID | None, Header(alias="X-Actor-User-Id")] = None,
) -> UUID:
    if not get_settings().allow_dev_actor_header:
        raise HTTPException(
            status_code=401,
            detail="Temporary dev actor header is disabled. Use production auth when available.",
        )
    if x_actor_user_id is None:
        raise HTTPException(
            status_code=401,
            detail="X-Actor-User-Id header is required for temporary local API actor context.",
        )
    return x_actor_user_id


def raise_service_http_error(exc: Exception) -> NoReturn:
    if isinstance(exc, IntegrityError):
        _raise_integrity_http_error(exc)
    if isinstance(exc, PermissionDeniedError):
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    if isinstance(exc, OrganizationNotFoundError):
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if isinstance(
        exc,
        (
            CardServiceError,
            InvalidFieldValueError,
            PublicLinkError,
            ReferenceListError,
            RegistrySchemaError,
        ),
    ):
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    raise HTTPException(status_code=500, detail="Internal service error.") from exc


def _normalize_ip_address(raw_ip: str | None) -> str | None:
    if not raw_ip:
        return None
    try:
        return str(ip_address(raw_ip))
    except ValueError:
        return None


def _raise_integrity_http_error(exc: IntegrityError) -> NoReturn:
    message = str(getattr(exc, "orig", exc)).lower()
    if "foreign key" in message or "check constraint" in message:
        raise HTTPException(status_code=422, detail="Integrity constraint violation.") from exc
    raise HTTPException(status_code=409, detail="Integrity constraint violation.") from exc
