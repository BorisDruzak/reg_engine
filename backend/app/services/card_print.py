from dataclasses import dataclass
from uuid import UUID

CARD_PRINT_LAYOUT_VERSION = "card_print_layout_v1"
CARD_PRINT_LINKED_COMPOSITION_MODE = "linked_card"
CARD_PRINT_LAYOUT_COLUMNS = 12
CARD_PRINT_REPEAT_MODES = {"first_instance_only", "repeat_section", "table_rows"}
CARD_PRINT_PAGE_WIDTH_MM = 210.0
CARD_PRINT_PAGE_HEIGHT_MM = 297.0
CARD_PRINT_LINKED_CARD_WIDTH_MM = 186.0
CARD_PRINT_LINKED_CARD_HEIGHT_MM = 273.0
CARD_PRINT_MIN_LINKED_CARD_SCALE = 0.5
_DECORATIVE_KINDS = {"divider", "line", "block", "container", "panel", "rectangle"}
_OVERLAY_KINDS = {"divider", "line", "container", "panel", "rectangle", "image", "qr_code"}
_EXPLICIT_OVERLAY_KINDS = {*_OVERLAY_KINDS, "static_text", "heading"}
_FLOW_KINDS = {"field", "static_text", "heading", "metadata", "page_number", "print_date"}
_KNOWN_KINDS = {
    "field",
    "block",
    "static_text",
    "heading",
    "container",
    "panel",
    "rectangle",
    "divider",
    "line",
    "metadata",
    "page_number",
    "print_date",
    "qr_code",
    "image",
    "card_layout",
}
_STYLE_ALLOWED_VALUES = {
    "align": {"left", "center", "right"},
    "vertical_align": {"top", "middle", "bottom"},
    "border": {"none", "thin", "medium"},
    "label_position": {"top", "left", "right", "bottom"},
    "overflow": {"wrap", "truncate", "expand_down"},
}


@dataclass(frozen=True)
class CardPrintLayoutValidationResult:
    normalized_layout: dict[str, object]
    errors: list[str]
    warnings: list[str]


class CardPrintLayoutError(ValueError):
    """Raised while normalizing one linked card layout item."""


def validate_card_print_layout(
    layout_json: object,
    *,
    allowed_field_ids: set[UUID] | None = None,
    allowed_block_ids: set[UUID] | None = None,
) -> CardPrintLayoutValidationResult:
    errors: list[str] = []
    warnings: list[str] = []
    normalized_layout: dict[str, object] = {}

    if not isinstance(layout_json, dict):
        return CardPrintLayoutValidationResult(
            normalized_layout={},
            errors=["Print layout must be a JSON object."],
            warnings=[],
        )
    normalized_layout = dict(layout_json)

    if normalized_layout.get("version") != CARD_PRINT_LAYOUT_VERSION:
        errors.append("Print layout version must be card_print_layout_v1.")
    composition_mode = normalized_layout.get("composition_mode")
    if composition_mode not in (None, CARD_PRINT_LINKED_COMPOSITION_MODE):
        errors.append("Print layout composition mode is unsupported.")

    page = normalized_layout.get("page")
    if not isinstance(page, dict):
        errors.append("Print layout page must be an object.")
        page = {}
    if page.get("format") != "A4":
        errors.append("Print layout page format must be A4.")
    width_mm = _positive_number(page.get("width_mm"), default=CARD_PRINT_PAGE_WIDTH_MM)
    height_mm = _positive_number(page.get("height_mm"), default=CARD_PRINT_PAGE_HEIGHT_MM)
    if abs(width_mm - CARD_PRINT_PAGE_WIDTH_MM) > 0.01:
        errors.append("Print layout page width must be 210 mm.")
    if abs(height_mm - CARD_PRINT_PAGE_HEIGHT_MM) > 0.01:
        errors.append("Print layout page height must be 297 mm.")
    margin = page.get("margin_mm")
    if not isinstance(margin, dict):
        margin = {}
    top_margin = _non_negative_number(margin.get("top"), default=12)
    right_margin = _non_negative_number(margin.get("right"), default=12)
    bottom_margin = _non_negative_number(margin.get("bottom"), default=12)
    left_margin = _non_negative_number(margin.get("left"), default=12)

    grid = normalized_layout.get("grid")
    if not isinstance(grid, dict):
        errors.append("Print layout grid must be an object.")
        grid = {}
    columns = _positive_int(grid.get("columns"), default=CARD_PRINT_LAYOUT_COLUMNS)
    if columns != CARD_PRINT_LAYOUT_COLUMNS:
        errors.append("Print layout grid must use 12 columns.")
        columns = CARD_PRINT_LAYOUT_COLUMNS
    row_height_mm = _positive_number(grid.get("row_height_mm"), default=8)
    usable_height_mm = max(0.0, height_mm - top_margin - bottom_margin)
    max_rows = max(1, int(usable_height_mm // row_height_mm))

    raw_sections = normalized_layout.get("sections")
    has_sections = isinstance(raw_sections, list)
    items = normalized_layout.get("items")
    if not isinstance(items, list):
        if has_sections:
            items = []
        else:
            errors.append("Print layout items must be an array.")
            items = []

    seen_item_ids: set[str] = set()
    normalized_items: list[dict[str, object]] = []
    blocking_rects: list[tuple[str, int, float, float, float, float]] = []

    for index, raw_item in enumerate(items):
        if not isinstance(raw_item, dict):
            errors.append(f"Print layout item at index {index} must be an object.")
            continue
        normalized_item = dict(raw_item)
        item_id = raw_item.get("id")
        if not isinstance(item_id, str) or not item_id.strip():
            errors.append(f"Print layout item at index {index} must have a stable id.")
            item_id = f"item_{index}"
        elif item_id in seen_item_ids:
            errors.append(f"Print layout item '{item_id}' has a duplicate id.")
        seen_item_ids.add(item_id)

        kind = raw_item.get("kind")
        if kind not in _KNOWN_KINDS:
            errors.append(f"Print layout item '{item_id}' has unsupported kind '{kind}'.")
        if kind == "card_layout":
            try:
                normalized_item = _normalize_linked_card_item(raw_item)
            except CardPrintLayoutError as exc:
                errors.append(str(exc))
        normalized_items.append(normalized_item)

        page_number = _positive_int(normalized_item.get("page"), default=1)
        row = _positive_int(normalized_item.get("row"), default=1)
        column = _positive_int(normalized_item.get("column"), default=1)
        row_span = _positive_int(normalized_item.get("row_span"), default=1)
        column_span = _positive_int(normalized_item.get("column_span"), default=1)

        if column + column_span - 1 > columns:
            errors.append(f"Print layout item '{item_id}' is outside the 12-column grid.")
        if row + row_span - 1 > max_rows:
            errors.append(f"Print layout item '{item_id}' is outside the A4 page height.")

        repeat = normalized_item.get("repeat")
        if isinstance(repeat, dict):
            repeat_mode = repeat.get("mode")
            if repeat_mode is not None and repeat_mode not in CARD_PRINT_REPEAT_MODES:
                errors.append(
                    f"Print layout item '{item_id}' has unsupported repeat mode '{repeat_mode}'."
                )

        if kind == "field":
            raw_field_id = normalized_item.get("field_id")
            try:
                field_id = UUID(str(raw_field_id))
            except (TypeError, ValueError):
                errors.append(f"Print layout item '{item_id}' has invalid field_id.")
            else:
                if allowed_field_ids is not None and field_id not in allowed_field_ids:
                    errors.append(f"Unknown field_id for print layout item '{item_id}'.")

        if kind == "block":
            raw_block_id = normalized_item.get("block_id")
            if raw_block_id is not None:
                try:
                    block_id = UUID(str(raw_block_id))
                except (TypeError, ValueError):
                    errors.append(f"Print layout item '{item_id}' has invalid block_id.")
                else:
                    if allowed_block_ids is not None and block_id not in allowed_block_ids:
                        errors.append(f"Unknown block_id for print layout item '{item_id}'.")

        style = normalized_item.get("style")
        if style is not None:
            if not isinstance(style, dict):
                errors.append(f"Print layout item '{item_id}' style must be an object.")
            else:
                _validate_item_style(style, item_id, errors)

        rect = _item_rect_mm(
            normalized_item,
            row=row,
            column=column,
            row_span=row_span,
            column_span=column_span,
            row_height_mm=row_height_mm,
            width_mm=width_mm,
            height_mm=height_mm,
            left_margin=left_margin,
            right_margin=right_margin,
            top_margin=top_margin,
        )
        if rect is None:
            errors.append(f"Print layout item '{item_id}' has invalid millimeter geometry.")
            rect = _grid_rect_mm(
                row=row,
                column=column,
                row_span=row_span,
                column_span=column_span,
                row_height_mm=row_height_mm,
                left_margin=left_margin,
                right_margin=right_margin,
                top_margin=top_margin,
                width_mm=width_mm,
            )
        x_mm, y_mm, item_width_mm, item_height_mm = rect
        normalized_item["x_mm"] = round(x_mm, 3)
        normalized_item["y_mm"] = round(y_mm, 3)
        normalized_item["width_mm"] = round(item_width_mm, 3)
        normalized_item["height_mm"] = round(item_height_mm, 3)

        if x_mm < 0 or x_mm + item_width_mm > width_mm:
            errors.append(f"Print layout item '{item_id}' is outside the A4 page width.")
        if y_mm < 0 or y_mm + item_height_mm > height_mm:
            errors.append(f"Print layout item '{item_id}' is outside the A4 page height.")
        if kind == "card_layout":
            linked_scale = min(
                item_width_mm / CARD_PRINT_LINKED_CARD_WIDTH_MM,
                item_height_mm / CARD_PRINT_LINKED_CARD_HEIGHT_MM,
            )
            if linked_scale < CARD_PRINT_MIN_LINKED_CARD_SCALE:
                errors.append(f"Print layout item '{item_id}' is below the readable text scale.")

        if kind in _DECORATIVE_KINDS:
            continue

        current_rect = (item_id, page_number, x_mm, y_mm, item_width_mm, item_height_mm)
        for previous in blocking_rects:
            if _rects_overlap(previous, current_rect):
                errors.append(
                    f"Print layout item '{item_id}' overlaps '{previous[0]}' on page {page_number}."
                )
                break
        blocking_rects.append(current_rect)

    linked_item_count = sum(item.get("kind") == "card_layout" for item in normalized_items)
    if composition_mode == CARD_PRINT_LINKED_COMPOSITION_MODE or linked_item_count:
        normalized_layout["composition_mode"] = CARD_PRINT_LINKED_COMPOSITION_MODE
        if linked_item_count != 1:
            errors.append("Linked card composition must contain exactly one card_layout item.")

    normalized_layout["items"] = normalized_items
    if has_sections:
        normalized_layout["sections"] = _normalize_sections(
            raw_sections,
            errors=errors,
            allowed_field_ids=allowed_field_ids,
            allowed_block_ids=allowed_block_ids,
            width_mm=width_mm,
            height_mm=height_mm,
            row_height_mm=row_height_mm,
        )
        normalized_layout["overlays"] = _normalize_overlays(
            normalized_layout.get("overlays"),
            errors=errors,
            width_mm=width_mm,
            height_mm=height_mm,
        )
    else:
        legacy_sections, legacy_overlays = _normalize_legacy_items_to_sections(
            normalized_items,
            width_mm=width_mm,
            height_mm=height_mm,
            left_margin=left_margin,
            right_margin=right_margin,
            top_margin=top_margin,
            bottom_margin=bottom_margin,
            row_height_mm=row_height_mm,
        )
        normalized_layout["sections"] = legacy_sections
        explicit_overlays = _normalize_overlays(
            normalized_layout.get("overlays"),
            errors=errors,
            width_mm=width_mm,
            height_mm=height_mm,
        )
        normalized_layout["overlays"] = _merge_overlays(explicit_overlays, legacy_overlays)

    return CardPrintLayoutValidationResult(
        normalized_layout=normalized_layout,
        errors=errors,
        warnings=warnings,
    )


def _normalize_linked_card_item(item: dict[str, object]) -> dict[str, object]:
    return {
        "id": _required_string(
            item.get("id"),
            "Не указан идентификатор связанного макета карточки.",
        ),
        "kind": "card_layout",
        "card_template_id": _required_uuid_string(item.get("card_template_id")),
        "page": _positive_int(item.get("page"), default=1),
        "x_mm": _non_negative_number(item.get("x_mm"), default=12.0),
        "y_mm": _non_negative_number(item.get("y_mm"), default=12.0),
        "width_mm": _positive_number(item.get("width_mm"), default=CARD_PRINT_LINKED_CARD_WIDTH_MM),
        "height_mm": _positive_number(
            item.get("height_mm"), default=CARD_PRINT_LINKED_CARD_HEIGHT_MM
        ),
    }


def _required_string(value: object, message: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise CardPrintLayoutError(message)
    return value.strip()


def _required_uuid_string(value: object) -> str:
    try:
        return str(UUID(str(value)))
    except (TypeError, ValueError) as exc:
        raise CardPrintLayoutError(
            "Идентификатор связанного шаблона карточки некорректен."
        ) from exc


def _normalize_sections(
    raw_sections: object,
    *,
    errors: list[str],
    allowed_field_ids: set[UUID] | None,
    allowed_block_ids: set[UUID] | None,
    width_mm: float,
    height_mm: float,
    row_height_mm: float,
) -> list[dict[str, object]]:
    if not isinstance(raw_sections, list):
        errors.append("Print layout sections must be an array.")
        return []

    normalized_sections: list[dict[str, object]] = []
    seen_section_ids: set[str] = set()
    for index, raw_section in enumerate(raw_sections):
        if not isinstance(raw_section, dict):
            errors.append(f"Print layout section at index {index} must be an object.")
            continue
        section = dict(raw_section)
        section_id = raw_section.get("id")
        if not isinstance(section_id, str) or not section_id.strip():
            errors.append(f"Print layout section at index {index} must have a stable id.")
            section_id = f"section_{index}"
        elif section_id in seen_section_ids:
            errors.append(f"Print layout section '{section_id}' has a duplicate id.")
        seen_section_ids.add(section_id)

        if raw_section.get("kind") not in {None, "section"}:
            errors.append(f"Print layout section '{section_id}' has unsupported kind.")

        page_number = _positive_int(raw_section.get("page"), default=1)
        x_mm = _non_negative_number(raw_section.get("x_mm"), default=0)
        y_mm = _non_negative_number(raw_section.get("y_mm"), default=0)
        section_width_mm = _positive_number(raw_section.get("width_mm"), default=width_mm)
        section_height_mm = _positive_number(raw_section.get("height_mm"), default=height_mm)
        grid_columns = _positive_int(
            raw_section.get("grid_columns"), default=CARD_PRINT_LAYOUT_COLUMNS
        )
        if grid_columns != CARD_PRINT_LAYOUT_COLUMNS:
            errors.append(f"Print layout section '{section_id}' must use 12 columns.")
            grid_columns = CARD_PRINT_LAYOUT_COLUMNS
        if (
            x_mm < 0
            or x_mm + section_width_mm > width_mm
            or y_mm < 0
            or y_mm + section_height_mm > height_mm
        ):
            errors.append(f"Print layout section '{section_id}' is outside the A4 page.")

        raw_block_id = raw_section.get("block_id")
        if raw_block_id is not None:
            try:
                block_id = UUID(str(raw_block_id))
            except (TypeError, ValueError):
                errors.append(f"Print layout section '{section_id}' has invalid block_id.")
            else:
                if allowed_block_ids is not None and block_id not in allowed_block_ids:
                    errors.append(f"Unknown block_id for print layout section '{section_id}'.")

        style = raw_section.get("style")
        if style is not None:
            if not isinstance(style, dict):
                errors.append(f"Print layout section '{section_id}' style must be an object.")
            else:
                _validate_item_style(style, section_id, errors)

        raw_items = raw_section.get("items")
        if not isinstance(raw_items, list):
            errors.append(f"Print layout section '{section_id}' items must be an array.")
            raw_items = []
        normalized_items: list[dict[str, object]] = []
        blocking_rects: list[tuple[str, int, float, float, float, float]] = []
        max_rows = max(1, int(section_height_mm // row_height_mm))
        seen_item_ids: set[str] = set()
        for item_index, raw_item in enumerate(raw_items):
            if not isinstance(raw_item, dict):
                errors.append(
                    "Print layout section "
                    f"'{section_id}' item at index {item_index} must be an object."
                )
                continue
            normalized_item = dict(raw_item)
            item_id = raw_item.get("id")
            if not isinstance(item_id, str) or not item_id.strip():
                errors.append(
                    "Print layout section "
                    f"'{section_id}' item at index {item_index} must have a stable id."
                )
                item_id = f"{section_id}_item_{item_index}"
            elif item_id in seen_item_ids:
                errors.append(
                    f"Print layout item '{item_id}' has a duplicate id in section '{section_id}'."
                )
            seen_item_ids.add(item_id)

            kind = raw_item.get("kind")
            if kind not in _FLOW_KINDS:
                errors.append(
                    f"Print layout item '{item_id}' has unsupported section kind '{kind}'."
                )
            row = _positive_int(raw_item.get("row"), default=1)
            column = _positive_int(raw_item.get("column"), default=1)
            row_span = _positive_int(raw_item.get("row_span"), default=1)
            column_span = _positive_int(raw_item.get("column_span"), default=1)
            normalized_item.update(
                {
                    "id": item_id,
                    "kind": kind,
                    "row": row,
                    "column": column,
                    "row_span": row_span,
                    "column_span": column_span,
                }
            )
            if column + column_span - 1 > grid_columns or row + row_span - 1 > max_rows:
                errors.append(
                    f"Print layout item '{item_id}' is outside section grid '{section_id}'."
                )

            if kind == "field":
                _validate_field_id(raw_item.get("field_id"), item_id, allowed_field_ids, errors)

            item_style = raw_item.get("style")
            if item_style is not None:
                if not isinstance(item_style, dict):
                    errors.append(f"Print layout item '{item_id}' style must be an object.")
                else:
                    _validate_item_style(item_style, item_id, errors)

            current_rect = _section_item_rect(
                item_id=item_id,
                page_number=page_number,
                section_x_mm=x_mm,
                section_y_mm=y_mm,
                section_width_mm=section_width_mm,
                grid_columns=grid_columns,
                row_height_mm=row_height_mm,
                row=row,
                column=column,
                row_span=row_span,
                column_span=column_span,
            )
            for previous in blocking_rects:
                if _rects_overlap(previous, current_rect):
                    errors.append(
                        "Print layout item "
                        f"'{item_id}' overlaps '{previous[0]}' in section '{section_id}'."
                    )
                    break
            blocking_rects.append(current_rect)
            normalized_items.append(normalized_item)

        section.update(
            {
                "id": section_id,
                "kind": "section",
                "page": page_number,
                "x_mm": round(x_mm, 3),
                "y_mm": round(y_mm, 3),
                "width_mm": round(section_width_mm, 3),
                "height_mm": round(section_height_mm, 3),
                "grid_columns": grid_columns,
                "items": normalized_items,
            }
        )
        normalized_sections.append(section)
    return normalized_sections


def _normalize_overlays(
    raw_overlays: object,
    *,
    errors: list[str],
    width_mm: float,
    height_mm: float,
) -> list[dict[str, object]]:
    if raw_overlays is None:
        return []
    if not isinstance(raw_overlays, list):
        errors.append("Print layout overlays must be an array.")
        return []
    normalized_overlays: list[dict[str, object]] = []
    seen_overlay_ids: set[str] = set()
    for index, raw_overlay in enumerate(raw_overlays):
        if not isinstance(raw_overlay, dict):
            errors.append(f"Print layout overlay at index {index} must be an object.")
            continue
        overlay = dict(raw_overlay)
        overlay_id = raw_overlay.get("id")
        if not isinstance(overlay_id, str) or not overlay_id.strip():
            errors.append(f"Print layout overlay at index {index} must have a stable id.")
            overlay_id = f"overlay_{index}"
        elif overlay_id in seen_overlay_ids:
            errors.append(f"Print layout overlay '{overlay_id}' has a duplicate id.")
        seen_overlay_ids.add(overlay_id)
        kind = raw_overlay.get("kind")
        if kind not in _EXPLICIT_OVERLAY_KINDS:
            errors.append(f"Print layout overlay '{overlay_id}' has unsupported kind '{kind}'.")
        page_number = _positive_int(raw_overlay.get("page"), default=1)
        x_mm = _non_negative_number(raw_overlay.get("x_mm"), default=0)
        y_mm = _non_negative_number(raw_overlay.get("y_mm"), default=0)
        overlay_width_mm = _positive_number(raw_overlay.get("width_mm"), default=1)
        overlay_height_mm = _positive_number(raw_overlay.get("height_mm"), default=1)
        if x_mm + overlay_width_mm > width_mm or y_mm + overlay_height_mm > height_mm:
            errors.append(f"Print layout overlay '{overlay_id}' is outside the A4 page.")
        style = raw_overlay.get("style")
        if style is not None:
            if not isinstance(style, dict):
                errors.append(f"Print layout overlay '{overlay_id}' style must be an object.")
            else:
                _validate_item_style(style, overlay_id, errors)
        overlay.update(
            {
                "id": overlay_id,
                "kind": kind,
                "page": page_number,
                "x_mm": round(x_mm, 3),
                "y_mm": round(y_mm, 3),
                "width_mm": round(overlay_width_mm, 3),
                "height_mm": round(overlay_height_mm, 3),
            }
        )
        normalized_overlays.append(overlay)
    return normalized_overlays


def _merge_overlays(
    primary: list[dict[str, object]],
    secondary: list[dict[str, object]],
) -> list[dict[str, object]]:
    merged: list[dict[str, object]] = []
    seen_ids: set[str] = set()
    for overlay in [*primary, *secondary]:
        overlay_id = str(overlay.get("id") or "")
        if overlay_id and overlay_id in seen_ids:
            continue
        merged.append(overlay)
        if overlay_id:
            seen_ids.add(overlay_id)
    return merged


def _normalize_legacy_items_to_sections(
    items: list[dict[str, object]],
    *,
    width_mm: float,
    height_mm: float,
    left_margin: float,
    right_margin: float,
    top_margin: float,
    bottom_margin: float,
    row_height_mm: float,
) -> tuple[list[dict[str, object]], list[dict[str, object]]]:
    default_section: dict[str, object] = {
        "id": "section-default",
        "kind": "section",
        "title": "Print layout",
        "page": 1,
        "x_mm": round(left_margin, 3),
        "y_mm": round(top_margin, 3),
        "width_mm": round(max(1.0, width_mm - left_margin - right_margin), 3),
        "height_mm": round(max(1.0, height_mm - top_margin - bottom_margin), 3),
        "grid_columns": CARD_PRINT_LAYOUT_COLUMNS,
        "items": [],
    }
    block_sections: list[dict[str, object]] = []
    overlays: list[dict[str, object]] = []
    for item in items:
        kind = item.get("kind")
        if kind == "block":
            x_mm, y_mm, item_width_mm, item_height_mm = _rect_from_normalized_item(item)
            section: dict[str, object] = {
                "id": f"section-{item.get('id') or len(block_sections) + 1}",
                "kind": "section",
                "block_id": item.get("block_id"),
                "title": item.get("label") or item.get("text"),
                "page": _positive_int(item.get("page"), default=1),
                "x_mm": round(x_mm, 3),
                "y_mm": round(y_mm, 3),
                "width_mm": round(item_width_mm, 3),
                "height_mm": round(item_height_mm, 3),
                "grid_columns": CARD_PRINT_LAYOUT_COLUMNS,
                "style": item.get("style"),
                "items": [],
            }
            repeat = item.get("repeat")
            if isinstance(repeat, dict):
                section["repeat"] = repeat
            block_sections.append(section)

    for item in items:
        kind = item.get("kind")
        if kind == "block":
            continue
        if kind in _OVERLAY_KINDS:
            overlays.append(_legacy_item_to_overlay(item))
            continue
        if kind not in _FLOW_KINDS:
            continue
        x_mm, y_mm, item_width_mm, item_height_mm = _rect_from_normalized_item(item)
        target_section = next(
            (
                section
                for section in block_sections
                if _section_contains_rect(section, x_mm, y_mm, item_width_mm, item_height_mm)
            ),
            default_section,
        )
        flow_item = _legacy_item_to_flow_item(
            item,
            target_section,
            x_mm=x_mm,
            y_mm=y_mm,
            item_width_mm=item_width_mm,
            item_height_mm=item_height_mm,
            row_height_mm=row_height_mm,
        )
        section_items = target_section["items"]
        if isinstance(section_items, list):
            section_items.append(flow_item)

    sections = [
        *block_sections,
        default_section,
    ]
    return (
        [section for section in sections if section.get("block_id") or section.get("items")],
        overlays,
    )


def _legacy_item_to_overlay(item: dict[str, object]) -> dict[str, object]:
    x_mm, y_mm, item_width_mm, item_height_mm = _rect_from_normalized_item(item)
    return {
        "id": item.get("id"),
        "kind": item.get("kind"),
        "page": _positive_int(item.get("page"), default=1),
        "x_mm": round(x_mm, 3),
        "y_mm": round(y_mm, 3),
        "width_mm": round(item_width_mm, 3),
        "height_mm": round(item_height_mm, 3),
        "text": item.get("text"),
        "alt": item.get("label"),
        "style": item.get("style"),
    }


def _legacy_item_to_flow_item(
    item: dict[str, object],
    section: dict[str, object],
    *,
    x_mm: float,
    y_mm: float,
    item_width_mm: float,
    item_height_mm: float,
    row_height_mm: float,
) -> dict[str, object]:
    section_x = _non_negative_number(section.get("x_mm"), default=0)
    section_y = _non_negative_number(section.get("y_mm"), default=0)
    section_width = _positive_number(section.get("width_mm"), default=1)
    column_width = section_width / CARD_PRINT_LAYOUT_COLUMNS
    return {
        "id": item.get("id"),
        "kind": item.get("kind"),
        "field_id": item.get("field_id"),
        "metadata_key": item.get("metadata_key"),
        "text": item.get("text"),
        "label": item.get("label"),
        "show_label": item.get("show_label"),
        "row": max(1, round((y_mm - section_y) / row_height_mm) + 1),
        "column": max(
            1, min(CARD_PRINT_LAYOUT_COLUMNS, round((x_mm - section_x) / column_width) + 1)
        ),
        "row_span": max(1, round(item_height_mm / row_height_mm)),
        "column_span": max(1, min(CARD_PRINT_LAYOUT_COLUMNS, round(item_width_mm / column_width))),
        "style": item.get("style"),
    }


def _validate_field_id(
    raw_field_id: object,
    item_id: str,
    allowed_field_ids: set[UUID] | None,
    errors: list[str],
) -> None:
    try:
        field_id = UUID(str(raw_field_id))
    except (TypeError, ValueError):
        errors.append(f"Print layout item '{item_id}' has invalid field_id.")
        return
    if allowed_field_ids is not None and field_id not in allowed_field_ids:
        errors.append(f"Unknown field_id for print layout item '{item_id}'.")


def _section_item_rect(
    *,
    item_id: str,
    page_number: int,
    section_x_mm: float,
    section_y_mm: float,
    section_width_mm: float,
    grid_columns: int,
    row_height_mm: float,
    row: int,
    column: int,
    row_span: int,
    column_span: int,
) -> tuple[str, int, float, float, float, float]:
    column_width_mm = section_width_mm / grid_columns
    return (
        item_id,
        page_number,
        section_x_mm + ((column - 1) * column_width_mm),
        section_y_mm + ((row - 1) * row_height_mm),
        column_span * column_width_mm,
        row_span * row_height_mm,
    )


def _rect_from_normalized_item(item: dict[str, object]) -> tuple[float, float, float, float]:
    return (
        _non_negative_number(item.get("x_mm"), default=0),
        _non_negative_number(item.get("y_mm"), default=0),
        _positive_number(item.get("width_mm"), default=1),
        _positive_number(item.get("height_mm"), default=1),
    )


def _section_contains_rect(
    section: dict[str, object],
    x_mm: float,
    y_mm: float,
    item_width_mm: float,
    item_height_mm: float,
) -> bool:
    section_x = _non_negative_number(section.get("x_mm"), default=0)
    section_y = _non_negative_number(section.get("y_mm"), default=0)
    section_width = _positive_number(section.get("width_mm"), default=1)
    section_height = _positive_number(section.get("height_mm"), default=1)
    return (
        x_mm >= section_x
        and y_mm >= section_y
        and x_mm + item_width_mm <= section_x + section_width
        and y_mm + item_height_mm <= section_y + section_height
    )


def _positive_int(value: object, *, default: int) -> int:
    if isinstance(value, bool):
        return default
    if not isinstance(value, int | float | str):
        return default
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return parsed if parsed > 0 else default


def _positive_number(value: object, *, default: float) -> float:
    if isinstance(value, bool):
        return default
    try:
        parsed = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default
    return parsed if parsed > 0 else default


def _non_negative_number(value: object, *, default: float) -> float:
    if isinstance(value, bool):
        return default
    try:
        parsed = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default
    return parsed if parsed >= 0 else default


def _optional_number(value: object) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        parsed = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return parsed if parsed >= 0 else None


def _item_rect_mm(
    item: dict[str, object],
    *,
    row: int,
    column: int,
    row_span: int,
    column_span: int,
    row_height_mm: float,
    width_mm: float,
    height_mm: float,
    left_margin: float,
    right_margin: float,
    top_margin: float,
) -> tuple[float, float, float, float] | None:
    has_mm_geometry = any(key in item for key in ("x_mm", "y_mm", "width_mm", "height_mm"))
    if not has_mm_geometry:
        return _grid_rect_mm(
            row=row,
            column=column,
            row_span=row_span,
            column_span=column_span,
            row_height_mm=row_height_mm,
            left_margin=left_margin,
            right_margin=right_margin,
            top_margin=top_margin,
            width_mm=width_mm,
        )
    x_mm = _optional_number(item.get("x_mm"))
    y_mm = _optional_number(item.get("y_mm"))
    item_width_mm = _optional_number(item.get("width_mm"))
    item_height_mm = _optional_number(item.get("height_mm"))
    if x_mm is None or y_mm is None or item_width_mm is None or item_height_mm is None:
        return None
    if item_width_mm <= 0 or item_height_mm <= 0:
        return None
    if item_width_mm > width_mm or item_height_mm > height_mm:
        return (x_mm, y_mm, item_width_mm, item_height_mm)
    return (x_mm, y_mm, item_width_mm, item_height_mm)


def _grid_rect_mm(
    *,
    row: int,
    column: int,
    row_span: int,
    column_span: int,
    row_height_mm: float,
    left_margin: float,
    right_margin: float,
    top_margin: float,
    width_mm: float,
) -> tuple[float, float, float, float]:
    usable_width_mm = max(1.0, width_mm - left_margin - right_margin)
    column_width_mm = usable_width_mm / CARD_PRINT_LAYOUT_COLUMNS
    return (
        left_margin + ((column - 1) * column_width_mm),
        top_margin + ((row - 1) * row_height_mm),
        column_span * column_width_mm,
        row_span * row_height_mm,
    )


def _validate_item_style(
    style: dict[object, object],
    item_id: str,
    errors: list[str],
) -> None:
    for key, allowed_values in _STYLE_ALLOWED_VALUES.items():
        value = style.get(key)
        if value is not None and (not isinstance(value, str) or value not in allowed_values):
            errors.append(f"Print layout item '{item_id}' has unsupported style {key}.")
    font_size = style.get("font_size")
    if font_size is not None and _positive_number(font_size, default=0) <= 0:
        errors.append(f"Print layout item '{item_id}' has invalid font_size.")
    padding_mm = style.get("padding_mm")
    if padding_mm is not None and _non_negative_number(padding_mm, default=-1) < 0:
        errors.append(f"Print layout item '{item_id}' has invalid padding_mm.")
    max_lines = style.get("max_lines")
    if max_lines is not None and _positive_int(max_lines, default=0) <= 0:
        errors.append(f"Print layout item '{item_id}' has invalid max_lines.")


def _rects_overlap(
    left: tuple[str, int, float, float, float, float],
    right: tuple[str, int, float, float, float, float],
) -> bool:
    _left_id, left_page, left_x, left_y, left_width, left_height = left
    _right_id, right_page, right_x, right_y, right_width, right_height = right
    if left_page != right_page:
        return False
    left_x_end = left_x + left_width
    right_x_end = right_x + right_width
    left_y_end = left_y + left_height
    right_y_end = right_y + right_height
    return not (
        left_x_end <= right_x
        or right_x_end <= left_x
        or left_y_end <= right_y
        or right_y_end <= left_y
    )
