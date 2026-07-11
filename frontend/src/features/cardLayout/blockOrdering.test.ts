import { describe, expect, test } from "vitest";

import type {
  CardTemplateFormLayoutRead,
  CardTemplateFormLayoutSectionRead,
} from "@/api/types";

import { rectsOverlap } from "./layoutGeometry";
import { reorderBlockSections } from "./blockOrdering";

function section(
  id: string,
  row: number,
  column: number,
  rowSpan: CardTemplateFormLayoutSectionRead["row_span"],
  columnSpan: CardTemplateFormLayoutSectionRead["column_span"],
): CardTemplateFormLayoutSectionRead {
  return {
    id,
    block_id: `block-${id}`,
    row,
    column,
    row_span: rowSpan,
    column_span: columnSpan,
    items: [],
  };
}

function layout(sections: CardTemplateFormLayoutSectionRead[]): CardTemplateFormLayoutRead {
  return { columns: 12, sections };
}

function hasCollision(sections: CardTemplateFormLayoutSectionRead[]) {
  return sections.some((left, index) =>
    sections.slice(index + 1).some((right) =>
      rectsOverlap(
        {
          row: left.row,
          column: left.column,
          rowSpan: left.row_span as 1 | 2 | 3 | 4,
          columnSpan: left.column_span as 3 | 6 | 9 | 12,
        },
        {
          row: right.row,
          column: right.column,
          rowSpan: right.row_span as 1 | 2 | 3 | 4,
          columnSpan: right.column_span as 3 | 6 | 9 | 12,
        },
      ),
    ),
  );
}

describe("reorderBlockSections", () => {
  test("moves a mixed-size block up and repacks vertical bands without changing dimensions", () => {
    const original = layout([
      section("section-a", 1, 1, 1, 12),
      section("section-b", 2, 7, 2, 6),
      section("section-c", 4, 10, 1, 3),
    ]);

    const moved = reorderBlockSections(original, "section-b", "up");

    expect(moved?.sections.map((item) => item.id)).toEqual([
      "section-b",
      "section-a",
      "section-c",
    ]);
    expect(moved?.sections.map((item) => item.row)).toEqual([1, 3, 4]);
    expect(
      moved?.sections.map(({ id, column, column_span, row_span }) => ({
        id,
        column,
        column_span,
        row_span,
      })),
    ).toEqual([
      { id: "section-b", column: 7, column_span: 6, row_span: 2 },
      { id: "section-a", column: 1, column_span: 12, row_span: 1 },
      { id: "section-c", column: 10, column_span: 3, row_span: 1 },
    ]);
    expect(hasCollision(moved?.sections ?? [])).toBe(false);
    expect(original.sections.map((item) => item.row)).toEqual([1, 2, 4]);
  });

  test("moves a block down by one visual position", () => {
    const moved = reorderBlockSections(
      layout([
        section("section-a", 1, 1, 1, 12),
        section("section-b", 2, 1, 1, 12),
        section("section-c", 3, 1, 1, 12),
      ]),
      "section-b",
      "down",
    );

    expect(moved?.sections.map((item) => item.id)).toEqual([
      "section-a",
      "section-c",
      "section-b",
    ]);
    expect(moved?.sections.map((item) => item.row)).toEqual([1, 2, 3]);
  });

  test("returns null at boundaries and for an unknown section", () => {
    const original = layout([
      section("section-a", 1, 1, 1, 12),
      section("section-b", 2, 1, 1, 12),
    ]);

    expect(reorderBlockSections(original, "section-a", "up")).toBeNull();
    expect(reorderBlockSections(original, "section-b", "down")).toBeNull();
    expect(reorderBlockSections(original, "missing", "up")).toBeNull();
  });

  test("uses row column and id for stable visual ordering", () => {
    const moved = reorderBlockSections(
      layout([
        section("section-c", 2, 1, 1, 4),
        section("section-b", 1, 7, 1, 3),
        section("section-a", 1, 7, 1, 3),
      ]),
      "section-c",
      "up",
    );

    expect(moved?.sections.map((item) => item.id)).toEqual([
      "section-a",
      "section-c",
      "section-b",
    ]);
  });

  test("clamps a preserved column when its width would leave the grid", () => {
    const moved = reorderBlockSections(
      layout([section("section-a", 1, 11, 1, 4), section("section-b", 2, 1, 1, 12)]),
      "section-a",
      "down",
    );

    expect(moved?.sections.find((item) => item.id === "section-a")?.column).toBe(9);
    expect(hasCollision(moved?.sections ?? [])).toBe(false);
  });
});
