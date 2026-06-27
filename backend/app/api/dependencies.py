from collections.abc import Generator
from typing import Annotated, cast
from uuid import UUID

from fastapi import Depends
from sqlalchemy.orm import Session

from app.core.database import get_session
from app.repositories.audit import SQLAlchemyAuditRepository
from app.repositories.org_units import OrgUnitSessionLike, SQLAlchemyOrgUnitRepository
from app.repositories.organizations import OrganizationSessionLike, SQLAlchemyOrganizationRepository
from app.repositories.reference_lists import (
    ReferenceListSessionLike,
    SQLAlchemyReferenceListRepository,
)
from app.repositories.registry_schema import (
    RegistrySchemaSessionLike,
    SQLAlchemyRegistrySchemaRepository,
)
from app.services.audit import AuditService
from app.services.org_units import OrgUnitService
from app.services.organizations import OrganizationService
from app.services.permissions import ActorContext
from app.services.reference_lists import ReferenceListService
from app.services.registry_schema import RegistrySchemaService


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


def get_org_unit_service(
    session: Annotated[Session, Depends(get_db_session)],
) -> OrgUnitService:
    audit_repository = SQLAlchemyAuditRepository(session)
    audit_service = AuditService(audit_repository)
    org_unit_repository = SQLAlchemyOrgUnitRepository(cast(OrgUnitSessionLike, session))
    return OrgUnitService(org_unit_repository, audit_service)


def get_registry_schema_service(
    session: Annotated[Session, Depends(get_db_session)],
) -> RegistrySchemaService:
    audit_repository = SQLAlchemyAuditRepository(session)
    audit_service = AuditService(audit_repository)
    registry_repository = SQLAlchemyRegistrySchemaRepository(
        cast(RegistrySchemaSessionLike, session)
    )
    return RegistrySchemaService(registry_repository, audit_service)


def get_reference_list_service(
    session: Annotated[Session, Depends(get_db_session)],
) -> ReferenceListService:
    audit_repository = SQLAlchemyAuditRepository(session)
    audit_service = AuditService(audit_repository)
    reference_repository = SQLAlchemyReferenceListRepository(
        cast(ReferenceListSessionLike, session)
    )
    return ReferenceListService(reference_repository, audit_service)
