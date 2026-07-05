import { describe, expect, test } from "vitest";

import { normalizeLayoutGeometry } from "./printLayoutGeometry";

describe("print layout normalization", () => {
  test("normalizes legacy flat items into sections and overlays while keeping items", () => {
    const normalized = normalizeLayoutGeometry({
      version: "card_print_layout_v1",
      page: {
        format: "A4",
        width_mm: 210,
        height_mm: 297,
        margin_mm: { top: 12, right: 12, bottom: 12, left: 12 },
      },
      grid: { columns: 12, row_height_mm: 8, snap_mm: 2 },
      items: [
        {
          id: "heading",
          kind: "heading",
          page: 1,
          row: 1,
          column: 1,
          row_span: 1,
          column_span: 12,
          text: "Печатная форма",
        },
        {
          id: "field-name",
          kind: "field",
          page: 1,
          row: 2,
          column: 1,
          row_span: 2,
          column_span: 6,
          field_id: "field-1",
          label: "ФИО",
        },
        {
          id: "decor-line",
          kind: "line",
          page: 1,
          row: 6,
          column: 1,
          row_span: 1,
          column_span: 12,
        },
      ],
    } as never) as unknown as {
      items: unknown[];
      sections?: Array<{ items: Array<{ id: string }> }>;
      overlays?: Array<{ id: string; kind: string }>;
    };

    expect(normalized.items).toHaveLength(3);
    expect(normalized.sections).toHaveLength(1);
    expect(normalized.sections?.[0].items.map((item) => item.id)).toEqual([
      "heading",
      "field-name",
    ]);
    expect(normalized.overlays).toEqual([
      expect.objectContaining({ id: "decor-line", kind: "line" }),
    ]);
  });
});
