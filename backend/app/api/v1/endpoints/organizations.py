from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_actor_user_id, get_db_session, raise_service_http_error
from app.models import Organization
from app.schemas.organizations import (
    OrganizationCreate,
    OrganizationListRead,
    OrganizationRead,
    OrganizationTreeNodeRead,
    OrganizationTreeRead,
    OrganizationUpdate,
    OrgUnitCreate,
    OrgUnitListRead,
    OrgUnitRead,
    OrgUnitUpdate,
)
from app.services.organizations import OrganizationService

router = APIRouter(tags=["organizations"])


@router.post("/organizations", response_model=OrganizationRead, status_code=status.HTTP_201_CREATED)
def create_organization(
    payload: OrganizationCreate,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> OrganizationRead:
    service = OrganizationService(session)
    try:
        if payload.parent_id is None:
            organization = service.create_root_for_actor(
                actor_user_id=actor_user_id,
                code=payload.code,
                name=payload.name,
                organization_type=payload.organization_type,
            )
        else:
            organization = service.create_child_for_actor(
                actor_user_id=actor_user_id,
                parent_id=payload.parent_id,
                code=payload.code,
                name=payload.name,
                organization_type=payload.organization_type,
            )
    except Exception as exc:
        raise_service_http_error(exc)
    return OrganizationRead.model_validate(organization)


@router.get("/organizations", response_model=OrganizationListRead)
def list_organizations(
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> OrganizationListRead:
    try:
        organizations = OrganizationService(session).list_organizations_for_actor(
            actor_user_id=actor_user_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return OrganizationListRead(
        items=[OrganizationRead.model_validate(organization) for organization in organizations]
    )


@router.get("/organizations/tree", response_model=OrganizationTreeRead)
def read_organization_tree(
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> OrganizationTreeRead:
    try:
        organizations = OrganizationService(session).list_organizations_for_actor(
            actor_user_id=actor_user_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return OrganizationTreeRead(items=_organization_tree_nodes(organizations))


@router.get("/organizations/{organization_id}", response_model=OrganizationRead)
def read_organization(
    organization_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> OrganizationRead:
    try:
        organization = OrganizationService(session).get_organization_for_actor(
            actor_user_id=actor_user_id,
            organization_id=organization_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return OrganizationRead.model_validate(organization)


@router.patch("/organizations/{organization_id}", response_model=OrganizationRead)
def update_organization(
    organization_id: UUID,
    payload: OrganizationUpdate,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> OrganizationRead:
    try:
        organization = OrganizationService(session).update_organization_for_actor(
            actor_user_id=actor_user_id,
            organization_id=organization_id,
            name=payload.name,
            organization_type=payload.organization_type,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return OrganizationRead.model_validate(organization)


@router.delete("/organizations/{organization_id}", response_model=OrganizationRead)
def archive_organization(
    organization_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> OrganizationRead:
    try:
        organization = OrganizationService(session).archive_organization_for_actor(
            actor_user_id=actor_user_id,
            organization_id=organization_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return OrganizationRead.model_validate(organization)


@router.post(
    "/organizations/{organization_id}/org-units",
    response_model=OrgUnitRead,
    status_code=status.HTTP_201_CREATED,
)
def create_org_unit(
    organization_id: UUID,
    payload: OrgUnitCreate,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> OrgUnitRead:
    try:
        org_unit = OrganizationService(session).create_org_unit_for_actor(
            actor_user_id=actor_user_id,
            organization_id=organization_id,
            code=payload.code,
            name=payload.name,
            parent_id=payload.parent_id,
            unit_type=payload.unit_type,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return OrgUnitRead.model_validate(org_unit)


@router.get("/organizations/{organization_id}/org-units", response_model=OrgUnitListRead)
def list_org_units(
    organization_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> OrgUnitListRead:
    try:
        org_units = OrganizationService(session).list_org_units_for_actor(
            actor_user_id=actor_user_id,
            organization_id=organization_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return OrgUnitListRead(items=[OrgUnitRead.model_validate(org_unit) for org_unit in org_units])


@router.get("/org-units/{org_unit_id}", response_model=OrgUnitRead)
def read_org_unit(
    org_unit_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> OrgUnitRead:
    try:
        org_unit = OrganizationService(session).read_org_unit_for_actor(
            actor_user_id=actor_user_id,
            org_unit_id=org_unit_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return OrgUnitRead.model_validate(org_unit)


@router.patch("/org-units/{org_unit_id}", response_model=OrgUnitRead)
def update_org_unit(
    org_unit_id: UUID,
    payload: OrgUnitUpdate,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> OrgUnitRead:
    try:
        org_unit = OrganizationService(session).update_org_unit_for_actor(
            actor_user_id=actor_user_id,
            org_unit_id=org_unit_id,
            name=payload.name,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return OrgUnitRead.model_validate(org_unit)


@router.delete("/org-units/{org_unit_id}", response_model=OrgUnitRead)
def archive_org_unit(
    org_unit_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> OrgUnitRead:
    try:
        org_unit = OrganizationService(session).archive_org_unit_for_actor(
            actor_user_id=actor_user_id,
            org_unit_id=org_unit_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return OrgUnitRead.model_validate(org_unit)


def _organization_tree_nodes(organizations: list[Organization]) -> list[OrganizationTreeNodeRead]:
    by_parent: dict[UUID | None, list[Organization]] = {}
    visible_ids = {organization.id for organization in organizations}
    for organization in organizations:
        parent_id = organization.parent_id if organization.parent_id in visible_ids else None
        by_parent.setdefault(parent_id, []).append(organization)

    def build(parent_id: UUID | None) -> list[OrganizationTreeNodeRead]:
        nodes: list[OrganizationTreeNodeRead] = []
        for organization in sorted(
            by_parent.get(parent_id, []), key=lambda item: (item.code, item.id)
        ):
            node = OrganizationTreeNodeRead.model_validate(organization)
            node.children = build(organization.id)
            nodes.append(node)
        return nodes

    return build(None)
