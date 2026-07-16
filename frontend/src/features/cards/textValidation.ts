import type { TextValidationRule } from "@/api/types";

export type TextDraftValidationResult = { valid: true } | { valid: false; message: string };

const maxPortableRegexPatternLength = 512;

const russianTextPattern = /^[А-Яа-яЁё -]+$/u;

export function validateTextDraft(
  value: string,
  validation: TextValidationRule | null | undefined,
): TextDraftValidationResult {
  if (value.trim() === "" || validation == null) return { valid: true };
  const message = validation.message;
  if (containsNonBmpOrSurrogate(value)) return invalid(message);

  if (validation.kind === "russian_text") {
    return russianTextPattern.test(value) ? { valid: true } : invalid(message);
  }
  if (validation.kind === "regex") {
    if (!isSafeClientRegexPattern(validation.pattern)) return invalid(message);
    try {
      return new RegExp(`^(?:${validation.pattern})$`).test(value)
        ? { valid: true }
        : invalid(message);
    } catch {
      return invalid(message);
    }
  }
  return invalid(message);
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

type Quantifier = {
  end: number;
  repeats: boolean;
};

/**
 * The server protects its broader portable regex grammar with a timeout.
 * Browser RegExp has no timeout, so this bounded scan rejects patterns that
 * could trigger catastrophic backtracking before constructing a RegExp.
 */
function isSafeClientRegexPattern(pattern: string) {
  if (pattern.length === 0 || pattern.length > maxPortableRegexPatternLength) return false;
  return isSafeRegexSequence(pattern, 0, pattern.length);
}

function isSafeRegexSequence(pattern: string, start: number, end: number) {
  let index = start;
  let previousRepeatingSignature: string | null | undefined;

  while (index < end) {
    const character = pattern[index];
    if (character === "|") {
      previousRepeatingSignature = undefined;
      index += 1;
      continue;
    }
    if (character === "^" || character === "$") {
      index += 1;
      continue;
    }

    const atomStart = index;
    let groupBodyStart: number | undefined;
    let groupBodyEnd: number | undefined;
    let signature: string | null;

    if (character === "\\") {
      index = consumeEscape(pattern, index, end);
      if (index === -1) return false;
      signature = null;
    } else if (character === "[") {
      index = consumeCharacterClass(pattern, index, end);
      if (index === -1) return false;
      signature = null;
    } else if (character === "(") {
      const closeIndex = findClosingGroup(pattern, index, end);
      if (closeIndex === -1) return false;
      groupBodyStart = index + 1;
      groupBodyEnd = closeIndex;
      if (!isSafeRegexSequence(pattern, groupBodyStart, groupBodyEnd)) return false;
      index = closeIndex + 1;
      signature = null;
    } else if ("*+?{})".includes(character)) {
      return false;
    } else {
      index += 1;
      signature = pattern.slice(atomStart, index);
    }

    const quantifier = consumeQuantifier(pattern, index, end);
    if (quantifier === null) return false;
    if (
      quantifier.repeats &&
      groupBodyStart !== undefined &&
      groupBodyEnd !== undefined &&
      (containsQuantifier(pattern, groupBodyStart, groupBodyEnd) ||
        (containsAlternation(pattern, groupBodyStart, groupBodyEnd) &&
          !hasDistinctLiteralAlternatives(pattern, groupBodyStart, groupBodyEnd)))
    ) {
      return false;
    }
    if (quantifier.repeats && previousRepeatingSignature !== undefined) {
      if (
        signature === null ||
        previousRepeatingSignature === null ||
        signature === previousRepeatingSignature
      ) {
        return false;
      }
    }
    previousRepeatingSignature = quantifier.repeats ? signature : undefined;
    index = quantifier.end;
  }
  return true;
}

function consumeEscape(pattern: string, index: number, end: number) {
  if (index + 1 >= end) return -1;
  const escape = pattern[index + 1];
  if (escape === "x") return index + 3 < end ? index + 4 : -1;
  if (escape === "u") return index + 5 < end ? index + 6 : -1;
  return index + 2;
}

function consumeCharacterClass(pattern: string, index: number, end: number) {
  index += 1;
  while (index < end) {
    if (pattern[index] === "\\") {
      index = consumeEscape(pattern, index, end);
      if (index === -1) return -1;
      continue;
    }
    if (pattern[index] === "]") return index + 1;
    index += 1;
  }
  return -1;
}

function findClosingGroup(pattern: string, start: number, end: number) {
  let depth = 1;
  let index = start + 1;
  while (index < end) {
    if (pattern[index] === "\\") {
      index = consumeEscape(pattern, index, end);
      if (index === -1) return -1;
      continue;
    }
    if (pattern[index] === "[") {
      index = consumeCharacterClass(pattern, index, end);
      if (index === -1) return -1;
      continue;
    }
    if (pattern[index] === "(") depth += 1;
    if (pattern[index] === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
    index += 1;
  }
  return -1;
}

function consumeQuantifier(pattern: string, index: number, end: number): Quantifier | null {
  const character = pattern[index];
  if (character === "*" || character === "+") return { end: index + 1, repeats: true };
  if (character === "?") return { end: index + 1, repeats: false };
  if (character !== "{") return { end: index, repeats: false };

  let cursor = index + 1;
  const minimumStart = cursor;
  while (cursor < end && isDigit(pattern[cursor])) cursor += 1;
  if (cursor === minimumStart) return null;
  const minimum = Number(pattern.slice(minimumStart, cursor));
  let maximum = minimum;
  if (pattern[cursor] === ",") {
    cursor += 1;
    const maximumStart = cursor;
    while (cursor < end && isDigit(pattern[cursor])) cursor += 1;
    maximum =
      cursor === maximumStart
        ? Number.POSITIVE_INFINITY
        : Number(pattern.slice(maximumStart, cursor));
  }
  if (pattern[cursor] !== "}") return null;
  return { end: cursor + 1, repeats: maximum > 1 };
}

function containsQuantifier(pattern: string, start: number, end: number) {
  for (let index = start; index < end; index += 1) {
    if (pattern[index] === "\\") {
      index = consumeEscape(pattern, index, end) - 1;
      continue;
    }
    if (pattern[index] === "[") {
      index = consumeCharacterClass(pattern, index, end) - 1;
      continue;
    }
    if ("*+?{".includes(pattern[index])) return true;
  }
  return false;
}

function containsAlternation(pattern: string, start: number, end: number) {
  for (let index = start; index < end; index += 1) {
    if (pattern[index] === "\\") {
      index = consumeEscape(pattern, index, end) - 1;
      continue;
    }
    if (pattern[index] === "[") {
      index = consumeCharacterClass(pattern, index, end) - 1;
      continue;
    }
    if (pattern[index] === "|") return true;
  }
  return false;
}

function hasDistinctLiteralAlternatives(pattern: string, start: number, end: number) {
  const alternatives = splitTopLevelAlternatives(pattern, start, end);
  if (alternatives.length < 2) return false;
  const firstLiterals = alternatives.map(([alternativeStart, alternativeEnd]) =>
    firstLiteral(pattern, alternativeStart, alternativeEnd),
  );
  if (firstLiterals.some((literal) => literal === null)) return false;
  return new Set(firstLiterals).size === firstLiterals.length;
}

function splitTopLevelAlternatives(pattern: string, start: number, end: number) {
  const alternatives: Array<[number, number]> = [];
  let depth = 0;
  let alternativeStart = start;
  for (let index = start; index < end; index += 1) {
    if (pattern[index] === "\\") {
      index = consumeEscape(pattern, index, end) - 1;
      continue;
    }
    if (pattern[index] === "[") {
      index = consumeCharacterClass(pattern, index, end) - 1;
      continue;
    }
    if (pattern[index] === "(") depth += 1;
    if (pattern[index] === ")") depth -= 1;
    if (pattern[index] === "|" && depth === 0) {
      alternatives.push([alternativeStart, index]);
      alternativeStart = index + 1;
    }
  }
  alternatives.push([alternativeStart, end]);
  return alternatives;
}

function firstLiteral(pattern: string, start: number, end: number) {
  let index = start;
  while (index < end && (pattern[index] === "^" || pattern[index] === "$")) index += 1;
  if (index >= end || "\\[(".includes(pattern[index])) return null;
  return pattern[index];
}

function isDigit(value: string | undefined) {
  return value !== undefined && value >= "0" && value <= "9";
}
