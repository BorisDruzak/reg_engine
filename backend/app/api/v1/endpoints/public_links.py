from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_actor_user_id, get_db_session, raise_service_http_error
from app.api.v1.endpoints._field_values import coerce_api_field_value, field_value_to_read
from app.api.v1.endpoints.attachments import (
    AttachmentUploadTooLargeError,
    _attachment_service,
    _download_headers_for_filename,
    _read_upload_bytes_with_limit,
)
from app.core.config import get_settings
from app.models import CardAttachment, CardPublicLink
from app.schemas.cards import FieldValueRead
from app.schemas.public_links import (
    PublicLinkAttachmentListRead,
    PublicLinkAttachmentRead,
    PublicLinkAttachmentRequest,
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
from app.services.attachments import AttachmentService
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
            max_attachment_uploads=payload.max_attachment_uploads,
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


@router.post("/public-links/attachments", response_model=PublicLinkAttachmentListRead)
def list_public_link_attachments(
    payload: PublicLinkAttachmentRequest,
    session: Annotated[Session, Depends(get_db_session)],
) -> PublicLinkAttachmentListRead:
    try:
        public_link = PublicLinkService(session).validate_public_attachment_token(
            raw_token=payload.raw_token,
        )
        service = _attachment_service(session)
        attachments = service.list_attachments_from_public_link(
            actor_public_link_id=public_link.id,
            card_id=public_link.card_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return PublicLinkAttachmentListRead(
        items=[_public_attachment_to_read(service, attachment) for attachment in attachments],
        max_attachment_uploads=public_link.max_attachment_uploads,
        attachment_upload_count=public_link.attachment_upload_count,
        can_upload_attachments=_can_public_link_upload_attachment(public_link),
    )


@router.post(
    "/public-links/attachments/upload",
    response_model=PublicLinkAttachmentRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_public_link_attachment(
    session: Annotated[Session, Depends(get_db_session)],
    file: Annotated[UploadFile, File()],
    raw_token: Annotated[str, Form()],
    title: Annotated[str | None, Form()] = None,
    description: Annotated[str | None, Form()] = None,
) -> PublicLinkAttachmentRead:
    try:
        public_link = PublicLinkService(session).validate_public_attachment_token(
            raw_token=raw_token,
        )
        service = _attachment_service(session)
        content = await _read_upload_bytes_with_limit(
            file,
            max_bytes=get_settings().max_attachment_bytes,
        )
        attachment = service.create_attachment_from_public_link(
            actor_public_link_id=public_link.id,
            card_id=public_link.card_id,
            original_filename=file.filename or "attachment",
            content_type=file.content_type or "application/octet-stream",
            content=content,
            title=title,
            description=description,
        )
    except AttachmentUploadTooLargeError as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
    except Exception as exc:
        raise_service_http_error(exc)
    return _public_attachment_to_read(service, attachment)


@router.post("/public-links/attachments/{attachment_id}/content")
def read_public_link_attachment_content(
    attachment_id: UUID,
    payload: PublicLinkAttachmentRequest,
    session: Annotated[Session, Depends(get_db_session)],
) -> Response:
    try:
        public_link = PublicLinkService(session).validate_public_attachment_token(
            raw_token=payload.raw_token,
        )
        service = _attachment_service(session)
        attachment = service.read_attachment_from_public_link(
            actor_public_link_id=public_link.id,
            attachment_id=attachment_id,
        )
        stored_file = service.get_stored_file_for_attachment(attachment)
        content = service.read_attachment_content_from_public_link(
            actor_public_link_id=public_link.id,
            attachment_id=attachment_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return Response(
        content=content,
        media_type=stored_file.content_type,
        headers=_download_headers_for_filename(stored_file.original_filename),
    )


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
        max_attachment_uploads=public_link.max_attachment_uploads,
        attachment_upload_count=public_link.attachment_upload_count,
        disabled_at=public_link.disabled_at,
    )


def _can_public_link_upload_attachment(public_link: CardPublicLink) -> bool:
    return (
        public_link.max_attachment_uploads is None
        or public_link.attachment_upload_count < public_link.max_attachment_uploads
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
                layout_columns=block.layout_columns,
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
                                options_config_json=field.options_config_json,
                                display_config_json=field.display_config_json,
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


def _public_attachment_to_read(
    service: AttachmentService,
    attachment: CardAttachment,
) -> PublicLinkAttachmentRead:
    stored_file = service.get_stored_file_for_attachment(attachment)
    return PublicLinkAttachmentRead(
        id=attachment.id,
        card_id=attachment.card_id,
        title=attachment.title,
        description=attachment.description,
        position=attachment.position,
        original_filename=stored_file.original_filename,
        content_type=stored_file.content_type,
        content_length_bytes=stored_file.content_length_bytes,
        scanner_status=stored_file.scanner_status,
        created_at=attachment.created_at,
        archived_at=attachment.archived_at,
    )
