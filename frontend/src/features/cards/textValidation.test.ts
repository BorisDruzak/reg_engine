import { describe, expect, test, vi } from "vitest";

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
    ).toEqual({
      valid: false,
      conditions: [{ kind: "regex", pattern: "(a+)+", message, input_mode: "show_error" }],
      messages: [message],
    });
  });

  test("fails closed for a repeated group with overlapping alternatives before matching", () => {
    expect(
      validateTextDraft("aaaa", {
        kind: "regex",
        pattern: "(a|aa)+",
        message,
      }),
    ).toEqual({
      valid: false,
      conditions: [{ kind: "regex", pattern: "(a|aa)+", message, input_mode: "show_error" }],
      messages: [message],
    });
  });

  test("fails closed when an optional atom separates overlapping repetitions", () => {
    const regexTest = vi.spyOn(RegExp.prototype, "test");

    try {
      expect(
        validateTextDraft("aaaa", {
          kind: "regex",
          pattern: "a*a?a*",
          message,
        }),
      ).toEqual({
        valid: false,
        conditions: [{ kind: "regex", pattern: "a*a?a*", message, input_mode: "show_error" }],
        messages: [message],
      });
      expect(regexTest).not.toHaveBeenCalled();
    } finally {
      regexTest.mockRestore();
    }
  });

  test("allows adjacent repetitions over demonstrably disjoint character classes", () => {
    expect(
      validateTextDraft("AB12", {
        kind: "regex",
        pattern: "^[A-Z]+[0-9]+$",
        message,
      }),
    ).toEqual({ valid: true });
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

  test("collects every failed condition with its own input mode", () => {
    expect(
      validateTextDraft("Ста1", [
        { kind: "russian_text", message: "Только русские буквы", input_mode: "show_error" },
        {
          kind: "regex",
          pattern: "[^0-9]{1,256}",
          message: "Цифры запрещены",
          input_mode: "block_input",
        },
      ]),
    ).toEqual({
      valid: false,
      conditions: [
        { kind: "russian_text", message: "Только русские буквы", input_mode: "show_error" },
        {
          kind: "regex",
          pattern: "[^0-9]{1,256}",
          message: "Цифры запрещены",
          input_mode: "block_input",
        },
      ],
      messages: ["Только русские буквы", "Цифры запрещены"],
    });
  });
});
