from dataclasses import dataclass
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session
from starlette.datastructures import UploadFile

from app.api.dependencies import get_actor_user_id, get_db_session, raise_service_http_error
from app.core.config import get_settings
from app.schemas.import_export import (
    TabularCardExchangeOptionsRead,
    TabularCardImportCommitRead,
    TabularCardImportPreviewRead,
    TabularCardWorkbookRequest,
)
from app.services.import_export import (
    TabularCardExchangeService,
    TabularCardImportValidationError,
)

router = APIRouter(tags=["import-export"])
XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@dataclass(frozen=True)
class CardImportPayload:
    content: bytes


@router.get(
    "/registries/{registry_id}/tabular-xlsx-card-exchange/options",
    response_model=TabularCardExchangeOptionsRead,
)
def get_tabular_xlsx_card_exchange_options(
    registry_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> TabularCardExchangeOptionsRead:
    try:
        result = TabularCardExchangeService(session).options_for_actor(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return TabularCardExchangeOptionsRead.model_validate(result)


@router.post("/registries/{registry_id}/tabular-xlsx-card-exchange/export")
def export_tabular_xlsx_cards(
    registry_id: UUID,
    payload: TabularCardWorkbookRequest,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> Response:
    try:
        content = TabularCardExchangeService(session).export_xlsx_for_actor(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
            card_template_id=payload.card_template_id,
            field_ids=payload.field_ids,
            organization_ids=payload.organization_ids,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return Response(
        content=content,
        media_type=XLSX_MEDIA_TYPE,
        headers={"X-Document-Filename": "список-карточек.xlsx"},
    )


@router.post("/registries/{registry_id}/tabular-xlsx-card-exchange/import-template")
def download_tabular_xlsx_import_template(
    registry_id: UUID,
    payload: TabularCardWorkbookRequest,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> Response:
    try:
        content = TabularCardExchangeService(session).import_template_xlsx_for_actor(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
            card_template_id=payload.card_template_id,
            field_ids=payload.field_ids,
            organization_ids=payload.organization_ids,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return Response(
        content=content,
        media_type=XLSX_MEDIA_TYPE,
        headers={"X-Document-Filename": "шаблон-импорта-карточек.xlsx"},
    )


@router.post(
    "/registries/{registry_id}/tabular-xlsx-card-exchange/import/preview",
    response_model=TabularCardImportPreviewRead,
)
async def preview_tabular_xlsx_card_import(
    registry_id: UUID,
    request: Request,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> TabularCardImportPreviewRead:
    try:
        payload = await _read_xlsx_import_payload(request)
        result = TabularCardExchangeService(session).preview_import_xlsx_for_actor(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
            xlsx_content=payload.content,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise_service_http_error(exc)
    return TabularCardImportPreviewRead.model_validate(result)


@router.post(
    "/registries/{registry_id}/tabular-xlsx-card-exchange/import/commit",
    response_model=TabularCardImportCommitRead,
)
async def commit_tabular_xlsx_card_import(
    registry_id: UUID,
    request: Request,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> TabularCardImportCommitRead:
    try:
        payload = await _read_xlsx_import_payload(request)
        result = TabularCardExchangeService(session).commit_import_xlsx_for_actor(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
            xlsx_content=payload.content,
        )
    except TabularCardImportValidationError as exc:
        detail = TabularCardImportPreviewRead.model_validate(exc.preview).model_dump(mode="json")
        raise HTTPException(status_code=400, detail=detail) from exc
    except HTTPException:
        raise
    except Exception as exc:
        raise_service_http_error(exc)
    return TabularCardImportCommitRead.model_validate(result)


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
    return CardImportPayload(content=content)
