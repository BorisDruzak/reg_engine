from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.models import AuditEvent


class AuditService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def record_user_event(
        self,
        *,
        actor_user_id: UUID,
        action: str,
        object_type: str,
        object_id: UUID | None = None,
        old_data_json: dict[str, Any] | None = None,
        new_data_json: dict[str, Any] | None = None,
        source: str = "api",
    ) -> AuditEvent:
        return self._record(
            actor_type="user",
            actor_user_id=actor_user_id,
            actor_public_link_id=None,
            action=action,
            object_type=object_type,
            object_id=object_id,
            old_data_json=old_data_json,
            new_data_json=new_data_json,
            source=source,
        )

    def record_public_link_event(
        self,
        *,
        actor_public_link_id: UUID,
        action: str,
        object_type: str,
        object_id: UUID | None = None,
        old_data_json: dict[str, Any] | None = None,
        new_data_json: dict[str, Any] | None = None,
    ) -> AuditEvent:
        return self._record(
            actor_type="public_link",
            actor_user_id=None,
            actor_public_link_id=actor_public_link_id,
            action=action,
            object_type=object_type,
            object_id=object_id,
            old_data_json=old_data_json,
            new_data_json=new_data_json,
            source="public_link",
        )

    def record_system_event(
        self,
        *,
        action: str,
        object_type: str,
        object_id: UUID | None = None,
        old_data_json: dict[str, Any] | None = None,
        new_data_json: dict[str, Any] | None = None,
    ) -> AuditEvent:
        return self._record(
            actor_type="system",
            actor_user_id=None,
            actor_public_link_id=None,
            action=action,
            object_type=object_type,
            object_id=object_id,
            old_data_json=old_data_json,
            new_data_json=new_data_json,
            source="system",
        )

    def _record(
        self,
        *,
        actor_type: str,
        actor_user_id: UUID | None,
        actor_public_link_id: UUID | None,
        action: str,
        object_type: str,
        object_id: UUID | None,
        old_data_json: dict[str, Any] | None,
        new_data_json: dict[str, Any] | None,
        source: str,
    ) -> AuditEvent:
        event = AuditEvent(
            actor_type=actor_type,
            actor_user_id=actor_user_id,
            actor_public_link_id=actor_public_link_id,
            action=action,
            object_type=object_type,
            object_id=object_id,
            old_data_json=old_data_json,
            new_data_json=new_data_json,
            source=source,
        )
        self.session.add(event)
        self.session.flush()
        return event
