from datetime import UTC, datetime
from uuid import UUID, uuid4

from app.models.audit import AuditEvent
from app.repositories.audit import SQLAlchemyAuditRepository


class FakeSession:
    def __init__(self) -> None:
        self.added: list[object] = []
        self.flushed = False

    def add(self, instance: object) -> None:
        self.added.append(instance)

    def flush(self) -> None:
        self.flushed = True


def test_sqlalchemy_audit_repository_creates_audit_event_model() -> None:
    session = FakeSession()
    created_at = datetime(2026, 6, 27, 12, 0, tzinfo=UTC)
    repository = SQLAlchemyAuditRepository(session, now_provider=lambda: created_at)
    user_id = uuid4()
    object_id = uuid4()

    event_id = repository.create_event(
        actor_type="user",
        actor_user_id=user_id,
        actor_public_link_id=None,
        action="card.create",
        object_type="card",
        object_id=object_id,
        old_data=None,
        new_data={"display_name": "Card"},
        source="api",
    )

    assert isinstance(event_id, UUID)
    assert session.flushed is True
    assert len(session.added) == 1
    event = session.added[0]
    assert isinstance(event, AuditEvent)
    assert event.id == event_id
    assert event.actor_type == "user"
    assert event.actor_user_id == user_id
    assert event.actor_public_link_id is None
    assert event.action == "card.create"
    assert event.object_type == "card"
    assert event.object_id == object_id
    assert event.old_data_json is None
    assert event.new_data_json == {"display_name": "Card"}
    assert event.source == "api"
    assert event.created_at == created_at
