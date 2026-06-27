from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_actor, get_db_session, get_organization_service
from app.schemas.organizations import (
    OrganizationCreateRequest,
    OrganizationReadResponse,
    OrganizationResponse,
    OrganizationTreeNodeResponse,
    OrganizationUpdateRequest,
)
from app.services.organizations import OrganizationCreate, OrganizationService, OrganizationUpdate
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


@router.get("/tree", response_model=tuple[OrganizationTreeNodeResponse, ...])
def get_organization_tree(
    actor: Annotated[ActorContext, Depends(get_current_actor)],
    service: Annotated[OrganizationService, Depends(get_organization_service)],
    root_id: Annotated[UUID | None, Query()] = None,
) -> tuple[OrganizationTreeNodeResponse, ...]:
    nodes = service.get_tree(actor, root_id=root_id)
    return tuple(OrganizationTreeNodeResponse.model_validate(node) for node in nodes)


@router.get("/{organization_id}", response_model=OrganizationReadResponse)
def get_organization(
    organization_id: UUID,
    actor: Annotated[ActorContext, Depends(get_current_actor)],
    service: Annotated[OrganizationService, Depends(get_organization_service)],
) -> OrganizationReadResponse:
    return OrganizationReadResponse.model_validate(service.get_organization(actor, organization_id))


@router.patch("/{organization_id}", response_model=OrganizationReadResponse)
def update_organization(
    organization_id: UUID,
    payload: OrganizationUpdateRequest,
    actor: Annotated[ActorContext, Depends(get_current_actor)],
    service: Annotated[OrganizationService, Depends(get_organization_service)],
    session: Annotated[Session, Depends(get_db_session)],
) -> OrganizationReadResponse:
    organization = service.update_organization(
        actor,
        organization_id=organization_id,
        data=OrganizationUpdate(code=payload.code, name=payload.name),
    )
    session.commit()
    return OrganizationReadResponse.model_validate(organization)


@router.post("/{organization_id}/archive", status_code=status.HTTP_204_NO_CONTENT)
def archive_organization(
    organization_id: UUID,
    actor: Annotated[ActorContext, Depends(get_current_actor)],
    service: Annotated[OrganizationService, Depends(get_organization_service)],
    session: Annotated[Session, Depends(get_db_session)],
) -> Response:
    service.archive_organization(actor, organization_id)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
