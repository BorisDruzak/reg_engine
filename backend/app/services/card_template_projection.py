from dataclasses import dataclass
from typing import Any
from uuid import UUID

CARD_TEMPLATE_LAYOUT_VERSION = "card_template_layout_v1"
FORM_LAYOUT_COLUMNS = 12
DEFAULT_A4_PAGE: dict[str, Any] = {
    "format": "A4",
    "width_mm": 210,
    "height_mm": 297,
    "margin_mm": {"top": 12, "right": 12, "bottom": 12, "left": 12},
}
DEFAULT_A4_GRID: dict[str, Any] = {"columns": 12, "row_height_mm": 8, "snap_mm": 2}


@dataclass(frozen=True)
class PrintViewSyncResult:
    print_view: dict[str, Any]
    sync_status: dict[str, Any]


def project_form_layout_to_a4(
    form_layout: dict[str, Any],
    page_settings: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    page = _page(page_settings)
    margin = _margin(page)
    content_width = float(page["width_mm"]) - margin["left"] - margin["right"]
    column_width = content_width / FORM_LAYOUT_COLUMNS
    items: list[dict[str, Any]] = []
    flow_index = 0

    for section in _form_sections(form_layout):
        section_block_id = section.get("block_id")
        for item in _form_items(section):
            source_item_id = str(item.get("id") or f"form_item_{flow_index + 1}")
            kind = str(item.get("kind") or "field")
            column = _positive_int(item.get("column"), 1)
            column_span = _positive_int(item.get("column_span"), FORM_LAYOUT_COLUMNS)
            row = _positive_int(item.get("row"), 1)
            projected: dict[str, Any] = {
                "id": f"a4-{source_item_id}",
                "source_item_id": source_item_id,
                "kind": kind,
                "page": 1,
                "x_mm": round(margin["left"] + (column - 1) * column_width, 3),
                "y_mm": round(margin["top"] + flow_index * 14 + (row - 1) * 8, 3),
                "width_mm": round(column_span * column_width, 3),
                "height_mm": 12,
                "override": False,
                "sync_status": "synced",
            }
            if section_block_id is not None:
                projected["block_id"] = str(section_block_id)
            if kind == "field" and item.get("field_id") is not None:
                projected["field_id"] = str(item["field_id"])
            if kind in {"static_text", "heading"} and item.get("text") is not None:
                projected["text"] = str(item["text"])
            items.append(projected)
            flow_index += 1
    return items


def sync_print_view(
    existing_print_view: dict[str, Any],
    form_layout: dict[str, Any],
    page_settings: dict[str, Any] | None = None,
    *,
    archived_field_ids: set[UUID] | None = None,
) -> PrintViewSyncResult:
    projected_items = project_form_layout_to_a4(form_layout, page_settings)
    projected_by_source = {
        str(item["source_item_id"]): item
        for item in projected_items
        if item.get("source_item_id") is not None
    }
    existing_items = [
        dict(item) for item in existing_print_view.get("items", []) if isinstance(item, dict)
    ]
    existing_by_source = {
        str(item["source_item_id"]): item
        for item in existing_items
        if item.get("source_item_id") is not None
    }
    warnings: list[str] = []
    errors: list[str] = []
    synced_items: list[dict[str, object]] = []

    for source_item_id, projected in projected_by_source.items():
        existing = existing_by_source.get(source_item_id)
        if existing is None:
            synced_items.append(projected)
            warnings.append(f"Поле '{source_item_id}' размещено на A4 автоматически.")
            continue
        if existing.get("override") is True:
            overridden = {**projected, **existing, "sync_status": "manual_override"}
            synced_items.append(overridden)
            warnings.append(
                f"Элемент '{source_item_id}' сохранён с ручным положением и не был перемещён."
            )
            continue
        synced_items.append({**existing, **projected, "sync_status": "synced"})

    projected_sources = set(projected_by_source)
    for item in existing_items:
        raw_source_item_id = item.get("source_item_id")
        if raw_source_item_id is None or str(raw_source_item_id) not in projected_sources:
            orphan = dict(item)
            orphan["sync_status"] = "missing_source"
            synced_items.append(orphan)
            warnings.append(f"Элемент A4 '{orphan.get('id')}' не связан с формой.")

    archived_ids = {str(field_id) for field_id in archived_field_ids or set()}
    for item in synced_items:
        field_id = item.get("field_id")
        if field_id is not None and str(field_id) in archived_ids:
            item["sync_status"] = "archived_field"
            errors.append(f"Поле A4 '{item.get('id')}' ссылается на архивированное поле.")

    next_print_view = {
        **existing_print_view,
        "items": synced_items,
    }
    sync_status = {
        "has_errors": bool(errors),
        "errors": errors,
        "warnings": warnings,
        "mapping": build_mapping_table(
            form_layout,
            next_print_view,
            archived_field_ids=archived_field_ids,
        ),
    }
    return PrintViewSyncResult(print_view=next_print_view, sync_status=sync_status)


def build_mapping_table(
    form_layout: dict[str, Any],
    print_view: dict[str, Any],
    *,
    archived_field_ids: set[UUID] | None = None,
) -> dict[str, list[str]]:
    form_item_ids = {
        str(item.get("id"))
        for section in _form_sections(form_layout)
        for item in _form_items(section)
        if item.get("id") is not None
    }
    print_items = [item for item in print_view.get("items", []) if isinstance(item, dict)]
    source_item_ids = {
        str(item.get("source_item_id"))
        for item in print_items
        if item.get("source_item_id") is not None
    }
    manual_items = [
        str(item.get("id"))
        for item in print_items
        if item.get("source_item_id") is None and item.get("id") is not None
    ]
    missing_print_items = sorted(form_item_ids - source_item_ids)
    missing_source_items = [
        str(item.get("id"))
        for item in print_items
        if item.get("source_item_id") is not None
        and str(item.get("source_item_id")) not in form_item_ids
        and item.get("id") is not None
    ]
    overridden_items = [
        str(item.get("id"))
        for item in print_items
        if item.get("override") is True and item.get("id") is not None
    ]
    archived_ids = {str(field_id) for field_id in archived_field_ids or set()}
    archived_field_items = [
        str(item.get("id"))
        for item in print_items
        if item.get("field_id") is not None
        and str(item.get("field_id")) in archived_ids
        and item.get("id") is not None
    ]
    return {
        "missing_print_items": missing_print_items,
        "missing_source_items": missing_source_items,
        "manual_items": manual_items,
        "overridden_items": overridden_items,
        "archived_field_items": archived_field_items,
    }


def default_form_layout_for_blocks(
    blocks: list[dict[str, Any]],
    fields: list[dict[str, Any]],
) -> dict[str, Any]:
    sections: list[dict[str, Any]] = []
    fields_by_block: dict[str, list[dict[str, Any]]] = {}
    for field in fields:
        block_id = field.get("block_id")
        if block_id is None:
            continue
        fields_by_block.setdefault(str(block_id), []).append(field)

    for block_index, block in enumerate(blocks):
        block_id = str(block["id"])
        items: list[dict[str, Any]] = []
        for field_index, field in enumerate(fields_by_block.get(block_id, [])):
            items.append(
                {
                    "id": f"field-{field['id']}",
                    "kind": "field",
                    "field_id": str(field["id"]),
                    "row": field_index + 1,
                    "column": 1,
                    "column_span": 12,
                }
            )
        sections.append(
            {
                "id": f"block-{block_id}",
                "block_id": block_id,
                "row": block_index + 1,
                "column": 1,
                "column_span": 12,
                "items": items,
            }
        )
    return {"columns": FORM_LAYOUT_COLUMNS, "sections": sections}


def virtual_default_print_view(
    form_layout: dict[str, Any],
    *,
    name: str = "Основная A4",
) -> dict[str, Any]:
    page = dict(DEFAULT_A4_PAGE)
    return {
        "id": "default-a4",
        "name": name,
        "is_default": True,
        "document_template_id": None,
        "current_version_id": None,
        "source": "form_layout",
        "page": page,
        "items": project_form_layout_to_a4(form_layout, page),
    }


def _form_sections(form_layout: dict[str, Any]) -> list[dict[str, Any]]:
    sections = form_layout.get("sections")
    if not isinstance(sections, list):
        return []
    return [section for section in sections if isinstance(section, dict)]


def _form_items(section: dict[str, Any]) -> list[dict[str, Any]]:
    items = section.get("items")
    return [item for item in items if isinstance(item, dict)] if isinstance(items, list) else []


def _page(page_settings: dict[str, Any] | None) -> dict[str, Any]:
    page = dict(DEFAULT_A4_PAGE)
    if isinstance(page_settings, dict):
        page.update(page_settings)
    page["width_mm"] = float(page.get("width_mm") or 210)
    page["height_mm"] = float(page.get("height_mm") or 297)
    if not isinstance(page.get("margin_mm"), dict):
        page["margin_mm"] = dict(DEFAULT_A4_PAGE["margin_mm"])
    return page


def _margin(page: dict[str, Any]) -> dict[str, float]:
    raw_margin = page.get("margin_mm")
    margin = raw_margin if isinstance(raw_margin, dict) else {}
    return {
        "top": float(margin.get("top") or 12),
        "right": float(margin.get("right") or 12),
        "bottom": float(margin.get("bottom") or 12),
        "left": float(margin.get("left") or 12),
    }


def _positive_int(value: Any, default: int) -> int:
    if isinstance(value, bool):
        return default
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return parsed if parsed > 0 else default
