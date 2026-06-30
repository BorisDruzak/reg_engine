from dataclasses import dataclass
from typing import Annotated, Literal, cast
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from sqlalchemy.orm import Session
from starlette.datastructures import UploadFile

from app.api.dependencies import get_actor_user_id, get_db_session, raise_service_http_error
from app.core.config import get_settings
from app.schemas.import_export import (
    CardImportCommitRead,
    CardImportCommitRequest,
    CardImportPreviewRead,
    CardImportPreviewRequest,
)
from app.services.import_export import (
    CardExportService,
    CardImportCommitService,
    CardImportCommitValidationError,
    CardImportPreviewService,
)

router = APIRouter(tags=["import-export"])
XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@dataclass(frozen=True)
class CardImportPayload:
    import_format: Literal["csv", "xlsx"]
    content: str | bytes


@router.get("/registries/{registry_id}/exports/cards")
def export_cards(
    registry_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
    export_format: Annotated[str, Query(alias="format", pattern="^(json|csv|xlsx)$")] = "json",
    organization_id: Annotated[UUID | None, Query()] = None,
    include_archive: Annotated[bool, Query()] = False,
    q: Annotated[str | None, Query()] = None,
) -> Response:
    service = CardExportService(session)
    try:
        if export_format == "xlsx":
            xlsx_content = service.export_cards_xlsx_for_actor(
                actor_user_id=actor_user_id,
                registry_id=registry_id,
                organization_id=organization_id,
                include_archive=include_archive,
                query=q,
            )
            return Response(
                content=xlsx_content,
                media_type=XLSX_MEDIA_TYPE,
                headers={
                    "Content-Disposition": 'attachment; filename="registry-cards-export.xlsx"'
                },
            )

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
async def preview_card_import(
    registry_id: UUID,
    request: Request,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> CardImportPreviewRead:
    try:
        payload = await _read_card_import_payload(
            request,
            request_model=CardImportPreviewRequest,
        )
        preview_service = CardImportPreviewService(session)
        if payload.import_format == "xlsx":
            preview = preview_service.preview_cards_xlsx_for_actor(
                actor_user_id=actor_user_id,
                registry_id=registry_id,
                xlsx_content=cast(bytes, payload.content),
            )
        else:
            preview = preview_service.preview_cards_csv_for_actor(
                actor_user_id=actor_user_id,
                registry_id=registry_id,
                csv_content=cast(str, payload.content),
            )
    except HTTPException:
        raise
    except Exception as exc:
        raise_service_http_error(exc)
    return CardImportPreviewRead.model_validate(preview)


@router.post(
    "/registries/{registry_id}/imports/cards/commit",
    response_model=CardImportCommitRead,
)
async def commit_card_import(
    registry_id: UUID,
    request: Request,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> CardImportCommitRead:
    try:
        payload = await _read_card_import_payload(
            request,
            request_model=CardImportCommitRequest,
        )
        commit_service = CardImportCommitService(session)
        if payload.import_format == "xlsx":
            result = commit_service.commit_cards_xlsx_for_actor(
                actor_user_id=actor_user_id,
                registry_id=registry_id,
                xlsx_content=cast(bytes, payload.content),
            )
        else:
            result = commit_service.commit_cards_csv_for_actor(
                actor_user_id=actor_user_id,
                registry_id=registry_id,
                csv_content=cast(str, payload.content),
            )
    except CardImportCommitValidationError as exc:
        detail = CardImportPreviewRead.model_validate(exc.preview).model_dump(mode="json")
        raise HTTPException(status_code=400, detail=detail) from exc
    except HTTPException:
        raise
    except Exception as exc:
        raise_service_http_error(exc)
    return CardImportCommitRead.model_validate(result)


async def _read_card_import_payload(
    request: Request,
    *,
    request_model: type[CardImportPreviewRequest] | type[CardImportCommitRequest],
) -> CardImportPayload:
    content_type = request.headers.get("content-type", "")
    if content_type.startswith("multipart/form-data"):
        return await _read_xlsx_import_payload(request)
    return await _read_csv_import_payload(request, request_model=request_model)


async def _read_xlsx_import_payload(request: Request) -> CardImportPayload:
    form = await request.form()
    uploaded = form.get("file")
    if not isinstance(uploaded, UploadFile):
        raise HTTPException(status_code=400, detail="XLSX import file is required.")
    max_bytes = get_settings().max_import_bytes
    content = await uploaded.read(max_bytes + 1)
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"Import file exceeds REG_ENGINE_MAX_IMPORT_BYTES={max_bytes}.",
        )
    if not content:
        raise HTTPException(status_code=400, detail="XLSX import file is empty.")
    return CardImportPayload(import_format="xlsx", content=content)


async def _read_csv_import_payload(
    request: Request,
    *,
    request_model: type[CardImportPreviewRequest] | type[CardImportCommitRequest],
) -> CardImportPayload:
    try:
        data = await request.json()
        payload = request_model.model_validate(data)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors()) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail="JSON import payload could not be read.",
        ) from exc
    max_bytes = get_settings().max_import_bytes
    if len(payload.csv_content.encode("utf-8")) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"Import payload exceeds REG_ENGINE_MAX_IMPORT_BYTES={max_bytes}.",
        )
    return CardImportPayload(import_format="csv", content=payload.csv_content)
