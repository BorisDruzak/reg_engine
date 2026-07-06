from uuid import uuid4

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
