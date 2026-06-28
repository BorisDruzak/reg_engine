from collections.abc import Generator
from typing import Annotated, NoReturn
from uuid import UUID

from fastapi import Header, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_session
from app.services.cards import CardServiceError, InvalidFieldValueError
from app.services.organizations import OrganizationNotFoundError
from app.services.permissions import PermissionDeniedError
from app.services.public_links import PublicLinkError
from app.services.references import ReferenceListError
from app.services.registry_schema import RegistrySchemaError


def get_db_session() -> Generator[Session, None, None]:
    for session in get_session():
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise


def get_actor_user_id(
    x_actor_user_id: Annotated[UUID | None, Header(alias="X-Actor-User-Id")] = None,
) -> UUID:
    if x_actor_user_id is None:
        raise HTTPException(
            status_code=401,
            detail="X-Actor-User-Id header is required for temporary local API actor context.",
        )
    return x_actor_user_id


def raise_service_http_error(exc: Exception) -> NoReturn:
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
