from typing import Annotated, Literal, cast
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
from app.schemas.card_change_notifications import (
    CardChangeNotificationSubscriptionRead,
    CardChangeNotificationSubscriptionUpdate,
)
from app.schemas.card_template_layouts import CardTemplateFormLayoutRead
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
    PublicLinkRequestChanges,
    PublicLinkReviewAttachmentDiffRead,
    PublicLinkReviewFieldDiffRead,
    PublicLinkReviewRead,
    PublicLinkSafeStatusRead,
    PublicLinkSubmitRequest,
    PublicLinkTokenRead,
)
from app.services.attachments import AttachmentService
from app.services.card_change_notifications import CardChangeNotificationService
from app.services.public_links import (
    PublicLinkPreview,
    PublicLinkReviewDiff,
    PublicLinkSafeStatus,
    PublicLinkService,
)

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
            review_enabled=payload.review_enabled,
            allowed_block_ids=payload.allowed_block_ids,
            allowed_field_ids=payload.allowed_field_ids,
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
        review_enabled=token.public_link.review_enabled,
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
    return PublicLinkListRead(
        items=[
            _public_link_to_read(link, actor_user_id=actor_user_id, session=session)
            for link in public_links
        ]
    )


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
    return _public_link_to_read(public_link, actor_user_id=actor_user_id, session=session)


@router.post("/public-links/submit", response_model=PublicLinkSafeStatusRead)
def submit_public_link_for_review(
    payload: PublicLinkSubmitRequest,
    session: Annotated[Session, Depends(get_db_session)],
) -> PublicLinkSafeStatusRead:
    service = PublicLinkService(session)
    try:
        service.submit_for_review(raw_token=payload.raw_token)
        safe_status = service.safe_status(raw_token=payload.raw_token)
    except Exception as exc:
        raise_service_http_error(exc)
    return _public_link_safe_status_to_read(safe_status)


@router.post("/public-links/status", response_model=PublicLinkSafeStatusRead)
def read_public_link_safe_status(
    payload: PublicLinkSubmitRequest,
    session: Annotated[Session, Depends(get_db_session)],
) -> PublicLinkSafeStatusRead:
    try:
        safe_status = PublicLinkService(session).safe_status(raw_token=payload.raw_token)
    except Exception as exc:
        raise_service_http_error(exc)
    return _public_link_safe_status_to_read(safe_status)


@router.get("/public-links/{public_link_id}/review", response_model=PublicLinkReviewRead)
def read_public_link_review(
    public_link_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> PublicLinkReviewRead:
    try:
        review = PublicLinkService(session).review_diff_for_actor(
            actor_user_id=actor_user_id,
            public_link_id=public_link_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return _public_link_review_to_read(review, actor_user_id=actor_user_id, session=session)


@router.post("/public-links/{public_link_id}/request-changes", response_model=PublicLinkRead)
def request_public_link_changes(
    public_link_id: UUID,
    payload: PublicLinkRequestChanges,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> PublicLinkRead:
    try:
        public_link = PublicLinkService(session).request_changes_for_actor(
            actor_user_id=actor_user_id,
            public_link_id=public_link_id,
            comment=payload.comment,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return _public_link_to_read(public_link, actor_user_id=actor_user_id, session=session)


@router.post("/public-links/{public_link_id}/approve", response_model=PublicLinkRead)
def approve_public_link(
    public_link_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> PublicLinkRead:
    try:
        public_link = PublicLinkService(session).approve_for_actor(
            actor_user_id=actor_user_id,
            public_link_id=public_link_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return _public_link_to_read(public_link, actor_user_id=actor_user_id, session=session)


@router.post("/public-links/{public_link_id}/start-review-cycle", response_model=PublicLinkRead)
def start_public_link_review_cycle(
    public_link_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> PublicLinkRead:
    try:
        public_link = PublicLinkService(session).capture_review_baseline(
            actor_user_id=actor_user_id,
            public_link_id=public_link_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return _public_link_to_read(public_link, actor_user_id=actor_user_id, session=session)


@router.get(
    "/public-links/{public_link_id}/change-notification-subscription",
    response_model=CardChangeNotificationSubscriptionRead,
)
def get_public_link_change_notification_subscription(
    public_link_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> CardChangeNotificationSubscriptionRead:
    try:
        enabled = CardChangeNotificationService(session).get_public_link_subscription_for_creator(
            actor_user_id=actor_user_id,
            public_link_id=public_link_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return CardChangeNotificationSubscriptionRead(enabled=enabled)


@router.put(
    "/public-links/{public_link_id}/change-notification-subscription",
    response_model=CardChangeNotificationSubscriptionRead,
)
def set_public_link_change_notification_subscription(
    public_link_id: UUID,
    payload: CardChangeNotificationSubscriptionUpdate,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> CardChangeNotificationSubscriptionRead:
    try:
        enabled = CardChangeNotificationService(session).set_public_link_subscription_for_creator(
            actor_user_id=actor_user_id,
            public_link_id=public_link_id,
            enabled=payload.enabled,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return CardChangeNotificationSubscriptionRead(enabled=enabled)


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
        service.validate_public_field_edit(
            raw_token=payload.raw_token,
            field_id=payload.field_id,
        )
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


def _public_link_to_read(
    public_link: CardPublicLink,
    *,
    actor_user_id: UUID,
    session: Session,
) -> PublicLinkRead:
    submission_summary = public_link.submission_summary_json or {}
    can_manage_change_notifications = public_link.created_by == actor_user_id
    change_notifications_enabled = (
        CardChangeNotificationService(session).get_public_link_subscription_for_creator(
            actor_user_id=actor_user_id,
            public_link_id=public_link.id,
        )
        if can_manage_change_notifications
        else False
    )
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
        submitted_at=public_link.submitted_at,
        reviewed_at=public_link.reviewed_at,
        reviewed_by=public_link.reviewed_by,
        review_comment=public_link.review_comment,
        review_enabled=public_link.review_enabled,
        completed_public_fields=_summary_count(
            submission_summary,
            "completed_public_fields",
        ),
        total_public_fields=_summary_count(
            submission_summary,
            "total_public_fields",
        ),
        can_manage_change_notifications=can_manage_change_notifications,
        change_notifications_enabled=change_notifications_enabled,
    )


def _public_link_safe_status_to_read(
    safe_status: PublicLinkSafeStatus,
) -> PublicLinkSafeStatusRead:
    return PublicLinkSafeStatusRead(
        status=safe_status.status,
        can_edit=safe_status.can_edit,
        submitted_at=safe_status.submitted_at,
        reviewed_at=safe_status.reviewed_at,
        review_comment=safe_status.review_comment,
        completed_public_fields=safe_status.completed_public_fields,
        total_public_fields=safe_status.total_public_fields,
    )


def _public_link_review_to_read(
    review: PublicLinkReviewDiff,
    *,
    actor_user_id: UUID,
    session: Session,
) -> PublicLinkReviewRead:
    return PublicLinkReviewRead(
        public_link=_public_link_to_read(
            review.public_link,
            actor_user_id=actor_user_id,
            session=session,
        ),
        changed_field_count=review.changed_field_count,
        changed_attachment_count=review.changed_attachment_count,
        fields=[
            PublicLinkReviewFieldDiffRead(
                block_id=item.block_id,
                field_id=item.field_id,
                block_instance_id=item.block_instance_id,
                label=item.label,
                field_type=item.field_type,
                before=item.before,
                after=item.after,
                changed_at=item.changed_at,
            )
            for item in review.fields
        ],
        attachments=[
            PublicLinkReviewAttachmentDiffRead(
                attachment_id=item.attachment_id,
                title=item.title,
                original_filename=item.original_filename,
                content_length_bytes=item.content_length_bytes,
                change=cast(Literal["added", "archived"], item.change),
            )
            for item in review.attachments
        ],
    )


def _summary_count(summary: dict[str, object], key: str) -> int | None:
    value = summary.get(key)
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def _can_public_link_upload_attachment(public_link: CardPublicLink) -> bool:
    return (
        public_link.max_attachment_uploads is None
        or public_link.attachment_upload_count < public_link.max_attachment_uploads
    )


def _public_link_preview_to_read(preview: PublicLinkPreview) -> PublicLinkPreviewRead:
    return PublicLinkPreviewRead(
        card_id=preview.card_id,
        display_name=preview.display_name,
        organization_name=preview.organization_name,
        card_template_name=preview.card_template_name,
        lifecycle_status=preview.lifecycle_status,
        expires_at=preview.expires_at,
        can_edit=preview.can_edit,
        form_layout=CardTemplateFormLayoutRead.model_validate(preview.form_layout),
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
                                        archived=option.archived,
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
