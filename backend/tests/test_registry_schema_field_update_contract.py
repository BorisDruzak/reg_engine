from unittest.mock import Mock
from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

from app.api.v1.endpoints import registries as registry_endpoints
from app.models import FormBlock, FormField, ReferenceList
from app.schemas.registries import FormFieldUpdate
from app.services.registry_schema import RegistrySchemaError, RegistrySchemaService


def _field(*, block_id):
    return FormField(
        id=uuid4(),
        block_id=block_id,
        code="status",
        label="Статус",
        description=None,
        field_type="text",
        position=0,
        required_mode="not_required",
        options_source_type=None,
        options_source_id=None,
        options_config_json=None,
        display_config_json=None,
        is_system=False,
        is_locked=False,
        is_active=True,
        is_list_display=False,
        public_visible=True,
        public_editable=False,
    )


def test_field_update_endpoint_forwards_every_editable_schema_property(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    actor_user_id = uuid4()
    block_id = uuid4()
    field = _field(block_id=block_id)
    reference_list_id = uuid4()
    captured: dict[str, object] = {}

    class FakeRegistrySchemaService:
        def __init__(self, _session: object) -> None:
            pass

        def update_field_for_actor(self, **payload: object) -> FormField:
            captured.update(payload)
            field.label = str(payload["label"])
            field.description = str(payload["description"])
            field.field_type = str(payload["field_type"])
            field.required_mode = str(payload["required_mode"])
            field.options_source_type = str(payload["options_source_type"])
            field.options_source_id = payload["options_source_id"]  # type: ignore[assignment]
            field.options_config_json = payload["options_config_json"]  # type: ignore[assignment]
            field.public_visible = bool(payload["public_visible"])
            field.public_editable = bool(payload["public_editable"])
            field.is_list_display = bool(payload["is_list_display"])
            return field

    monkeypatch.setattr(registry_endpoints, "RegistrySchemaService", FakeRegistrySchemaService)

    result = registry_endpoints.update_field(
        field_id=field.id,
        payload=FormFieldUpdate.model_validate(
            {
                "label": "Статус заявки",
                "description": "Выберите статус",
                "field_type": "select",
                "required_mode": "required",
                "options_source_type": "reference_list",
                "options_source_id": reference_list_id,
                "options_config_json": {"allow_empty": False},
                "public_visible": False,
                "public_editable": True,
                "is_list_display": True,
            }
        ),
        session=Mock(spec=Session),
        actor_user_id=actor_user_id,
    )

    assert captured["actor_user_id"] == actor_user_id
    assert captured["field_type"] == "select"
    assert captured["options_source_type"] == "reference_list"
    assert captured["options_source_id"] == reference_list_id
    assert captured["public_visible"] is False
    assert captured["public_editable"] is True
    assert result.field_type == "select"
    assert result.options_source_id == reference_list_id


def test_field_update_service_persists_reference_visibility_and_static_text_with_audit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    actor_user_id = uuid4()
    registry_id = uuid4()
    block_id = uuid4()
    reference_list_id = uuid4()
    field = _field(block_id=block_id)
    block = FormBlock(id=block_id, registry_id=registry_id, code="main", title="Основной")
    reference_list = ReferenceList(
        id=reference_list_id,
        registry_id=registry_id,
        owner_organization_id=None,
        code="statuses",
        name="Статусы",
        is_active=True,
        archived_at=None,
    )
    session = Mock(spec=Session)
    session.get.return_value = reference_list
    service = RegistrySchemaService(session)
    permission_check = Mock()
    audit_events: list[dict[str, object]] = []

    monkeypatch.setattr(service, "_get_active_field", lambda _field_id: field)
    monkeypatch.setattr(service, "_get_active_block", lambda _block_id: block)
    monkeypatch.setattr(service, "_ensure_mutable_field", lambda _field: None)
    monkeypatch.setattr(service, "_require_schema_permission", permission_check)
    monkeypatch.setattr(service, "ensure_base_card_template_for_registry", lambda **_payload: None)
    monkeypatch.setattr(
        "app.services.registry_schema.AuditService.record_user_event",
        lambda _self, **payload: audit_events.append(payload),
    )

    updated = service.update_field_for_actor(
        actor_user_id=actor_user_id,
        field_id=field.id,
        label="Статус заявки",
        description="Выберите статус",
        field_type="select",
        required_mode="required",
        options_source_type="reference_list",
        options_source_id=reference_list_id,
        options_config_json={"allow_empty": False},
        public_visible=False,
        public_editable=True,
        is_list_display=True,
    )

    assert updated.field_type == "select"
    assert updated.options_source_type == "reference_list"
    assert updated.options_source_id == reference_list_id
    assert updated.options_config_json == {"allow_empty": False}
    assert updated.public_visible is False
    assert updated.public_editable is True
    assert updated.is_list_display is True

    updated_static = service.update_field_for_actor(
        actor_user_id=actor_user_id,
        field_id=field.id,
        field_type="static_text",
        required_mode="not_required",
        options_source_type=None,
        options_source_id=None,
        options_config_json={"static_text": "Только для чтения"},
        public_visible=True,
        public_editable=False,
        is_list_display=False,
    )

    assert updated_static.field_type == "static_text"
    assert updated_static.options_source_type is None
    assert updated_static.options_source_id is None
    assert updated_static.options_config_json == {"static_text": "Только для чтения"}
    assert updated_static.public_editable is False
    assert permission_check.call_count == 2
    assert len(audit_events) == 2
    assert audit_events[-1]["new_data_json"] == {
        "label": "Статус заявки",
        "description": "Выберите статус",
        "field_type": "static_text",
        "position": 0,
        "required_mode": "not_required",
        "options_source_type": None,
        "options_source_id": None,
        "options_config_json": {"static_text": "Только для чтения"},
        "display_config_json": None,
        "is_active": True,
        "is_list_display": False,
        "public_visible": True,
        "public_editable": False,
    }


def test_field_update_service_rejects_reference_list_from_another_registry(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    block_id = uuid4()
    field = _field(block_id=block_id)
    block = FormBlock(id=block_id, registry_id=uuid4(), code="main", title="Основной")
    foreign_reference = ReferenceList(
        id=uuid4(),
        registry_id=uuid4(),
        owner_organization_id=None,
        code="foreign",
        name="Чужой справочник",
        is_active=True,
        archived_at=None,
    )
    session = Mock(spec=Session)
    session.get.return_value = foreign_reference
    service = RegistrySchemaService(session)

    monkeypatch.setattr(service, "_get_active_field", lambda _field_id: field)
    monkeypatch.setattr(service, "_get_active_block", lambda _block_id: block)
    monkeypatch.setattr(service, "_ensure_mutable_field", lambda _field: None)
    monkeypatch.setattr(service, "_require_schema_permission", lambda *_args: None)

    with pytest.raises(RegistrySchemaError, match="reference list"):
        service.update_field_for_actor(
            actor_user_id=uuid4(),
            field_id=field.id,
            field_type="select",
            options_source_type="reference_list",
            options_source_id=foreign_reference.id,
        )
