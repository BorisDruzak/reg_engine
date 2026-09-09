from typing import Annotated, cast
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.api.dependencies import get_actor_user_id, get_db_session, raise_service_http_error
from app.api.v1.endpoints.import_export import XLSX_MEDIA_TYPE, xlsx_download_headers
from app.models import CardExportTemplate
from app.schemas.card_export_templates import (
    CardExportDownloadRequest,
    CardExportTemplateCreate,
    CardExportTemplateListRead,
    CardExportTemplateRead,
    CardExportTemplateUpdate,
    ExportKind,
)
from app.services.card_export_templates import CardExportTemplateService

router = APIRouter(tags=["card-export-templates"])
SessionDependency = Annotated[Session, Depends(get_db_session)]
ActorDependency = Annotated[UUID, Depends(get_actor_user_id)]


def _read(template: CardExportTemplate) -> CardExportTemplateRead:
    configuration = dict(template.configuration_json)
    configuration.pop("organization_ids", None)
    return CardExportTemplateRead(
        id=template.id,
        registry_id=template.registry_id,
        code=template.code,
        name=template.name,
        export_kind=cast(ExportKind, template.export_kind),
        card_template_id=configuration.pop("card_template_id"),
        configuration_json=configuration,
        created_at=template.created_at,
        updated_at=template.updated_at,
        archived_at=template.archived_at,
    )


@router.post(
    "/registries/{registry_id}/card-export-templates",
    response_model=CardExportTemplateRead,
    status_code=201,
)
def create_export_template(
    registry_id: UUID,
    payload: CardExportTemplateCreate,
    session: SessionDependency,
    actor_user_id: ActorDependency,
) -> CardExportTemplateRead:
    try:
        result = CardExportTemplateService(session).create_for_actor(
            actor_user_id=actor_user_id, registry_id=registry_id, **payload.model_dump()
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return _read(result)


@router.get(
    "/registries/{registry_id}/card-export-templates", response_model=CardExportTemplateListRead
)
def list_export_templates(
    registry_id: UUID,
    session: SessionDependency,
    actor_user_id: ActorDependency,
    include_archive: Annotated[bool, Query()] = False,
) -> CardExportTemplateListRead:
    try:
        results = CardExportTemplateService(session).list_for_actor(
            actor_user_id=actor_user_id, registry_id=registry_id, include_archive=include_archive
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return CardExportTemplateListRead(items=[_read(item) for item in results])


@router.get("/card-export-templates/{template_id}", response_model=CardExportTemplateRead)
def read_export_template(
    template_id: UUID, session: SessionDependency, actor_user_id: ActorDependency
) -> CardExportTemplateRead:
    try:
        result = CardExportTemplateService(session).read_for_actor(
            actor_user_id=actor_user_id, template_id=template_id
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return _read(result)


@router.patch("/card-export-templates/{template_id}", response_model=CardExportTemplateRead)
def update_export_template(
    template_id: UUID,
    payload: CardExportTemplateUpdate,
    session: SessionDependency,
    actor_user_id: ActorDependency,
) -> CardExportTemplateRead:
    try:
        result = CardExportTemplateService(session).update_for_actor(
            actor_user_id=actor_user_id,
            template_id=template_id,
            **payload.model_dump(exclude_unset=True),
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return _read(result)


@router.delete("/card-export-templates/{template_id}", response_model=CardExportTemplateRead)
def archive_export_template(
    template_id: UUID, session: SessionDependency, actor_user_id: ActorDependency
) -> CardExportTemplateRead:
    try:
        result = CardExportTemplateService(session).archive_for_actor(
            actor_user_id=actor_user_id, template_id=template_id
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return _read(result)


@router.post("/card-export-templates/{template_id}/download")
def download_export_template(
    template_id: UUID,
    payload: CardExportDownloadRequest,
    session: SessionDependency,
    actor_user_id: ActorDependency,
) -> Response:
    try:
        content = CardExportTemplateService(session).render_for_actor(
            actor_user_id=actor_user_id, template_id=template_id, **payload.model_dump()
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return Response(
        content=content,
        media_type=XLSX_MEDIA_TYPE,
        headers=xlsx_download_headers("registry-export.xlsx"),
    )
