from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_actor, get_db_session, get_org_unit_service
from app.schemas.org_units import (
    OrgUnitCreateRequest,
    OrgUnitCreateResponse,
    OrgUnitResponse,
    OrgUnitUpdateRequest,
)
from app.services.org_units import OrgUnitCreate, OrgUnitService, OrgUnitUpdate
from app.services.permissions import ActorContext

router = APIRouter(prefix="/org-units", tags=["org-units"])


@router.post("", response_model=OrgUnitCreateResponse, status_code=status.HTTP_201_CREATED)
def create_org_unit(
    payload: OrgUnitCreateRequest,
    actor: Annotated[ActorContext, Depends(get_current_actor)],
    service: Annotated[OrgUnitService, Depends(get_org_unit_service)],
    session: Annotated[Session, Depends(get_db_session)],
) -> OrgUnitCreateResponse:
    org_unit_id = service.create(
        organization_id=payload.organization_id,
        data=OrgUnitCreate(
            code=payload.code,
            name=payload.name,
            parent_id=payload.parent_id,
        ),
        created_by=actor.user_id,
        actor=actor,
    )
    session.commit()
    return OrgUnitCreateResponse(id=org_unit_id)


@router.get("", response_model=list[OrgUnitResponse])
def list_org_units(
    organization_id: Annotated[UUID, Query()],
    service: Annotated[OrgUnitService, Depends(get_org_unit_service)],
) -> list[OrgUnitResponse]:
    return [
        OrgUnitResponse.model_validate(unit)
        for unit in service.list_by_organization(organization_id)
    ]


@router.get("/{org_unit_id}", response_model=OrgUnitResponse)
def get_org_unit(
    org_unit_id: UUID,
    service: Annotated[OrgUnitService, Depends(get_org_unit_service)],
) -> OrgUnitResponse:
    return OrgUnitResponse.model_validate(service.get(org_unit_id))


@router.patch("/{org_unit_id}", response_model=OrgUnitResponse)
def update_org_unit(
    org_unit_id: UUID,
    payload: OrgUnitUpdateRequest,
    actor: Annotated[ActorContext, Depends(get_current_actor)],
    service: Annotated[OrgUnitService, Depends(get_org_unit_service)],
    session: Annotated[Session, Depends(get_db_session)],
) -> OrgUnitResponse:
    unit = service.update(
        org_unit_id,
        OrgUnitUpdate(
            code=payload.code,
            name=payload.name,
            parent_id=payload.parent_id,
            parent_id_set="parent_id" in payload.model_fields_set,
        ),
        actor=actor,
    )
    session.commit()
    return OrgUnitResponse.model_validate(unit)


@router.post("/{org_unit_id}/archive", status_code=status.HTTP_204_NO_CONTENT)
def archive_org_unit(
    org_unit_id: UUID,
    actor: Annotated[ActorContext, Depends(get_current_actor)],
    service: Annotated[OrgUnitService, Depends(get_org_unit_service)],
    session: Annotated[Session, Depends(get_db_session)],
) -> Response:
    service.archive(org_unit_id, actor=actor)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
