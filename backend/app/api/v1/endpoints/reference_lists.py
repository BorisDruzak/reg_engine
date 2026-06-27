from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_actor, get_db_session, get_reference_list_service
from app.schemas.reference_lists import (
    CreatedIdResponse,
    ReferenceItemCreateRequest,
    ReferenceItemResponse,
    ReferenceItemUpdateRequest,
    ReferenceListCreateRequest,
    ReferenceListResponse,
    ReferenceListUpdateRequest,
)
from app.services.permissions import ActorContext
from app.services.reference_lists import (
    ReferenceItemCreate,
    ReferenceItemUpdate,
    ReferenceListCreate,
    ReferenceListService,
    ReferenceListUpdate,
)

router = APIRouter(prefix="/reference-lists", tags=["reference-lists"])


@router.post("", response_model=CreatedIdResponse, status_code=status.HTTP_201_CREATED)
def create_reference_list(
    payload: ReferenceListCreateRequest,
    actor: Annotated[ActorContext, Depends(get_current_actor)],
    service: Annotated[ReferenceListService, Depends(get_reference_list_service)],
    session: Annotated[Session, Depends(get_db_session)],
) -> CreatedIdResponse:
    list_id = service.create_list(
        actor,
        ReferenceListCreate(
            registry_id=payload.registry_id,
            owner_organization_id=payload.owner_organization_id,
            code=payload.code,
            name=payload.name,
            locked_for_descendants=payload.locked_for_descendants,
            inherit_to_descendants=payload.inherit_to_descendants,
        ),
    )
    session.commit()
    return CreatedIdResponse(id=list_id)


@router.post(
    "/{list_id}/items", response_model=CreatedIdResponse, status_code=status.HTTP_201_CREATED
)
def create_reference_item(
    list_id: UUID,
    payload: ReferenceItemCreateRequest,
    actor: Annotated[ActorContext, Depends(get_current_actor)],
    service: Annotated[ReferenceListService, Depends(get_reference_list_service)],
    session: Annotated[Session, Depends(get_db_session)],
) -> CreatedIdResponse:
    item_id = service.create_item(
        actor,
        list_id=list_id,
        data=ReferenceItemCreate(code=payload.code, label=payload.label),
    )
    session.commit()
    return CreatedIdResponse(id=item_id)


@router.patch("/{list_id}", response_model=ReferenceListResponse)
def update_reference_list(
    list_id: UUID,
    payload: ReferenceListUpdateRequest,
    actor: Annotated[ActorContext, Depends(get_current_actor)],
    service: Annotated[ReferenceListService, Depends(get_reference_list_service)],
    session: Annotated[Session, Depends(get_db_session)],
) -> ReferenceListResponse:
    reference_list = service.update_list(
        actor,
        list_id,
        ReferenceListUpdate(code=payload.code, name=payload.name),
    )
    session.commit()
    return ReferenceListResponse.model_validate(reference_list)


@router.patch("/items/{item_id}", response_model=ReferenceItemResponse)
def update_reference_item(
    item_id: UUID,
    payload: ReferenceItemUpdateRequest,
    actor: Annotated[ActorContext, Depends(get_current_actor)],
    service: Annotated[ReferenceListService, Depends(get_reference_list_service)],
    session: Annotated[Session, Depends(get_db_session)],
) -> ReferenceItemResponse:
    reference_item = service.update_item(
        actor,
        item_id,
        ReferenceItemUpdate(code=payload.code, label=payload.label),
    )
    session.commit()
    return ReferenceItemResponse.model_validate(reference_item)


@router.post("/{list_id}/archive", status_code=status.HTTP_204_NO_CONTENT)
def archive_reference_list(
    list_id: UUID,
    actor: Annotated[ActorContext, Depends(get_current_actor)],
    service: Annotated[ReferenceListService, Depends(get_reference_list_service)],
    session: Annotated[Session, Depends(get_db_session)],
) -> Response:
    service.archive_list(actor, list_id)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/items/{item_id}/archive", status_code=status.HTTP_204_NO_CONTENT)
def archive_reference_item(
    item_id: UUID,
    actor: Annotated[ActorContext, Depends(get_current_actor)],
    service: Annotated[ReferenceListService, Depends(get_reference_list_service)],
    session: Annotated[Session, Depends(get_db_session)],
) -> Response:
    service.archive_item(actor, item_id)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
