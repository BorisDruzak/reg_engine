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
from app.models import DocumentTemplate, GeneratedDocument
from app.schemas.documents import (
    CardPrintTemplateCreate,
    CardPrintTemplateVersionCreate,
    DocumentTemplateCreate,
    DocumentTemplateListRead,
    DocumentTemplateRead,
    DocumentTemplateVersionListRead,
    DocumentTemplateVersionRead,
    GeneratedDocumentCreate,
    GeneratedDocumentListRead,
    GeneratedDocumentRead,
)
from app.services.attachments import LocalFilesystemAttachmentStorage, normalize_attachment_filename
from app.services.documents import DocumentService, DocumentServiceError

router = APIRouter(tags=["documents"])

_UPLOAD_READ_CHUNK_SIZE = 64 * 1024


class DocumentTemplateUploadTooLargeError(ValueError):
    """Raised when a document template upload exceeds the configured size."""


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
    return _document_template_to_read(service, template)


@router.post(
    "/registries/{registry_id}/card-print-templates",
    response_model=DocumentTemplateRead,
    status_code=status.HTTP_201_CREATED,
)
def create_card_print_template(
    registry_id: UUID,
    payload: CardPrintTemplateCreate,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> DocumentTemplateRead:
    service = _document_service(session)
    try:
        template = service.create_card_print_template_for_actor(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
            code=payload.code,
            name=payload.name,
            description=payload.description,
            card_template_id=payload.card_template_id,
            layout_json=payload.layout_json,
            output_filename_template=payload.output_filename_template,
        )
    except DocumentServiceError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise_service_http_error(exc)
    return _document_template_to_read(service, template)


@router.post(
    "/registries/{registry_id}/document-templates/upload",
    response_model=DocumentTemplateRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_binary_document_template(
    registry_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
    file: Annotated[UploadFile, File()],
    code: Annotated[str, Form()],
    name: Annotated[str, Form()],
    description: Annotated[str | None, Form()] = None,
    output_filename_template: Annotated[str, Form()] = "{{ card.display_name }}.docx",
) -> DocumentTemplateRead:
    service = _document_service(session)
    try:
        content = await _read_upload_bytes_with_limit(
            file,
            max_bytes=get_settings().max_attachment_bytes,
        )
        template, _version = service.create_binary_template_for_actor(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
            code=code,
            name=name,
            description=description,
            output_filename_template=output_filename_template,
            original_filename=file.filename or "template.docx",
            content_type=file.content_type or "application/octet-stream",
            content=content,
        )
    except DocumentTemplateUploadTooLargeError as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
    except DocumentServiceError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise_service_http_error(exc)
    return _document_template_to_read(service, template)


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
        items=[_document_template_to_read(service, template) for template in templates]
    )


@router.get(
    "/registries/{registry_id}/card-print-templates",
    response_model=DocumentTemplateListRead,
)
def list_card_print_templates(
    registry_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
    card_template_id: Annotated[UUID | None, Query()] = None,
    include_archive: Annotated[bool, Query()] = False,
) -> DocumentTemplateListRead:
    service = _document_service(session)
    try:
        templates = service.list_card_print_templates_for_actor(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
            card_template_id=card_template_id,
            include_archive=include_archive,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return DocumentTemplateListRead(
        items=[_document_template_to_read(service, template) for template in templates]
    )


@router.get("/card-print-templates/{template_id}", response_model=DocumentTemplateRead)
def read_card_print_template(
    template_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
    include_archive: Annotated[bool, Query()] = False,
) -> DocumentTemplateRead:
    service = _document_service(session)
    try:
        template = service.read_template_for_actor(
            actor_user_id=actor_user_id,
            template_id=template_id,
            include_archive=include_archive,
        )
        if template.template_format != "card_print_layout_v1":
            raise DocumentServiceError("Document template is not a card print layout template.")
    except Exception as exc:
        raise_service_http_error(exc)
    return _document_template_to_read(service, template)


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
    return _document_template_to_read(service, template)


@router.get(
    "/document-templates/{template_id}/versions",
    response_model=DocumentTemplateVersionListRead,
)
def list_document_template_versions(
    template_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
    include_archive: Annotated[bool, Query()] = False,
) -> DocumentTemplateVersionListRead:
    service = _document_service(session)
    try:
        versions = service.list_template_versions_for_actor(
            actor_user_id=actor_user_id,
            template_id=template_id,
            include_archive=include_archive,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return DocumentTemplateVersionListRead(
        items=[DocumentTemplateVersionRead.model_validate(version) for version in versions]
    )


@router.post(
    "/document-templates/{template_id}/versions/upload",
    response_model=DocumentTemplateVersionRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_binary_document_template_version(
    template_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
    file: Annotated[UploadFile, File()],
) -> DocumentTemplateVersionRead:
    service = _document_service(session)
    try:
        content = await _read_upload_bytes_with_limit(
            file,
            max_bytes=get_settings().max_attachment_bytes,
        )
        version = service.create_binary_template_version_for_actor(
            actor_user_id=actor_user_id,
            template_id=template_id,
            original_filename=file.filename or "template.docx",
            content_type=file.content_type or "application/octet-stream",
            content=content,
        )
    except DocumentTemplateUploadTooLargeError as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
    except DocumentServiceError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise_service_http_error(exc)
    return DocumentTemplateVersionRead.model_validate(version)


@router.post(
    "/card-print-templates/{template_id}/versions",
    response_model=DocumentTemplateVersionRead,
    status_code=status.HTTP_201_CREATED,
)
def create_card_print_template_version(
    template_id: UUID,
    payload: CardPrintTemplateVersionCreate,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> DocumentTemplateVersionRead:
    service = _document_service(session)
    try:
        version = service.create_card_print_template_version_for_actor(
            actor_user_id=actor_user_id,
            template_id=template_id,
            layout_json=payload.layout_json,
        )
    except DocumentServiceError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise_service_http_error(exc)
    return DocumentTemplateVersionRead.model_validate(version)


@router.get("/card-print-templates/{template_id}/blank-docx")
def download_blank_card_print_template_docx(
    template_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> Response:
    service = _document_service(session)
    try:
        rendered = service.render_blank_card_print_template_for_actor(
            actor_user_id=actor_user_id,
            template_id=template_id,
            output_format="docx",
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return Response(
        content=rendered.content,
        media_type=rendered.content_type,
        headers=_download_headers_for_filename(rendered.filename),
    )


@router.get("/card-print-templates/{template_id}/blank-pdf")
def download_blank_card_print_template_pdf(
    template_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> Response:
    service = _document_service(session)
    try:
        rendered = service.render_blank_card_print_template_for_actor(
            actor_user_id=actor_user_id,
            template_id=template_id,
            output_format="pdf",
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return Response(
        content=rendered.content,
        media_type=rendered.content_type,
        headers=_download_headers_for_filename(rendered.filename),
    )


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


@router.post(
    "/cards/{card_id}/generated-documents/pdf",
    response_model=GeneratedDocumentRead,
    status_code=status.HTTP_201_CREATED,
)
def generate_pdf_document(
    card_id: UUID,
    payload: GeneratedDocumentCreate,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> GeneratedDocumentRead:
    service = _document_service(session)
    try:
        generated = service.generate_pdf_for_actor(
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
        template_storage=LocalFilesystemAttachmentStorage(
            settings.storage_root,
            key_prefix="document_templates",
        ),
    )


async def _read_upload_bytes_with_limit(file: UploadFile, *, max_bytes: int) -> bytes:
    content = bytearray()
    while True:
        remaining = max_bytes + 1 - len(content)
        chunk = await file.read(min(_UPLOAD_READ_CHUNK_SIZE, remaining))
        if not chunk:
            break
        content.extend(chunk)
        if len(content) > max_bytes:
            raise DocumentTemplateUploadTooLargeError(
                "Document template content exceeds the configured size limit."
            )
    return bytes(content)


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


def _document_template_to_read(
    service: DocumentService,
    template: DocumentTemplate,
) -> DocumentTemplateRead:
    current_version = service.get_current_template_version(
        template.id,
        include_archive=template.archived_at is not None,
    )
    return DocumentTemplateRead(
        id=template.id,
        registry_id=template.registry_id,
        code=template.code,
        name=template.name,
        description=template.description,
        template_format=template.template_format,
        output_filename_template=template.output_filename_template,
        output_content_type=template.output_content_type,
        is_active=template.is_active,
        card_template_id=template.card_template_id,
        current_version_id=current_version.id if current_version is not None else None,
        current_version_number=(
            current_version.version_number if current_version is not None else None
        ),
        current_layout_json=(
            current_version.layout_json
            if current_version is not None and current_version.layout_json is not None
            else None
        ),
        created_at=template.created_at,
        archived_at=template.archived_at,
    )


def _generated_document_to_read(generated: GeneratedDocument) -> GeneratedDocumentRead:
    return GeneratedDocumentRead.model_validate(generated)
