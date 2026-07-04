from uuid import uuid4

from app.services.card_print import validate_card_print_layout


def _valid_layout(field_id: str) -> dict[str, object]:
    return {
        "version": "card_print_layout_v1",
        "page": {
            "format": "A4",
            "orientation": "portrait",
            "width_mm": 210,
            "height_mm": 297,
            "margin_mm": {"top": 12, "right": 12, "bottom": 12, "left": 12},
        },
        "grid": {"columns": 12, "row_height_mm": 8, "snap_mm": 2},
        "items": [
            {
                "id": "title",
                "kind": "static_text",
                "text": "Карточка",
                "page": 1,
                "row": 1,
                "column": 1,
                "row_span": 1,
                "column_span": 12,
                "style": {"font_size": 16, "bold": True, "align": "center"},
            },
            {
                "id": "field_name",
                "kind": "field",
                "field_id": field_id,
                "page": 1,
                "row": 3,
                "column": 1,
                "row_span": 2,
                "column_span": 6,
                "label": {"visible": True, "position": "top"},
                "value": {"format": "default", "overflow": "wrap", "max_lines": 3},
                "style": {"font_size": 10, "border": "thin", "padding_mm": 1.5},
            },
        ],
    }


def test_card_print_layout_validation_accepts_valid_a4_layout() -> None:
    field_id = uuid4()

    result = validate_card_print_layout(_valid_layout(str(field_id)), allowed_field_ids={field_id})

    assert result.errors == []
    assert result.normalized_layout["version"] == "card_print_layout_v1"
    assert result.normalized_layout["grid"]["columns"] == 12


def test_card_print_layout_validation_rejects_unknown_field_and_out_of_grid() -> None:
    field_id = uuid4()
    layout = _valid_layout(str(uuid4()))
    items = layout["items"]
    assert isinstance(items, list)
    field_item = items[1]
    assert isinstance(field_item, dict)
    field_item["column"] = 12
    field_item["column_span"] = 2

    result = validate_card_print_layout(layout, allowed_field_ids={field_id})

    assert any("Unknown field_id" in error for error in result.errors)
    assert any("outside the 12-column grid" in error for error in result.errors)


def test_card_print_layout_validation_rejects_blocking_overlap() -> None:
    field_id = uuid4()
    layout = _valid_layout(str(field_id))
    items = layout["items"]
    assert isinstance(items, list)
    overlapping = dict(items[1])
    overlapping["id"] = "field_name_duplicate"
    items.append(overlapping)

    result = validate_card_print_layout(layout, allowed_field_ids={field_id})

    assert any("overlaps" in error for error in result.errors)
