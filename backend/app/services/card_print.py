from dataclasses import dataclass
from uuid import UUID

CARD_PRINT_LAYOUT_VERSION = "card_print_layout_v1"
CARD_PRINT_LAYOUT_COLUMNS = 12
CARD_PRINT_REPEAT_MODES = {"first_instance_only", "repeat_section", "table_rows"}
CARD_PRINT_PAGE_WIDTH_MM = 210.0
CARD_PRINT_PAGE_HEIGHT_MM = 297.0
_DECORATIVE_KINDS = {"divider", "line"}
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

    items = normalized_layout.get("items")
    if not isinstance(items, list):
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
        normalized_items.append(normalized_item)
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

        page_number = _positive_int(raw_item.get("page"), default=1)
        row = _positive_int(raw_item.get("row"), default=1)
        column = _positive_int(raw_item.get("column"), default=1)
        row_span = _positive_int(raw_item.get("row_span"), default=1)
        column_span = _positive_int(raw_item.get("column_span"), default=1)

        if column + column_span - 1 > columns:
            errors.append(f"Print layout item '{item_id}' is outside the 12-column grid.")
        if row + row_span - 1 > max_rows:
            errors.append(f"Print layout item '{item_id}' is outside the A4 page height.")

        repeat = raw_item.get("repeat")
        if isinstance(repeat, dict):
            repeat_mode = repeat.get("mode")
            if repeat_mode is not None and repeat_mode not in CARD_PRINT_REPEAT_MODES:
                errors.append(
                    f"Print layout item '{item_id}' has unsupported repeat mode '{repeat_mode}'."
                )

        if kind == "field":
            raw_field_id = raw_item.get("field_id")
            try:
                field_id = UUID(str(raw_field_id))
            except (TypeError, ValueError):
                errors.append(f"Print layout item '{item_id}' has invalid field_id.")
            else:
                if allowed_field_ids is not None and field_id not in allowed_field_ids:
                    errors.append(f"Unknown field_id for print layout item '{item_id}'.")

        if kind == "block":
            raw_block_id = raw_item.get("block_id")
            if raw_block_id is not None:
                try:
                    block_id = UUID(str(raw_block_id))
                except (TypeError, ValueError):
                    errors.append(f"Print layout item '{item_id}' has invalid block_id.")
                else:
                    if allowed_block_ids is not None and block_id not in allowed_block_ids:
                        errors.append(f"Unknown block_id for print layout item '{item_id}'.")

        style = raw_item.get("style")
        if style is not None:
            if not isinstance(style, dict):
                errors.append(f"Print layout item '{item_id}' style must be an object.")
            else:
                _validate_item_style(style, item_id, errors)

        rect = _item_rect_mm(
            raw_item,
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

    normalized_layout["items"] = normalized_items

    return CardPrintLayoutValidationResult(
        normalized_layout=normalized_layout,
        errors=errors,
        warnings=warnings,
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
        if value is not None and value not in allowed_values:
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
