import { describe, expect, test } from "vitest";

import { buildBlockCompletions, isValueFilled } from "./cardCompletion";

describe("isValueFilled", () => {
  test("treats meaningful typed values as filled", () => {
    expect(isValueFilled("  значение  ", "text")).toBe(true);
    expect(isValueFilled(0, "number")).toBe(true);
    expect(isValueFilled(false, "bool")).toBe(true);
    expect(isValueFilled(["option"], "multi_select")).toBe(true);
    expect(isValueFilled("Инструкция", "static_text")).toBe(true);
  });

  test("treats blank and empty collection values as empty", () => {
    expect(isValueFilled("   ", "text")).toBe(false);
    expect(isValueFilled([], "multi_select")).toBe(false);
    expect(isValueFilled(undefined, "file_ref")).toBe(false);
    expect(isValueFilled(null, "text")).toBe(false);
  });

  test("treats stored work experience as filled but an absent editor default as empty", () => {
    expect(
      isValueFilled(
        { days: 16, months: 3, years: 9, display: "16 дней 3 месяца 9 лет" },
        "work_experience",
      ),
    ).toBe(true);
    expect(isValueFilled(undefined, "work_experience")).toBe(false);
  });
});

describe("buildBlockCompletions", () => {
  test("marks required empty fields and their block as needing attention", () => {
    const result = buildBlockCompletions({
      blocks: [{ id: "employment", title: "Положение" }],
      fields: [
        {
          id: "department",
          block_id: "employment",
          field_type: "text",
          required_mode: "required",
        },
      ],
      valueForField: () => undefined,
    });

    expect(result.fields.get("department")).toMatchObject({
      state: "required-missing",
      label: "Нужно заполнить",
    });
    expect(result.blocks.get("employment")).toMatchObject({
      state: "attention",
      filledCount: 0,
      totalCount: 1,
      label: "Нужно заполнить 1 из 1",
    });
  });

  test("keeps optional empty fields neutral and static text filled", () => {
    const result = buildBlockCompletions({
      blocks: [{ id: "notes", title: "Примечания" }],
      fields: [
        {
          id: "optional-field",
          block_id: "notes",
          field_type: "text",
          required_mode: "optional",
        },
        {
          id: "hint",
          block_id: "notes",
          field_type: "static_text",
          required_mode: "optional",
        },
      ],
      valueForField: () => undefined,
    });

    expect(result.fields.get("optional-field")?.state).toBe("empty");
    expect(result.fields.get("hint")).toMatchObject({
      state: "filled",
      label: "Заполнено",
    });
    expect(result.blocks.get("notes")).toMatchObject({
      state: "complete",
      filledCount: 1,
      totalCount: 2,
      label: "Заполнено 1 из 2",
    });
  });

  test("recognizes required_on_publish and evaluates repeatable instances independently", () => {
    const input = {
      blocks: [{ id: "contacts", title: "Контакты" }],
      fields: [
        {
          id: "phone",
          block_id: "contacts",
          field_type: "text",
          required_mode: "required_on_publish",
        },
        {
          id: "files",
          block_id: "contacts",
          field_type: "file_ref",
          required_mode: "optional",
        },
      ],
    };

    const firstInstance = buildBlockCompletions({
      ...input,
      valueForField: (field) => (field.id === "phone" ? " +7 900 000-00-00 " : undefined),
    });
    const secondInstance = buildBlockCompletions({
      ...input,
      valueForField: () => undefined,
    });

    expect(firstInstance.blocks.get("contacts")?.state).toBe("complete");
    expect(secondInstance.fields.get("phone")?.state).toBe("required-missing");
    expect(secondInstance.fields.get("files")?.state).toBe("empty");
    expect(secondInstance.blocks.get("contacts")?.state).toBe("attention");
  });

  test("keeps a required absent work-experience field incomplete", () => {
    const result = buildBlockCompletions({
      blocks: [{ id: "employment", title: "Опыт" }],
      fields: [
        {
          id: "experience",
          block_id: "employment",
          field_type: "work_experience",
          required_mode: "required",
        },
      ],
      valueForField: () => undefined,
    });

    expect(result.fields.get("experience")?.state).toBe("required-missing");
    expect(result.blocks.get("employment")?.state).toBe("attention");
  });
});
