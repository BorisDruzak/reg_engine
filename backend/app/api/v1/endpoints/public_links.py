from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_actor, get_db_session, get_public_link_service
from app.schemas.public_links import (
    CreatedIdResponse,
    PublicFieldValueWriteRequest,
    PublicLinkCardAccessResponse,
    PublicLinkCreatedResponse,
    PublicLinkCreateRequest,
    PublicLinkReadResponse,
)
from app.services.permissions import ActorContext
from app.services.public_links import PublicFieldValueWrite, PublicLinkCreate, PublicLinkService

router = APIRouter(prefix="/public-links", tags=["public-links"])


@router.post("", response_model=PublicLinkCreatedResponse, status_code=status.HTTP_201_CREATED)
def create_public_link(
    payload: PublicLinkCreateRequest,
    actor: Annotated[ActorContext, Depends(get_current_actor)],
    service: Annotated[PublicLinkService, Depends(get_public_link_service)],
    session: Annotated[Session, Depends(get_db_session)],
) -> PublicLinkCreatedResponse:
    created = service.create_link(
        actor,
        PublicLinkCreate(
            card_id=payload.card_id,
            can_view=payload.can_view,
            can_edit=payload.can_edit,
            expires_at=payload.expires_at,
            max_uses=payload.max_uses,
        ),
    )
    session.commit()
    return PublicLinkCreatedResponse.model_validate(created)


@router.get("", response_model=tuple[PublicLinkReadResponse, ...])
def list_public_links(
    card_id: Annotated[UUID, Query()],
    actor: Annotated[ActorContext, Depends(get_current_actor)],
    service: Annotated[PublicLinkService, Depends(get_public_link_service)],
) -> tuple[PublicLinkReadResponse, ...]:
    links = service.list_links(actor, card_id)
    return tuple(PublicLinkReadResponse.model_validate(link) for link in links)


@router.post("/{link_id}/disable", status_code=status.HTTP_204_NO_CONTENT)
def disable_public_link(
    link_id: UUID,
    actor: Annotated[ActorContext, Depends(get_current_actor)],
    service: Annotated[PublicLinkService, Depends(get_public_link_service)],
    session: Annotated[Session, Depends(get_db_session)],
) -> Response:
    service.disable_link(actor, link_id)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/public/{raw_token}", response_model=PublicLinkCardAccessResponse)
def get_public_link_card(
    raw_token: str,
    service: Annotated[PublicLinkService, Depends(get_public_link_service)],
) -> PublicLinkCardAccessResponse:
    return PublicLinkCardAccessResponse.model_validate(service.get_public_card(raw_token))


@router.post(
    "/public/{raw_token}/values",
    response_model=CreatedIdResponse,
    status_code=status.HTTP_201_CREATED,
)
def update_public_field_value(
    raw_token: str,
    payload: PublicFieldValueWriteRequest,
    service: Annotated[PublicLinkService, Depends(get_public_link_service)],
    session: Annotated[Session, Depends(get_db_session)],
) -> CreatedIdResponse:
    field_value_id = service.update_value(
        raw_token,
        PublicFieldValueWrite(
            block_instance_id=payload.block_instance_id,
            field_id=payload.field_id,
            value=payload.value,
        ),
    )
    session.commit()
    return CreatedIdResponse(id=field_value_id)
