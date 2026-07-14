from typing import Annotated, NoReturn
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_actor_user_id, get_db_session, raise_service_http_error
from app.api.v1.endpoints._field_values import coerce_api_field_value
from app.schemas.card_creation_links import (
    CardCreationLinkCardListRead,
    CardCreationLinkCreate,
    CardCreationLinkCreatedCardRead,
    CardCreationLinkDraftCreateRequest,
    CardCreationLinkFirstSaveRead,
    CardCreationLinkFirstSaveRequest,
    CardCreationLinkListRead,
    CardCreationLinkOrganizationRead,
    CardCreationLinkPublicPreviewRead,
    CardCreationLinkPublicPreviewRequest,
    CardCreationLinkRead,
)
from app.schemas.card_template_layouts import CardTemplateFormLayoutRead
from app.schemas.public_links import (
    PublicLinkPreviewBlockInstanceRead,
    PublicLinkPreviewBlockRead,
    PublicLinkPreviewFieldRead,
    PublicLinkPreviewOptionRead,
)
from app.services.card_creation_links import (
    CardCreationLinkCardValue,
    CardCreationLinkError,
    CardCreationLinkPublicPreviewValue,
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


@router.post(
    "/public/card-creation-links/preview",
    response_model=CardCreationLinkPublicPreviewRead,
)
def preview_card_creation_link_for_public(
    payload: CardCreationLinkPublicPreviewRequest,
    session: Annotated[Session, Depends(get_db_session)],
) -> CardCreationLinkPublicPreviewRead:
    try:
        preview = CardCreationLinkService(session).preview_for_public(
            raw_token=payload.raw_token,
            organization_id=payload.organization_id,
        )
    except Exception as exc:
        _raise_public_creation_link_http_error(exc)
    return _public_preview_to_read(preview)


@router.post(
    "/public/card-creation-links/create-draft",
    response_model=CardCreationLinkFirstSaveRead,
    status_code=status.HTTP_201_CREATED,
)
def create_card_draft_from_creation_link(
    payload: CardCreationLinkDraftCreateRequest,
    session: Annotated[Session, Depends(get_db_session)],
) -> CardCreationLinkFirstSaveRead:
    try:
        created = CardCreationLinkService(session).create_draft_from_public_link(
            raw_token=payload.raw_token,
            organization_id=payload.organization_id,
        )
    except Exception as exc:
        _raise_public_creation_link_http_error(exc)
    return CardCreationLinkFirstSaveRead(
        card_id=created.card.id,
        display_name=created.card.display_name,
        child_raw_token=created.child_raw_token,
    )


@router.post(
    "/public/card-creation-links/first-save",
    response_model=CardCreationLinkFirstSaveRead,
    status_code=status.HTTP_201_CREATED,
)
def first_save_card_from_creation_link(
    payload: CardCreationLinkFirstSaveRequest,
    session: Annotated[Session, Depends(get_db_session)],
) -> CardCreationLinkFirstSaveRead:
    try:
        value = coerce_api_field_value(session, payload.field_id, payload.value)
    except HTTPException as exc:
        raise HTTPException(
            status_code=422,
            detail="Некорректное значение поля для создания карточки.",
        ) from exc
    try:
        created = CardCreationLinkService(session).create_card_from_public_link(
            raw_token=payload.raw_token,
            organization_id=payload.organization_id,
            field_id=payload.field_id,
            value=value,
            block_instance_id=payload.block_instance_id,
        )
    except Exception as exc:
        _raise_public_creation_link_http_error(exc)
    return CardCreationLinkFirstSaveRead(
        card_id=created.card.id,
        display_name=created.card.display_name,
        child_raw_token=created.child_raw_token,
    )


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


def _public_preview_to_read(
    value: CardCreationLinkPublicPreviewValue,
) -> CardCreationLinkPublicPreviewRead:
    return CardCreationLinkPublicPreviewRead(
        card_template_id=value.card_template_id,
        card_template_name=value.card_template_name,
        selected_organization_id=value.selected_organization_id,
        organizations=[
            CardCreationLinkOrganizationRead(id=item.id, name=item.name)
            for item in value.organizations
        ],
        form_layout=CardTemplateFormLayoutRead.model_validate(value.form_layout),
        blocks=[
            PublicLinkPreviewBlockRead(
                block_id=block.block_id,
                code=block.code,
                title=block.title,
                is_repeatable=block.is_repeatable,
                layout_columns=block.layout_columns,
                display_config_json=block.display_config_json,
                instances=[
                    PublicLinkPreviewBlockInstanceRead(
                        block_instance_id=instance.block_instance_id,
                        ordinal=instance.ordinal,
                        fields=[
                            PublicLinkPreviewFieldRead(
                                field_id=field.field_id,
                                code=field.code,
                                label=field.label,
                                description=field.description,
                                field_type=field.field_type,
                                required_mode=field.required_mode,
                                value=field.value,
                                options_source_type=field.options_source_type,
                                options_source_id=field.options_source_id,
                                options_config_json=field.options_config_json,
                                display_config_json=field.display_config_json,
                                public_editable=field.public_editable,
                                options=[
                                    PublicLinkPreviewOptionRead(
                                        id=option.id,
                                        code=option.code,
                                        label=option.label,
                                    )
                                    for option in field.options
                                ],
                            )
                            for field in instance.fields
                        ],
                    )
                    for instance in block.instances
                ],
            )
            for block in value.blocks
        ],
    )


def _raise_public_creation_link_http_error(exc: Exception) -> NoReturn:
    if isinstance(exc, CardCreationLinkError):
        raise HTTPException(
            status_code=400,
            detail="Ссылка на создание карточки недоступна или заполнена неверно.",
        ) from exc
    raise_service_http_error(exc)
