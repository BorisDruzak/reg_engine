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
    FieldValueListRead,
    FieldValueRead,
    FieldValuesBulkUpdate,
    FieldValueUpdate,
    OrganizationCardCreate,
)
from app.schemas.registries import ReferenceItemListRead, ReferenceItemRead
from app.services.cards import BulkFieldValueInput, CardService, FileRefValueRead
from app.services.cards import CardFieldRead as ServiceCardFieldRead
from app.services.cards import CardRead as ServiceCardRead

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


@router.post(
    "/organizations/{organization_id}/cards",
    response_model=CardSummaryRead,
    status_code=status.HTTP_201_CREATED,
)
def create_organization_card(
    organization_id: UUID,
    payload: OrganizationCardCreate,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> CardSummaryRead:
    try:
        card = CardService(session).create_card_for_organization_for_actor(
            actor_user_id=actor_user_id,
            organization_id=organization_id,
            display_name=payload.display_name,
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


@router.get(
    "/cards/{card_id}/fields/{field_id}/reference-items",
    response_model=ReferenceItemListRead,
)
def list_card_field_reference_items(
    card_id: UUID,
    field_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> ReferenceItemListRead:
    try:
        items = CardService(session).list_reference_items_for_card_field_for_actor(
            actor_user_id=actor_user_id,
            card_id=card_id,
            field_id=field_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return ReferenceItemListRead(items=[ReferenceItemRead.model_validate(item) for item in items])


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


@router.patch("/cards/{card_id}/values", response_model=FieldValueListRead)
def set_card_field_values(
    card_id: UUID,
    payload: FieldValuesBulkUpdate,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> FieldValueListRead:
    values = [
        BulkFieldValueInput(
            field_id=item.field_id,
            value=coerce_api_field_value(session, item.field_id, item.value),
            block_instance_id=item.block_instance_id,
        )
        for item in payload.values
    ]
    try:
        field_values = CardService(session).set_field_values_for_actor(
            actor_user_id=actor_user_id,
            card_id=card_id,
            values=values,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return FieldValueListRead(
        items=[field_value_to_read(session, field_value) for field_value in field_values]
    )


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
            org_unit_id=payload.org_unit_id,
            update_org_unit="org_unit_id" in payload.model_fields_set,
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


@router.delete(
    "/card-block-instances/{block_instance_id}", response_model=CardBlockInstanceSummaryRead
)
def archive_card_block_instance(
    block_instance_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> CardBlockInstanceSummaryRead:
    try:
        block_instance = CardService(session).archive_block_instance_for_actor(
            actor_user_id=actor_user_id,
            block_instance_id=block_instance_id,
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
                            field_code: _card_field_read_to_schema(field)
                            for field_code, field in instance.fields.items()
                        },
                    )
                    for instance in block.instances
                ],
            )
            for block_code, block in card_read.blocks.items()
        },
        fields={
            field_code: _card_field_read_to_schema(field)
            for field_code, field in card_read.fields.items()
        },
    )


def _card_field_read_to_schema(field: ServiceCardFieldRead) -> CardFieldRead:
    return CardFieldRead(
        field_id=field.field_id,
        code=field.code,
        field_type=field.field_type,
        value=_serialize_field_value(field.value),
    )


def _serialize_field_value(value: object | None) -> object | None:
    if isinstance(value, FileRefValueRead):
        return {
            "attachment_id": value.attachment_id,
            "title": value.title,
            "original_filename": value.original_filename,
            "content_type": value.content_type,
            "content_length_bytes": value.content_length_bytes,
            "scanner_status": value.scanner_status,
            "archived_at": value.archived_at,
        }
    return value


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
