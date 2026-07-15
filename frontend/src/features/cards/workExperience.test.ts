import { describe, expect, test } from "vitest";

import { coerceEditorValue, formatValue, initialEditorValue } from "./fieldEditorUtils";

describe("work experience editor values", () => {
  test.each([
    [1, "день", "месяц", "год"],
    [2, "дня", "месяца", "года"],
    [4, "дня", "месяца", "года"],
    [5, "дней", "месяцев", "лет"],
    [11, "дней", "месяцев", "лет"],
    [14, "дней", "месяцев", "лет"],
    [21, "день", "месяц", "год"],
    [22, "дня", "месяца", "года"],
    [25, "дней", "месяцев", "лет"],
  ])("formats %i with Russian declensions", (value, days, months, years) => {
    expect(formatValue({ days: value, months: value, years: value })).toBe(
      `${value} ${days} ${value} ${months} ${value} ${years}`,
    );
  });

  test("formats a zero duration", () => {
    expect(formatValue({ days: 0, months: 0, years: 0 })).toBe("0 дней 0 месяцев 0 лет");
  });

  test("keeps the server display for a stored value and removes it from an outgoing payload", () => {
    const storedValue = {
      days: 16,
      months: 3,
      years: 9,
      display: "16 дней 3 месяца 9 лет",
    };

    expect(initialEditorValue({ field_type: "work_experience", value: storedValue })).toEqual(
      storedValue,
    );
    expect(formatValue(storedValue)).toBe(storedValue.display);
    expect(coerceEditorValue("work_experience", storedValue as never)).toEqual({
      days: 16,
      months: 3,
      years: 9,
    });
  });
});
