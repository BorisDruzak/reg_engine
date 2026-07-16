import type { TextValidationRule } from "@/api/types";

export type TextDraftValidationResult = { valid: true } | { valid: false; message: string };

const russianTextPattern = /^[А-Яа-яЁё -]+$/u;

export function validateTextDraft(
  value: string,
  validation: TextValidationRule | null | undefined,
): TextDraftValidationResult {
  if (value.trim() === "" || validation == null) return { valid: true };
  if (containsNonBmpOrSurrogate(value)) return invalid(validation.message);

  if (validation.kind === "russian_text") {
    return russianTextPattern.test(value) ? { valid: true } : invalid(validation.message);
  }
  if (validation.kind === "regex") {
    try {
      return new RegExp(`^(?:${validation.pattern})$`).test(value)
        ? { valid: true }
        : invalid(validation.message);
    } catch {
      return invalid(validation.message);
    }
  }
  return invalid(validation.message);
}

function containsNonBmpOrSurrogate(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdfff) return true;
  }
  return false;
}

function invalid(message: string): TextDraftValidationResult {
  return { valid: false, message };
}
