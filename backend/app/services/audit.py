from dataclasses import dataclass
from typing import Protocol
from uuid import UUID

from app.services.permissions import ActorContext


@dataclass(frozen=True)
class AuditEventCreate:
    action: str
    object_type: str
    object_id: UUID | None
    old_data: dict[str, object] | None = None
    new_data: dict[str, object] | None = None
    source: str = "api"


class AuditRepository(Protocol):
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
        """Create an audit event and return its id."""


class AuditService:
    def __init__(self, repository: AuditRepository) -> None:
        self.repository = repository

    def record_user_event(self, actor: ActorContext, event: AuditEventCreate) -> UUID:
        return self.repository.create_event(
            actor_type="user",
            actor_user_id=actor.user_id,
            actor_public_link_id=None,
            action=event.action,
            object_type=event.object_type,
            object_id=event.object_id,
            old_data=event.old_data,
            new_data=event.new_data,
            source=event.source,
        )

    def record_public_link_event(
        self,
        public_link_id: UUID,
        event: AuditEventCreate,
    ) -> UUID:
        return self.repository.create_event(
            actor_type="public_link",
            actor_user_id=None,
            actor_public_link_id=public_link_id,
            action=event.action,
            object_type=event.object_type,
            object_id=event.object_id,
            old_data=event.old_data,
            new_data=event.new_data,
            source="public_link",
        )

    def record_system_event(self, event: AuditEventCreate) -> UUID:
        return self.repository.create_event(
            actor_type="system",
            actor_user_id=None,
            actor_public_link_id=None,
            action=event.action,
            object_type=event.object_type,
            object_id=event.object_id,
            old_data=event.old_data,
            new_data=event.new_data,
            source="system",
        )
