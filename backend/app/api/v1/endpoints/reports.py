from typing import Annotated
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_actor_user_id, get_db_session, raise_service_http_error
from app.core.config import get_settings
from app.models import ReportRun
from app.schemas.reports import (
    ReportRunCreate,
    ReportRunListRead,
    ReportRunRead,
    ReportTemplateCreate,
    ReportTemplateListRead,
    ReportTemplateRead,
    ReportTemplateUpdate,
)
from app.services.attachments import LocalFilesystemAttachmentStorage, normalize_attachment_filename
from app.services.reports import ReportService

router = APIRouter(tags=["reports"])


@router.post(
    "/registries/{registry_id}/report-templates",
    response_model=ReportTemplateRead,
    status_code=status.HTTP_201_CREATED,
)
def create_report_template(
    registry_id: UUID,
    payload: ReportTemplateCreate,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> ReportTemplateRead:
    service = _report_service(session)
    try:
        template = service.create_template_for_actor(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
            code=payload.code,
            name=payload.name,
            description=payload.description,
            report_type=payload.report_type,
            parameters_schema_json=payload.parameters_schema_json,
            default_parameters_json=payload.default_parameters_json,
            output_format=payload.output_format,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return ReportTemplateRead.model_validate(template)


@router.get(
    "/registries/{registry_id}/report-templates",
    response_model=ReportTemplateListRead,
)
def list_report_templates(
    registry_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
    include_archive: Annotated[bool, Query()] = False,
) -> ReportTemplateListRead:
    service = _report_service(session)
    try:
        templates = service.list_templates_for_actor(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
            include_archive=include_archive,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return ReportTemplateListRead(
        items=[ReportTemplateRead.model_validate(template) for template in templates]
    )


@router.patch("/report-templates/{template_id}", response_model=ReportTemplateRead)
def update_report_template(
    template_id: UUID,
    payload: ReportTemplateUpdate,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> ReportTemplateRead:
    service = _report_service(session)
    try:
        template = service.update_template_for_actor(
            actor_user_id=actor_user_id,
            template_id=template_id,
            updates=payload.model_dump(exclude_unset=True),
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return ReportTemplateRead.model_validate(template)


@router.delete("/report-templates/{template_id}", response_model=ReportTemplateRead)
def archive_report_template(
    template_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> ReportTemplateRead:
    service = _report_service(session)
    try:
        template = service.archive_template_for_actor(
            actor_user_id=actor_user_id,
            template_id=template_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return ReportTemplateRead.model_validate(template)


@router.post(
    "/report-templates/{template_id}/runs",
    response_model=ReportRunRead,
    status_code=status.HTTP_201_CREATED,
)
def generate_report_run(
    template_id: UUID,
    payload: ReportRunCreate,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> ReportRunRead:
    service = _report_service(session)
    try:
        report_run = service.generate_report_for_actor(
            actor_user_id=actor_user_id,
            template_id=template_id,
            parameters=payload.parameters,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return ReportRunRead.model_validate(report_run)


@router.get("/registries/{registry_id}/report-runs", response_model=ReportRunListRead)
def list_report_runs(
    registry_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
    include_archive: Annotated[bool, Query()] = False,
) -> ReportRunListRead:
    service = _report_service(session)
    try:
        report_runs = service.list_report_runs_for_actor(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
            include_archive=include_archive,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return ReportRunListRead(items=[ReportRunRead.model_validate(item) for item in report_runs])


@router.get("/report-runs/{report_run_id}", response_model=ReportRunRead)
def read_report_run(
    report_run_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
    include_archive: Annotated[bool, Query()] = False,
) -> ReportRunRead:
    service = _report_service(session)
    try:
        report_run = service.read_report_run_for_actor(
            actor_user_id=actor_user_id,
            report_run_id=report_run_id,
            include_archive=include_archive,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return ReportRunRead.model_validate(report_run)


@router.get("/report-runs/{report_run_id}/content")
def read_report_run_content(
    report_run_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
    include_archive: Annotated[bool, Query()] = False,
) -> Response:
    service = _report_service(session)
    try:
        report_run = service.read_report_run_for_actor(
            actor_user_id=actor_user_id,
            report_run_id=report_run_id,
            include_archive=include_archive,
        )
        stored_file = service.get_stored_file_for_report_run(report_run)
        content = service.read_report_content_for_actor(
            actor_user_id=actor_user_id,
            report_run_id=report_run_id,
            include_archive=include_archive,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return Response(
        content=content,
        media_type=stored_file.content_type,
        headers=_download_headers_for_report(report_run),
    )


@router.delete("/report-runs/{report_run_id}", response_model=ReportRunRead)
def archive_report_run(
    report_run_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> ReportRunRead:
    service = _report_service(session)
    try:
        report_run = service.archive_report_run_for_actor(
            actor_user_id=actor_user_id,
            report_run_id=report_run_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return ReportRunRead.model_validate(report_run)


def _report_service(session: Session) -> ReportService:
    settings = get_settings()
    if settings.storage_backend != "local_filesystem":
        raise HTTPException(status_code=503, detail="Report storage backend is not supported.")
    if settings.storage_root is None:
        raise HTTPException(status_code=503, detail="Report storage is not configured.")
    return ReportService(
        session,
        storage=LocalFilesystemAttachmentStorage(settings.storage_root, key_prefix="reports"),
    )


def _download_headers_for_report(report_run: ReportRun) -> dict[str, str]:
    filename = normalize_attachment_filename(report_run.output_filename)
    fallback_filename = _ascii_download_filename_fallback(filename)
    quoted_filename = quote(filename, safe="")
    return {
        "X-Report-Filename": fallback_filename,
        "Content-Disposition": (
            f"attachment; filename=\"{fallback_filename}\"; filename*=UTF-8''{quoted_filename}"
        ),
    }


def _ascii_download_filename_fallback(filename: str) -> str:
    fallback = "".join(char if char.isascii() and char.isprintable() else "_" for char in filename)
    return fallback if fallback.strip("._ ") else "report.json"
