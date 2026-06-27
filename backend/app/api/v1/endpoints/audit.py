from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.api.dependencies import get_audit_service, get_current_actor
from app.schemas.audit import AuditEventResponse
from app.services.audit import AuditEventFilters, AuditService
from app.services.permissions import ActorContext

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("", response_model=tuple[AuditEventResponse, ...])
def list_audit_events(
    actor: Annotated[ActorContext, Depends(get_current_actor)],
    service: Annotated[AuditService, Depends(get_audit_service)],
    object_type: Annotated[str | None, Query()] = None,
    object_id: Annotated[UUID | None, Query()] = None,
    action: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
) -> tuple[AuditEventResponse, ...]:
    events = service.list_events(
        actor,
        AuditEventFilters(
            object_type=object_type,
            object_id=object_id,
            action=action,
            limit=limit,
        ),
    )
    return tuple(AuditEventResponse.model_validate(event) for event in events)


@router.get("/cards/{card_id}", response_model=tuple[AuditEventResponse, ...])
def list_card_audit_events(
    card_id: UUID,
    actor: Annotated[ActorContext, Depends(get_current_actor)],
    service: Annotated[AuditService, Depends(get_audit_service)],
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
) -> tuple[AuditEventResponse, ...]:
    events = service.list_events(
        actor,
        AuditEventFilters(object_type="card", object_id=card_id, limit=limit),
    )
    return tuple(AuditEventResponse.model_validate(event) for event in events)


@router.get("/organizations/{organization_id}", response_model=tuple[AuditEventResponse, ...])
def list_organization_audit_events(
    organization_id: UUID,
    actor: Annotated[ActorContext, Depends(get_current_actor)],
    service: Annotated[AuditService, Depends(get_audit_service)],
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
) -> tuple[AuditEventResponse, ...]:
    events = service.list_events(
        actor,
        AuditEventFilters(
            object_type="organization",
            object_id=organization_id,
            limit=limit,
        ),
    )
    return tuple(AuditEventResponse.model_validate(event) for event in events)
