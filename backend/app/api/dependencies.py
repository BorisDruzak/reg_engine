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
from app.models import User
from app.services.attachments import AttachmentServiceError
from app.services.auth import AuthError, AuthService
from app.services.cards import CardServiceError, InvalidFieldValueError
from app.services.documents import DocumentServiceError
from app.services.import_export import ImportExportServiceError
from app.services.organizations import OrganizationNotFoundError, OrganizationTopologyError
from app.services.permissions import (
    PermissionDeniedError,
    PersistStatePermissionDeniedError,
    PublicLinkReviewPermissionDeniedError,
    PublicLinkSubmittedReadOnlyError,
)
from app.services.public_links import PublicLinkError, PublicLinkTransitionError
from app.services.reference_edit_links import ReferenceEditLinkError, ReferenceEditLinkReadOnlyError
from app.services.references import ReferenceListError
from app.services.registry_schema import RegistrySchemaError
from app.services.reports import ReportServiceError
from app.services.user_access import (
    UserAccessConflictError,
    UserAccessError,
    UserAccessNotFoundError,
)


@dataclass(frozen=True)
class RequestMetadata:
    ip_address: str | None
    user_agent: str | None
    request_id: str | None
    source: str


class PersistStateHTTPException(HTTPException):
    """HTTP denial whose deliberate service state transition must be committed."""


def get_request_metadata(request: Request) -> RequestMetadata:
    forwarded_for = request.headers.get("x-forwarded-for")
    raw_ip = forwarded_for.split(",", maxsplit=1)[0].strip() if forwarded_for else None
    if raw_ip is None and request.client is not None:
        raw_ip = request.client.host
    return RequestMetadata(
        ip_address=_normalize_ip_address(raw_ip),
        user_agent=request.headers.get("user-agent"),
        request_id=request.headers.get("x-request-id"),
        source=_request_source(request.headers.get("x-reg-engine-source")),
    )


def get_db_session(
    request_metadata: Annotated[RequestMetadata, Depends(get_request_metadata)],
) -> Generator[Session, None, None]:
    for session in get_session():
        session.info["audit_metadata"] = request_metadata
        try:
            yield session
            session.commit()
        except PersistStateHTTPException:
            session.commit()
            raise
        except IntegrityError as exc:
            session.rollback()
            _raise_integrity_http_error(exc)
        except Exception:
            session.rollback()
            raise


def get_actor_user_id(
    session: Annotated[Session, Depends(get_db_session)],
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
    x_actor_user_id: Annotated[UUID | None, Header(alias="X-Actor-User-Id")] = None,
) -> UUID:
    if authorization is not None:
        return _current_user_from_authorization(session, authorization).id

    if get_settings().allow_dev_actor_header:
        if x_actor_user_id is None:
            raise HTTPException(
                status_code=401,
                detail="X-Actor-User-Id header is required for temporary local API actor context.",
            )
        return x_actor_user_id

    raise HTTPException(
        status_code=401,
        detail="Temporary dev actor header is disabled. Use production auth when available.",
    )


def get_current_user(
    session: Annotated[Session, Depends(get_db_session)],
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
) -> User:
    if authorization is None:
        raise HTTPException(
            status_code=401,
            detail="Bearer token is required.",
        )
    return _current_user_from_authorization(session, authorization)


def _current_user_from_authorization(session: Session, authorization: str) -> User:
    token = _bearer_token_from_authorization(authorization)
    try:
        return AuthService(session).get_user_from_token(token)
    except AuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


def _bearer_token_from_authorization(authorization: str) -> str:
    scheme, separator, token = authorization.partition(" ")
    if not separator or scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(
            status_code=401,
            detail="Bearer token is required.",
        )
    return token.strip()


def raise_service_http_error(exc: Exception) -> NoReturn:
    if isinstance(exc, IntegrityError):
        _raise_integrity_http_error(exc)
    if isinstance(exc, PersistStatePermissionDeniedError):
        raise PersistStateHTTPException(
            status_code=403,
            detail="Срок действия публичной ссылки истёк.",
        ) from exc
    if isinstance(exc, PublicLinkTransitionError):
        raise HTTPException(
            status_code=409,
            detail="Недопустимый переход состояния публичной ссылки.",
        ) from exc
    if isinstance(exc, PublicLinkSubmittedReadOnlyError):
        raise HTTPException(
            status_code=403,
            detail=("Карточка уже отправлена на проверку. Редактирование временно недоступно."),
        ) from exc
    if isinstance(exc, PublicLinkReviewPermissionDeniedError):
        raise HTTPException(
            status_code=403,
            detail="Недостаточно прав для проверки этой публичной ссылки.",
        ) from exc
    if isinstance(exc, PermissionDeniedError):
        raise HTTPException(
            status_code=403,
            detail="Недостаточно прав для выполнения операции.",
        ) from exc
    if isinstance(exc, OrganizationNotFoundError):
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if isinstance(exc, UserAccessNotFoundError):
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if isinstance(exc, UserAccessConflictError):
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if isinstance(exc, PublicLinkError):
        raise HTTPException(
            status_code=400,
            detail="Операция с публичной ссылкой недоступна.",
        ) from exc
    if isinstance(exc, ReferenceEditLinkReadOnlyError):
        raise HTTPException(
            status_code=403, detail="Публичная ссылка на справочники доступна только для чтения."
        ) from exc
    if isinstance(exc, ReferenceEditLinkError):
        raise HTTPException(
            status_code=400, detail="Операция со ссылкой на справочники недоступна."
        ) from exc
    if isinstance(exc, CardServiceError):
        raise HTTPException(status_code=400, detail="Операция с карточкой недоступна.") from exc
    if isinstance(exc, RegistrySchemaError):
        raise HTTPException(
            status_code=400,
            detail="Операция со схемой реестра недоступна.",
        ) from exc
    if isinstance(
        exc,
        (
            AttachmentServiceError,
            DocumentServiceError,
            InvalidFieldValueError,
            ImportExportServiceError,
            OrganizationTopologyError,
            ReferenceListError,
            ReportServiceError,
            UserAccessError,
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


def _request_source(raw_source: str | None) -> str:
    return "mcp" if raw_source is not None and raw_source.strip().lower() == "mcp" else "api"


def _raise_integrity_http_error(exc: IntegrityError) -> NoReturn:
    message = str(getattr(exc, "orig", exc)).lower()
    if "uq_organizations_code" in message:
        raise HTTPException(status_code=409, detail="Organization code already exists.") from exc
    if "uq_registries_code" in message:
        raise HTTPException(status_code=409, detail="Registry code already exists.") from exc
    if "foreign key" in message or "check constraint" in message:
        raise HTTPException(status_code=422, detail="Integrity constraint violation.") from exc
    raise HTTPException(status_code=409, detail="Integrity constraint violation.") from exc
