from dataclasses import dataclass
from uuid import UUID

CARD_PRINT_LAYOUT_VERSION = "card_print_layout_v1"
CARD_PRINT_LAYOUT_COLUMNS = 12
CARD_PRINT_REPEAT_MODES = {"first_instance_only", "repeat_section", "table_rows"}
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


@dataclass(frozen=True)
class CardPrintLayoutValidationResult:
    normalized_layout: dict[str, object]
    errors: list[str]
    warnings: list[str]


def validate_card_print_layout(
    layout_json: object,
    *,
    allowed_field_ids: set[UUID] | None = None,
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
    height_mm = _positive_number(page.get("height_mm"), default=297)
    margin = page.get("margin_mm")
    if not isinstance(margin, dict):
        margin = {}
    top_margin = _non_negative_number(margin.get("top"), default=12)
    bottom_margin = _non_negative_number(margin.get("bottom"), default=12)

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
    blocking_rects: list[tuple[str, int, int, int, int, int]] = []

    for index, raw_item in enumerate(items):
        if not isinstance(raw_item, dict):
            errors.append(f"Print layout item at index {index} must be an object.")
            continue
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

        if kind in _DECORATIVE_KINDS:
            continue

        current_rect = (item_id, page_number, row, column, row_span, column_span)
        for previous in blocking_rects:
            if _rects_overlap(previous, current_rect):
                errors.append(
                    f"Print layout item '{item_id}' overlaps '{previous[0]}' on page {page_number}."
                )
                break
        blocking_rects.append(current_rect)

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


def _rects_overlap(
    left: tuple[str, int, int, int, int, int],
    right: tuple[str, int, int, int, int, int],
) -> bool:
    _left_id, left_page, left_row, left_col, left_row_span, left_col_span = left
    _right_id, right_page, right_row, right_col, right_row_span, right_col_span = right
    if left_page != right_page:
        return False
    left_row_end = left_row + left_row_span - 1
    right_row_end = right_row + right_row_span - 1
    left_col_end = left_col + left_col_span - 1
    right_col_end = right_col + right_col_span - 1
    return not (
        left_row_end < right_row
        or right_row_end < left_row
        or left_col_end < right_col
        or right_col_end < left_col
    )
