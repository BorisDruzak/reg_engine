import json
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_actor_user_id, get_db_session, raise_service_http_error
from app.api.v1.endpoints._field_values import coerce_api_field_value, field_value_to_read
from app.models import Card
from app.schemas.card_change_notifications import (
    CardChangeNotificationSubscriptionRead,
    CardChangeNotificationSubscriptionUpdate,
)
from app.schemas.cards import (
    CardBlockInstanceRead,
    CardBlockInstanceSummaryRead,
    CardBlockRead,
    CardCreate,
    CardCreationPreviewBlockRead,
    CardCreationPreviewFieldRead,
    CardCreationPreviewOptionRead,
    CardCreationPreviewRead,
    CardDraftCreateRequest,
    CardDraftPublicLinkRead,
    CardDraftPublicLinkRequest,
    CardFieldOptionListRead,
    CardFieldOptionRead,
    CardFieldRead,
    CardFirstSaveRequest,
    CardListFieldValueRead,
    CardListRead,
    CardOrganizationUpdate,
    CardPublicAccessRead,
    CardPublicAccessUpdate,
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
from app.services.card_change_notifications import CardChangeNotificationService
from app.services.card_public_access import CardPublicAccessService
from app.services.cards import (
    BulkFieldValueInput,
    CardFieldFilterInput,
    CardService,
    CardServiceError,
    FileRefValueRead,
)
from app.services.cards import CardFieldRead as ServiceCardFieldRead
from app.services.cards import CardListFieldRead as ServiceCardListFieldRead
from app.services.cards import CardRead as ServiceCardRead

router = APIRouter(tags=["cards"])


@router.get(
    "/organizations/{organization_id}/card-templates/{card_template_id}/creation-preview",
    response_model=CardCreationPreviewRead,
)
def read_organization_card_creation_preview(
    organization_id: UUID,
    card_template_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> CardCreationPreviewRead:
    try:
        preview = CardService(session).preview_card_creation_for_actor(
            actor_user_id=actor_user_id,
            organization_id=organization_id,
            card_template_id=card_template_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return CardCreationPreviewRead(
        organization_id=preview.organization_id,
        card_template_id=preview.card_template_id,
        display_name=preview.display_name,
        blocks=[
            CardCreationPreviewBlockRead(
                block_id=block.block_id,
                code=block.code,
                title=block.title,
                description=block.description,
                is_repeatable=block.is_repeatable,
                fields=[
                    CardCreationPreviewFieldRead(
                        field_id=field.field_id,
                        code=field.code,
                        label=field.label,
                        description=field.description,
                        field_type=field.field_type,
                        required_mode=field.required_mode,
                        options=[
                            CardCreationPreviewOptionRead(
                                id=option.id,
                                label=option.label,
                                archived=option.archived,
                            )
                            for option in field.options
                        ],
                    )
                    for field in block.fields
                ],
            )
            for block in preview.blocks
        ],
    )


@router.post(
    "/organizations/{organization_id}/cards/draft",
    response_model=CardSummaryRead,
    status_code=status.HTTP_201_CREATED,
)
def create_organization_card_draft(
    organization_id: UUID,
    payload: CardDraftCreateRequest,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> CardSummaryRead:
    try:
        card_service = CardService(session)
        card = card_service.create_card_draft_for_actor(
            actor_user_id=actor_user_id,
            organization_id=organization_id,
            display_name=payload.display_name,
            card_template_id=payload.card_template_id,
            public_access=payload.public_access,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return _card_to_summary(card, card_service)


@router.post(
    "/organizations/{organization_id}/cards/first-save",
    response_model=CardSummaryRead,
    status_code=status.HTTP_201_CREATED,
)
def first_save_organization_card(
    organization_id: UUID,
    payload: CardFirstSaveRequest,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> CardSummaryRead:
    try:
        card_service = CardService(session)
        card = card_service.create_card_with_first_value_for_actor(
            actor_user_id=actor_user_id,
            organization_id=organization_id,
            display_name=payload.display_name,
            card_template_id=payload.card_template_id,
            public_view_enabled=payload.public_view_enabled,
            public_edit_enabled=payload.public_edit_enabled,
            public_access=payload.public_access,
            field_id=payload.field_id,
            value=coerce_api_field_value(session, payload.field_id, payload.value),
            block_instance_id=payload.block_instance_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return _card_to_summary(card, card_service)


@router.post(
    "/organizations/{organization_id}/cards/draft-public-link",
    response_model=CardDraftPublicLinkRead,
    status_code=status.HTTP_201_CREATED,
)
def create_organization_card_draft_with_public_link(
    organization_id: UUID,
    payload: CardDraftPublicLinkRequest,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> CardDraftPublicLinkRead:
    try:
        card_service = CardService(session)
        created = card_service.create_card_draft_with_public_link_for_actor(
            actor_user_id=actor_user_id,
            organization_id=organization_id,
            display_name=payload.display_name,
            card_template_id=payload.card_template_id,
            public_access=payload.public_access,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return CardDraftPublicLinkRead(
        card=_card_to_summary(created.card, card_service),
        raw_token=created.public_link.raw_token,
        public_link_id=created.public_link.public_link.id,
    )


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
        card_service = CardService(session)
        card = card_service.create_card_for_actor(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
            organization_id=payload.organization_id,
            display_name=payload.display_name,
            card_template_id=payload.card_template_id,
            org_unit_id=payload.org_unit_id,
            public_view_enabled=payload.public_view_enabled,
            public_edit_enabled=payload.public_edit_enabled,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return _card_to_summary(card, card_service)


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
        card_service = CardService(session)
        card = card_service.create_card_for_organization_for_actor(
            actor_user_id=actor_user_id,
            organization_id=organization_id,
            display_name=payload.display_name,
            card_template_id=payload.card_template_id,
            public_view_enabled=payload.public_view_enabled,
            public_edit_enabled=payload.public_edit_enabled,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return _card_to_summary(card, card_service)


@router.get("/registries/{registry_id}/cards", response_model=CardListRead)
def list_cards(
    registry_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
    organization_id: Annotated[UUID | None, Query()] = None,
    organization_ids: Annotated[list[UUID] | None, Query()] = None,
    include_descendant_organizations: Annotated[bool, Query()] = True,
    include_archive: Annotated[bool, Query()] = False,
    q: Annotated[str | None, Query()] = None,
    filters: Annotated[str | None, Query()] = None,
    card_template_ids: Annotated[list[UUID] | None, Query()] = None,
) -> CardListRead:
    try:
        field_filters = _parse_card_field_filters(filters)
        card_service = CardService(session)
        cards = card_service.list_visible_cards(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
            organization_id=organization_id,
            organization_ids=organization_ids,
            include_descendant_organizations=include_descendant_organizations,
            include_archive=include_archive,
            query=q,
            field_filters=field_filters,
            card_template_ids=card_template_ids,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return CardListRead(items=[_card_to_summary(card, card_service) for card in cards])


@router.get("/organizations/{organization_id}/cards", response_model=CardListRead)
def list_organization_cards(
    organization_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
    scope_organization_id: Annotated[UUID | None, Query(alias="organization_id")] = None,
    organization_ids: Annotated[list[UUID] | None, Query()] = None,
    include_descendant_organizations: Annotated[bool, Query()] = True,
    include_archive: Annotated[bool, Query()] = False,
    q: Annotated[str | None, Query()] = None,
    filters: Annotated[str | None, Query()] = None,
    card_template_ids: Annotated[list[UUID] | None, Query()] = None,
) -> CardListRead:
    try:
        field_filters = _parse_card_field_filters(filters)
        card_service = CardService(session)
        cards = card_service.list_visible_cards_for_organization_for_actor(
            actor_user_id=actor_user_id,
            resolver_organization_id=organization_id,
            organization_id=scope_organization_id,
            organization_ids=organization_ids,
            include_descendant_organizations=include_descendant_organizations,
            include_archive=include_archive,
            query=q,
            field_filters=field_filters,
            card_template_ids=card_template_ids,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return CardListRead(items=[_card_to_summary(card, card_service) for card in cards])


@router.get(
    "/cards/{card_id}/change-notification-subscription",
    response_model=CardChangeNotificationSubscriptionRead,
)
def get_card_change_notification_subscription(
    card_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> CardChangeNotificationSubscriptionRead:
    try:
        enabled = CardChangeNotificationService(session).get_card_subscription_for_actor(
            actor_user_id=actor_user_id,
            card_id=card_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return CardChangeNotificationSubscriptionRead(enabled=enabled)


@router.put(
    "/cards/{card_id}/change-notification-subscription",
    response_model=CardChangeNotificationSubscriptionRead,
)
def set_card_change_notification_subscription(
    card_id: UUID,
    payload: CardChangeNotificationSubscriptionUpdate,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> CardChangeNotificationSubscriptionRead:
    try:
        enabled = CardChangeNotificationService(session).set_card_subscription_for_actor(
            actor_user_id=actor_user_id,
            card_id=card_id,
            enabled=payload.enabled,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return CardChangeNotificationSubscriptionRead(enabled=enabled)


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


@router.get(
    "/cards/{card_id}/fields/{field_id}/org-unit-options",
    response_model=CardFieldOptionListRead,
)
def list_card_field_org_unit_options(
    card_id: UUID,
    field_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> CardFieldOptionListRead:
    try:
        options = CardService(session).list_org_unit_options_for_actor(
            actor_user_id=actor_user_id,
            card_id=card_id,
            field_id=field_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return CardFieldOptionListRead(
        items=[
            CardFieldOptionRead(id=option.id, label=option.label, archived=option.archived)
            for option in options
        ]
    )


@router.get(
    "/cards/{card_id}/fields/{field_id}/organization-options",
    response_model=CardFieldOptionListRead,
)
def list_card_field_organization_options(
    card_id: UUID,
    field_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> CardFieldOptionListRead:
    try:
        options = CardService(session).list_organization_options_for_actor(
            actor_user_id=actor_user_id,
            card_id=card_id,
            field_id=field_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return CardFieldOptionListRead(
        items=[
            CardFieldOptionRead(id=option.id, label=option.label, archived=option.archived)
            for option in options
        ]
    )


def _parse_card_field_filters(raw_filters: str | None) -> list[CardFieldFilterInput]:
    if not raw_filters:
        return []
    try:
        parsed = json.loads(raw_filters)
    except json.JSONDecodeError as exc:
        raise CardServiceError("Card field filters must be valid JSON.") from exc
    if not isinstance(parsed, list):
        raise CardServiceError("Card field filters must be a JSON array.")
    if len(parsed) > 20:
        raise CardServiceError("Card field filters cannot contain more than 20 items.")

    filters: list[CardFieldFilterInput] = []
    for item in parsed:
        if not isinstance(item, dict):
            raise CardServiceError("Each card field filter must be an object.")
        try:
            field_id = UUID(str(item["field_id"]))
        except (KeyError, TypeError, ValueError) as exc:
            raise CardServiceError("Card field filters require field_id.") from exc
        field_type = item.get("field_type")
        operator = item.get("operator")
        if not isinstance(field_type, str) or not field_type.strip():
            raise CardServiceError("Card field filters require field_type.")
        if not isinstance(operator, str) or not operator.strip():
            raise CardServiceError("Card field filters require operator.")
        if "value" not in item:
            raise CardServiceError("Card field filters require value.")
        filters.append(
            CardFieldFilterInput(
                field_id=field_id,
                field_type=field_type,
                operator=operator,
                value=item["value"],
            )
        )
    return filters


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
        card_service = CardService(session)
        card = card_service.update_card_for_actor(
            actor_user_id=actor_user_id,
            card_id=card_id,
            display_name=payload.display_name,
            org_unit_id=payload.org_unit_id,
            update_org_unit="org_unit_id" in payload.model_fields_set,
            lifecycle_status=payload.lifecycle_status,
            public_view_enabled=payload.public_view_enabled,
            public_edit_enabled=payload.public_edit_enabled,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return _card_to_summary(card, card_service)


@router.patch("/cards/{card_id}/organization", response_model=CardSummaryRead)
def move_card_organization(
    card_id: UUID,
    payload: CardOrganizationUpdate,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> CardSummaryRead:
    try:
        card_service = CardService(session)
        card = card_service.move_card_organization_for_actor(
            actor_user_id=actor_user_id,
            card_id=card_id,
            target_organization_id=payload.organization_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return _card_to_summary(card, card_service)


@router.get("/cards/{card_id}/public-access", response_model=CardPublicAccessRead)
def read_card_public_access(
    card_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> CardPublicAccessRead:
    try:
        return CardPublicAccessService(session).read_for_actor(
            actor_user_id=actor_user_id,
            card_id=card_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)


@router.patch("/cards/{card_id}/public-access", response_model=CardPublicAccessRead)
def update_card_public_access(
    card_id: UUID,
    payload: CardPublicAccessUpdate,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> CardPublicAccessRead:
    try:
        return CardPublicAccessService(session).update_for_actor(
            actor_user_id=actor_user_id,
            card_id=card_id,
            payload=payload,
        )
    except Exception as exc:
        raise_service_http_error(exc)


@router.delete("/cards/{card_id}", response_model=CardSummaryRead)
def archive_card(
    card_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> CardSummaryRead:
    try:
        card_service = CardService(session)
        card = card_service.archive_card_for_actor(
            actor_user_id=actor_user_id,
            card_id=card_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return _card_to_summary(card, card_service)


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
        card_service = CardService(session)
        card = card_service.transfer_card_for_actor(
            actor_user_id=actor_user_id,
            card_id=card_id,
            target_organization_id=payload.target_organization_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return _card_to_summary(card, card_service)


def _card_read_to_schema(card_read: ServiceCardRead) -> CardRead:
    return CardRead(
        id=card_read.card_id,
        registry_id=card_read.registry_id,
        card_template_id=card_read.card_template_id,
        card_template_name=card_read.card_template_name,
        organization_id=card_read.organization_id,
        display_name=card_read.display_name,
        creator_display_name=card_read.creator_display_name,
        can_manage=card_read.can_manage,
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


def _card_to_summary(card: Card, card_service: CardService) -> CardSummaryRead:
    return CardSummaryRead(
        id=card.id,
        registry_id=card.registry_id,
        card_template_id=card.card_template_id,
        card_template_name=card_service._card_template_name(card),
        organization_id=card.organization_id,
        org_unit_id=card.org_unit_id,
        display_name=card.display_name,
        creator_display_name=card_service.creator_display_name_for_card(card),
        lifecycle_status=card.lifecycle_status,
        public_view_enabled=card.public_view_enabled,
        public_edit_enabled=card.public_edit_enabled,
        list_fields=[
            _card_list_field_to_schema(list_field)
            for list_field in card_service.list_display_fields_for_card(card)
        ],
    )


def _card_list_field_to_schema(list_field: ServiceCardListFieldRead) -> CardListFieldValueRead:
    return CardListFieldValueRead(
        field_id=list_field.field_id,
        code=list_field.code,
        label=list_field.label,
        field_type=list_field.field_type,
        value=_serialize_field_value(list_field.value),
        display_value=_serialize_field_value(list_field.display_value),
    )
