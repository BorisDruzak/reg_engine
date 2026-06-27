from collections.abc import Generator
from typing import Annotated, cast
from uuid import UUID

from fastapi import Depends
from sqlalchemy.orm import Session

from app.core.database import get_session
from app.repositories.audit import SQLAlchemyAuditRepository
from app.repositories.organizations import OrganizationSessionLike, SQLAlchemyOrganizationRepository
from app.services.audit import AuditService
from app.services.organizations import OrganizationService
from app.services.permissions import ActorContext


def get_current_actor() -> ActorContext:
    return ActorContext(
        user_id=UUID("00000000-0000-0000-0000-000000000000"),
        is_superuser=True,
        grants=(),
    )


def get_db_session() -> Generator[Session, None, None]:
    yield from get_session()


def get_organization_service(
    session: Annotated[Session, Depends(get_db_session)],
) -> OrganizationService:
    audit_repository = SQLAlchemyAuditRepository(session)
    audit_service = AuditService(audit_repository)
    organization_repository = SQLAlchemyOrganizationRepository(
        cast(OrganizationSessionLike, session)
    )
    return OrganizationService(organization_repository, audit_service)
