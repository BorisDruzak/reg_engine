from collections.abc import Callable
from datetime import UTC, datetime
from typing import Protocol
from uuid import UUID, uuid4

from app.models.audit import AuditEvent


class SessionLike(Protocol):
    def add(self, instance: object) -> None:
        """Stage an ORM instance for persistence."""

    def flush(self) -> None:
        """Flush pending ORM changes."""


class SQLAlchemyAuditRepository:
    def __init__(
        self,
        session: SessionLike,
        *,
        now_provider: Callable[[], datetime] | None = None,
    ) -> None:
        self.session = session
        self.now_provider = now_provider or (lambda: datetime.now(UTC))

    def create_event(
        self,
        *,
        actor_type: str,
        actor_user_id: UUID | None,
        actor_public_link_id: UUID | None,
        action: str,
        object_type: str,
        object_id: UUID | None,
        old_data: dict[str, object] | None,
        new_data: dict[str, object] | None,
        source: str,
    ) -> UUID:
        event_id = uuid4()
        event = AuditEvent(
            id=event_id,
            actor_type=actor_type,
            actor_user_id=actor_user_id,
            actor_public_link_id=actor_public_link_id,
            action=action,
            object_type=object_type,
            object_id=object_id,
            old_data_json=old_data,
            new_data_json=new_data,
            source=source,
            created_at=self.now_provider(),
        )
        self.session.add(event)
        self.session.flush()
        return event_id
