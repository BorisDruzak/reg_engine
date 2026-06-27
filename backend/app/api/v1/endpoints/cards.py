from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.api.dependencies import (
    get_card_query_service,
    get_card_service,
    get_current_actor,
    get_db_session,
)
from app.schemas.cards import (
    CardArchiveRequest,
    CardBlockInstanceCreateRequest,
    CardCreateRequest,
    CardListItemResponse,
    CardReadResponse,
    CardRelationCreateRequest,
    CardRelationResponse,
    CardSystemResponse,
    CardSystemUpdateRequest,
    CardTransferRequest,
    CardTransferResponse,
    CreatedIdResponse,
    FieldValueWriteRequest,
)
from app.services.card_queries import CardListFilters, CardQueryService
from app.services.cards import (
    CardCreate,
    CardRelationCreate,
    CardService,
    CardSystemUpdate,
    CardTransfer,
    FieldValueWrite,
)
from app.services.permissions import ActorContext

router = APIRouter(prefix="/cards", tags=["cards"])


@router.post("", response_model=CreatedIdResponse, status_code=status.HTTP_201_CREATED)
def create_card(
    payload: CardCreateRequest,
    actor: Annotated[ActorContext, Depends(get_current_actor)],
    service: Annotated[CardService, Depends(get_card_service)],
    session: Annotated[Session, Depends(get_db_session)],
) -> CreatedIdResponse:
    card_id = service.create_card(
        actor,
        CardCreate(
            registry_id=payload.registry_id,
            organization_id=payload.organization_id,
            org_unit_id=payload.org_unit_id,
            display_name=payload.display_name,
        ),
    )
    session.commit()
    return CreatedIdResponse(id=card_id)


@router.get("", response_model=tuple[CardListItemResponse, ...])
def list_cards(
    actor: Annotated[ActorContext, Depends(get_current_actor)],
    service: Annotated[CardQueryService, Depends(get_card_query_service)],
    registry_id: Annotated[UUID | None, Query()] = None,
    lifecycle_status: Annotated[str | None, Query()] = None,
    org_unit_id: Annotated[UUID | None, Query()] = None,
    display_name_query: Annotated[str | None, Query()] = None,
) -> tuple[CardListItemResponse, ...]:
    cards = service.list_cards(
        actor,
        CardListFilters(
            registry_id=registry_id,
            lifecycle_status=lifecycle_status,
            org_unit_id=org_unit_id,
            display_name_query=display_name_query,
        ),
    )
    return tuple(CardListItemResponse.model_validate(card) for card in cards)


@router.get("/{card_id}", response_model=CardReadResponse)
def get_card(
    card_id: UUID,
    actor: Annotated[ActorContext, Depends(get_current_actor)],
    service: Annotated[CardQueryService, Depends(get_card_query_service)],
) -> CardReadResponse:
    return CardReadResponse.model_validate(service.get_card(actor, card_id))


@router.patch("/{card_id}/system-fields", response_model=CardSystemResponse)
def update_card_system_fields(
    card_id: UUID,
    payload: CardSystemUpdateRequest,
    actor: Annotated[ActorContext, Depends(get_current_actor)],
    service: Annotated[CardService, Depends(get_card_service)],
    session: Annotated[Session, Depends(get_db_session)],
) -> CardSystemResponse:
    card = service.update_system_fields(
        actor,
        card_id=card_id,
        data=CardSystemUpdate(
            display_name=payload.display_name,
            org_unit_id=payload.org_unit_id,
            org_unit_id_set="org_unit_id" in payload.model_fields_set,
            public_view_enabled=payload.public_view_enabled,
            public_edit_enabled=payload.public_edit_enabled,
        ),
    )
    session.commit()
    return CardSystemResponse.model_validate(card)


@router.post(
    "/{card_id}/relations",
    response_model=CreatedIdResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_card_relation(
    card_id: UUID,
    payload: CardRelationCreateRequest,
    actor: Annotated[ActorContext, Depends(get_current_actor)],
    service: Annotated[CardService, Depends(get_card_service)],
    session: Annotated[Session, Depends(get_db_session)],
) -> CreatedIdResponse:
    relation_id = service.create_relation(
        actor,
        CardRelationCreate(
            source_card_id=card_id,
            target_card_id=payload.target_card_id,
            relation_type=payload.relation_type,
        ),
    )
    session.commit()
    return CreatedIdResponse(id=relation_id)


@router.get("/{card_id}/relations", response_model=tuple[CardRelationResponse, ...])
def list_card_relations(
    card_id: UUID,
    actor: Annotated[ActorContext, Depends(get_current_actor)],
    service: Annotated[CardService, Depends(get_card_service)],
) -> tuple[CardRelationResponse, ...]:
    relations = service.list_relations(actor, card_id)
    return tuple(CardRelationResponse.model_validate(relation) for relation in relations)


@router.post(
    "/{card_id}/block-instances",
    response_model=CreatedIdResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_block_instance(
    card_id: UUID,
    payload: CardBlockInstanceCreateRequest,
    actor: Annotated[ActorContext, Depends(get_current_actor)],
    service: Annotated[CardService, Depends(get_card_service)],
    session: Annotated[Session, Depends(get_db_session)],
) -> CreatedIdResponse:
    block_instance_id = service.create_block_instance(
        actor,
        card_id=card_id,
        block_id=payload.block_id,
        ordinal=payload.ordinal,
    )
    session.commit()
    return CreatedIdResponse(id=block_instance_id)


@router.post("/values", response_model=CreatedIdResponse, status_code=status.HTTP_201_CREATED)
def write_field_value(
    payload: FieldValueWriteRequest,
    actor: Annotated[ActorContext, Depends(get_current_actor)],
    service: Annotated[CardService, Depends(get_card_service)],
    session: Annotated[Session, Depends(get_db_session)],
) -> CreatedIdResponse:
    field_value_id = service.write_field_value(
        actor,
        FieldValueWrite(
            card_id=payload.card_id,
            block_instance_id=payload.block_instance_id,
            field_id=payload.field_id,
            value=payload.value,
        ),
    )
    session.commit()
    return CreatedIdResponse(id=field_value_id)


@router.post("/{card_id}/archive", status_code=status.HTTP_204_NO_CONTENT)
def archive_card(
    card_id: UUID,
    payload: CardArchiveRequest,
    actor: Annotated[ActorContext, Depends(get_current_actor)],
    service: Annotated[CardService, Depends(get_card_service)],
    session: Annotated[Session, Depends(get_db_session)],
) -> Response:
    service.archive_card(actor, card_id=card_id, reason=payload.reason)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{card_id}/transfer",
    response_model=CardTransferResponse,
    status_code=status.HTTP_201_CREATED,
)
def transfer_card(
    card_id: UUID,
    payload: CardTransferRequest,
    actor: Annotated[ActorContext, Depends(get_current_actor)],
    service: Annotated[CardService, Depends(get_card_service)],
    session: Annotated[Session, Depends(get_db_session)],
) -> CardTransferResponse:
    result = service.transfer_card(
        actor,
        CardTransfer(
            source_card_id=card_id,
            target_organization_id=payload.target_organization_id,
            target_org_unit_id=payload.target_org_unit_id,
            display_name=payload.display_name,
        ),
    )
    session.commit()
    return CardTransferResponse(
        target_card_id=result.target_card_id,
        relation_id=result.relation_id,
    )
