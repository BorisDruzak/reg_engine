from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_actor_user_id, get_db_session, raise_service_http_error
from app.schemas.organizations import OrganizationCreate, OrganizationRead
from app.services.organizations import OrganizationService

router = APIRouter(prefix="/organizations", tags=["organizations"])


@router.post("", response_model=OrganizationRead, status_code=status.HTTP_201_CREATED)
def create_organization(
    payload: OrganizationCreate,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> OrganizationRead:
    service = OrganizationService(session)
    try:
        if payload.parent_id is None:
            organization = service.create_root_for_actor(
                actor_user_id=actor_user_id,
                code=payload.code,
                name=payload.name,
                organization_type=payload.organization_type,
            )
        else:
            organization = service.create_child_for_actor(
                actor_user_id=actor_user_id,
                parent_id=payload.parent_id,
                code=payload.code,
                name=payload.name,
                organization_type=payload.organization_type,
            )
    except Exception as exc:
        raise_service_http_error(exc)
    return OrganizationRead.model_validate(organization)


@router.get("/{organization_id}", response_model=OrganizationRead)
def read_organization(
    organization_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> OrganizationRead:
    try:
        organization = OrganizationService(session).get_organization_for_actor(
            actor_user_id=actor_user_id,
            organization_id=organization_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return OrganizationRead.model_validate(organization)
