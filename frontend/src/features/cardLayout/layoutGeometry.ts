export type LayoutRect = {
  row: number;
  column: number;
  rowSpan: 1 | 2 | 3 | 4;
  columnSpan: 3 | 6 | 9 | 12;
};

export type ResizeHandle =
  | "top-left"
  | "top"
  | "top-right"
  | "right"
  | "bottom-right"
  | "bottom"
  | "bottom-left"
  | "left";

export const QUARTER_COLUMN_SPANS = [3, 6, 9, 12] as const;
export const QUARTER_ROW_SPANS = [1, 2, 3, 4] as const;

const GRID_COLUMNS = 12;
const GRID_ROWS = 4;

type LayoutRectInput = {
  row: number;
  column: number;
  rowSpan: number;
  columnSpan: number;
};

export function snapQuarterRect(rect: LayoutRectInput): LayoutRect {
  const columnSpan = nearestSpan(rect.columnSpan, QUARTER_COLUMN_SPANS);
  const rowSpan = nearestSpan(rect.rowSpan, QUARTER_ROW_SPANS);
  return {
    row: clampCoordinate(rect.row, GRID_ROWS - rowSpan + 1),
    column: clampCoordinate(rect.column, GRID_COLUMNS - columnSpan + 1),
    rowSpan,
    columnSpan,
  };
}

export function moveRect(rect: LayoutRect, column: number, row: number): LayoutRect {
  const normalized = snapQuarterRect(rect);
  return {
    ...normalized,
    row: clampCoordinate(row, GRID_ROWS - normalized.rowSpan + 1),
    column: clampCoordinate(column, GRID_COLUMNS - normalized.columnSpan + 1),
  };
}

export function resizeRect(
  rect: LayoutRect,
  handle: ResizeHandle,
  columnSpan: number,
  rowSpan: number,
): LayoutRect {
  const normalized = snapQuarterRect(rect);
  const movesLeft = handle.includes("left");
  const movesRight = handle.includes("right");
  const movesTop = handle.includes("top");
  const movesBottom = handle.includes("bottom");

  const nextColumnSpan =
    movesLeft || movesRight
      ? nearestSpan(
          columnSpan,
          fittingSpans(
            QUARTER_COLUMN_SPANS,
            movesLeft
              ? normalized.column + normalized.columnSpan - 1
              : GRID_COLUMNS - normalized.column + 1,
          ),
        )
      : normalized.columnSpan;
  const nextRowSpan =
    movesTop || movesBottom
      ? nearestSpan(
          rowSpan,
          fittingSpans(
            QUARTER_ROW_SPANS,
            movesTop ? normalized.row + normalized.rowSpan - 1 : GRID_ROWS - normalized.row + 1,
          ),
        )
      : normalized.rowSpan;

  return {
    row: movesTop ? normalized.row + normalized.rowSpan - nextRowSpan : normalized.row,
    column: movesLeft
      ? normalized.column + normalized.columnSpan - nextColumnSpan
      : normalized.column,
    rowSpan: nextRowSpan,
    columnSpan: nextColumnSpan,
  };
}

export function rectsOverlap(left: LayoutRect, right: LayoutRect): boolean {
  const normalizedLeft = snapQuarterRect(left);
  const normalizedRight = snapQuarterRect(right);
  return !(
    normalizedLeft.column + normalizedLeft.columnSpan <= normalizedRight.column ||
    normalizedRight.column + normalizedRight.columnSpan <= normalizedLeft.column ||
    normalizedLeft.row + normalizedLeft.rowSpan <= normalizedRight.row ||
    normalizedRight.row + normalizedRight.rowSpan <= normalizedLeft.row
  );
}

function fittingSpans<const T extends readonly number[]>(spans: T, maximum: number): T[number][] {
  return spans.filter((span) => span <= maximum);
}

function nearestSpan<const T extends readonly number[]>(value: number, spans: T): T[number] {
  const fallback = spans[0];
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return spans.reduce<T[number]>((nearest, candidate) => {
    const nearestDistance = Math.abs(value - nearest);
    const candidateDistance = Math.abs(value - candidate);
    return candidateDistance < nearestDistance ? candidate : nearest;
  }, fallback);
}

function clampCoordinate(value: number, maximum: number): number {
  const rounded = Number.isFinite(value) ? Math.round(value) : 1;
  return Math.min(maximum, Math.max(1, rounded));
}
