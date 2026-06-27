from uuid import UUID, uuid4

from app.services.audit import AuditEventCreate, AuditService
from app.services.permissions import ActorContext


class InMemoryAuditRepository:
    def __init__(self) -> None:
        self.events: list[dict[str, object]] = []

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
        self.events.append(
            {
                "id": event_id,
                "actor_type": actor_type,
                "actor_user_id": actor_user_id,
                "actor_public_link_id": actor_public_link_id,
                "action": action,
                "object_type": object_type,
                "object_id": object_id,
                "old_data": old_data,
                "new_data": new_data,
                "source": source,
            }
        )
        return event_id


def test_audit_service_records_user_public_link_and_system_events() -> None:
    repository = InMemoryAuditRepository()
    service = AuditService(repository)
    actor = ActorContext(user_id=uuid4(), is_superuser=True, grants=())
    public_link_id = uuid4()
    card_id = uuid4()

    service.record_user_event(
        actor,
        AuditEventCreate(action="card.create", object_type="card", object_id=card_id),
    )
    service.record_public_link_event(
        public_link_id,
        AuditEventCreate(
            action="public_link.value_update",
            object_type="field_value",
            object_id=uuid4(),
        ),
    )
    service.record_system_event(
        AuditEventCreate(
            action="card.transfer",
            object_type="card",
            object_id=card_id,
            new_data={"target_card_id": uuid4()},
        )
    )

    assert [event["actor_type"] for event in repository.events] == [
        "user",
        "public_link",
        "system",
    ]
    assert repository.events[0]["actor_user_id"] == actor.user_id
    assert repository.events[1]["actor_public_link_id"] == public_link_id
    assert repository.events[2]["source"] == "system"
