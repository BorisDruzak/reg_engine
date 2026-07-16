from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
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
    scope: Annotated[Literal["technical", "card_history"], Query()] = "technical",
    card_id: Annotated[UUID | None, Query()] = None,
) -> AuditEventListRead:
    if scope == "card_history" and card_id is None:
        raise HTTPException(status_code=422, detail="card_id is required for card history.")
    try:
        events = AuditService(session).list_events_for_actor(
            actor_user_id=actor_user_id,
            object_type=object_type,
            limit=limit,
            scope=scope,
            card_id=card_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return AuditEventListRead(
        items=[
            AuditEventRead.from_event(
                item.event,
                actor_display_name=item.actor_display_name,
                attributed_user_display_name=item.attributed_user_display_name,
            )
            for item in events
        ]
    )
