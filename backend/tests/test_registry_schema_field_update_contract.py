from unittest.mock import Mock
from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

from app.api.v1.endpoints import registries as registry_endpoints
from app.models import CardTemplate, FormBlock, FormField, ReferenceList
from app.schemas.registries import FormBlockUpdate, FormFieldUpdate
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
                "code": "status_v2",
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
    assert captured["code"] == "status_v2"
    assert captured["field_type"] == "select"
    assert captured["options_source_type"] == "reference_list"
    assert captured["options_source_id"] == reference_list_id
    assert captured["public_visible"] is False
    assert captured["public_editable"] is True
    assert result.field_type == "select"
    assert result.options_source_id == reference_list_id


def test_block_update_endpoint_forwards_complete_semantic_payload(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    actor_user_id = uuid4()
    block = FormBlock(
        id=uuid4(),
        registry_id=uuid4(),
        code="main",
        title="Основной",
        description=None,
        position=0,
        is_repeatable=False,
        is_active=True,
        public_visible=True,
        public_editable=False,
        layout_columns=1,
        display_config_json=None,
    )
    captured: dict[str, object] = {}

    class FakeRegistrySchemaService:
        def __init__(self, _session: object) -> None:
            pass

        def update_block_for_actor(self, **payload: object) -> FormBlock:
            captured.update(payload)
            block.is_repeatable = bool(payload["is_repeatable"])
            block.public_visible = bool(payload["public_visible"])
            block.public_editable = bool(payload["public_editable"])
            block.display_config_json = payload["display_config_json"]  # type: ignore[assignment]
            return block

    monkeypatch.setattr(registry_endpoints, "RegistrySchemaService", FakeRegistrySchemaService)

    result = registry_endpoints.update_block(
        block_id=block.id,
        payload=FormBlockUpdate.model_validate(
            {
                "title": "Основной",
                "is_repeatable": True,
                "public_visible": False,
                "public_editable": True,
                "display_config_json": {
                    "title_position": "bottom",
                    "collapsible": True,
                    "unsafe": "drop-me",
                },
            }
        ),
        session=Mock(spec=Session),
        actor_user_id=actor_user_id,
    )

    assert captured["is_repeatable"] is True
    assert captured["public_visible"] is False
    assert captured["public_editable"] is True
    assert result.display_config_json == {
        "title_position": "bottom",
        "collapsible": True,
        "unsafe": "drop-me",
    }


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
        "code": "status",
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


def test_block_update_service_persists_visibility_repeatability_and_safe_collapsible_config(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    actor_user_id = uuid4()
    registry_id = uuid4()
    block = FormBlock(
        id=uuid4(),
        registry_id=registry_id,
        code="main",
        title="Основной",
        description=None,
        position=0,
        is_repeatable=False,
        is_system=False,
        is_locked=False,
        is_active=True,
        public_visible=True,
        public_editable=False,
        layout_columns=1,
        display_config_json={"title_position": "top"},
    )
    session = Mock(spec=Session)
    service = RegistrySchemaService(session)
    audit_events: list[dict[str, object]] = []

    monkeypatch.setattr(service, "_get_active_block", lambda _block_id: block)
    monkeypatch.setattr(service, "_ensure_mutable_block", lambda _block: None)
    monkeypatch.setattr(service, "_require_schema_permission", lambda *_args: None)
    monkeypatch.setattr(service, "ensure_base_card_template_for_registry", lambda **_payload: None)
    monkeypatch.setattr(
        "app.services.registry_schema.AuditService.record_user_event",
        lambda _self, **payload: audit_events.append(payload),
    )

    updated = service.update_block_for_actor(
        actor_user_id=actor_user_id,
        block_id=block.id,
        is_repeatable=True,
        public_visible=False,
        public_editable=True,
        display_config_json={
            "title_position": "bottom",
            "collapsible": True,
            "unsafe": "drop-me",
        },
    )

    assert updated.is_repeatable is True
    assert updated.public_visible is False
    assert updated.public_editable is True
    assert updated.display_config_json == {
        "title_position": "bottom",
        "collapsible": True,
    }
    assert audit_events[-1]["old_data_json"] == {
        "title": "Основной",
        "description": None,
        "position": 0,
        "is_repeatable": False,
        "public_visible": True,
        "public_editable": False,
        "layout_columns": 1,
        "display_config_json": {"title_position": "top"},
    }
    assert audit_events[-1]["new_data_json"] == {
        "title": "Основной",
        "description": None,
        "position": 0,
        "is_repeatable": True,
        "public_visible": False,
        "public_editable": True,
        "layout_columns": 1,
        "display_config_json": {"title_position": "bottom", "collapsible": True},
    }


def test_field_update_service_persists_unique_registry_code_and_audits_old_and_new(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    actor_user_id = uuid4()
    registry_id = uuid4()
    block_id = uuid4()
    field = _field(block_id=block_id)
    block = FormBlock(id=block_id, registry_id=registry_id, code="main", title="Основной")
    session = Mock(spec=Session)
    session.scalar.return_value = None
    service = RegistrySchemaService(session)
    audit_events: list[dict[str, object]] = []

    monkeypatch.setattr(service, "_get_active_field", lambda _field_id: field)
    monkeypatch.setattr(service, "_get_active_block", lambda _block_id: block)
    monkeypatch.setattr(service, "_ensure_mutable_field", lambda _field: None)
    monkeypatch.setattr(service, "_require_schema_permission", lambda *_args: None)
    monkeypatch.setattr(service, "ensure_base_card_template_for_registry", lambda **_payload: None)
    monkeypatch.setattr(
        "app.services.registry_schema.AuditService.record_user_event",
        lambda _self, **payload: audit_events.append(payload),
    )

    updated = service.update_field_for_actor(
        actor_user_id=actor_user_id,
        field_id=field.id,
        code="status_v2",
    )

    assert updated.code == "status_v2"
    assert audit_events[-1]["old_data_json"]["code"] == "status"
    assert audit_events[-1]["new_data_json"]["code"] == "status_v2"


def test_field_update_service_rejects_invalid_or_duplicate_registry_code(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    registry_id = uuid4()
    block_id = uuid4()
    field = _field(block_id=block_id)
    duplicate = _field(block_id=uuid4())
    duplicate.code = "duplicate_code"
    block = FormBlock(id=block_id, registry_id=registry_id, code="main", title="Основной")
    session = Mock(spec=Session)
    service = RegistrySchemaService(session)

    monkeypatch.setattr(service, "_get_active_field", lambda _field_id: field)
    monkeypatch.setattr(service, "_get_active_block", lambda _block_id: block)
    monkeypatch.setattr(service, "_ensure_mutable_field", lambda _field: None)
    monkeypatch.setattr(service, "_require_schema_permission", lambda *_args: None)

    with pytest.raises(RegistrySchemaError, match="format"):
        service.update_field_for_actor(
            actor_user_id=uuid4(),
            field_id=field.id,
            code="status label",
        )

    session.scalar.return_value = duplicate
    with pytest.raises(RegistrySchemaError, match="already exists"):
        service.update_field_for_actor(
            actor_user_id=uuid4(),
            field_id=field.id,
            code="duplicate_code",
        )


@pytest.mark.parametrize(
    ("old_type", "old_source_type", "old_source_id", "old_config"),
    [
        ("static_text", None, None, {"static_text": "Устаревший текст"}),
        ("select", "reference_list", uuid4(), {"allow_empty": False}),
    ],
)
def test_field_type_transition_to_text_clears_type_specific_source_and_config(
    monkeypatch: pytest.MonkeyPatch,
    old_type: str,
    old_source_type: str | None,
    old_source_id: object,
    old_config: dict[str, object],
) -> None:
    block_id = uuid4()
    field = _field(block_id=block_id)
    field.field_type = old_type
    field.options_source_type = old_source_type
    field.options_source_id = old_source_id  # type: ignore[assignment]
    field.options_config_json = old_config
    block = FormBlock(id=block_id, registry_id=uuid4(), code="main", title="Основной")
    service = RegistrySchemaService(Mock(spec=Session))

    monkeypatch.setattr(service, "_get_active_field", lambda _field_id: field)
    monkeypatch.setattr(service, "_get_active_block", lambda _block_id: block)
    monkeypatch.setattr(service, "_ensure_mutable_field", lambda _field: None)
    monkeypatch.setattr(service, "_require_schema_permission", lambda *_args: None)
    monkeypatch.setattr(service, "ensure_base_card_template_for_registry", lambda **_payload: None)
    monkeypatch.setattr(
        "app.services.registry_schema.AuditService.record_user_event",
        lambda _self, **_payload: None,
    )

    updated = service.update_field_for_actor(
        actor_user_id=uuid4(),
        field_id=field.id,
        field_type="text",
    )

    assert updated.options_source_type is None
    assert updated.options_source_id is None
    assert updated.options_config_json is None


@pytest.mark.parametrize(
    ("old_type", "old_source_type", "old_source_id", "stale_config"),
    [
        ("static_text", None, None, {"static_text": "Устаревший текст"}),
        ("select", "reference_list", uuid4(), {"allow_empty": False}),
    ],
)
def test_field_type_transition_to_text_discards_explicit_stale_payload(
    monkeypatch: pytest.MonkeyPatch,
    old_type: str,
    old_source_type: str | None,
    old_source_id: object,
    stale_config: dict[str, object],
) -> None:
    block_id = uuid4()
    field = _field(block_id=block_id)
    field.field_type = old_type
    field.options_source_type = old_source_type
    field.options_source_id = old_source_id  # type: ignore[assignment]
    field.options_config_json = stale_config
    block = FormBlock(id=block_id, registry_id=uuid4(), code="main", title="Основной")
    service = RegistrySchemaService(Mock(spec=Session))

    monkeypatch.setattr(service, "_get_active_field", lambda _field_id: field)
    monkeypatch.setattr(service, "_get_active_block", lambda _block_id: block)
    monkeypatch.setattr(service, "_ensure_mutable_field", lambda _field: None)
    monkeypatch.setattr(service, "_require_schema_permission", lambda *_args: None)
    monkeypatch.setattr(service, "ensure_base_card_template_for_registry", lambda **_payload: None)
    monkeypatch.setattr(
        "app.services.registry_schema.AuditService.record_user_event",
        lambda _self, **_payload: None,
    )

    updated = service.update_field_for_actor(
        actor_user_id=uuid4(),
        field_id=field.id,
        field_type="text",
        options_source_type=old_source_type,
        options_source_id=old_source_id,
        options_config_json=stale_config,
    )

    assert updated.options_source_type is None
    assert updated.options_source_id is None
    assert updated.options_config_json is None


def test_field_create_rejects_invalid_code_before_insert_or_audit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    actor_user_id = uuid4()
    block = FormBlock(id=uuid4(), registry_id=uuid4(), code="main", title="Основной")
    session = Mock(spec=Session)
    service = RegistrySchemaService(session)
    audit_events: list[dict[str, object]] = []

    monkeypatch.setattr(service, "_get_active_block", lambda _block_id: block)
    monkeypatch.setattr(service, "_require_schema_permission", lambda *_args: None)
    monkeypatch.setattr(
        "app.services.registry_schema.AuditService.record_user_event",
        lambda _self, **payload: audit_events.append(payload),
    )

    with pytest.raises(RegistrySchemaError, match="format"):
        service.create_field_for_actor(
            actor_user_id=actor_user_id,
            block_id=block.id,
            code="invalid code",
            label="Поле",
            field_type="text",
        )

    session.add.assert_not_called()
    session.flush.assert_not_called()
    assert audit_events == []


def test_field_create_rejects_registry_wide_duplicate_before_insert_or_audit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    actor_user_id = uuid4()
    block = FormBlock(id=uuid4(), registry_id=uuid4(), code="main", title="Основной")
    duplicate_field_id = uuid4()
    session = Mock(spec=Session)
    session.scalar.return_value = duplicate_field_id
    service = RegistrySchemaService(session)
    audit_events: list[dict[str, object]] = []

    monkeypatch.setattr(service, "_get_active_block", lambda _block_id: block)
    monkeypatch.setattr(service, "_require_schema_permission", lambda *_args: None)
    monkeypatch.setattr(
        "app.services.registry_schema.AuditService.record_user_event",
        lambda _self, **payload: audit_events.append(payload),
    )

    with pytest.raises(RegistrySchemaError, match="already exists"):
        service.create_field_for_actor(
            actor_user_id=actor_user_id,
            block_id=block.id,
            code="duplicate_code",
            label="Поле",
            field_type="text",
        )

    session.add.assert_not_called()
    session.flush.assert_not_called()
    assert audit_events == []


def test_card_template_membership_update_requests_a_fresh_row_lock(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    actor_user_id = uuid4()
    template = CardTemplate(
        id=uuid4(),
        registry_id=uuid4(),
        code="custom",
        name="Шаблон",
        field_schema_json={"field_ids": []},
        default_values_json=[],
        is_active=True,
    )
    service = RegistrySchemaService(Mock(spec=Session))
    load_calls: list[dict[str, object]] = []

    def load_template(_template_id, **kwargs):
        load_calls.append(kwargs)
        return template

    monkeypatch.setattr(service, "_get_card_template", load_template)
    monkeypatch.setattr(service, "_require_schema_permission", lambda *_args: None)
    monkeypatch.setattr(
        service,
        "_normalize_card_template_payload",
        lambda **_payload: ({"field_ids": []}, []),
    )
    monkeypatch.setattr(
        "app.services.registry_schema.AuditService.record_user_event",
        lambda _self, **_payload: None,
    )

    service.update_card_template_for_actor(
        actor_user_id=actor_user_id,
        template_id=template.id,
        field_schema_json={"field_ids": []},
    )

    assert load_calls == [{"include_archive": False, "lock_for_update": True}]


def test_locked_card_template_load_uses_populate_existing_and_for_update() -> None:
    template = CardTemplate(
        id=uuid4(),
        registry_id=uuid4(),
        code="custom",
        name="Шаблон",
        is_active=True,
        archived_at=None,
    )
    session = Mock(spec=Session)
    session.scalars.return_value.one_or_none.return_value = template
    service = RegistrySchemaService(session)

    loaded = service._get_card_template(  # noqa: SLF001
        template.id,
        include_archive=False,
        lock_for_update=True,
    )

    statement = session.scalars.call_args.args[0]
    assert loaded is template
    assert statement.get_execution_options()["populate_existing"] is True
    assert statement._for_update_arg is not None


def test_field_update_preserves_type_config_when_type_is_unchanged(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    block_id = uuid4()
    reference_list_id = uuid4()
    field = _field(block_id=block_id)
    field.field_type = "select"
    field.options_source_type = "reference_list"
    field.options_source_id = reference_list_id
    field.options_config_json = {"allow_empty": False}
    block = FormBlock(id=block_id, registry_id=uuid4(), code="main", title="Основной")
    service = RegistrySchemaService(Mock(spec=Session))

    monkeypatch.setattr(service, "_get_active_field", lambda _field_id: field)
    monkeypatch.setattr(service, "_get_active_block", lambda _block_id: block)
    monkeypatch.setattr(service, "_ensure_mutable_field", lambda _field: None)
    monkeypatch.setattr(service, "_require_schema_permission", lambda *_args: None)
    monkeypatch.setattr(service, "ensure_base_card_template_for_registry", lambda **_payload: None)
    monkeypatch.setattr(
        "app.services.registry_schema.AuditService.record_user_event",
        lambda _self, **_payload: None,
    )

    updated = service.update_field_for_actor(
        actor_user_id=uuid4(),
        field_id=field.id,
        label="Статус заявки",
    )

    assert updated.options_source_type == "reference_list"
    assert updated.options_source_id == reference_list_id
    assert updated.options_config_json == {"allow_empty": False}
