from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_actor_user_id, get_db_session, raise_service_http_error
from app.schemas.card_creation_links import (
    CardCreationLinkCardListRead,
    CardCreationLinkCreate,
    CardCreationLinkCreatedCardRead,
    CardCreationLinkListRead,
    CardCreationLinkOrganizationRead,
    CardCreationLinkRead,
)
from app.services.card_creation_links import (
    CardCreationLinkCardValue,
    CardCreationLinkService,
    CardCreationLinkValue,
)

router = APIRouter(tags=["card-creation-links"])


@router.post(
    "/registries/{registry_id}/card-creation-links",
    response_model=CardCreationLinkRead,
    status_code=status.HTTP_201_CREATED,
)
def create_card_creation_link(
    registry_id: UUID,
    payload: CardCreationLinkCreate,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> CardCreationLinkRead:
    service = CardCreationLinkService(session)
    try:
        token = service.create_for_actor(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
            card_template_id=payload.card_template_id,
            organization_ids=payload.organization_ids,
        )
        return _creation_link_to_read(
            service.read_for_actor(
                actor_user_id=actor_user_id,
                creation_link_id=token.creation_link.id,
            )
        )
    except Exception as exc:
        raise_service_http_error(exc)


@router.get(
    "/registries/{registry_id}/card-creation-links",
    response_model=CardCreationLinkListRead,
)
def list_card_creation_links(
    registry_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> CardCreationLinkListRead:
    try:
        items = CardCreationLinkService(session).list_for_actor(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return CardCreationLinkListRead(items=[_creation_link_to_read(item) for item in items])


@router.delete("/card-creation-links/{creation_link_id}", response_model=CardCreationLinkRead)
def close_card_creation_link(
    creation_link_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> CardCreationLinkRead:
    service = CardCreationLinkService(session)
    try:
        service.close_for_actor(
            actor_user_id=actor_user_id,
            creation_link_id=creation_link_id,
        )
        return _creation_link_to_read(
            service.read_for_actor(
                actor_user_id=actor_user_id,
                creation_link_id=creation_link_id,
            )
        )
    except Exception as exc:
        raise_service_http_error(exc)


@router.get("/cards/{card_id}/creation-links", response_model=CardCreationLinkCardListRead)
def list_card_creation_links_for_card(
    card_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> CardCreationLinkCardListRead:
    try:
        items = CardCreationLinkService(session).list_for_card_for_actor(
            actor_user_id=actor_user_id,
            card_id=card_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return CardCreationLinkCardListRead(items=[_card_to_read(item) for item in items])


def _creation_link_to_read(value: CardCreationLinkValue) -> CardCreationLinkRead:
    return CardCreationLinkRead(
        id=value.creation_link.id,
        registry_id=value.creation_link.registry_id,
        card_template_id=value.creation_link.card_template_id,
        card_template_name=value.card_template_name,
        raw_token=value.raw_token,
        created_at=value.creation_link.created_at,
        closed_at=value.creation_link.closed_at,
        organizations=[
            CardCreationLinkOrganizationRead(id=item.id, name=item.name)
            for item in value.organizations
        ],
        created_cards=[_card_to_read(item) for item in value.created_cards],
    )


def _card_to_read(value: CardCreationLinkCardValue) -> CardCreationLinkCreatedCardRead:
    return CardCreationLinkCreatedCardRead(
        card_id=value.card_id,
        display_name=value.display_name,
        organization_id=value.organization_id,
        organization_name=value.organization_name,
        child_public_link_id=value.child_public_link_id,
        child_raw_token=value.child_raw_token,
    )
