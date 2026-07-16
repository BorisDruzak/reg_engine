"""Pure validation rules for schema-defined text fields."""

from __future__ import annotations

import re
from collections.abc import Mapping

RUSSIAN_TEXT_PATTERN = re.compile(r"[А-Яа-яЁё -]+")
_MAX_REGEX_PATTERN_LENGTH = 512
_PYTHON_ONLY_ESCAPES = frozenset({"A", "N", "U", "Z", "a"})


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
    if _contains_nonportable_regex_syntax(pattern):
        raise TextValidationError("Text validation pattern is not portable.")
    try:
        re.compile(pattern)
    except re.error as exc:
        raise TextValidationError("Text validation pattern is invalid.") from exc


def _contains_nonportable_regex_syntax(pattern: str) -> bool:
    in_character_class = False
    index = 0
    while index < len(pattern):
        character = pattern[index]
        if character == "\\":
            if index + 1 < len(pattern) and pattern[index + 1] in _PYTHON_ONLY_ESCAPES:
                return True
            index += 2
            continue
        if character == "[" and not in_character_class:
            in_character_class = True
        elif character == "]" and in_character_class:
            in_character_class = False
        elif not in_character_class and (
            (character == "(" and pattern[index + 1 : index + 2] == "?")
            or pattern[index : index + 2] == "{,"
        ):
            return True
        index += 1
    return False
