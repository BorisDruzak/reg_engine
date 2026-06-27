from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_actor, get_db_session, get_organization_service
from app.schemas.organizations import OrganizationCreateRequest, OrganizationResponse
from app.services.organizations import OrganizationCreate, OrganizationService
from app.services.permissions import ActorContext

router = APIRouter(prefix="/organizations", tags=["organizations"])


@router.post(
    "/root",
    response_model=OrganizationResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_root_organization(
    payload: OrganizationCreateRequest,
    actor: Annotated[ActorContext, Depends(get_current_actor)],
    service: Annotated[OrganizationService, Depends(get_organization_service)],
    session: Annotated[Session, Depends(get_db_session)],
) -> OrganizationResponse:
    organization_id = service.create_root(
        actor,
        OrganizationCreate(code=payload.code, name=payload.name),
    )
    session.commit()
    return OrganizationResponse(id=organization_id)


@router.post(
    "/{parent_id}/children",
    response_model=OrganizationResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_child_organization(
    parent_id: UUID,
    payload: OrganizationCreateRequest,
    actor: Annotated[ActorContext, Depends(get_current_actor)],
    service: Annotated[OrganizationService, Depends(get_organization_service)],
    session: Annotated[Session, Depends(get_db_session)],
) -> OrganizationResponse:
    organization_id = service.create_child(
        actor,
        parent_id=parent_id,
        data=OrganizationCreate(code=payload.code, name=payload.name),
    )
    session.commit()
    return OrganizationResponse(id=organization_id)
