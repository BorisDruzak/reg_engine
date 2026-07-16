from typing import Annotated, Literal
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
    scope: Annotated[Literal["technical", "card_history"], Query()] = "technical",
    card_id: Annotated[UUID | None, Query()] = None,
    card_status: Annotated[Literal["active", "archived", "all"], Query()] = "active",
    actor_filter_user_id: Annotated[UUID | None, Query(alias="actor_user_id")] = None,
) -> AuditEventListRead:
    try:
        events = AuditService(session).list_events_for_actor(
            actor_user_id=actor_user_id,
            object_type=object_type,
            limit=limit,
            scope=scope,
            card_id=card_id,
            card_status=card_status,
            actor_filter_user_id=actor_filter_user_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return AuditEventListRead(
        items=[
            AuditEventRead.from_event(
                item.event,
                actor_display_name=item.actor_display_name,
                attributed_user_display_name=item.attributed_user_display_name,
                card_display_name=item.card_display_name,
                card_lifecycle_status=item.card_lifecycle_status,
                old_data_json=item.old_data_json,
                new_data_json=item.new_data_json,
            )
            for item in events
        ]
    )
