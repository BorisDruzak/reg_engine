import { describe, expect, test } from "vitest";

import type { CardPrintLayout, FormBlockRead, FormFieldRead } from "@/api/types";

import { validatePrintLayout } from "./printLayoutValidation";

const fields = [
  { id: "field-name", name: "Имя" },
  { id: "field-last-name", name: "Фамилия" },
] as unknown as FormFieldRead[];

const blocks = [{ id: "block-full-name", name: "ФИО" }] as unknown as FormBlockRead[];

describe("print layout validation", () => {
  test("requires exactly one linked item only for linked-card compositions", () => {
    const linkedLayout = linkedCardLayout();
    const missing = validatePrintLayout(
      { ...linkedLayout, items: [] },
      fields,
      blocks,
      "Связанный макет",
      "{{ card.display_name }}.docx",
    );
    const multiple = validatePrintLayout(
      {
        ...linkedLayout,
        items: [...linkedLayout.items, { ...linkedLayout.items[0], id: "linked-card-copy" }],
      },
      fields,
      blocks,
      "Связанный макет",
      "{{ card.display_name }}.docx",
    );
    const legacy = validatePrintLayout(
      legacyLayoutWithoutLinkedItem(),
      fields,
      blocks,
      "Прежний макет",
      "{{ card.display_name }}.docx",
    );

    expect(missing).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: "error",
          message: "Связанный макет должен содержать ровно одну карточку.",
        }),
      ]),
    );
    expect(multiple).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: "error",
          message: "Связанный макет должен содержать ровно одну карточку.",
        }),
      ]),
    );
    expect(legacy.filter((issue) => issue.level === "error")).toEqual([]);
  });

  test("allows decorative block containers to overlap their field contents", () => {
    const issues = validatePrintLayout(
      {
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
            id: "block-full-name-container",
            kind: "block",
            block_id: "block-full-name",
            page: 1,
            x_mm: 12,
            y_mm: 12,
            width_mm: 120,
            height_mm: 32,
            row: 1,
            column: 1,
            row_span: 4,
            column_span: 8,
            label: "ФИО",
          },
          {
            id: "field-name",
            kind: "field",
            field_id: "field-name",
            page: 1,
            x_mm: 16,
            y_mm: 20,
            width_mm: 50,
            height_mm: 10,
            row: 2,
            column: 1,
            row_span: 1,
            column_span: 4,
            label: "Имя",
          },
        ],
      },
      fields,
      blocks,
      "Базовый шаблон: печать",
      "{{ card.display_name }}.docx",
    );

    expect(issues.map((issue) => issue.message).join("\n")).not.toContain(
      "Элементы пересекаются на странице.",
    );
  });

  test("keeps warning for overlapping content fields", () => {
    const issues = validatePrintLayout(
      {
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
            id: "field-name",
            kind: "field",
            field_id: "field-name",
            page: 1,
            x_mm: 16,
            y_mm: 20,
            width_mm: 50,
            height_mm: 10,
            row: 2,
            column: 1,
            row_span: 1,
            column_span: 4,
            label: "Имя",
          },
          {
            id: "field-last-name",
            kind: "field",
            field_id: "field-last-name",
            page: 1,
            x_mm: 18,
            y_mm: 22,
            width_mm: 50,
            height_mm: 10,
            row: 2,
            column: 1,
            row_span: 1,
            column_span: 4,
            label: "Фамилия",
          },
        ],
      },
      fields,
      blocks,
      "Базовый шаблон: печать",
      "{{ card.display_name }}.docx",
    );

    expect(issues.map((issue) => issue.message).join("\n")).toContain(
      "Элементы пересекаются на странице.",
    );
  });
});

function linkedCardLayout(): CardPrintLayout {
  return {
    ...legacyLayoutWithoutLinkedItem(),
    composition_mode: "linked_card",
    items: [
      {
        id: "linked-card",
        kind: "card_layout",
        card_template_id: "template-1",
        page: 1,
        x_mm: 12,
        y_mm: 12,
        width_mm: 186,
        height_mm: 273,
        row: 1,
        column: 1,
        row_span: 1,
        column_span: 12,
      },
    ],
  };
}

function legacyLayoutWithoutLinkedItem(): CardPrintLayout {
  return {
    version: "card_print_layout_v1",
    page: {
      format: "A4",
      width_mm: 210,
      height_mm: 297,
      margin_mm: { top: 12, right: 12, bottom: 12, left: 12 },
    },
    grid: { columns: 12, row_height_mm: 8, snap_mm: 2 },
    items: [],
  };
}
