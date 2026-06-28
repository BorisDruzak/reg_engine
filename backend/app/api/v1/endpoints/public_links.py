from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_actor_user_id, get_db_session, raise_service_http_error
from app.api.v1.endpoints._field_values import coerce_api_field_value, field_value_to_read
from app.models import CardPublicLink
from app.schemas.cards import FieldValueRead
from app.schemas.public_links import (
    PublicLinkCreate,
    PublicLinkEditRequest,
    PublicLinkListRead,
    PublicLinkPreviewBlockInstanceRead,
    PublicLinkPreviewBlockRead,
    PublicLinkPreviewFieldRead,
    PublicLinkPreviewOptionRead,
    PublicLinkPreviewRead,
    PublicLinkPreviewRequest,
    PublicLinkRead,
    PublicLinkTokenRead,
)
from app.services.public_links import PublicLinkPreview, PublicLinkService

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


@router.get("/cards/{card_id}/public-links", response_model=PublicLinkListRead)
def list_public_links(
    card_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> PublicLinkListRead:
    try:
        public_links = PublicLinkService(session).list_public_links_for_actor(
            actor_user_id=actor_user_id,
            card_id=card_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return PublicLinkListRead(items=[_public_link_to_read(link) for link in public_links])


@router.delete("/public-links/{public_link_id}", response_model=PublicLinkRead)
def disable_public_link(
    public_link_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> PublicLinkRead:
    try:
        public_link = PublicLinkService(session).disable_public_link_for_actor(
            actor_user_id=actor_user_id,
            public_link_id=public_link_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return _public_link_to_read(public_link)


@router.post("/public-links/preview", response_model=PublicLinkPreviewRead)
def preview_public_link(
    payload: PublicLinkPreviewRequest,
    session: Annotated[Session, Depends(get_db_session)],
) -> PublicLinkPreviewRead:
    try:
        preview = PublicLinkService(session).preview_public_link(raw_token=payload.raw_token)
    except Exception as exc:
        raise_service_http_error(exc)
    return _public_link_preview_to_read(preview)


@router.post("/public-links/edit", response_model=FieldValueRead)
def edit_card_field_with_public_link(
    payload: PublicLinkEditRequest,
    session: Annotated[Session, Depends(get_db_session)],
) -> FieldValueRead:
    service = PublicLinkService(session)
    try:
        service.validate_public_edit_token(raw_token=payload.raw_token)
    except Exception as exc:
        raise_service_http_error(exc)
    value = coerce_api_field_value(session, payload.field_id, payload.value)
    try:
        field_value = service.edit_card_field_with_token(
            raw_token=payload.raw_token,
            field_id=payload.field_id,
            value=value,
            block_instance_id=payload.block_instance_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return field_value_to_read(session, field_value)


def _public_link_to_read(public_link: CardPublicLink) -> PublicLinkRead:
    return PublicLinkRead(
        id=public_link.id,
        card_id=public_link.card_id,
        status=public_link.status,
        can_view=public_link.can_view,
        can_edit=public_link.can_edit,
        expires_at=public_link.expires_at,
        max_uses=public_link.max_uses,
        used_count=public_link.used_count,
        disabled_at=public_link.disabled_at,
    )


def _public_link_preview_to_read(preview: PublicLinkPreview) -> PublicLinkPreviewRead:
    return PublicLinkPreviewRead(
        card_id=preview.card_id,
        display_name=preview.display_name,
        expires_at=preview.expires_at,
        can_edit=preview.can_edit,
        blocks=[
            PublicLinkPreviewBlockRead(
                block_id=block.block_id,
                code=block.code,
                title=block.title,
                instances=[
                    PublicLinkPreviewBlockInstanceRead(
                        block_instance_id=instance.block_instance_id,
                        ordinal=instance.ordinal,
                        fields=[
                            PublicLinkPreviewFieldRead(
                                field_id=field.field_id,
                                code=field.code,
                                label=field.label,
                                field_type=field.field_type,
                                value=field.value,
                                options_source_type=field.options_source_type,
                                options_source_id=field.options_source_id,
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
            for block in preview.blocks
        ],
    )
