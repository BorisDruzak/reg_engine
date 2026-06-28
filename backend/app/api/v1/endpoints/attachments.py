from typing import Annotated
from urllib.parse import quote
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
from app.services.attachments import (
    AttachmentService,
    LocalFilesystemAttachmentStorage,
    normalize_attachment_filename,
)

router = APIRouter(tags=["attachments"])

_UPLOAD_READ_CHUNK_SIZE = 64 * 1024


class AttachmentUploadTooLargeError(ValueError):
    """Raised when a multipart upload exceeds the configured attachment size."""


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
    try:
        content = await _read_upload_bytes_with_limit(
            file,
            max_bytes=get_settings().max_attachment_bytes,
        )
        attachment = service.create_attachment_for_actor(
            actor_user_id=actor_user_id,
            card_id=card_id,
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
        headers=_download_headers_for_filename(stored_file.original_filename),
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
        allowed_content_types=_parse_allowed_content_types(settings.attachment_allowed_types),
    )


def _parse_allowed_content_types(raw_value: str) -> set[str]:
    return {item.strip().lower() for item in raw_value.split(",") if item.strip()}


async def _read_upload_bytes_with_limit(file: UploadFile, *, max_bytes: int) -> bytes:
    content = bytearray()
    while True:
        remaining = max_bytes + 1 - len(content)
        chunk = await file.read(min(_UPLOAD_READ_CHUNK_SIZE, remaining))
        if not chunk:
            break
        content.extend(chunk)
        if len(content) > max_bytes:
            raise AttachmentUploadTooLargeError(
                "Attachment content exceeds the configured size limit."
            )
    return bytes(content)


def _download_headers_for_filename(original_filename: str) -> dict[str, str]:
    filename = normalize_attachment_filename(original_filename)
    fallback_filename = _ascii_download_filename_fallback(filename)
    quoted_filename = quote(filename, safe="")
    return {
        "X-Attachment-Filename": fallback_filename,
        "Content-Disposition": (
            f"attachment; filename=\"{fallback_filename}\"; filename*=UTF-8''{quoted_filename}"
        ),
    }


def _ascii_download_filename_fallback(filename: str) -> str:
    fallback = "".join(char if char.isascii() and char.isprintable() else "_" for char in filename)
    return fallback if fallback.strip("._ ") else "attachment"


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
