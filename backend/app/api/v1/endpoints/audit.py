from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.dependencies import get_actor_user_id, get_db_session, raise_service_http_error
from app.schemas.audit import AuditEventListRead, AuditEventRead
from app.services.audit import AuditService

router = APIRouter(prefix="/audit-events", tags=["audit"])


@router.get("", response_model=AuditEventListRead)
def list_audit_events(
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
    object_type: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> AuditEventListRead:
    try:
        events = AuditService(session).list_events_for_actor(
            actor_user_id=actor_user_id,
            object_type=object_type,
            limit=limit,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return AuditEventListRead(items=[AuditEventRead.model_validate(event) for event in events])
