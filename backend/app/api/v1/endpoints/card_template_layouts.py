from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_actor_user_id, get_db_session, raise_service_http_error
from app.api.v1.endpoints.documents import _document_service, _generated_document_to_read
from app.schemas.card_template_layouts import (
    CardTemplateLayoutGeneratedDocumentRead,
    CardTemplateLayoutGeneratePayload,
    CardTemplateLayoutRead,
    CardTemplateLayoutUpdate,
    CardTemplatePrintViewRead,
    CardTemplatePrintViewUpdate,
)
from app.services.card_template_layout import (
    CardTemplateLayoutConflictError,
    CardTemplateLayoutError,
    CardTemplateLayoutService,
)
from app.services.documents import DocumentServiceError

router = APIRouter(tags=["card-template-layouts"])


@router.get("/card-templates/{template_id}/layout", response_model=CardTemplateLayoutRead)
def read_card_template_layout(
    template_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> CardTemplateLayoutRead:
    try:
        return _layout_service(session).read_layout_for_actor(
            actor_user_id=actor_user_id,
            card_template_id=template_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)


@router.patch("/card-templates/{template_id}/layout/form", response_model=CardTemplateLayoutRead)
def update_card_template_form_layout(
    template_id: UUID,
    payload: CardTemplateLayoutUpdate,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> CardTemplateLayoutRead:
    try:
        return _layout_service(session).update_form_layout_for_actor(
            actor_user_id=actor_user_id,
            card_template_id=template_id,
            expected_revision=payload.expected_revision,
            form_layout=payload.form_layout,
        )
    except CardTemplateLayoutConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except Exception as exc:
        raise_service_http_error(exc)


@router.post(
    "/card-templates/{template_id}/layout/print-views",
    response_model=CardTemplatePrintViewRead,
    status_code=status.HTTP_201_CREATED,
)
def create_card_template_print_view(
    template_id: UUID,
    payload: CardTemplatePrintViewUpdate,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> CardTemplatePrintViewRead:
    try:
        return _layout_service(session).create_print_view_for_actor(
            actor_user_id=actor_user_id,
            card_template_id=template_id,
            payload=payload,
        )
    except (CardTemplateLayoutError, DocumentServiceError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise_service_http_error(exc)


@router.patch(
    "/card-templates/{template_id}/layout/print-views/{print_view_id}",
    response_model=CardTemplatePrintViewRead,
)
def update_card_template_print_view(
    template_id: UUID,
    print_view_id: str,
    payload: CardTemplatePrintViewUpdate,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> CardTemplatePrintViewRead:
    try:
        return _layout_service(session).update_print_view_for_actor(
            actor_user_id=actor_user_id,
            card_template_id=template_id,
            print_view_id=print_view_id,
            payload=payload,
        )
    except (CardTemplateLayoutError, DocumentServiceError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise_service_http_error(exc)


@router.post(
    "/card-templates/{template_id}/layout/print-views/{print_view_id}/sync",
    response_model=CardTemplatePrintViewRead,
)
def sync_card_template_print_view(
    template_id: UUID,
    print_view_id: str,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> CardTemplatePrintViewRead:
    try:
        return _layout_service(session).sync_print_view_from_form_layout(
            actor_user_id=actor_user_id,
            card_template_id=template_id,
            print_view_id=print_view_id,
        )
    except (CardTemplateLayoutError, DocumentServiceError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise_service_http_error(exc)


@router.post(
    "/cards/{card_id}/card-template-layout/{template_id}/generate-docx",
    response_model=CardTemplateLayoutGeneratedDocumentRead,
    status_code=status.HTTP_201_CREATED,
)
def generate_card_template_layout_docx(
    card_id: UUID,
    template_id: UUID,
    payload: CardTemplateLayoutGeneratePayload,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> CardTemplateLayoutGeneratedDocumentRead:
    service = _layout_service(session)
    try:
        generated = service.generate_docx_for_actor(
            actor_user_id=actor_user_id,
            card_id=card_id,
            card_template_id=template_id,
            print_view_id=payload.print_view_id,
            title=payload.title,
        )
        layout = service.read_layout_for_actor(
            actor_user_id=actor_user_id,
            card_template_id=template_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return CardTemplateLayoutGeneratedDocumentRead(
        document=_generated_document_to_read(generated),
        print_view=layout.print_views[0],
    )


@router.post(
    "/cards/{card_id}/card-template-layout/{template_id}/generate-pdf",
    response_model=CardTemplateLayoutGeneratedDocumentRead,
    status_code=status.HTTP_201_CREATED,
)
def generate_card_template_layout_pdf(
    card_id: UUID,
    template_id: UUID,
    payload: CardTemplateLayoutGeneratePayload,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> CardTemplateLayoutGeneratedDocumentRead:
    service = _layout_service(session)
    try:
        generated = service.generate_pdf_for_actor(
            actor_user_id=actor_user_id,
            card_id=card_id,
            card_template_id=template_id,
            print_view_id=payload.print_view_id,
            title=payload.title,
        )
        layout = service.read_layout_for_actor(
            actor_user_id=actor_user_id,
            card_template_id=template_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return CardTemplateLayoutGeneratedDocumentRead(
        document=_generated_document_to_read(generated),
        print_view=layout.print_views[0],
    )


def _layout_service(session: Session) -> CardTemplateLayoutService:
    return CardTemplateLayoutService(session, document_service=_document_service(session))
