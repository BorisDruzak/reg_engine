from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.api.dependencies import get_actor_user_id, get_db_session, raise_service_http_error
from app.schemas.import_export import CardImportPreviewRead, CardImportPreviewRequest
from app.services.import_export import CardExportService, CardImportPreviewService

router = APIRouter(tags=["import-export"])


@router.get("/registries/{registry_id}/exports/cards")
def export_cards(
    registry_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
    export_format: Annotated[str, Query(alias="format", pattern="^(json|csv)$")] = "json",
    organization_id: Annotated[UUID | None, Query()] = None,
    include_archive: Annotated[bool, Query()] = False,
    q: Annotated[str | None, Query()] = None,
) -> Response:
    service = CardExportService(session)
    try:
        if export_format == "csv":
            csv_content = service.export_cards_csv_for_actor(
                actor_user_id=actor_user_id,
                registry_id=registry_id,
                organization_id=organization_id,
                include_archive=include_archive,
                query=q,
            )
            return Response(
                content=csv_content,
                media_type="text/csv; charset=utf-8",
                headers={"Content-Disposition": 'attachment; filename="registry-cards-export.csv"'},
            )

        payload = service.export_cards_json_for_actor(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
            organization_id=organization_id,
            include_archive=include_archive,
            query=q,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return JSONResponse(
        content=payload,
        headers={"Content-Disposition": 'attachment; filename="registry-cards-export.json"'},
    )


@router.post(
    "/registries/{registry_id}/imports/cards/preview",
    response_model=CardImportPreviewRead,
)
def preview_card_import(
    registry_id: UUID,
    payload: CardImportPreviewRequest,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> CardImportPreviewRead:
    try:
        preview = CardImportPreviewService(session).preview_cards_csv_for_actor(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
            csv_content=payload.csv_content,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return CardImportPreviewRead.model_validate(preview)
