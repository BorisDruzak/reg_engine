from typing import Annotated
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Response,
    UploadFile,
    status,
)
from sqlalchemy.orm import Session

from app.api.dependencies import get_actor_user_id, get_db_session, raise_service_http_error
from app.core.config import get_settings
from app.models import CardAttachment
from app.schemas.attachments import AttachmentListRead, AttachmentRead
from app.services.attachments import AttachmentService, LocalFilesystemAttachmentStorage

router = APIRouter(tags=["attachments"])


@router.post(
    "/cards/{card_id}/attachments",
    response_model=AttachmentRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_attachment(
    card_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
    file: Annotated[UploadFile, File()],
    title: Annotated[str | None, Form()] = None,
    description: Annotated[str | None, Form()] = None,
) -> AttachmentRead:
    service = _attachment_service(session)
    content = await file.read()
    try:
        attachment = service.create_attachment_for_actor(
            actor_user_id=actor_user_id,
            card_id=card_id,
            original_filename=file.filename or "attachment",
            content_type=file.content_type or "application/octet-stream",
            content=content,
            title=title,
            description=description,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return _attachment_to_read(service, attachment)


@router.get("/cards/{card_id}/attachments", response_model=AttachmentListRead)
def list_attachments(
    card_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
    include_archive: Annotated[bool, Query()] = False,
) -> AttachmentListRead:
    service = _attachment_service(session)
    try:
        attachments = service.list_attachments_for_actor(
            actor_user_id=actor_user_id,
            card_id=card_id,
            include_archive=include_archive,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return AttachmentListRead(items=[_attachment_to_read(service, item) for item in attachments])


@router.get("/attachments/{attachment_id}", response_model=AttachmentRead)
def read_attachment(
    attachment_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
    include_archive: Annotated[bool, Query()] = False,
) -> AttachmentRead:
    service = _attachment_service(session)
    try:
        attachment = service.read_attachment_for_actor(
            actor_user_id=actor_user_id,
            attachment_id=attachment_id,
            include_archive=include_archive,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return _attachment_to_read(service, attachment)


@router.get("/attachments/{attachment_id}/content")
def read_attachment_content(
    attachment_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
    include_archive: Annotated[bool, Query()] = False,
) -> Response:
    service = _attachment_service(session)
    try:
        attachment = service.read_attachment_for_actor(
            actor_user_id=actor_user_id,
            attachment_id=attachment_id,
            include_archive=include_archive,
        )
        stored_file = service.get_stored_file_for_attachment(attachment)
        content = service.read_attachment_content_for_actor(
            actor_user_id=actor_user_id,
            attachment_id=attachment_id,
            include_archive=include_archive,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return Response(
        content=content,
        media_type=stored_file.content_type,
        headers={"X-Attachment-Filename": stored_file.original_filename},
    )


@router.delete("/attachments/{attachment_id}", response_model=AttachmentRead)
def archive_attachment(
    attachment_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> AttachmentRead:
    service = _attachment_service(session)
    try:
        attachment = service.archive_attachment_for_actor(
            actor_user_id=actor_user_id,
            attachment_id=attachment_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return _attachment_to_read(service, attachment)


def _attachment_service(session: Session) -> AttachmentService:
    settings = get_settings()
    if settings.storage_backend != "local_filesystem":
        raise HTTPException(status_code=503, detail="Attachment storage backend is not supported.")
    if settings.storage_root is None:
        raise HTTPException(status_code=503, detail="Attachment storage is not configured.")
    return AttachmentService(
        session,
        storage=LocalFilesystemAttachmentStorage(settings.storage_root),
        max_attachment_bytes=settings.max_attachment_bytes,
    )


def _attachment_to_read(service: AttachmentService, attachment: CardAttachment) -> AttachmentRead:
    stored_file = service.get_stored_file_for_attachment(attachment)
    return AttachmentRead(
        id=attachment.id,
        card_id=attachment.card_id,
        stored_file_id=attachment.stored_file_id,
        title=attachment.title,
        description=attachment.description,
        position=attachment.position,
        original_filename=stored_file.original_filename,
        content_type=stored_file.content_type,
        content_length_bytes=stored_file.content_length_bytes,
        checksum_sha256=stored_file.checksum_sha256,
        scanner_status=stored_file.scanner_status,
        created_at=attachment.created_at,
        archived_at=attachment.archived_at,
    )
