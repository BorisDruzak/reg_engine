from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_actor_user_id, get_db_session, raise_service_http_error
from app.schemas.registries import (
    FormBlockCreate,
    FormBlockRead,
    FormBlockUpdate,
    FormFieldCreate,
    FormFieldRead,
    FormFieldUpdate,
    ReferenceItemCreate,
    ReferenceItemListRead,
    ReferenceItemRead,
    ReferenceItemUpdate,
    ReferenceListCreate,
    ReferenceListListRead,
    ReferenceListRead,
    ReferenceListUpdate,
    RegistryCreate,
    RegistryRead,
    RegistrySchemaRead,
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


@router.get("/registries/{registry_id}", response_model=RegistryRead)
def read_registry(
    registry_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> RegistryRead:
    try:
        registry = RegistrySchemaService(session).read_registry_for_actor(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return RegistryRead.model_validate(registry)


@router.get("/registries/{registry_id}/schema", response_model=RegistrySchemaRead)
def read_registry_schema(
    registry_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> RegistrySchemaRead:
    try:
        registry, blocks, fields = RegistrySchemaService(session).read_schema_for_actor(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return RegistrySchemaRead(
        registry=RegistryRead.model_validate(registry),
        blocks=[FormBlockRead.model_validate(block) for block in blocks],
        fields=[FormFieldRead.model_validate(field) for field in fields],
    )


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


@router.patch("/blocks/{block_id}", response_model=FormBlockRead)
def update_block(
    block_id: UUID,
    payload: FormBlockUpdate,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> FormBlockRead:
    try:
        block = RegistrySchemaService(session).update_block_for_actor(
            actor_user_id=actor_user_id,
            block_id=block_id,
            title=payload.title,
            description=payload.description,
            position=payload.position,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return FormBlockRead.model_validate(block)


@router.delete("/blocks/{block_id}", response_model=FormBlockRead)
def archive_block(
    block_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> FormBlockRead:
    try:
        block = RegistrySchemaService(session).archive_block_for_actor(
            actor_user_id=actor_user_id,
            block_id=block_id,
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


@router.patch("/fields/{field_id}", response_model=FormFieldRead)
def update_field(
    field_id: UUID,
    payload: FormFieldUpdate,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> FormFieldRead:
    try:
        field = RegistrySchemaService(session).update_field_for_actor(
            actor_user_id=actor_user_id,
            field_id=field_id,
            label=payload.label,
            description=payload.description,
            position=payload.position,
            is_active=payload.is_active,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return FormFieldRead.model_validate(field)


@router.delete("/fields/{field_id}", response_model=FormFieldRead)
def archive_field(
    field_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> FormFieldRead:
    try:
        field = RegistrySchemaService(session).archive_field_for_actor(
            actor_user_id=actor_user_id,
            field_id=field_id,
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


@router.get(
    "/registries/{registry_id}/reference-lists",
    response_model=ReferenceListListRead,
)
def list_reference_lists(
    registry_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
    organization_id: Annotated[UUID | None, Query()] = None,
) -> ReferenceListListRead:
    try:
        reference_lists = ReferenceListService(session).list_reference_lists_for_actor(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
            organization_id=organization_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return ReferenceListListRead(
        items=[
            ReferenceListRead.model_validate(reference_list) for reference_list in reference_lists
        ]
    )


@router.get("/reference-lists/{list_id}", response_model=ReferenceListRead)
def read_reference_list(
    list_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> ReferenceListRead:
    try:
        reference_list = ReferenceListService(session).read_reference_list_for_actor(
            actor_user_id=actor_user_id,
            list_id=list_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return ReferenceListRead.model_validate(reference_list)


@router.patch("/reference-lists/{list_id}", response_model=ReferenceListRead)
def update_reference_list(
    list_id: UUID,
    payload: ReferenceListUpdate,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> ReferenceListRead:
    try:
        reference_list = ReferenceListService(session).update_reference_list_for_actor(
            actor_user_id=actor_user_id,
            list_id=list_id,
            name=payload.name,
            description=payload.description,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return ReferenceListRead.model_validate(reference_list)


@router.delete("/reference-lists/{list_id}", response_model=ReferenceListRead)
def archive_reference_list(
    list_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> ReferenceListRead:
    try:
        reference_list = ReferenceListService(session).archive_reference_list_for_actor(
            actor_user_id=actor_user_id,
            list_id=list_id,
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


@router.get("/reference-lists/{list_id}/items", response_model=ReferenceItemListRead)
def list_reference_items(
    list_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> ReferenceItemListRead:
    try:
        items = ReferenceListService(session).list_items_for_actor(
            actor_user_id=actor_user_id,
            list_id=list_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return ReferenceItemListRead(items=[ReferenceItemRead.model_validate(item) for item in items])


@router.get("/reference-items/{item_id}", response_model=ReferenceItemRead)
def read_reference_item(
    item_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> ReferenceItemRead:
    try:
        item = ReferenceListService(session).read_reference_item_for_actor(
            actor_user_id=actor_user_id,
            item_id=item_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return ReferenceItemRead.model_validate(item)


@router.patch("/reference-items/{item_id}", response_model=ReferenceItemRead)
def update_reference_item(
    item_id: UUID,
    payload: ReferenceItemUpdate,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> ReferenceItemRead:
    try:
        item = ReferenceListService(session).update_reference_item_for_actor(
            actor_user_id=actor_user_id,
            item_id=item_id,
            label=payload.label,
            description=payload.description,
            position=payload.position,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return ReferenceItemRead.model_validate(item)


@router.delete("/reference-items/{item_id}", response_model=ReferenceItemRead)
def archive_reference_item(
    item_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> ReferenceItemRead:
    try:
        item = ReferenceListService(session).archive_reference_item_for_actor(
            actor_user_id=actor_user_id,
            item_id=item_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return ReferenceItemRead.model_validate(item)
