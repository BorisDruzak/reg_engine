from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_actor_user_id, get_db_session, raise_service_http_error
from app.schemas.access_management import (
    AccessGrantCreate,
    AccessGrantListRead,
    AccessGrantRead,
    PermissionListRead,
    PermissionRead,
    RoleListRead,
    RoleRead,
    UserCreate,
    UserListRead,
    UserRead,
    UserUpdate,
)
from app.services.user_access import UserAccessService

router = APIRouter(tags=["access-management"])


@router.get("/users", response_model=UserListRead)
def list_users(
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> UserListRead:
    try:
        users = UserAccessService(session).list_users_for_actor(actor_user_id=actor_user_id)
    except Exception as exc:
        raise_service_http_error(exc)
    service = UserAccessService(session)
    return UserListRead(
        items=[UserRead.model_validate(service.user_read_data(user)) for user in users]
    )


@router.post("/users", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> UserRead:
    try:
        user = UserAccessService(session).create_user_for_actor(
            actor_user_id=actor_user_id,
            email=payload.email,
            display_name=payload.display_name,
            password=payload.password,
            status=payload.status,
            is_superuser=payload.is_superuser,
            role_code=payload.role_code,
            organization_ids=payload.organization_ids,
            can_manage_access=payload.can_manage_access,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return UserRead.model_validate(UserAccessService(session).user_read_data(user))


@router.get("/users/{user_id}", response_model=UserRead)
def read_user(
    user_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> UserRead:
    try:
        user = UserAccessService(session).read_user_for_actor(
            actor_user_id=actor_user_id,
            user_id=user_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return UserRead.model_validate(UserAccessService(session).user_read_data(user))


@router.patch("/users/{user_id}", response_model=UserRead)
def update_user(
    user_id: UUID,
    payload: UserUpdate,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> UserRead:
    try:
        user = UserAccessService(session).update_user_for_actor(
            actor_user_id=actor_user_id,
            user_id=user_id,
            email=payload.email,
            display_name=payload.display_name,
            password=payload.password,
            status=payload.status,
            is_superuser=payload.is_superuser,
            role_code=payload.role_code,
            organization_ids=payload.organization_ids,
            can_manage_access=payload.can_manage_access,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return UserRead.model_validate(UserAccessService(session).user_read_data(user))


@router.delete("/users/{user_id}", response_model=UserRead)
def archive_user(
    user_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> UserRead:
    try:
        user = UserAccessService(session).archive_user_for_actor(
            actor_user_id=actor_user_id,
            user_id=user_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return UserRead.model_validate(UserAccessService(session).user_read_data(user))


@router.get("/roles", response_model=RoleListRead)
def list_roles(
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> RoleListRead:
    try:
        roles = UserAccessService(session).list_roles_for_actor(actor_user_id=actor_user_id)
    except Exception as exc:
        raise_service_http_error(exc)
    return RoleListRead(items=[RoleRead.model_validate(role) for role in roles])


@router.get("/roles/{role_id}", response_model=RoleRead)
def read_role(
    role_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> RoleRead:
    try:
        role = UserAccessService(session).read_role_for_actor(
            actor_user_id=actor_user_id,
            role_id=role_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return RoleRead.model_validate(role)


@router.get("/permissions", response_model=PermissionListRead)
def list_permissions(
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> PermissionListRead:
    try:
        permissions = UserAccessService(session).list_permissions_for_actor(
            actor_user_id=actor_user_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return PermissionListRead(
        items=[PermissionRead.model_validate(permission) for permission in permissions]
    )


@router.get("/access-grants", response_model=AccessGrantListRead)
def list_access_grants(
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
    user_id: Annotated[UUID | None, Query()] = None,
    organization_id: Annotated[UUID | None, Query()] = None,
    include_archived: Annotated[bool, Query()] = False,
) -> AccessGrantListRead:
    try:
        grants = UserAccessService(session).list_access_grants_for_actor(
            actor_user_id=actor_user_id,
            user_id=user_id,
            organization_id=organization_id,
            include_archived=include_archived,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return AccessGrantListRead(items=[AccessGrantRead.model_validate(grant) for grant in grants])


@router.post(
    "/access-grants",
    response_model=AccessGrantRead,
    status_code=status.HTTP_201_CREATED,
)
def create_access_grant(
    payload: AccessGrantCreate,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> AccessGrantRead:
    try:
        grant = UserAccessService(session).create_access_grant_for_actor(
            actor_user_id=actor_user_id,
            user_id=payload.user_id,
            role_id=payload.role_id,
            registry_id=payload.registry_id,
            organization_id=payload.organization_id,
            include_descendants=payload.include_descendants,
            valid_from=payload.valid_from,
            valid_to=payload.valid_to,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return AccessGrantRead.model_validate(grant)


@router.delete("/access-grants/{grant_id}", response_model=AccessGrantRead)
def archive_access_grant(
    grant_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> AccessGrantRead:
    try:
        grant = UserAccessService(session).archive_access_grant_for_actor(
            actor_user_id=actor_user_id,
            grant_id=grant_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return AccessGrantRead.model_validate(grant)
