from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_actor, get_db_session, get_registry_schema_service
from app.schemas.registry_schema import (
    CreatedIdResponse,
    FormBlockCreateRequest,
    FormBlockResponse,
    FormBlockUpdateRequest,
    FormFieldCreateRequest,
    FormFieldResponse,
    FormFieldUpdateRequest,
    RegistryCreateRequest,
    RegistrySchemaResponse,
    RegistryUpdateRequest,
)
from app.services.permissions import ActorContext
from app.services.registry_schema import (
    FieldCreate,
    FieldUpdate,
    FormBlockUpdate,
    RegistryCreate,
    RegistrySchemaService,
    RegistryUpdate,
)

router = APIRouter(prefix="/registries", tags=["registries"])


@router.post("", response_model=CreatedIdResponse, status_code=status.HTTP_201_CREATED)
def create_registry(
    payload: RegistryCreateRequest,
    actor: Annotated[ActorContext, Depends(get_current_actor)],
    service: Annotated[RegistrySchemaService, Depends(get_registry_schema_service)],
    session: Annotated[Session, Depends(get_db_session)],
) -> CreatedIdResponse:
    registry_id = service.create_registry(
        actor,
        RegistryCreate(code=payload.code, name=payload.name),
    )
    session.commit()
    return CreatedIdResponse(id=registry_id)


@router.get("/{registry_id}/schema", response_model=RegistrySchemaResponse)
def get_registry_schema(
    registry_id: UUID,
    actor: Annotated[ActorContext, Depends(get_current_actor)],
    service: Annotated[RegistrySchemaService, Depends(get_registry_schema_service)],
) -> RegistrySchemaResponse:
    return RegistrySchemaResponse.model_validate(service.get_schema(actor, registry_id))


@router.patch("/{registry_id}", response_model=RegistrySchemaResponse)
def update_registry(
    registry_id: UUID,
    payload: RegistryUpdateRequest,
    actor: Annotated[ActorContext, Depends(get_current_actor)],
    service: Annotated[RegistrySchemaService, Depends(get_registry_schema_service)],
    session: Annotated[Session, Depends(get_db_session)],
) -> RegistrySchemaResponse:
    registry = service.update_registry(
        actor,
        registry_id,
        RegistryUpdate(code=payload.code, name=payload.name),
    )
    session.commit()
    return RegistrySchemaResponse.model_validate(registry)


@router.post(
    "/{registry_id}/blocks",
    response_model=CreatedIdResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_form_block(
    registry_id: UUID,
    payload: FormBlockCreateRequest,
    actor: Annotated[ActorContext, Depends(get_current_actor)],
    service: Annotated[RegistrySchemaService, Depends(get_registry_schema_service)],
    session: Annotated[Session, Depends(get_db_session)],
) -> CreatedIdResponse:
    block_id = service.create_block(
        actor,
        registry_id=registry_id,
        code=payload.code,
        title=payload.title,
    )
    session.commit()
    return CreatedIdResponse(id=block_id)


@router.patch("/blocks/{block_id}", response_model=FormBlockResponse)
def update_form_block(
    block_id: UUID,
    payload: FormBlockUpdateRequest,
    actor: Annotated[ActorContext, Depends(get_current_actor)],
    service: Annotated[RegistrySchemaService, Depends(get_registry_schema_service)],
    session: Annotated[Session, Depends(get_db_session)],
) -> FormBlockResponse:
    block = service.update_block(
        actor,
        block_id,
        FormBlockUpdate(code=payload.code, title=payload.title),
    )
    session.commit()
    return FormBlockResponse.model_validate(block)


@router.post(
    "/blocks/{block_id}/fields",
    response_model=CreatedIdResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_form_field(
    block_id: UUID,
    payload: FormFieldCreateRequest,
    actor: Annotated[ActorContext, Depends(get_current_actor)],
    service: Annotated[RegistrySchemaService, Depends(get_registry_schema_service)],
    session: Annotated[Session, Depends(get_db_session)],
) -> CreatedIdResponse:
    field_id = service.create_field(
        actor,
        block_id=block_id,
        data=FieldCreate(
            code=payload.code,
            label=payload.label,
            field_type=payload.field_type,
            required_mode=payload.required_mode,
        ),
    )
    session.commit()
    return CreatedIdResponse(id=field_id)


@router.patch("/fields/{field_id}", response_model=FormFieldResponse)
def update_form_field(
    field_id: UUID,
    payload: FormFieldUpdateRequest,
    actor: Annotated[ActorContext, Depends(get_current_actor)],
    service: Annotated[RegistrySchemaService, Depends(get_registry_schema_service)],
    session: Annotated[Session, Depends(get_db_session)],
) -> FormFieldResponse:
    field = service.update_field(
        actor,
        field_id,
        FieldUpdate(code=payload.code, label=payload.label, required_mode=payload.required_mode),
    )
    session.commit()
    return FormFieldResponse.model_validate(field)


@router.post("/blocks/{block_id}/archive", status_code=status.HTTP_204_NO_CONTENT)
def archive_form_block(
    block_id: UUID,
    actor: Annotated[ActorContext, Depends(get_current_actor)],
    service: Annotated[RegistrySchemaService, Depends(get_registry_schema_service)],
    session: Annotated[Session, Depends(get_db_session)],
) -> Response:
    service.archive_block(actor, block_id)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/fields/{field_id}/archive", status_code=status.HTTP_204_NO_CONTENT)
def archive_form_field(
    field_id: UUID,
    actor: Annotated[ActorContext, Depends(get_current_actor)],
    service: Annotated[RegistrySchemaService, Depends(get_registry_schema_service)],
    session: Annotated[Session, Depends(get_db_session)],
) -> Response:
    service.archive_field(actor, field_id)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
