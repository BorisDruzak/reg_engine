import { describe, expect, test } from "vitest";

import {
  moveRect,
  rectsOverlap,
  resizeRect,
  snapQuarterRect,
  type LayoutRect,
  type ResizeHandle,
} from "./layoutGeometry";

describe("quarter-grid geometry", () => {
  test("snaps both axes to quarter units", () => {
    expect(snapQuarterRect({ row: 1, column: 1, rowSpan: 3, columnSpan: 7 })).toEqual({
      row: 1,
      column: 1,
      rowSpan: 3,
      columnSpan: 6,
    });
  });

  test("resolves exact span ties to the smaller span", () => {
    expect(snapQuarterRect({ row: 1, column: 1, rowSpan: 2.5, columnSpan: 4.5 })).toEqual({
      row: 1,
      column: 1,
      rowSpan: 2,
      columnSpan: 3,
    });
  });

  test("normalizes invalid numbers and clamps out-of-grid geometry", () => {
    expect(
      snapQuarterRect({
        row: Number.NaN,
        column: Number.NEGATIVE_INFINITY,
        rowSpan: Number.NaN,
        columnSpan: Number.POSITIVE_INFINITY,
      }),
    ).toEqual({ row: 1, column: 1, rowSpan: 1, columnSpan: 3 });

    expect(snapQuarterRect({ row: 4, column: 12, rowSpan: 4, columnSpan: 12 })).toEqual({
      row: 1,
      column: 1,
      rowSpan: 4,
      columnSpan: 12,
    });
  });

  test.each([
    ["left", 1, 2, 1, 2],
    ["right", 99, 2, 7, 2],
    ["top", 4, -10, 4, 1],
    ["bottom", 4, 99, 4, 3],
  ])("moves against the %s boundary", (_boundary, column, row, expectedColumn, expectedRow) => {
    expect(moveRect({ row: 2, column: 4, rowSpan: 2, columnSpan: 6 }, column, row)).toEqual({
      row: expectedRow,
      column: expectedColumn,
      rowSpan: 2,
      columnSpan: 6,
    });
  });

  test.each<{
    handle: ResizeHandle;
    expected: LayoutRect;
  }>([
    {
      handle: "top-left",
      expected: { row: 3, column: 7, rowSpan: 1, columnSpan: 3 },
    },
    { handle: "top", expected: { row: 3, column: 4, rowSpan: 1, columnSpan: 6 } },
    {
      handle: "top-right",
      expected: { row: 3, column: 4, rowSpan: 1, columnSpan: 3 },
    },
    { handle: "right", expected: { row: 2, column: 4, rowSpan: 2, columnSpan: 3 } },
    {
      handle: "bottom-right",
      expected: { row: 2, column: 4, rowSpan: 1, columnSpan: 3 },
    },
    { handle: "bottom", expected: { row: 2, column: 4, rowSpan: 1, columnSpan: 6 } },
    {
      handle: "bottom-left",
      expected: { row: 2, column: 7, rowSpan: 1, columnSpan: 3 },
    },
    { handle: "left", expected: { row: 2, column: 7, rowSpan: 2, columnSpan: 3 } },
  ])(
    "resizes with the $handle handle while anchoring the opposite edges",
    ({ handle, expected }) => {
      expect(resizeRect({ row: 2, column: 4, rowSpan: 2, columnSpan: 6 }, handle, 3, 1)).toEqual(
        expected,
      );
    },
  );

  test("resizes from the bottom right without leaving the grid", () => {
    expect(
      resizeRect({ row: 1, column: 1, rowSpan: 2, columnSpan: 6 }, "bottom-right", 9, 4),
    ).toEqual({
      row: 1,
      column: 1,
      rowSpan: 4,
      columnSpan: 9,
    });
  });

  test("clamps resizing at every fixed grid edge", () => {
    expect(resizeRect({ row: 2, column: 10, rowSpan: 2, columnSpan: 3 }, "right", 12, 2)).toEqual({
      row: 2,
      column: 10,
      rowSpan: 2,
      columnSpan: 3,
    });
    expect(resizeRect({ row: 2, column: 4, rowSpan: 2, columnSpan: 6 }, "left", 12, 2)).toEqual({
      row: 2,
      column: 1,
      rowSpan: 2,
      columnSpan: 9,
    });
    expect(resizeRect({ row: 3, column: 4, rowSpan: 2, columnSpan: 6 }, "bottom", 6, 4)).toEqual({
      row: 3,
      column: 4,
      rowSpan: 2,
      columnSpan: 6,
    });
    expect(resizeRect({ row: 2, column: 4, rowSpan: 2, columnSpan: 6 }, "top", 6, 4)).toEqual({
      row: 1,
      column: 4,
      rowSpan: 3,
      columnSpan: 6,
    });
  });

  test("uses smaller spans at resize ties", () => {
    expect(
      resizeRect({ row: 1, column: 1, rowSpan: 1, columnSpan: 3 }, "bottom-right", 4.5, 2.5),
    ).toEqual({ row: 1, column: 1, rowSpan: 2, columnSpan: 3 });
  });

  test("detects area overlap but treats shared edges as non-overlapping", () => {
    const left: LayoutRect = { row: 1, column: 1, rowSpan: 2, columnSpan: 6 };

    expect(rectsOverlap(left, { row: 2, column: 6, rowSpan: 1, columnSpan: 3 })).toBe(true);
    expect(rectsOverlap(left, { row: 1, column: 7, rowSpan: 2, columnSpan: 6 })).toBe(false);
    expect(rectsOverlap(left, { row: 3, column: 1, rowSpan: 2, columnSpan: 6 })).toBe(false);
  });

  test("never mutates input rectangles", () => {
    const raw = { row: 2, column: 4, rowSpan: 2, columnSpan: 7 };
    const rect: LayoutRect = { row: 2, column: 4, rowSpan: 2, columnSpan: 6 };
    const rawBefore = { ...raw };
    const rectBefore = { ...rect };

    snapQuarterRect(raw);
    moveRect(rect, 1, 1);
    resizeRect(rect, "top-left", 3, 1);
    rectsOverlap(rect, { row: 1, column: 1, rowSpan: 1, columnSpan: 3 });

    expect(raw).toEqual(rawBefore);
    expect(rect).toEqual(rectBefore);
  });
});
