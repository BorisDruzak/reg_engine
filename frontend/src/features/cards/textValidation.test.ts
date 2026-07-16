import { describe, expect, test } from "vitest";

import { validateTextDraft } from "./textValidation";

describe("validateTextDraft regex safety", () => {
  const message = "Некорректное значение";

  test("fails closed for a nested quantified group before matching", () => {
    expect(
      validateTextDraft("aaaa", {
        kind: "regex",
        pattern: "(a+)+",
        message,
      }),
    ).toEqual({ valid: false, message });
  });

  test("fails closed for a repeated group with overlapping alternatives before matching", () => {
    expect(
      validateTextDraft("aaaa", {
        kind: "regex",
        pattern: "(a|aa)+",
        message,
      }),
    ).toEqual({ valid: false, message });
  });

  test("continues to match an ordinary portable pattern", () => {
    expect(
      validateTextDraft("АБ", {
        kind: "regex",
        pattern: "[А-Я]{2,5}",
        message,
      }),
    ).toEqual({ valid: true });
  });
});
