from datetime import UTC, datetime
from ipaddress import ip_address
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.models import AuditEvent
from app.schemas.audit import AuditEventRead
from app.services.audit import AuditService
from tests.test_registry_card_services import card_event_context as event_context  # noqa: F401


@pytest.mark.parametrize("template_active", [True, False])
def test_audit_resolves_fio_without_card_display_name(
    event_context,  # noqa: F811
    monkeypatch,
    template_active,
):
    from app.models import CardTemplate, FormBlock, FormField, User
    from app.services.cards import CardServiceError
    from app.services.permissions import PermissionService

    ctx = event_context
    for model in (User, FormBlock, FormField):
        model.__table__.create(ctx.session.get_bind(), checkfirst=True)
    monkeypatch.setattr(PermissionService, "is_superuser", lambda *args: True)
    template = SimpleNamespace(
        id=ctx.card.card_template_id,
        registry_id=ctx.card.registry_id,
        code="historical_custom",
        is_active=template_active,
        archived_at=None,
        field_schema_json={"field_ids": [str(ctx.fields[0].id)]},
    )
    original_get = ctx.session.get
    monkeypatch.setattr(
        ctx.session,
        "get",
        lambda model, key, **kwargs: (
            template
            if model is CardTemplate and key == template.id
            else original_get(model, key, **kwargs)
        ),
    )
    ctx.session.add_all(
        [
            FormBlock(
                id=ctx.block.id,
                registry_id=ctx.card.registry_id,
                code="main",
                title="Данные",
                is_active=True,
            ),
            FormField(
                id=ctx.fields[0].id,
                block_id=ctx.block.id,
                code="fio",
                label="ФИО",
                field_type="text",
                is_active=True,
            ),
        ]
    )
    ctx.values[0].value_text = "Иванов Иван Иванович"
    audit = AuditService(ctx.session)
    audit.record_user_event(
        actor_user_id=ctx.actor_id,
        action="update",
        object_type="card",
        object_id=ctx.card.id,
        card_id=ctx.card.id,
        retention_class="card_history",
    )
    item = audit.list_events_for_actor(actor_user_id=ctx.actor_id, scope="card_history")[0]
    assert item.card_display_value == "Иванов Иван Иванович"
    assert not hasattr(item, "card_display_name")
    if not template_active:
        with pytest.raises(CardServiceError, match="Card template was not found"):
            ctx.service._get_active_card_template_for_registry(
                template.id, registry_id=ctx.card.registry_id, actor_user_id=ctx.actor_id
            )


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
