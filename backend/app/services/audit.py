from dataclasses import dataclass
from datetime import datetime
from typing import Protocol, cast
from uuid import UUID

from app.services.permissions import AccessDeniedError, ActorContext


@dataclass(frozen=True)
class AuditEventCreate:
    action: str
    object_type: str
    object_id: UUID | None
    old_data: dict[str, object] | None = None
    new_data: dict[str, object] | None = None
    source: str = "api"


@dataclass(frozen=True)
class AuditEventFilters:
    object_type: str | None = None
    object_id: UUID | None = None
    action: str | None = None
    limit: int = 100


@dataclass(frozen=True)
class AuditEventRead:
    id: UUID
    actor_type: str
    actor_user_id: UUID | None
    actor_public_link_id: UUID | None
    action: str
    object_type: str
    object_id: UUID | None
    old_data: dict[str, object] | None
    new_data: dict[str, object] | None
    source: str
    created_at: datetime


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

    def list_events(self, filters: AuditEventFilters) -> list[dict[str, object]]:
        """Return audit events matching filters."""


class AuditRecorder(Protocol):
    def record_user_event(self, actor: ActorContext, event: AuditEventCreate) -> UUID:
        """Record an audit event for an authenticated user actor."""

    def record_public_link_event(
        self,
        public_link_id: UUID,
        event: AuditEventCreate,
    ) -> UUID:
        """Record an audit event for a public-link actor."""

    def record_system_event(self, event: AuditEventCreate) -> UUID:
        """Record an audit event for a system actor."""


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

    def list_events(
        self,
        actor: ActorContext,
        filters: AuditEventFilters,
    ) -> tuple[AuditEventRead, ...]:
        if not actor.is_superuser:
            raise AccessDeniedError("Only system admins can read audit events.")
        return tuple(self._event_to_read(event) for event in self.repository.list_events(filters))

    def _event_to_read(self, event: dict[str, object]) -> AuditEventRead:
        return AuditEventRead(
            id=cast(UUID, event["id"]),
            actor_type=str(event["actor_type"]),
            actor_user_id=cast(UUID | None, event["actor_user_id"]),
            actor_public_link_id=cast(UUID | None, event["actor_public_link_id"]),
            action=str(event["action"]),
            object_type=str(event["object_type"]),
            object_id=cast(UUID | None, event["object_id"]),
            old_data=cast(dict[str, object] | None, event["old_data"]),
            new_data=cast(dict[str, object] | None, event["new_data"]),
            source=str(event["source"]),
            created_at=cast(datetime, event["created_at"]),
        )
