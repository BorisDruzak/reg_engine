from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_actor_user_id, get_db_session, raise_service_http_error
from app.api.v1.endpoints._field_values import coerce_api_field_value, field_value_to_read
from app.models import Card
from app.schemas.cards import (
    CardBlockInstanceRead,
    CardBlockInstanceSummaryRead,
    CardBlockRead,
    CardCreate,
    CardFieldRead,
    CardListRead,
    CardRead,
    CardSummaryRead,
    CardTransferRequest,
    CardUpdate,
    FieldValueRead,
    FieldValueUpdate,
)
from app.services.cards import CardRead as ServiceCardRead
from app.services.cards import CardService

router = APIRouter(tags=["cards"])


@router.post(
    "/registries/{registry_id}/cards",
    response_model=CardSummaryRead,
    status_code=status.HTTP_201_CREATED,
)
def create_card(
    registry_id: UUID,
    payload: CardCreate,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> CardSummaryRead:
    try:
        card = CardService(session).create_card_for_actor(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
            organization_id=payload.organization_id,
            display_name=payload.display_name,
            org_unit_id=payload.org_unit_id,
            public_view_enabled=payload.public_view_enabled,
            public_edit_enabled=payload.public_edit_enabled,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return _card_to_summary(card)


@router.get("/registries/{registry_id}/cards", response_model=CardListRead)
def list_cards(
    registry_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
    organization_id: Annotated[UUID | None, Query()] = None,
    include_archive: Annotated[bool, Query()] = False,
    q: Annotated[str | None, Query()] = None,
) -> CardListRead:
    try:
        cards = CardService(session).list_visible_cards(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
            organization_id=organization_id,
            include_archive=include_archive,
            query=q,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return CardListRead(items=[_card_to_summary(card) for card in cards])


@router.get("/cards/{card_id}", response_model=CardRead)
def read_card(
    card_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
    include_archive: Annotated[bool, Query()] = False,
) -> CardRead:
    try:
        card_read = CardService(session).read_card_for_actor(
            actor_user_id=actor_user_id,
            card_id=card_id,
            include_archive=include_archive,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return _card_read_to_schema(card_read)


@router.patch("/cards/{card_id}/fields/{field_id}", response_model=FieldValueRead)
def set_card_field_value(
    card_id: UUID,
    field_id: UUID,
    payload: FieldValueUpdate,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> FieldValueRead:
    value = coerce_api_field_value(session, field_id, payload.value)
    try:
        field_value = CardService(session).set_field_value_for_actor(
            actor_user_id=actor_user_id,
            card_id=card_id,
            field_id=field_id,
            value=value,
            block_instance_id=payload.block_instance_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return field_value_to_read(session, field_value)


@router.patch("/cards/{card_id}", response_model=CardSummaryRead)
def update_card(
    card_id: UUID,
    payload: CardUpdate,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> CardSummaryRead:
    try:
        card = CardService(session).update_card_for_actor(
            actor_user_id=actor_user_id,
            card_id=card_id,
            display_name=payload.display_name,
            public_view_enabled=payload.public_view_enabled,
            public_edit_enabled=payload.public_edit_enabled,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return _card_to_summary(card)


@router.delete("/cards/{card_id}", response_model=CardSummaryRead)
def archive_card(
    card_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> CardSummaryRead:
    try:
        card = CardService(session).archive_card_for_actor(
            actor_user_id=actor_user_id,
            card_id=card_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return _card_to_summary(card)


@router.post(
    "/cards/{card_id}/blocks/{block_id}/instances",
    response_model=CardBlockInstanceSummaryRead,
    status_code=status.HTTP_201_CREATED,
)
def create_card_block_instance(
    card_id: UUID,
    block_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> CardBlockInstanceSummaryRead:
    try:
        block_instance = CardService(session).create_block_instance_for_actor(
            actor_user_id=actor_user_id,
            card_id=card_id,
            block_id=block_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return CardBlockInstanceSummaryRead(
        id=block_instance.id,
        card_id=block_instance.card_id,
        block_id=block_instance.block_id,
        ordinal=block_instance.ordinal,
    )


@router.post(
    "/cards/{card_id}/transfer",
    response_model=CardSummaryRead,
    status_code=status.HTTP_201_CREATED,
)
def transfer_card(
    card_id: UUID,
    payload: CardTransferRequest,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> CardSummaryRead:
    try:
        card = CardService(session).transfer_card_for_actor(
            actor_user_id=actor_user_id,
            card_id=card_id,
            target_organization_id=payload.target_organization_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return _card_to_summary(card)


def _card_read_to_schema(card_read: ServiceCardRead) -> CardRead:
    return CardRead(
        id=card_read.card_id,
        registry_id=card_read.registry_id,
        organization_id=card_read.organization_id,
        display_name=card_read.display_name,
        blocks={
            block_code: CardBlockRead(
                block_id=block.block_id,
                code=block.code,
                instances=[
                    CardBlockInstanceRead(
                        block_instance_id=instance.block_instance_id,
                        ordinal=instance.ordinal,
                        fields={
                            field_code: CardFieldRead(
                                field_id=field.field_id,
                                code=field.code,
                                field_type=field.field_type,
                                value=field.value,
                            )
                            for field_code, field in instance.fields.items()
                        },
                    )
                    for instance in block.instances
                ],
            )
            for block_code, block in card_read.blocks.items()
        },
        fields={
            field_code: CardFieldRead(
                field_id=field.field_id,
                code=field.code,
                field_type=field.field_type,
                value=field.value,
            )
            for field_code, field in card_read.fields.items()
        },
    )


def _card_to_summary(card: Card) -> CardSummaryRead:
    return CardSummaryRead(
        id=card.id,
        registry_id=card.registry_id,
        organization_id=card.organization_id,
        org_unit_id=card.org_unit_id,
        display_name=card.display_name,
        lifecycle_status=card.lifecycle_status,
        public_view_enabled=card.public_view_enabled,
        public_edit_enabled=card.public_edit_enabled,
    )
