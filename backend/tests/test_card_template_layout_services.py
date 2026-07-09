from types import SimpleNamespace
from typing import cast
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Session

from app.api.v1.endpoints import card_template_layouts as layout_endpoints
from app.schemas.card_template_layouts import (
    CardTemplateFormLayoutRead,
    CardTemplateLayoutRead,
    CardTemplateLayoutUpdate,
)
from app.services import card_template_layout as layout_service
from app.services.card_template_projection import (
    build_mapping_table,
    project_form_layout_to_a4,
    sync_print_view,
)


def _form_layout(field_id: str, *, item_id: str = "field-name") -> dict[str, object]:
    return {
        "columns": 12,
        "sections": [
            {
                "id": "section-main",
                "block_id": str(uuid4()),
                "row": 1,
                "column": 1,
                "column_span": 12,
                "items": [
                    {
                        "id": item_id,
                        "kind": "field",
                        "field_id": field_id,
                        "row": 1,
                        "column": 1,
                        "column_span": 6,
                    }
                ],
            }
        ],
    }


def _page_settings() -> dict[str, object]:
    return {
        "format": "A4",
        "width_mm": 210,
        "height_mm": 297,
        "margin_mm": {"top": 12, "right": 12, "bottom": 12, "left": 12},
    }


def test_form_layout_defaults_legacy_row_span_to_one() -> None:
    layout = CardTemplateFormLayoutRead.model_validate(
        {
            "columns": 12,
            "sections": [
                {
                    "id": "block-a",
                    "row": 1,
                    "column": 1,
                    "column_span": 6,
                    "items": [
                        {
                            "id": "field-a",
                            "row": 1,
                            "column": 1,
                            "column_span": 6,
                        }
                    ],
                }
            ],
        }
    )

    assert layout.sections[0].row_span == 1
    assert layout.sections[0].items[0].row_span == 1


def test_form_layout_read_keeps_legacy_rows_above_four() -> None:
    layout = CardTemplateFormLayoutRead.model_validate(
        {
            "columns": 12,
            "sections": [
                {
                    "id": "legacy-block",
                    "row": 5,
                    "column": 1,
                    "column_span": 12,
                    "items": [],
                }
            ],
        }
    )

    assert layout.sections[0].row == 5


@pytest.mark.parametrize("columns", [8, 99])
def test_form_layout_read_keeps_legacy_column_counts(columns: int) -> None:
    layout = CardTemplateFormLayoutRead.model_validate(
        {
            "columns": columns,
            "sections": [],
        }
    )

    assert layout.columns == columns


@pytest.mark.parametrize("columns", [8, 99])
def test_form_layout_save_requires_twelve_columns(columns: int) -> None:
    with pytest.raises(layout_service.CardTemplateLayoutError, match="12"):
        layout_service.validate_form_layout_geometry(
            {
                "columns": columns,
                "sections": [],
            }
        )


def test_form_layout_rejects_non_quarter_spans() -> None:
    with pytest.raises(layout_service.CardTemplateLayoutError, match="quarter"):
        layout_service.validate_form_layout_geometry(
            {
                "columns": 12,
                "sections": [
                    {
                        "id": "a",
                        "row": 1,
                        "column": 1,
                        "column_span": 5,
                        "row_span": 1,
                        "items": [],
                    }
                ],
            }
        )


def test_form_layout_accepts_minimum_field_width_and_height() -> None:
    normalized = layout_service.validate_form_layout_geometry(
        {
            "columns": 12,
            "sections": [
                {
                    "id": "block",
                    "row": 1,
                    "column": 1,
                    "column_span": 12,
                    "row_span": 1,
                    "items": [
                        {
                            "id": "minimum-field",
                            "row": 1,
                            "column": 1,
                            "column_span": 3,
                            "row_span": 1,
                        }
                    ],
                }
            ],
        }
    )

    item = normalized["sections"][0]["items"][0]
    assert item["column_span"] == 3
    assert item["row_span"] == 1


@pytest.mark.parametrize(("dimension", "value"), [("column_span", 0), ("row_span", 0)])
def test_form_layout_rejects_non_positive_field_size_as_layout_error(
    dimension: str,
    value: int,
) -> None:
    item = {
        "id": "invalid-field",
        "row": 1,
        "column": 1,
        "column_span": 3,
        "row_span": 1,
    }
    item[dimension] = value

    with pytest.raises(layout_service.CardTemplateLayoutError, match="geometry"):
        layout_service.validate_form_layout_geometry(
            {
                "columns": 12,
                "sections": [
                    {
                        "id": "block",
                        "row": 1,
                        "column": 1,
                        "column_span": 12,
                        "row_span": 1,
                        "items": [item],
                    }
                ],
            }
        )


def test_form_layout_rejects_overlapping_blocks() -> None:
    with pytest.raises(layout_service.CardTemplateLayoutError, match="blocks cannot overlap"):
        layout_service.validate_form_layout_geometry(
            {
                "columns": 12,
                "sections": [
                    {
                        "id": "left",
                        "row": 1,
                        "column": 1,
                        "column_span": 6,
                        "row_span": 1,
                        "items": [],
                    },
                    {
                        "id": "overlap",
                        "row": 1,
                        "column": 4,
                        "column_span": 6,
                        "row_span": 1,
                        "items": [],
                    },
                ],
            }
        )


def test_form_layout_rejects_overlapping_fields() -> None:
    with pytest.raises(layout_service.CardTemplateLayoutError, match="Fields inside a block"):
        layout_service.validate_form_layout_geometry(
            {
                "columns": 12,
                "sections": [
                    {
                        "id": "block",
                        "row": 1,
                        "column": 1,
                        "column_span": 12,
                        "row_span": 1,
                        "items": [
                            {
                                "id": "first",
                                "row": 1,
                                "column": 1,
                                "column_span": 6,
                                "row_span": 1,
                            },
                            {
                                "id": "second",
                                "row": 1,
                                "column": 4,
                                "column_span": 6,
                                "row_span": 1,
                            },
                        ],
                    }
                ],
            }
        )


def test_form_layout_save_rejects_rows_above_four() -> None:
    with pytest.raises(layout_service.CardTemplateLayoutError, match="height"):
        layout_service.validate_form_layout_geometry(
            {
                "columns": 12,
                "sections": [
                    {
                        "id": "legacy-block",
                        "row": 5,
                        "column": 1,
                        "column_span": 12,
                        "row_span": 1,
                        "items": [],
                    }
                ],
            }
        )


def test_layout_revision_is_canonical_and_required_by_update_contract() -> None:
    left = {"columns": 12, "sections": []}
    right = {"sections": [], "columns": 12}

    revision = layout_service.form_layout_revision(left)
    update = CardTemplateLayoutUpdate.model_validate(
        {"expected_revision": revision, "form_layout": left}
    )

    assert layout_service.form_layout_revision(right) == revision
    assert CardTemplateLayoutRead.model_fields["revision"].is_required()
    assert update.expected_revision == revision


def test_update_form_layout_rejects_stale_revision(monkeypatch: pytest.MonkeyPatch) -> None:
    current_layout = {"columns": 12, "sections": []}
    template = SimpleNamespace(
        id=uuid4(),
        registry_id=uuid4(),
        field_schema_json={"form_layout": current_layout},
        updated_by=None,
    )
    service = layout_service.CardTemplateLayoutService(cast(Session, object()))
    lock_requests: list[bool] = []

    def get_template(_template_id: object, *, lock_for_update: bool = False) -> object:
        lock_requests.append(lock_for_update)
        return template

    monkeypatch.setattr(service, "_get_active_card_template", get_template)
    monkeypatch.setattr(service, "_require_schema_permission", lambda *_args: None)
    monkeypatch.setattr(service, "_template_structure", lambda _template: ([], []))
    monkeypatch.setattr(
        service,
        "_form_layout",
        lambda _template, _blocks, _fields: current_layout,
    )

    with pytest.raises(
        layout_service.CardTemplateLayoutConflictError,
        match="Reload before saving",
    ):
        service.update_form_layout_for_actor(
            actor_user_id=uuid4(),
            card_template_id=template.id,
            expected_revision="stale",
            form_layout=current_layout,
        )

    assert lock_requests == [True]
    assert template.field_schema_json == {"form_layout": current_layout}
    assert template.updated_by is None


def test_get_active_card_template_uses_row_lock_for_update() -> None:
    template = SimpleNamespace(id=uuid4(), archived_at=None, is_active=True)
    statements: list[object] = []

    class ScalarResult:
        def one_or_none(self) -> object:
            return template

    class RecordingSession:
        def get(self, *_args: object, **_kwargs: object) -> None:
            pytest.fail("Locking path must not use Session.get().")

        def scalars(self, statement: object) -> ScalarResult:
            statements.append(statement)
            return ScalarResult()

    service = layout_service.CardTemplateLayoutService(cast(Session, RecordingSession()))

    result = service._get_active_card_template(template.id, lock_for_update=True)

    assert result is template
    assert len(statements) == 1
    statement = statements[0]
    compiled = str(statement.compile(dialect=postgresql.dialect()))  # type: ignore[attr-defined]
    assert "FOR UPDATE" in compiled
    assert statement.get_execution_options()["populate_existing"] is True  # type: ignore[attr-defined]


def test_update_form_layout_saves_with_audit_after_lock(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    actor_user_id = uuid4()
    current_layout = {"columns": 12, "sections": []}
    next_layout = {
        "columns": 12,
        "sections": [
            {
                "id": "block",
                "row": 1,
                "column": 1,
                "column_span": 12,
                "row_span": 1,
                "items": [
                    {
                        "id": "minimum-field",
                        "row": 1,
                        "column": 1,
                        "column_span": 3,
                        "row_span": 1,
                    }
                ],
            }
        ],
    }
    template = SimpleNamespace(
        id=uuid4(),
        registry_id=uuid4(),
        field_schema_json={"field_ids": [], "form_layout": current_layout},
        updated_by=None,
    )
    events: list[str] = []
    audit_events: list[dict[str, object]] = []

    class RecordingSession:
        def flush(self) -> None:
            events.append("flush")

    class RecordingAuditService:
        def __init__(self, _session: object) -> None:
            pass

        def record_user_event(self, **payload: object) -> None:
            events.append("audit")
            audit_events.append(payload)

    service = layout_service.CardTemplateLayoutService(cast(Session, RecordingSession()))
    read_result = cast(CardTemplateLayoutRead, SimpleNamespace(revision="new-revision"))

    def get_template(_template_id: object, *, lock_for_update: bool = False) -> object:
        assert lock_for_update is True
        events.append("lock")
        return template

    def require_permission(_actor_user_id: object, _registry_id: object) -> None:
        events.append("permission")

    monkeypatch.setattr(service, "_get_active_card_template", get_template)
    monkeypatch.setattr(service, "_require_schema_permission", require_permission)
    monkeypatch.setattr(service, "_template_structure", lambda _template: ([], []))
    monkeypatch.setattr(
        service,
        "_form_layout",
        lambda _template, _blocks, _fields: current_layout,
    )
    monkeypatch.setattr(service, "read_layout_for_actor", lambda **_kwargs: read_result)
    monkeypatch.setattr(layout_service, "AuditService", RecordingAuditService)
    normalized_next_layout = CardTemplateFormLayoutRead.model_validate(next_layout).model_dump(
        mode="json"
    )

    result = service.update_form_layout_for_actor(
        actor_user_id=actor_user_id,
        card_template_id=template.id,
        expected_revision=layout_service.form_layout_revision(current_layout),
        form_layout=next_layout,
    )

    assert result is read_result
    assert events == ["lock", "permission", "flush", "audit"]
    assert template.updated_by == actor_user_id
    assert template.field_schema_json["form_layout"] == normalized_next_layout
    assert len(audit_events) == 1
    assert audit_events[0]["action"] == "update"
    assert audit_events[0]["object_type"] == "card_template_layout"
    assert audit_events[0]["old_data_json"] == {"form_layout": current_layout}
    assert audit_events[0]["new_data_json"] == {"form_layout": normalized_next_layout}


def test_layout_read_warns_when_legacy_geometry_exceeds_four_rows() -> None:
    service = layout_service.CardTemplateLayoutService(cast(Session, object()))
    status = service._layout_sync_status(
        {
            "columns": 12,
            "sections": [
                {
                    "id": "legacy-block",
                    "row": 5,
                    "column": 1,
                    "column_span": 12,
                    "row_span": 1,
                    "items": [],
                }
            ],
        },
        [],
        [],
    )

    assert any("4" in warning for warning in status["warnings"])


def test_form_layout_endpoint_maps_revision_conflict_to_409(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    expected_revision = "stale"

    class ConflictService:
        def update_form_layout_for_actor(
            self,
            *,
            actor_user_id: object,
            card_template_id: object,
            expected_revision: str,
            form_layout: dict[str, object],
        ) -> None:
            assert actor_user_id is not None
            assert card_template_id is not None
            assert expected_revision == "stale"
            assert form_layout == {"columns": 12, "sections": []}
            raise layout_service.CardTemplateLayoutConflictError(
                "Card layout changed. Reload before saving."
            )

    monkeypatch.setattr(
        layout_endpoints,
        "_layout_service",
        lambda _session: ConflictService(),
    )
    payload = cast(
        CardTemplateLayoutUpdate,
        SimpleNamespace(
            expected_revision=expected_revision,
            form_layout={"columns": 12, "sections": []},
        ),
    )

    with pytest.raises(HTTPException) as exc_info:
        layout_endpoints.update_card_template_form_layout(
            template_id=uuid4(),
            payload=payload,
            session=cast(Session, object()),
            actor_user_id=uuid4(),
        )

    assert exc_info.value.status_code == 409
    assert exc_info.value.detail == "Card layout changed. Reload before saving."


def test_form_layout_endpoint_maps_geometry_error_to_russian_422(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class InvalidGeometryService:
        def update_form_layout_for_actor(self, **_kwargs: object) -> None:
            raise layout_service.CardTemplateLayoutError("Field exceeds the card height.")

    monkeypatch.setattr(
        layout_endpoints,
        "_layout_service",
        lambda _session: InvalidGeometryService(),
    )
    payload = cast(
        CardTemplateLayoutUpdate,
        SimpleNamespace(
            expected_revision="current",
            form_layout={"columns": 12, "sections": []},
        ),
    )

    with pytest.raises(HTTPException) as exc_info:
        layout_endpoints.update_card_template_form_layout(
            template_id=uuid4(),
            payload=payload,
            session=cast(Session, object()),
            actor_user_id=uuid4(),
        )

    assert exc_info.value.status_code == 422
    assert (
        exc_info.value.detail
        == "Макет карточки содержит недопустимые размеры или расположение элементов."
    )


def test_projection_maps_form_field_item_to_a4_geometry() -> None:
    field_id = str(uuid4())

    items = project_form_layout_to_a4(_form_layout(field_id), _page_settings())

    assert len(items) == 1
    assert items[0]["source_item_id"] == "field-name"
    assert items[0]["field_id"] == field_id
    assert items[0]["page"] == 1
    assert items[0]["x_mm"] == 12
    assert items[0]["width_mm"] == 93
    assert items[0]["sync_status"] == "synced"


def test_sync_print_view_preserves_manual_override_geometry() -> None:
    field_id = str(uuid4())
    form_layout = _form_layout(field_id)
    existing_print_view = {
        "id": "default-a4",
        "items": [
            {
                "id": "a4-field-name",
                "source_item_id": "field-name",
                "field_id": field_id,
                "page": 1,
                "x_mm": 55,
                "y_mm": 44,
                "width_mm": 70,
                "height_mm": 14,
                "override": True,
                "sync_status": "manual_override",
            }
        ],
    }

    result = sync_print_view(existing_print_view, form_layout, _page_settings())

    item = result.print_view["items"][0]
    assert item["x_mm"] == 55
    assert item["y_mm"] == 44
    assert item["width_mm"] == 70
    assert item["override"] is True
    assert item["sync_status"] == "manual_override"
    assert "ручным положением" in " ".join(result.sync_status["warnings"])


def test_sync_print_view_places_missing_form_items() -> None:
    field_id = str(uuid4())

    result = sync_print_view(
        {"id": "default-a4", "items": []},
        _form_layout(field_id),
        _page_settings(),
    )

    assert result.print_view["items"][0]["source_item_id"] == "field-name"
    assert result.print_view["items"][0]["field_id"] == field_id
    assert any("размещено" in warning for warning in result.sync_status["warnings"])


def test_mapping_table_reports_a4_item_without_source() -> None:
    field_id = str(uuid4())
    print_view = {
        "items": [
            {
                "id": "manual-note",
                "kind": "static_text",
                "source_item_id": None,
                "text": "Ручная пометка",
            }
        ]
    }

    result = build_mapping_table(_form_layout(field_id), print_view)

    assert result["manual_items"] == ["manual-note"]
    assert result["missing_print_items"] == ["field-name"]


def test_mapping_table_reports_archived_field() -> None:
    field_id = str(uuid4())
    print_view = {
        "items": [
            {
                "id": "a4-field-name",
                "source_item_id": "field-name",
                "field_id": field_id,
                "sync_status": "synced",
            }
        ]
    }

    result = build_mapping_table(_form_layout(field_id), print_view, archived_field_ids={field_id})

    assert result["archived_field_items"] == ["a4-field-name"]
