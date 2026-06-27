from collections.abc import Callable
from datetime import UTC, datetime
from typing import Protocol, cast
from uuid import UUID, uuid4

from sqlalchemy import select

from app.models.audit import AuditEvent
from app.services.audit import AuditEventFilters


class ScalarResultLike(Protocol):
    def all(self) -> list[object]:
        """Return scalar result values."""


class ExecuteResultLike(Protocol):
    def scalars(self) -> ScalarResultLike:
        """Return scalar result wrapper."""


class SessionLike(Protocol):
    def add(self, instance: object) -> None:
        """Stage an ORM instance for persistence."""

    def flush(self) -> None:
        """Flush pending ORM changes."""

    def execute(self, statement: object) -> ExecuteResultLike:
        """Execute a SQLAlchemy statement."""


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

    def list_events(self, filters: AuditEventFilters) -> list[dict[str, object]]:
        statement = select(AuditEvent)
        if filters.object_type is not None:
            statement = statement.where(AuditEvent.object_type == filters.object_type)
        if filters.object_id is not None:
            statement = statement.where(AuditEvent.object_id == filters.object_id)
        if filters.action is not None:
            statement = statement.where(AuditEvent.action == filters.action)
        statement = statement.order_by(AuditEvent.created_at.desc()).limit(filters.limit)
        result = self.session.execute(statement)
        return [self._event_to_dict(event) for event in result.scalars().all()]

    def _event_to_dict(self, event: object) -> dict[str, object]:
        typed_event = cast(AuditEvent, event)
        return {
            "id": typed_event.id,
            "actor_type": typed_event.actor_type,
            "actor_user_id": typed_event.actor_user_id,
            "actor_public_link_id": typed_event.actor_public_link_id,
            "action": typed_event.action,
            "object_type": typed_event.object_type,
            "object_id": typed_event.object_id,
            "old_data": typed_event.old_data_json,
            "new_data": typed_event.new_data_json,
            "source": typed_event.source,
            "created_at": typed_event.created_at,
        }
