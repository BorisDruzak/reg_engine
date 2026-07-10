from uuid import UUID, uuid4

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


def _section_layout(field_id: str, block_id: str | None = None) -> dict[str, object]:
    section: dict[str, object] = {
        "id": "section-main",
        "kind": "section",
        "title": "Основной блок",
        "page": 1,
        "x_mm": 12,
        "y_mm": 24,
        "width_mm": 186,
        "height_mm": 80,
        "grid_columns": 12,
        "items": [
            {
                "id": "section-heading",
                "kind": "heading",
                "text": "Печатная форма",
                "row": 1,
                "column": 1,
                "row_span": 1,
                "column_span": 12,
            },
            {
                "id": "section-field",
                "kind": "field",
                "field_id": field_id,
                "label": "Текстовое поле",
                "show_label": True,
                "row": 2,
                "column": 1,
                "row_span": 2,
                "column_span": 6,
                "style": {"border": "thin", "padding_mm": 1.5},
            },
        ],
    }
    if block_id is not None:
        section["block_id"] = block_id
    return {
        "version": "card_print_layout_v1",
        "page": {
            "format": "A4",
            "width_mm": 210,
            "height_mm": 297,
            "margin_mm": {"top": 12, "right": 12, "bottom": 12, "left": 12},
        },
        "grid": {"columns": 12, "baseline_mm": 4, "row_height_mm": 8, "snap_mm": 2},
        "sections": [section],
        "overlays": [
            {
                "id": "page-line",
                "kind": "line",
                "page": 1,
                "x_mm": 12,
                "y_mm": 112,
                "width_mm": 186,
                "height_mm": 2,
            }
        ],
    }


def _linked_layout(
    card_template_id: str,
    *,
    x_mm: float = 12.0,
    y_mm: float = 12.0,
    width_mm: float = 186.0,
    height_mm: float = 273.0,
) -> dict[str, object]:
    return {
        "version": "card_print_layout_v1",
        "composition_mode": "linked_card",
        "page": {
            "format": "A4",
            "width_mm": 210,
            "height_mm": 297,
            "margin_mm": {"top": 12, "right": 12, "bottom": 12, "left": 12},
        },
        "grid": {"columns": 12, "row_height_mm": 8, "snap_mm": 2},
        "items": [
            {
                "id": "linked-card",
                "kind": "card_layout",
                "card_template_id": card_template_id,
                "page": 1,
                "x_mm": x_mm,
                "y_mm": y_mm,
                "width_mm": width_mm,
                "height_mm": height_mm,
            }
        ],
    }


def test_card_print_layout_validation_accepts_valid_a4_layout() -> None:
    field_id = uuid4()

    result = validate_card_print_layout(_valid_layout(str(field_id)), allowed_field_ids={field_id})

    assert result.errors == []
    assert result.normalized_layout["version"] == "card_print_layout_v1"
    assert result.normalized_layout["grid"]["columns"] == 12


def test_card_print_layout_validation_accepts_sections_and_overlays() -> None:
    field_id = uuid4()
    block_id = uuid4()

    result = validate_card_print_layout(
        _section_layout(str(field_id), str(block_id)),
        allowed_field_ids={field_id},
        allowed_block_ids={block_id},
    )

    assert result.errors == []
    assert result.normalized_layout["version"] == "card_print_layout_v1"
    assert result.normalized_layout["sections"][0]["block_id"] == str(block_id)
    assert result.normalized_layout["overlays"][0]["kind"] == "line"


def test_card_print_layout_validation_rejects_unknown_section_block_id() -> None:
    field_id = uuid4()
    allowed_block_id = uuid4()

    result = validate_card_print_layout(
        _section_layout(str(field_id), str(uuid4())),
        allowed_field_ids={field_id},
        allowed_block_ids={allowed_block_id},
    )

    assert any("Unknown block_id" in error for error in result.errors)


def test_card_print_layout_validation_rejects_flow_item_outside_section_grid() -> None:
    field_id = uuid4()
    layout = _section_layout(str(field_id))
    section = layout["sections"][0]
    assert isinstance(section, dict)
    items = section["items"]
    assert isinstance(items, list)
    assert isinstance(items[1], dict)
    items[1]["column"] = 12
    items[1]["column_span"] = 2

    result = validate_card_print_layout(layout, allowed_field_ids={field_id})

    assert any("outside section grid" in error for error in result.errors)


def test_card_print_layout_validation_rejects_flow_item_overlap_in_section() -> None:
    field_id = uuid4()
    layout = _section_layout(str(field_id))
    section = layout["sections"][0]
    assert isinstance(section, dict)
    items = section["items"]
    assert isinstance(items, list)
    duplicate = dict(items[1])
    duplicate["id"] = "section-field-copy"
    items.append(duplicate)

    result = validate_card_print_layout(layout, allowed_field_ids={field_id})

    assert any("overlaps" in error for error in result.errors)


def test_card_print_layout_validation_allows_decorative_overlay_overlap() -> None:
    field_id = uuid4()
    layout = _section_layout(str(field_id))
    overlays = layout["overlays"]
    assert isinstance(overlays, list)
    overlays.append(
        {
            "id": "page-line-copy",
            "kind": "divider",
            "page": 1,
            "x_mm": 12,
            "y_mm": 112,
            "width_mm": 186,
            "height_mm": 2,
        }
    )

    result = validate_card_print_layout(layout, allowed_field_ids={field_id})

    assert result.errors == []


def test_card_print_layout_validation_normalizes_legacy_items_to_sections_and_overlays() -> None:
    field_id = uuid4()
    layout = _valid_layout(str(field_id))
    items = layout["items"]
    assert isinstance(items, list)
    items.append(
        {
            "id": "legacy-divider",
            "kind": "divider",
            "page": 1,
            "row": 6,
            "column": 1,
            "row_span": 1,
            "column_span": 12,
        }
    )

    result = validate_card_print_layout(layout, allowed_field_ids={field_id})

    assert result.errors == []
    assert result.normalized_layout["sections"][0]["items"]
    assert result.normalized_layout["overlays"][0]["id"] == "legacy-divider"


def test_card_print_layout_validation_normalizes_linked_card_item() -> None:
    card_template_id = uuid4()

    result = validate_card_print_layout(_linked_layout(str(card_template_id)))

    assert result.errors == []
    linked_item = result.normalized_layout["items"][0]
    assert linked_item == {
        "id": "linked-card",
        "kind": "card_layout",
        "card_template_id": str(card_template_id),
        "page": 1,
        "x_mm": 12.0,
        "y_mm": 12.0,
        "width_mm": 186.0,
        "height_mm": 273.0,
    }


def test_linked_card_composition_requires_exactly_one_linked_item() -> None:
    layout = _linked_layout(str(uuid4()))
    items = layout["items"]
    assert isinstance(items, list)
    items.clear()

    missing = validate_card_print_layout(layout)

    assert any("exactly one" in error for error in missing.errors)

    first = _linked_layout(str(uuid4()))
    first_items = first["items"]
    assert isinstance(first_items, list)
    duplicate = dict(first_items[0])
    duplicate["id"] = "linked-card-copy"
    first_items.append(duplicate)

    multiple = validate_card_print_layout(first)

    assert any("exactly one" in error for error in multiple.errors)


def test_legacy_composition_without_linked_item_remains_valid() -> None:
    field_id = uuid4()
    layout = _valid_layout(str(field_id))

    result = validate_card_print_layout(layout, allowed_field_ids={field_id})

    assert result.errors == []
    assert "composition_mode" not in result.normalized_layout


def test_card_print_layout_validation_rejects_linked_card_overflow() -> None:
    result = validate_card_print_layout(_linked_layout(str(uuid4()), x_mm=190.0, width_mm=40.0))

    assert any("outside the A4 page width" in error for error in result.errors)


def test_card_print_layout_validation_rejects_unreadable_linked_card_scale() -> None:
    result = validate_card_print_layout(_linked_layout(str(uuid4()), width_mm=40.0, height_mm=40.0))

    assert any("readable text" in error for error in result.errors)


def test_linked_card_allows_overlapping_image_and_qr_overlays() -> None:
    layout = _linked_layout(str(uuid4()))
    layout["overlays"] = [
        {
            "id": "brand-image",
            "kind": "image",
            "page": 1,
            "x_mm": 20.0,
            "y_mm": 20.0,
            "width_mm": 30.0,
            "height_mm": 20.0,
            "alt": "Эмблема",
        },
        {
            "id": "card-qr",
            "kind": "qr_code",
            "page": 1,
            "x_mm": 160.0,
            "y_mm": 240.0,
            "width_mm": 24.0,
            "height_mm": 24.0,
            "text": "https://example.test/card",
        },
    ]

    result = validate_card_print_layout(layout)

    assert result.errors == []
    assert [overlay["id"] for overlay in result.normalized_layout["overlays"]] == [
        "brand-image",
        "card-qr",
    ]


def test_linked_card_still_rejects_overlapping_heading_flow_item() -> None:
    layout = _linked_layout(str(uuid4()))
    items = layout["items"]
    assert isinstance(items, list)
    items.append(
        {
            "id": "overlapping-heading",
            "kind": "heading",
            "page": 1,
            "x_mm": 20.0,
            "y_mm": 20.0,
            "width_mm": 40.0,
            "height_mm": 10.0,
            "text": "Заголовок",
        }
    )

    result = validate_card_print_layout(layout)

    assert any("overlaps" in error for error in result.errors)


def test_legacy_field_items_remain_valid() -> None:
    field_id = uuid4()

    normalized = validate_card_print_layout(
        _valid_layout(str(field_id)),
        allowed_field_ids={field_id},
    )

    assert normalized.errors == []
    assert normalized.normalized_layout["sections"]


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


def test_card_print_layout_validation_rejects_mm_geometry_outside_page() -> None:
    field_id = UUID("11111111-1111-1111-1111-111111111111")
    layout = _valid_layout(str(field_id))
    layout["items"][1].update(
        {
            "x_mm": 190,
            "y_mm": 20,
            "width_mm": 40,
            "height_mm": 12,
            "style": {
                "font_size": 12,
                "border": "thin",
                "padding_mm": 2,
                "label_position": "top",
            },
        }
    )

    result = validate_card_print_layout(layout, allowed_field_ids={field_id})

    assert any("outside the A4 page width" in error for error in result.errors)


def test_card_print_layout_validation_rejects_object_style_enum_without_crashing() -> None:
    field_id = UUID("11111111-1111-1111-1111-111111111111")
    layout = _valid_layout(str(field_id))
    layout["items"][1]["style"] = {
        "border": {"enabled": True, "color": "#000000", "width_px": 1},
        "padding_mm": 2,
    }

    result = validate_card_print_layout(layout, allowed_field_ids={field_id})

    assert any("unsupported style border" in error for error in result.errors)
