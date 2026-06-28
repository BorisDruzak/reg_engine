from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_actor_user_id, get_db_session, raise_service_http_error
from app.api.v1.endpoints._field_values import coerce_api_field_value, field_value_to_read
from app.schemas.cards import FieldValueRead
from app.schemas.public_links import PublicLinkCreate, PublicLinkEditRequest, PublicLinkTokenRead
from app.services.public_links import PublicLinkService

router = APIRouter(tags=["public-links"])


@router.post(
    "/cards/{card_id}/public-links",
    response_model=PublicLinkTokenRead,
    status_code=status.HTTP_201_CREATED,
)
def create_public_link(
    card_id: UUID,
    payload: PublicLinkCreate,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> PublicLinkTokenRead:
    try:
        token = PublicLinkService(session).create_public_link_for_actor(
            actor_user_id=actor_user_id,
            card_id=card_id,
            expires_in_days=payload.expires_in_days,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return PublicLinkTokenRead(
        id=token.public_link.id,
        card_id=token.public_link.card_id,
        raw_token=token.raw_token,
        status=token.public_link.status,
        can_edit=token.public_link.can_edit,
        expires_at=token.public_link.expires_at,
    )


@router.post("/public-links/edit", response_model=FieldValueRead)
def edit_card_field_with_public_link(
    payload: PublicLinkEditRequest,
    session: Annotated[Session, Depends(get_db_session)],
) -> FieldValueRead:
    value = coerce_api_field_value(session, payload.field_id, payload.value)
    try:
        field_value = PublicLinkService(session).edit_card_field_with_token(
            raw_token=payload.raw_token,
            field_id=payload.field_id,
            value=value,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return field_value_to_read(session, field_value)
