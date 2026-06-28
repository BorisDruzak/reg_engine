from datetime import UTC, datetime
from ipaddress import ip_address
from types import SimpleNamespace
from uuid import uuid4

from app.schemas.audit import AuditEventRead


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
