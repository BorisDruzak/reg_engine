from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_actor_user_id, get_db_session, raise_service_http_error
from app.schemas.registries import (
    FormBlockCreate,
    FormBlockRead,
    FormFieldCreate,
    FormFieldRead,
    ReferenceItemCreate,
    ReferenceItemRead,
    ReferenceListCreate,
    ReferenceListRead,
    RegistryCreate,
    RegistryRead,
)
from app.services.references import ReferenceListService
from app.services.registry_schema import RegistrySchemaService

router = APIRouter(tags=["registries"])


@router.post("/registries", response_model=RegistryRead, status_code=status.HTTP_201_CREATED)
def create_registry(
    payload: RegistryCreate,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> RegistryRead:
    try:
        registry = RegistrySchemaService(session).create_registry_for_actor(
            actor_user_id=actor_user_id,
            code=payload.code,
            name=payload.name,
            description=payload.description,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return RegistryRead.model_validate(registry)


@router.post(
    "/registries/{registry_id}/blocks",
    response_model=FormBlockRead,
    status_code=status.HTTP_201_CREATED,
)
def create_block(
    registry_id: UUID,
    payload: FormBlockCreate,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> FormBlockRead:
    try:
        block = RegistrySchemaService(session).create_block_for_actor(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
            code=payload.code,
            title=payload.title,
            description=payload.description,
            position=payload.position,
            is_repeatable=payload.is_repeatable,
            public_visible=payload.public_visible,
            public_editable=payload.public_editable,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return FormBlockRead.model_validate(block)


@router.post(
    "/blocks/{block_id}/fields",
    response_model=FormFieldRead,
    status_code=status.HTTP_201_CREATED,
)
def create_field(
    block_id: UUID,
    payload: FormFieldCreate,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> FormFieldRead:
    try:
        field = RegistrySchemaService(session).create_field_for_actor(
            actor_user_id=actor_user_id,
            block_id=block_id,
            code=payload.code,
            label=payload.label,
            field_type=payload.field_type,
            description=payload.description,
            position=payload.position,
            options_source_type=payload.options_source_type,
            options_source_id=payload.options_source_id,
            public_visible=payload.public_visible,
            public_editable=payload.public_editable,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return FormFieldRead.model_validate(field)


@router.post(
    "/registries/{registry_id}/reference-lists",
    response_model=ReferenceListRead,
    status_code=status.HTTP_201_CREATED,
)
def create_reference_list(
    registry_id: UUID,
    payload: ReferenceListCreate,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> ReferenceListRead:
    try:
        reference_list = ReferenceListService(session).create_reference_list_for_actor(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
            owner_organization_id=payload.owner_organization_id,
            code=payload.code,
            name=payload.name,
            description=payload.description,
            inherit_to_descendants=payload.inherit_to_descendants,
            locked_for_descendants=payload.locked_for_descendants,
            managed_by_system_only=payload.managed_by_system_only,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return ReferenceListRead.model_validate(reference_list)


@router.post(
    "/reference-lists/{list_id}/items",
    response_model=ReferenceItemRead,
    status_code=status.HTTP_201_CREATED,
)
def create_reference_item(
    list_id: UUID,
    payload: ReferenceItemCreate,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> ReferenceItemRead:
    try:
        item = ReferenceListService(session).create_reference_item_for_actor(
            actor_user_id=actor_user_id,
            list_id=list_id,
            parent_id=payload.parent_id,
            code=payload.code,
            label=payload.label,
            description=payload.description,
            position=payload.position,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return ReferenceItemRead.model_validate(item)
