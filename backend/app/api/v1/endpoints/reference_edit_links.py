from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_actor_user_id, get_db_session, raise_service_http_error
from app.schemas.reference_edit_links import (
    PublicReferenceEditTokenRequest,
    PublicReferenceItemCreate,
    PublicReferenceItemRead,
    PublicReferenceItemUpdate,
    PublicReferenceListCreate,
    PublicReferenceListRead,
    PublicReferenceListUpdate,
    PublicReferenceWorkspaceRead,
    ReferenceEditLinkCreate,
    ReferenceEditLinkListRead,
    ReferenceEditLinkRead,
    ReferenceEditLinkTokenRead,
)
from app.services.reference_edit_links import ReferenceEditLinkService

router = APIRouter(tags=["reference-edit-links"])


@router.post(
    "/registries/{registry_id}/reference-edit-links",
    response_model=ReferenceEditLinkTokenRead,
    status_code=status.HTTP_201_CREATED,
)
def create_reference_edit_link(
    registry_id: UUID,
    payload: ReferenceEditLinkCreate,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> ReferenceEditLinkTokenRead:
    try:
        token = ReferenceEditLinkService(session).create_for_actor(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
            owner_organization_id=payload.owner_organization_id,
            expires_in_days=payload.expires_in_days,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return _link_token_read(
        token.raw_token, token.reference_edit_link, ReferenceEditLinkService(session)
    )


@router.get(
    "/registries/{registry_id}/reference-edit-links", response_model=ReferenceEditLinkListRead
)
def list_reference_edit_links(
    registry_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> ReferenceEditLinkListRead:
    service = ReferenceEditLinkService(session)
    try:
        items = service.list_for_actor(actor_user_id=actor_user_id, registry_id=registry_id)
    except Exception as exc:
        raise_service_http_error(exc)
    return ReferenceEditLinkListRead(items=[_link_read(item, service) for item in items])


@router.post("/reference-edit-links/{link_id}/close", response_model=ReferenceEditLinkRead)
def close_reference_edit_link(
    link_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> ReferenceEditLinkRead:
    service = ReferenceEditLinkService(session)
    try:
        item = service.close_for_actor(actor_user_id=actor_user_id, link_id=link_id)
    except Exception as exc:
        raise_service_http_error(exc)
    return _link_read(item, service)


@router.post("/public/reference-edit-links/workspace", response_model=PublicReferenceWorkspaceRead)
def public_reference_workspace(
    payload: PublicReferenceEditTokenRequest,
    session: Annotated[Session, Depends(get_db_session)],
) -> PublicReferenceWorkspaceRead:
    service = ReferenceEditLinkService(session)
    try:
        reference_edit_link, reference_lists = service.list_public_reference_lists(
            raw_token=payload.raw_token,
            include_archived=True,
        )
        items = [
            item
            for reference_list in reference_lists
            for item in service.list_public_reference_items(
                raw_token=payload.raw_token,
                list_id=reference_list.id,
                include_archived=True,
            )[1]
        ]
    except Exception as exc:
        raise_service_http_error(exc)
    link_status = service.status(reference_edit_link)
    return PublicReferenceWorkspaceRead(
        status=link_status,
        can_edit=link_status == "active",
        registry_id=reference_edit_link.registry_id,
        owner_organization_id=reference_edit_link.owner_organization_id,
        lists=[_public_list_read(item) for item in reference_lists],
        items=[_public_item_read(item) for item in items],
    )


@router.post(
    "/public/reference-edit-links/lists",
    response_model=PublicReferenceListRead,
    status_code=status.HTTP_201_CREATED,
)
def create_public_reference_list(
    payload: PublicReferenceListCreate,
    session: Annotated[Session, Depends(get_db_session)],
) -> PublicReferenceListRead:
    try:
        item = ReferenceEditLinkService(session).create_public_reference_list(
            raw_token=payload.raw_token,
            name=payload.name,
            description=payload.description,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return _public_list_read(item)


@router.patch(
    "/public/reference-edit-links/lists/{list_id}", response_model=PublicReferenceListRead
)
def update_public_reference_list(
    list_id: UUID,
    payload: PublicReferenceListUpdate,
    session: Annotated[Session, Depends(get_db_session)],
) -> PublicReferenceListRead:
    try:
        item = ReferenceEditLinkService(session).update_public_reference_list(
            raw_token=payload.raw_token,
            list_id=list_id,
            name=payload.name,
            description=payload.description,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return _public_list_read(item)


@router.delete(
    "/public/reference-edit-links/lists/{list_id}", response_model=PublicReferenceListRead
)
def archive_public_reference_list(
    list_id: UUID,
    payload: PublicReferenceEditTokenRequest,
    session: Annotated[Session, Depends(get_db_session)],
) -> PublicReferenceListRead:
    try:
        item = ReferenceEditLinkService(session).archive_public_reference_list(
            raw_token=payload.raw_token,
            list_id=list_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return _public_list_read(item)


@router.post(
    "/public/reference-edit-links/lists/{list_id}/items",
    response_model=PublicReferenceItemRead,
    status_code=status.HTTP_201_CREATED,
)
def create_public_reference_item(
    list_id: UUID,
    payload: PublicReferenceItemCreate,
    session: Annotated[Session, Depends(get_db_session)],
) -> PublicReferenceItemRead:
    try:
        item = ReferenceEditLinkService(session).create_public_reference_item(
            raw_token=payload.raw_token,
            list_id=list_id,
            label=payload.label,
            parent_id=payload.parent_id,
            description=payload.description,
            position=payload.position,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return _public_item_read(item)


@router.patch(
    "/public/reference-edit-links/items/{item_id}", response_model=PublicReferenceItemRead
)
def update_public_reference_item(
    item_id: UUID,
    payload: PublicReferenceItemUpdate,
    session: Annotated[Session, Depends(get_db_session)],
) -> PublicReferenceItemRead:
    try:
        item = ReferenceEditLinkService(session).update_public_reference_item(
            raw_token=payload.raw_token,
            item_id=item_id,
            label=payload.label,
            description=payload.description,
            position=payload.position,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return _public_item_read(item)


@router.delete(
    "/public/reference-edit-links/items/{item_id}", response_model=PublicReferenceItemRead
)
def archive_public_reference_item(
    item_id: UUID,
    payload: PublicReferenceEditTokenRequest,
    session: Annotated[Session, Depends(get_db_session)],
) -> PublicReferenceItemRead:
    try:
        item = ReferenceEditLinkService(session).archive_public_reference_item(
            raw_token=payload.raw_token,
            item_id=item_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return _public_item_read(item)


def _link_read(item, service: ReferenceEditLinkService) -> ReferenceEditLinkRead:
    return ReferenceEditLinkRead(
        id=item.id,
        registry_id=item.registry_id,
        owner_organization_id=item.owner_organization_id,
        status=service.status(item),
        expires_at=item.expires_at,
        closed_at=item.closed_at,
        created_at=item.created_at,
    )


def _link_token_read(
    raw_token: str, item, service: ReferenceEditLinkService
) -> ReferenceEditLinkTokenRead:
    return ReferenceEditLinkTokenRead(raw_token=raw_token, **_link_read(item, service).model_dump())


def _public_list_read(item) -> PublicReferenceListRead:
    return PublicReferenceListRead(
        id=item.id,
        name=item.name,
        description=item.description,
        archived_at=item.archived_at,
    )


def _public_item_read(item) -> PublicReferenceItemRead:
    return PublicReferenceItemRead(
        id=item.id,
        list_id=item.list_id,
        parent_id=item.parent_id,
        label=item.label,
        description=item.description,
        position=item.position,
        archived_at=item.archived_at,
    )
