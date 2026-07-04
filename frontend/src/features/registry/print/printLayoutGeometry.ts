import type { CardPrintLayout, CardPrintLayoutItem } from "@/api/types";

export const CARD_PRINT_LAYOUT_VERSION = "card_print_layout_v1";
export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;
export const A4_COLUMNS = 12;
export const DEFAULT_ROW_HEIGHT_MM = 8;
export const DEFAULT_MARGIN_MM = { top: 12, right: 12, bottom: 12, left: 12 };
export const DEFAULT_PX_PER_MM = 3;

type RectMm = {
  x_mm: number;
  y_mm: number;
  width_mm: number;
  height_mm: number;
};

export function createEmptyCardPrintLayout(): CardPrintLayout {
  return {
    version: CARD_PRINT_LAYOUT_VERSION,
    page: {
      format: "A4",
      width_mm: A4_WIDTH_MM,
      height_mm: A4_HEIGHT_MM,
      margin_mm: { ...DEFAULT_MARGIN_MM },
    },
    grid: { columns: A4_COLUMNS, row_height_mm: DEFAULT_ROW_HEIGHT_MM },
    items: [],
  };
}

export function normalizeLayoutGeometry(layout: CardPrintLayout): CardPrintLayout {
  return {
    ...layout,
    page: {
      format: "A4",
      width_mm: A4_WIDTH_MM,
      height_mm: A4_HEIGHT_MM,
      margin_mm: {
        ...DEFAULT_MARGIN_MM,
        ...layout.page?.margin_mm,
      },
    },
    grid: {
      columns: A4_COLUMNS,
      row_height_mm: Number(layout.grid?.row_height_mm) || DEFAULT_ROW_HEIGHT_MM,
    },
    items: layout.items.map((item) => ensureItemGeometry(item, layout)),
  };
}

export function ensureItemGeometry(
  item: CardPrintLayoutItem,
  layout: CardPrintLayout,
): CardPrintLayoutItem {
  const rect = itemHasMmGeometry(item) ? itemRectFromMm(item) : gridItemToRect(item, layout);
  const clamped = clampRectToPage(rect, layout);
  const grid = rectToGridItem(clamped, layout);
  return {
    ...item,
    ...grid,
    x_mm: roundMm(clamped.x_mm),
    y_mm: roundMm(clamped.y_mm),
    width_mm: roundMm(clamped.width_mm),
    height_mm: roundMm(clamped.height_mm),
  };
}

export function moveItemByMm(
  item: CardPrintLayoutItem,
  layout: CardPrintLayout,
  deltaX: number,
  deltaY: number,
): CardPrintLayoutItem {
  const normalized = ensureItemGeometry(item, layout);
  const rect = clampRectToPage(
    {
      x_mm: snapMm(Number(normalized.x_mm) + deltaX),
      y_mm: snapMm(Number(normalized.y_mm) + deltaY),
      width_mm: Number(normalized.width_mm),
      height_mm: Number(normalized.height_mm),
    },
    layout,
  );
  return { ...normalized, ...rectToGridItem(rect, layout), ...roundRect(rect) };
}

export function resizeItemByMm(
  item: CardPrintLayoutItem,
  layout: CardPrintLayout,
  edge: string,
  deltaX: number,
  deltaY: number,
): CardPrintLayoutItem {
  const normalized = ensureItemGeometry(item, layout);
  const rect = itemRectFromMm(normalized);
  const minWidth = item.kind === "line" || item.kind === "divider" ? 12 : 18;
  const minHeight = item.kind === "line" || item.kind === "divider" ? 2 : 8;
  let next = { ...rect };

  if (edge.includes("left")) {
    next.x_mm = rect.x_mm + deltaX;
    next.width_mm = rect.width_mm - deltaX;
  }
  if (edge.includes("right")) {
    next.width_mm = rect.width_mm + deltaX;
  }
  if (edge.includes("top")) {
    next.y_mm = rect.y_mm + deltaY;
    next.height_mm = rect.height_mm - deltaY;
  }
  if (edge.includes("bottom")) {
    next.height_mm = rect.height_mm + deltaY;
  }

  if (next.width_mm < minWidth) {
    if (edge.includes("left")) {
      next.x_mm -= minWidth - next.width_mm;
    }
    next.width_mm = minWidth;
  }
  if (next.height_mm < minHeight) {
    if (edge.includes("top")) {
      next.y_mm -= minHeight - next.height_mm;
    }
    next.height_mm = minHeight;
  }

  next = clampRectToPage(
    {
      x_mm: snapMm(next.x_mm),
      y_mm: snapMm(next.y_mm),
      width_mm: snapMm(next.width_mm),
      height_mm: snapMm(next.height_mm),
    },
    layout,
  );
  return { ...normalized, ...rectToGridItem(next, layout), ...roundRect(next) };
}

export function itemRectFromMm(item: CardPrintLayoutItem): RectMm {
  return {
    x_mm: Number(item.x_mm) || 0,
    y_mm: Number(item.y_mm) || 0,
    width_mm: Math.max(1, Number(item.width_mm) || 1),
    height_mm: Math.max(1, Number(item.height_mm) || 1),
  };
}

export function itemStyleFromMm(item: CardPrintLayoutItem, scale: number) {
  const rect = itemRectFromMm(item);
  return {
    left: `${rect.x_mm * scale}px`,
    top: `${rect.y_mm * scale}px`,
    width: `${rect.width_mm * scale}px`,
    height: `${rect.height_mm * scale}px`,
  };
}

export function snapMm(value: number, step = 1) {
  return Math.round(value / step) * step;
}

function itemHasMmGeometry(item: CardPrintLayoutItem) {
  return (
    Number.isFinite(item.x_mm) &&
    Number.isFinite(item.y_mm) &&
    Number.isFinite(item.width_mm) &&
    Number.isFinite(item.height_mm)
  );
}

function gridItemToRect(item: CardPrintLayoutItem, layout: CardPrintLayout): RectMm {
  const margin = layout.page.margin_mm;
  const usableWidth = layout.page.width_mm - margin.left - margin.right;
  const columnWidth = usableWidth / A4_COLUMNS;
  const rowHeight = layout.grid.row_height_mm || DEFAULT_ROW_HEIGHT_MM;
  const column = clampNumber(item.column || 1, 1, A4_COLUMNS);
  const row = clampNumber(item.row || 1, 1, maxRows(layout));
  return {
    x_mm: margin.left + (column - 1) * columnWidth,
    y_mm: margin.top + (row - 1) * rowHeight,
    width_mm: Math.max(columnWidth, (item.column_span || 1) * columnWidth),
    height_mm: Math.max(rowHeight, (item.row_span || 1) * rowHeight),
  };
}

function rectToGridItem(rect: RectMm, layout: CardPrintLayout) {
  const margin = layout.page.margin_mm;
  const usableWidth = layout.page.width_mm - margin.left - margin.right;
  const columnWidth = usableWidth / A4_COLUMNS;
  const rowHeight = layout.grid.row_height_mm || DEFAULT_ROW_HEIGHT_MM;
  const column = clampNumber(
    Math.round((rect.x_mm - margin.left) / columnWidth) + 1,
    1,
    A4_COLUMNS,
  );
  const row = clampNumber(Math.round((rect.y_mm - margin.top) / rowHeight) + 1, 1, maxRows(layout));
  return {
    row,
    column,
    row_span: clampNumber(
      Math.max(1, Math.round(rect.height_mm / rowHeight)),
      1,
      maxRows(layout) - row + 1,
    ),
    column_span: clampNumber(
      Math.max(1, Math.round(rect.width_mm / columnWidth)),
      1,
      A4_COLUMNS - column + 1,
    ),
  };
}

function clampRectToPage(rect: RectMm, layout: CardPrintLayout): RectMm {
  const width = layout.page.width_mm || A4_WIDTH_MM;
  const height = layout.page.height_mm || A4_HEIGHT_MM;
  const next = {
    x_mm: clampNumber(rect.x_mm, 0, Math.max(0, width - rect.width_mm)),
    y_mm: clampNumber(rect.y_mm, 0, Math.max(0, height - rect.height_mm)),
    width_mm: clampNumber(rect.width_mm, 1, width),
    height_mm: clampNumber(rect.height_mm, 1, height),
  };
  if (next.x_mm + next.width_mm > width) {
    next.width_mm = width - next.x_mm;
  }
  if (next.y_mm + next.height_mm > height) {
    next.height_mm = height - next.y_mm;
  }
  return next;
}

function maxRows(layout: CardPrintLayout) {
  const margin = layout.page.margin_mm;
  const rowHeight = layout.grid.row_height_mm || DEFAULT_ROW_HEIGHT_MM;
  return Math.max(1, Math.floor((layout.page.height_mm - margin.top - margin.bottom) / rowHeight));
}

function roundRect(rect: RectMm): RectMm {
  return {
    x_mm: roundMm(rect.x_mm),
    y_mm: roundMm(rect.y_mm),
    width_mm: roundMm(rect.width_mm),
    height_mm: roundMm(rect.height_mm),
  };
}

function roundMm(value: number) {
  return Math.round(value * 10) / 10;
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}
