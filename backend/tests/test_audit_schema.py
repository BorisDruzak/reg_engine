from datetime import UTC, datetime
from ipaddress import ip_address
from types import SimpleNamespace
from uuid import uuid4

from app.models import AuditEvent
from app.schemas.audit import AuditEventRead
from app.services.audit import AuditService


def test_audit_event_read_serializes_database_ip_address_objects() -> None:
    event = SimpleNamespace(
        id=uuid4(),
        actor_type="user",
        actor_user_id=uuid4(),
        actor_public_link_id=None,
        action="update",
        object_type="card",
        object_id=uuid4(),
        old_data_json=None,
        new_data_json={"field": "value"},
        source="api",
        ip_address=ip_address("198.51.100.25"),
        user_agent="phase-1l5-test",
        request_id="phase-1l5-request",
        created_at=datetime.now(UTC),
    )

    payload = AuditEventRead.model_validate(event)

    assert payload.ip_address == "198.51.100.25"


def test_audit_schema_serializes_public_actor_display_name() -> None:
    event = AuditEvent(
        id=uuid4(),
        actor_type="public_link",
        actor_user_id=None,
        actor_public_link_id=uuid4(),
        actor_display_name="Иванов Иван Иванович",
        action="public_link.update",
        object_type="field_value",
        object_id=uuid4(),
        old_data_json=None,
        new_data_json={"field": "value"},
        source="public_link",
        ip_address=None,
        user_agent=None,
        request_id=None,
        created_at=datetime.now(UTC),
    )

    payload = AuditEventRead.model_validate(event)

    assert payload.actor_display_name == "Иванов Иван Иванович"


def test_audit_service_serializes_uuid_values_in_event_data() -> None:
    class RecordingSession:
        info: dict[str, object] = {}

        def __init__(self) -> None:
            self.event: AuditEvent | None = None

        def add(self, event: AuditEvent) -> None:
            self.event = event

        def flush(self) -> None:
            return None

    organization_id = uuid4()
    session = RecordingSession()

    AuditService(session).record_user_event(  # type: ignore[arg-type]
        actor_user_id=uuid4(),
        action="update",
        object_type="user_role_profile",
        object_id=uuid4(),
        new_data_json={"organization_ids": [organization_id]},
    )

    assert session.event is not None
    assert session.event.new_data_json == {"organization_ids": [str(organization_id)]}
