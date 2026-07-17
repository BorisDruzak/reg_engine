"""Pure validation rules for schema-defined text fields."""

from __future__ import annotations

import re
import warnings
from collections.abc import Mapping

import regex

RUSSIAN_TEXT_PATTERN = re.compile(r"[А-Яа-яЁё -]+")
_MAX_REGEX_PATTERN_LENGTH = 512
_REGEX_MATCH_TIMEOUT_SECONDS = 0.01
_PORTABLE_CONTROL_ESCAPE_CODES = frozenset("fnrtv")
_ESCAPABLE_LITERAL_CHARACTERS = frozenset(r"\\^$.*+?()[]{}|/-")
_HEX_DIGITS = frozenset("0123456789abcdefABCDEF")
_REGEX_METACHARACTERS = frozenset(r"\\^$.*+?()[]{}|")
_ECMASCRIPT_TRIM_CHARACTERS = frozenset(
    "\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003"
    "\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"
)


class TextValidationError(ValueError):
    """Raised when a text-validation rule or value is invalid."""


def normalize_text_validation(value: object) -> list[dict[str, str]] | None:
    """Return canonical ordered text-validation conditions for persistence."""
    if value is None:
        return None
    raw_conditions = [value] if isinstance(value, Mapping) else value
    if not isinstance(raw_conditions, list) or not raw_conditions:
        raise TextValidationError("Text validation must be a non-empty list.")
    return [_normalize_text_validation_condition(condition) for condition in raw_conditions]


def _normalize_text_validation_condition(value: object) -> dict[str, str]:
    if not isinstance(value, Mapping):
        raise TextValidationError("Text validation condition must be an object.")
    kind = value.get("kind")
    input_mode = value.get("input_mode", "show_error")
    if input_mode not in {"show_error", "block_input"}:
        raise TextValidationError("Text validation input mode is unsupported.")
    if kind == "russian_text":
        _require_keys(value, {"kind", "message"}, {"input_mode"})
        message = _require_string(value, "message")
        return {"kind": kind, "message": message, "input_mode": input_mode}
    if kind == "regex":
        _require_keys(value, {"kind", "pattern", "message"}, {"input_mode"})
        pattern = _require_string(value, "pattern").strip()
        message = _require_string(value, "message")
        _validate_portable_regex(pattern)
        return {
            "kind": kind,
            "pattern": pattern,
            "message": message,
            "input_mode": input_mode,
        }

    raise TextValidationError("Unsupported text validation kind.")


def validate_text_value(value: str, validation: object) -> None:
    """Raise the configured message when a non-empty text value violates its rule."""
    if _is_ecmascript_blank(value) or validation is None:
        return

    conditions = normalize_text_validation(validation)
    if conditions is None:
        return
    failures: list[str] = []
    for condition in conditions:
        if _condition_is_valid(value, condition):
            continue
        failures.append(condition["message"])
    if failures:
        raise TextValidationError("\n".join(failures))


def _condition_is_valid(value: str, condition: Mapping[str, str]) -> bool:
    if _contains_non_bmp_or_surrogate(value):
        return False
    if condition["kind"] == "russian_text":
        return RUSSIAN_TEXT_PATTERN.fullmatch(value) is not None
    try:
        return (
            regex.fullmatch(
                condition["pattern"],
                value,
                timeout=_REGEX_MATCH_TIMEOUT_SECONDS,
            )
            is not None
        )
    except TimeoutError:
        return False


def _require_keys(value: Mapping[object, object], expected: set[str], optional: set[str]) -> None:
    if not expected.issubset(value) or not set(value).issubset(expected | optional):
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
    if _contains_non_bmp_or_surrogate(pattern):
        raise TextValidationError("Text validation pattern must use BMP Unicode only.")
    if not _is_portable_regex(pattern):
        raise TextValidationError("Text validation pattern is not portable.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", FutureWarning)
            re.compile(pattern)
    except FutureWarning as exc:
        raise TextValidationError("Text validation pattern is not portable.") from exc
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
    if (
        escape_code in _PORTABLE_CONTROL_ESCAPE_CODES
        or escape_code in _ESCAPABLE_LITERAL_CHARACTERS
    ):
        return index + 2
    if escape_code == "0" and not pattern[index + 2 : index + 3].isdigit():
        return index + 2
    if escape_code == "x" and _has_hex_digits(pattern, index + 2, 2):
        return index + 4
    if escape_code == "u" and _has_hex_digits(pattern, index + 2, 4):
        code_unit = int(pattern[index + 2 : index + 6], 16)
        if not 0xD800 <= code_unit <= 0xDFFF:
            return index + 6
    return None


def _has_hex_digits(pattern: str, start: int, count: int) -> bool:
    return len(pattern[start : start + count]) == count and all(
        character in _HEX_DIGITS for character in pattern[start : start + count]
    )


def _contains_non_bmp_or_surrogate(value: str) -> bool:
    return any(ord(character) > 0xFFFF or 0xD800 <= ord(character) <= 0xDFFF for character in value)


def _is_ecmascript_blank(value: str) -> bool:
    """Match the character set removed by JavaScript String.prototype.trim()."""
    return all(character in _ECMASCRIPT_TRIM_CHARACTERS for character in value)
