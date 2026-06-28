from typing import Annotated
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_actor_user_id, get_db_session, raise_service_http_error
from app.core.config import get_settings
from app.models import GeneratedDocument
from app.schemas.documents import (
    DocumentTemplateCreate,
    DocumentTemplateListRead,
    DocumentTemplateRead,
    GeneratedDocumentCreate,
    GeneratedDocumentListRead,
    GeneratedDocumentRead,
)
from app.services.attachments import LocalFilesystemAttachmentStorage, normalize_attachment_filename
from app.services.documents import DocumentService

router = APIRouter(tags=["documents"])


@router.post(
    "/registries/{registry_id}/document-templates",
    response_model=DocumentTemplateRead,
    status_code=status.HTTP_201_CREATED,
)
def create_document_template(
    registry_id: UUID,
    payload: DocumentTemplateCreate,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> DocumentTemplateRead:
    service = _document_service(session)
    try:
        template = service.create_template_for_actor(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
            code=payload.code,
            name=payload.name,
            description=payload.description,
            template_body=payload.template_body,
            output_filename_template=payload.output_filename_template,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return DocumentTemplateRead.model_validate(template)


@router.get(
    "/registries/{registry_id}/document-templates",
    response_model=DocumentTemplateListRead,
)
def list_document_templates(
    registry_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
    include_archive: Annotated[bool, Query()] = False,
) -> DocumentTemplateListRead:
    service = _document_service(session)
    try:
        templates = service.list_templates_for_actor(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
            include_archive=include_archive,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return DocumentTemplateListRead(
        items=[DocumentTemplateRead.model_validate(template) for template in templates]
    )


@router.delete("/document-templates/{template_id}", response_model=DocumentTemplateRead)
def archive_document_template(
    template_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> DocumentTemplateRead:
    service = _document_service(session)
    try:
        template = service.archive_template_for_actor(
            actor_user_id=actor_user_id,
            template_id=template_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return DocumentTemplateRead.model_validate(template)


@router.post(
    "/cards/{card_id}/generated-documents",
    response_model=GeneratedDocumentRead,
    status_code=status.HTTP_201_CREATED,
)
def generate_document(
    card_id: UUID,
    payload: GeneratedDocumentCreate,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> GeneratedDocumentRead:
    service = _document_service(session)
    try:
        generated = service.generate_document_for_actor(
            actor_user_id=actor_user_id,
            template_id=payload.template_id,
            card_id=card_id,
            title=payload.title,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return _generated_document_to_read(generated)


@router.get("/cards/{card_id}/generated-documents", response_model=GeneratedDocumentListRead)
def list_generated_documents(
    card_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
    include_archive: Annotated[bool, Query()] = False,
) -> GeneratedDocumentListRead:
    service = _document_service(session)
    try:
        documents = service.list_generated_documents_for_actor(
            actor_user_id=actor_user_id,
            card_id=card_id,
            include_archive=include_archive,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return GeneratedDocumentListRead(
        items=[_generated_document_to_read(item) for item in documents]
    )


@router.get("/generated-documents/{generated_document_id}", response_model=GeneratedDocumentRead)
def read_generated_document(
    generated_document_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
    include_archive: Annotated[bool, Query()] = False,
) -> GeneratedDocumentRead:
    service = _document_service(session)
    try:
        generated = service.read_generated_document_for_actor(
            actor_user_id=actor_user_id,
            generated_document_id=generated_document_id,
            include_archive=include_archive,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return _generated_document_to_read(generated)


@router.get("/generated-documents/{generated_document_id}/content")
def read_generated_document_content(
    generated_document_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
    include_archive: Annotated[bool, Query()] = False,
) -> Response:
    service = _document_service(session)
    try:
        generated = service.read_generated_document_for_actor(
            actor_user_id=actor_user_id,
            generated_document_id=generated_document_id,
            include_archive=include_archive,
        )
        stored_file = service.get_stored_file_for_generated_document(generated)
        content = service.read_generated_document_content_for_actor(
            actor_user_id=actor_user_id,
            generated_document_id=generated_document_id,
            include_archive=include_archive,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return Response(
        content=content,
        media_type=stored_file.content_type,
        headers=_download_headers_for_filename(stored_file.original_filename),
    )


@router.delete("/generated-documents/{generated_document_id}", response_model=GeneratedDocumentRead)
def archive_generated_document(
    generated_document_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> GeneratedDocumentRead:
    service = _document_service(session)
    try:
        generated = service.archive_generated_document_for_actor(
            actor_user_id=actor_user_id,
            generated_document_id=generated_document_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return _generated_document_to_read(generated)


def _document_service(session: Session) -> DocumentService:
    settings = get_settings()
    if settings.storage_backend != "local_filesystem":
        raise HTTPException(status_code=503, detail="Document storage backend is not supported.")
    if settings.storage_root is None:
        raise HTTPException(status_code=503, detail="Document storage is not configured.")
    return DocumentService(
        session,
        storage=LocalFilesystemAttachmentStorage(
            settings.storage_root,
            key_prefix="generated_documents",
        ),
    )


def _download_headers_for_filename(original_filename: str) -> dict[str, str]:
    filename = normalize_attachment_filename(original_filename)
    fallback_filename = _ascii_download_filename_fallback(filename)
    quoted_filename = quote(filename, safe="")
    return {
        "X-Document-Filename": fallback_filename,
        "Content-Disposition": (
            f"attachment; filename=\"{fallback_filename}\"; filename*=UTF-8''{quoted_filename}"
        ),
    }


def _ascii_download_filename_fallback(filename: str) -> str:
    fallback = "".join(char if char.isascii() and char.isprintable() else "_" for char in filename)
    return fallback if fallback.strip("._ ") else "document"


def _generated_document_to_read(generated: GeneratedDocument) -> GeneratedDocumentRead:
    return GeneratedDocumentRead.model_validate(generated)
