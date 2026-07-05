import type {
  CardPrintFlowItem,
  CardPrintLayout,
  CardPrintLayoutItem,
  CardPrintOverlayItem,
  CardPrintSection,
} from "@/api/types";

export const CARD_PRINT_LAYOUT_VERSION = "card_print_layout_v1";
export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;
export const A4_COLUMNS: CardPrintSection["grid_columns"] = 12;
export const DEFAULT_ROW_HEIGHT_MM = 8;
export const DEFAULT_BASELINE_MM = 4;
export const DEFAULT_SNAP_MM = 2;
export const DEFAULT_MARGIN_MM = { top: 12, right: 12, bottom: 12, left: 12 };
export const DEFAULT_PX_PER_MM = 3;

export type RectMm = {
  x_mm: number;
  y_mm: number;
  width_mm: number;
  height_mm: number;
};

const overlayKinds = new Set<CardPrintLayoutItem["kind"]>([
  "line",
  "divider",
  "rectangle",
  "panel",
  "container",
  "image",
  "qr_code",
]);

const flowKinds = new Set<CardPrintLayoutItem["kind"]>([
  "field",
  "static_text",
  "heading",
  "metadata",
  "page_number",
  "print_date",
]);

export function createEmptyCardPrintLayout(): CardPrintLayout {
  return {
    version: CARD_PRINT_LAYOUT_VERSION,
    page: {
      format: "A4",
      width_mm: A4_WIDTH_MM,
      height_mm: A4_HEIGHT_MM,
      margin_mm: { ...DEFAULT_MARGIN_MM },
    },
    grid: {
      columns: A4_COLUMNS,
      baseline_mm: DEFAULT_BASELINE_MM,
      row_height_mm: DEFAULT_ROW_HEIGHT_MM,
      snap_mm: DEFAULT_SNAP_MM,
    },
    sections: [],
    overlays: [],
    items: [],
  };
}

export function normalizeLayout(layout: CardPrintLayout): CardPrintLayout {
  return normalizeLayoutGeometry(layout);
}

export function normalizeLayoutGeometry(layout: CardPrintLayout): CardPrintLayout {
  const normalizedBase = normalizeLayoutBase(layout);
  const sourceItems = Array.isArray(layout.items) ? layout.items : [];
  const normalizedItems = sourceItems.map((item) => ensureItemGeometry(item, normalizedBase));
  const normalizedWithItems = { ...normalizedBase, items: normalizedItems };
  const normalizedSections =
    Array.isArray(layout.sections) && layout.sections.length > 0
      ? normalizeSections(layout.sections, normalizedBase)
      : normalizeLegacyItemsToSections(normalizedWithItems).sections;
  const normalizedOverlays =
    Array.isArray(layout.overlays) && layout.overlays.length > 0
      ? normalizeOverlays(layout.overlays, normalizedBase)
      : normalizeLegacyItemsToSections(normalizedWithItems).overlays;

  return {
    ...normalizedWithItems,
    sections: normalizedSections,
    overlays: normalizedOverlays,
  };
}

export function normalizeLegacyItemsToSections(layout: CardPrintLayout): {
  sections: CardPrintSection[];
  overlays: CardPrintOverlayItem[];
} {
  const normalizedBase = normalizeLayoutBase(layout);
  const items = (layout.items ?? []).map((item) => ensureItemGeometry(item, normalizedBase));
  const margins = normalizedBase.page.margin_mm;
  const defaultSection: CardPrintSection = {
    id: "section-default",
    kind: "section",
    title: "Печатная форма",
    page: 1,
    x_mm: margins.left,
    y_mm: margins.top,
    width_mm: normalizedBase.page.width_mm - margins.left - margins.right,
    height_mm: normalizedBase.page.height_mm - margins.top - margins.bottom,
    grid_columns: A4_COLUMNS,
    items: [],
  };
  const blockSections = items
    .filter((item) => item.kind === "block")
    .map<CardPrintSection>((item) => {
      const rect = itemRectFromMm(item);
      return {
        id: `section-${item.id}`,
        kind: "section",
        block_id: item.block_id,
        title: item.label || item.text,
        page: item.page || 1,
        ...roundRect(rect),
        grid_columns: A4_COLUMNS,
        repeat: item.repeat?.mode
          ? { mode: item.repeat.mode as "first_instance_only" | "repeat_section" | "table_rows" }
          : undefined,
        style: item.style,
        items: [],
      };
    });
  const overlays: CardPrintOverlayItem[] = [];

  for (const item of items) {
    if (item.kind === "block") {
      continue;
    }
    if (overlayKinds.has(item.kind)) {
      overlays.push(legacyItemToOverlay(item));
      continue;
    }
    if (!flowKinds.has(item.kind)) {
      continue;
    }
    const section =
      blockSections.find(
        (candidate) =>
          candidate.page === (item.page || 1) && rectContains(candidate, itemRectFromMm(item)),
      ) ?? defaultSection;
    section.items.push(legacyItemToFlowItem(item, section));
  }

  const sections = [...blockSections, defaultSection]
    .filter((section) => section.items.length > 0 || section.block_id)
    .sort(
      (left, right) => left.page - right.page || left.y_mm - right.y_mm || left.x_mm - right.x_mm,
    );

  return { sections, overlays };
}

export function ensureItemGeometry(
  item: CardPrintLayoutItem,
  layout: CardPrintLayout,
): CardPrintLayoutItem {
  const normalizedLayout = normalizeLayoutBase(layout);
  const rect = itemHasMmGeometry(item)
    ? itemRectFromMm(item)
    : gridItemToRect(item, normalizedLayout);
  const clamped = clampToPage(rect, normalizedLayout);
  const grid = rectToGrid(clamped, normalizedLayout);
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
  const snap = layout.grid?.snap_mm || 1;
  const rect = clampToPage(
    {
      x_mm: snapMm(Number(normalized.x_mm) + deltaX, snap),
      y_mm: snapMm(Number(normalized.y_mm) + deltaY, snap),
      width_mm: Number(normalized.width_mm),
      height_mm: Number(normalized.height_mm),
    },
    layout,
  );
  return { ...normalized, ...rectToGrid(rect, layout), ...roundRect(rect) };
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
  const snap = layout.grid?.snap_mm || 1;
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

  next = clampToPage(
    {
      x_mm: snapMm(next.x_mm, snap),
      y_mm: snapMm(next.y_mm, snap),
      width_mm: snapMm(next.width_mm, snap),
      height_mm: snapMm(next.height_mm, snap),
    },
    layout,
  );
  return { ...normalized, ...rectToGrid(next, layout), ...roundRect(next) };
}

export function itemRectFromMm(
  item: Pick<CardPrintLayoutItem, "x_mm" | "y_mm" | "width_mm" | "height_mm">,
): RectMm {
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

export function mmToPx(mm: number, scale: number) {
  return mm * scale;
}

export function pxToMm(px: number, scale: number) {
  return scale > 0 ? px / scale : 0;
}

export function gridToRect(
  section: Pick<CardPrintSection, "x_mm" | "y_mm" | "width_mm" | "grid_columns">,
  item: Pick<CardPrintFlowItem, "row" | "column" | "row_span" | "column_span">,
  rowHeightMm = DEFAULT_ROW_HEIGHT_MM,
): RectMm {
  const columns = section.grid_columns || A4_COLUMNS;
  const columnWidth = section.width_mm / columns;
  return {
    x_mm: section.x_mm + (item.column - 1) * columnWidth,
    y_mm: section.y_mm + (item.row - 1) * rowHeightMm,
    width_mm: Math.max(columnWidth, item.column_span * columnWidth),
    height_mm: Math.max(rowHeightMm, item.row_span * rowHeightMm),
  };
}

export function rectToGrid(rect: RectMm, layoutOrSection: CardPrintLayout | CardPrintSection) {
  if ("grid_columns" in layoutOrSection) {
    return rectToSectionGrid(layoutOrSection, rect);
  }
  return rectToPageGrid(rect, normalizeLayoutBase(layoutOrSection));
}

export function clampToPage(rect: RectMm, layout: CardPrintLayout): RectMm {
  const normalizedLayout = normalizeLayoutBase(layout);
  const width = normalizedLayout.page.width_mm || A4_WIDTH_MM;
  const height = normalizedLayout.page.height_mm || A4_HEIGHT_MM;
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

export function clampToSection(rect: RectMm, section: CardPrintSection): RectMm {
  const next = {
    x_mm: clampNumber(rect.x_mm, section.x_mm, section.x_mm + section.width_mm - rect.width_mm),
    y_mm: clampNumber(rect.y_mm, section.y_mm, section.y_mm + section.height_mm - rect.height_mm),
    width_mm: clampNumber(rect.width_mm, 1, section.width_mm),
    height_mm: clampNumber(rect.height_mm, 1, section.height_mm),
  };
  if (next.x_mm + next.width_mm > section.x_mm + section.width_mm) {
    next.width_mm = section.x_mm + section.width_mm - next.x_mm;
  }
  if (next.y_mm + next.height_mm > section.y_mm + section.height_mm) {
    next.height_mm = section.y_mm + section.height_mm - next.y_mm;
  }
  return next;
}

export function detectOverlaps<T extends { id: string }>(
  items: T[],
  rectForItem: (item: T) => RectMm,
) {
  const overlaps: Array<[T, T]> = [];
  for (let index = 0; index < items.length; index += 1) {
    for (let nextIndex = index + 1; nextIndex < items.length; nextIndex += 1) {
      if (rectsOverlap(rectForItem(items[index]), rectForItem(items[nextIndex]))) {
        overlaps.push([items[index], items[nextIndex]]);
      }
    }
  }
  return overlaps;
}

export function getItemRenderRectMm(
  section: CardPrintSection,
  item: CardPrintFlowItem,
  rowHeightMm = DEFAULT_ROW_HEIGHT_MM,
) {
  return gridToRect(section, item, rowHeightMm);
}

export function snapMm(value: number, step = DEFAULT_SNAP_MM) {
  return Math.round(value / step) * step;
}

function normalizeLayoutBase(layout: CardPrintLayout): CardPrintLayout {
  return {
    ...layout,
    version: CARD_PRINT_LAYOUT_VERSION,
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
      baseline_mm: Number(layout.grid?.baseline_mm) || DEFAULT_BASELINE_MM,
      row_height_mm: Number(layout.grid?.row_height_mm) || DEFAULT_ROW_HEIGHT_MM,
      snap_mm: Number(layout.grid?.snap_mm) || DEFAULT_SNAP_MM,
      gutter_mm: layout.grid?.gutter_mm,
    },
    items: Array.isArray(layout.items) ? layout.items : [],
  };
}

function normalizeSections(sections: CardPrintSection[], layout: CardPrintLayout) {
  return sections
    .map((section, index) => ({
      ...section,
      id: section.id || `section-${index + 1}`,
      kind: "section" as const,
      page: clampNumber(section.page || 1, 1, 1000),
      x_mm: roundMm(section.x_mm),
      y_mm: roundMm(section.y_mm),
      width_mm: roundMm(section.width_mm),
      height_mm: roundMm(section.height_mm),
      grid_columns: A4_COLUMNS,
      items: (section.items ?? []).map((item) => normalizeFlowItem(item)),
      style: section.style,
    }))
    .map((section) => ({ ...section, ...roundRect(clampToPage(section, layout)) }));
}

function normalizeOverlays(overlays: CardPrintOverlayItem[], layout: CardPrintLayout) {
  return overlays.map((overlay, index) => ({
    ...overlay,
    id: overlay.id || `overlay-${index + 1}`,
    page: clampNumber(overlay.page || 1, 1, 1000),
    ...roundRect(clampToPage(overlay, layout)),
  }));
}

function legacyItemToOverlay(item: CardPrintLayoutItem): CardPrintOverlayItem {
  const rect = itemRectFromMm(item);
  return {
    id: item.id,
    kind: item.kind as CardPrintOverlayItem["kind"],
    page: item.page || 1,
    ...roundRect(rect),
    text: item.text,
    alt: item.label,
    style: item.style,
  };
}

function legacyItemToFlowItem(
  item: CardPrintLayoutItem,
  section: CardPrintSection,
): CardPrintFlowItem {
  return normalizeFlowItem({
    id: item.id,
    kind: item.kind as CardPrintFlowItem["kind"],
    field_id: item.field_id,
    metadata_key: item.metadata_key as CardPrintFlowItem["metadata_key"],
    text: item.text,
    label: item.label,
    show_label: item.show_label,
    ...rectToSectionGrid(section, itemRectFromMm(item)),
    style: item.style,
  });
}

function normalizeFlowItem(item: CardPrintFlowItem): CardPrintFlowItem {
  return {
    ...item,
    row: Math.max(1, Math.round(item.row || 1)),
    column: clampNumber(Math.round(item.column || 1), 1, A4_COLUMNS),
    row_span: Math.max(1, Math.round(item.row_span || 1)),
    column_span: clampNumber(Math.round(item.column_span || 1), 1, A4_COLUMNS),
  };
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

function rectToPageGrid(rect: RectMm, layout: CardPrintLayout) {
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

function rectToSectionGrid(section: CardPrintSection, rect: RectMm) {
  const columnWidth = section.width_mm / (section.grid_columns || A4_COLUMNS);
  const rowHeight = DEFAULT_ROW_HEIGHT_MM;
  const column = clampNumber(
    Math.round((rect.x_mm - section.x_mm) / columnWidth) + 1,
    1,
    A4_COLUMNS,
  );
  const row = Math.max(1, Math.round((rect.y_mm - section.y_mm) / rowHeight) + 1);
  return {
    row,
    column,
    row_span: Math.max(1, Math.round(rect.height_mm / rowHeight)),
    column_span: clampNumber(Math.max(1, Math.round(rect.width_mm / columnWidth)), 1, A4_COLUMNS),
  };
}

function maxRows(layout: CardPrintLayout) {
  const margin = layout.page.margin_mm;
  const rowHeight = layout.grid.row_height_mm || DEFAULT_ROW_HEIGHT_MM;
  return Math.max(1, Math.floor((layout.page.height_mm - margin.top - margin.bottom) / rowHeight));
}

function rectContains(section: CardPrintSection, rect: RectMm) {
  return (
    rect.x_mm >= section.x_mm &&
    rect.y_mm >= section.y_mm &&
    rect.x_mm + rect.width_mm <= section.x_mm + section.width_mm &&
    rect.y_mm + rect.height_mm <= section.y_mm + section.height_mm
  );
}

function rectsOverlap(left: RectMm, right: RectMm) {
  return !(
    left.x_mm + left.width_mm <= right.x_mm ||
    right.x_mm + right.width_mm <= left.x_mm ||
    left.y_mm + left.height_mm <= right.y_mm ||
    right.y_mm + right.height_mm <= left.y_mm
  );
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
