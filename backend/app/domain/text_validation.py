"""Pure validation rules for schema-defined text fields."""

from __future__ import annotations

import re
from collections.abc import Mapping

RUSSIAN_TEXT_PATTERN = re.compile(r"[А-Яа-яЁё -]+")
_MAX_REGEX_PATTERN_LENGTH = 512
_PORTABLE_ESCAPE_CODES = frozenset("dDsSwWbBfnrtv")
_ESCAPABLE_LITERAL_CHARACTERS = frozenset(r"\\^$.*+?()[]{}|/-")
_HEX_DIGITS = frozenset("0123456789abcdefABCDEF")
_REGEX_METACHARACTERS = frozenset(r"\\^$.*+?()[]{}|")


class TextValidationError(ValueError):
    """Raised when a text-validation rule or value is invalid."""


def normalize_text_validation(value: object) -> dict[str, str] | None:
    """Return a strict, portable text-validation rule for persistence."""
    if value is None:
        return None
    if not isinstance(value, Mapping):
        raise TextValidationError("Text validation must be an object.")

    kind = value.get("kind")
    if kind == "russian_text":
        _require_exact_keys(value, {"kind", "message"})
        message = _require_string(value, "message")
        return {"kind": kind, "message": message}
    if kind == "regex":
        _require_exact_keys(value, {"kind", "pattern", "message"})
        pattern = _require_string(value, "pattern")
        message = _require_string(value, "message")
        _validate_portable_regex(pattern)
        return {"kind": kind, "pattern": pattern, "message": message}

    raise TextValidationError("Unsupported text validation kind.")


def validate_text_value(value: str, validation: Mapping[str, object] | None) -> None:
    """Raise the configured message when a non-empty text value violates its rule."""
    if not value.strip() or validation is None:
        return

    normalized = normalize_text_validation(validation)
    if normalized is None:
        return
    if normalized["kind"] == "russian_text":
        valid = RUSSIAN_TEXT_PATTERN.fullmatch(value) is not None
    else:
        valid = re.fullmatch(normalized["pattern"], value) is not None
    if not valid:
        raise TextValidationError(normalized["message"])


def _require_exact_keys(value: Mapping[object, object], expected: set[str]) -> None:
    if set(value) != expected:
        raise TextValidationError("Text validation contains unsupported or missing keys.")


def _require_string(value: Mapping[object, object], key: str) -> str:
    candidate = value.get(key)
    if not isinstance(candidate, str):
        raise TextValidationError(f"Text validation {key} must be a string.")
    return candidate


def _validate_portable_regex(pattern: str) -> None:
    if not pattern:
        raise TextValidationError("Text validation pattern must not be empty.")
    if len(pattern) > _MAX_REGEX_PATTERN_LENGTH:
        raise TextValidationError("Text validation pattern is too long.")
    if not _is_portable_regex(pattern):
        raise TextValidationError("Text validation pattern is not portable.")
    try:
        re.compile(pattern)
    except re.error as exc:
        raise TextValidationError("Text validation pattern is invalid.") from exc


def _is_portable_regex(pattern: str) -> bool:
    index = 0
    while index < len(pattern):
        character = pattern[index]
        if character == "\\":
            escaped_index = _consume_portable_escape(pattern, index)
            if escaped_index is None:
                return False
            index = escaped_index
            continue
        if character == "[":
            class_end = _consume_character_class(pattern, index)
            if class_end is None:
                return False
            index = class_end
            continue
        if character == "(":
            if pattern[index + 1 : index + 2] == "?":
                return False
        elif character == "{":
            quantifier_end = _consume_braced_quantifier(pattern, index)
            if quantifier_end is None:
                return False
            index = quantifier_end
            continue
        elif character in "*+?":
            if pattern[index + 1 : index + 2] == "+":
                return False
        elif character in _REGEX_METACHARACTERS and character not in "^$|)":
            return False
        index += 1
    return True


def _consume_character_class(pattern: str, index: int) -> int | None:
    index += 1
    if pattern[index : index + 1] == "^":
        index += 1
    has_member = False
    while index < len(pattern):
        character = pattern[index]
        if character == "\\":
            escaped_index = _consume_portable_escape(pattern, index)
            if escaped_index is None:
                return None
            index = escaped_index
            has_member = True
            continue
        if character == "]":
            return index + 1 if has_member else None
        index += 1
        has_member = True
    return None


def _consume_braced_quantifier(pattern: str, index: int) -> int | None:
    index += 1
    start = index
    while pattern[index : index + 1].isdigit():
        index += 1
    if index == start:
        return None
    if pattern[index : index + 1] == ",":
        index += 1
        while pattern[index : index + 1].isdigit():
            index += 1
    if pattern[index : index + 1] != "}":
        return None
    index += 1
    if pattern[index : index + 1] == "+":
        return None
    return index


def _consume_portable_escape(pattern: str, index: int) -> int | None:
    escape_code = pattern[index + 1 : index + 2]
    if escape_code in _PORTABLE_ESCAPE_CODES or escape_code in _ESCAPABLE_LITERAL_CHARACTERS:
        return index + 2
    if escape_code == "0" and not pattern[index + 2 : index + 3].isdigit():
        return index + 2
    if escape_code == "x" and _has_hex_digits(pattern, index + 2, 2):
        return index + 4
    if escape_code == "u" and _has_hex_digits(pattern, index + 2, 4):
        return index + 6
    return None


def _has_hex_digits(pattern: str, start: int, count: int) -> bool:
    return len(pattern[start : start + count]) == count and all(
        character in _HEX_DIGITS for character in pattern[start : start + count]
    )
