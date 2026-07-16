import pytest

from app.domain.text_validation import (
    TextValidationError,
    normalize_text_validation,
    validate_text_value,
)


def test_russian_text_allows_cyrillic_spaces_and_hyphens() -> None:
    rule = normalize_text_validation({"kind": "russian_text", "message": "Только русский"})

    validate_text_value("Иванов-Петров Иван Ёлкин", rule)


def test_russian_text_rejects_digits_and_punctuation_with_configured_message() -> None:
    with pytest.raises(TextValidationError, match="Введите русские буквы"):
        validate_text_value(
            "Иванов 2!",
            {"kind": "russian_text", "message": "Введите русские буквы"},
        )


def test_regex_requires_the_entire_non_empty_value_to_match() -> None:
    rule = normalize_text_validation(
        {"kind": "regex", "pattern": "[А-Я]{2}", "message": "Две заглавные"}
    )

    validate_text_value("АБ", rule)

    with pytest.raises(TextValidationError, match="Две заглавные"):
        validate_text_value("АБВ", rule)


@pytest.mark.parametrize("value", ["", "   ", "\t\n"])
def test_empty_text_values_bypass_validation(value: str) -> None:
    validate_text_value(
        value,
        {"kind": "regex", "pattern": "[А-Я]{2}", "message": "Две заглавные"},
    )


@pytest.mark.parametrize(
    "rule",
    [
        {"kind": "regex", "pattern": "[", "message": "Ошибка"},
        {"kind": "regex", "pattern": "(?P<name>[А-Я]+)", "message": "Ошибка"},
        {"kind": "regex", "pattern": "(?<=А)Б", "message": "Ошибка"},
        {"kind": "regex", "pattern": "(?i)[а-я]+", "message": "Ошибка"},
        {"kind": "regex", "pattern": "\\A[А-Я]+\\Z", "message": "Ошибка"},
        {"kind": "regex", "pattern": "\\N{CYRILLIC CAPITAL LETTER A}", "message": "Ошибка"},
    ],
)
def test_normalize_rejects_invalid_or_nonportable_regexes(rule: dict[str, str]) -> None:
    with pytest.raises(TextValidationError):
        normalize_text_validation(rule)


def test_normalize_rejects_oversized_regex() -> None:
    with pytest.raises(TextValidationError):
        normalize_text_validation({"kind": "regex", "pattern": "А" * 513, "message": "Ошибка"})


def test_normalize_rejects_empty_regex_pattern() -> None:
    with pytest.raises(TextValidationError):
        normalize_text_validation({"kind": "regex", "pattern": "", "message": "Ошибка"})


def test_normalize_rejects_python_only_unicode_escape() -> None:
    with pytest.raises(TextValidationError):
        normalize_text_validation({"kind": "regex", "pattern": r"\U00000041", "message": "Ошибка"})


def test_normalize_rejects_python_only_end_of_string_escape() -> None:
    with pytest.raises(TextValidationError):
        normalize_text_validation({"kind": "regex", "pattern": r"А\z", "message": "Ошибка"})


@pytest.mark.parametrize("pattern", [r"А*+", r"А++", r"А?+", r"А{1,2}+"])
def test_normalize_rejects_possessive_quantifiers(pattern: str) -> None:
    with pytest.raises(TextValidationError):
        normalize_text_validation({"kind": "regex", "pattern": pattern, "message": "Ошибка"})


@pytest.mark.parametrize(
    "pattern",
    [r"\d", r"\D", r"\w", r"\W", r"\s", r"\S", r"\b", r"\B"],
)
def test_normalize_rejects_unicode_semantic_divergence_escapes(pattern: str) -> None:
    with pytest.raises(TextValidationError):
        normalize_text_validation({"kind": "regex", "pattern": pattern, "message": "Ошибка"})


@pytest.mark.parametrize("pattern", ["😀", "[😀-😁]", r"\uD83D\uDE00"])
def test_normalize_rejects_non_bmp_unicode_patterns(pattern: str) -> None:
    with pytest.raises(TextValidationError):
        normalize_text_validation({"kind": "regex", "pattern": pattern, "message": "Ошибка"})


@pytest.mark.parametrize("value", ["😀", chr(0xD83D)])
def test_regex_rule_rejects_non_bmp_or_surrogate_values(value: str) -> None:
    rule = normalize_text_validation({"kind": "regex", "pattern": "[^a]", "message": "Только BMP"})

    with pytest.raises(TextValidationError, match="Только BMP"):
        validate_text_value(value, rule)


@pytest.mark.parametrize("pattern", [r"^(a+)+$", r"^(ab*)+$", r"^(ab?){2}$"])
def test_normalize_rejects_nested_quantified_groups(pattern: str) -> None:
    with pytest.raises(TextValidationError):
        normalize_text_validation({"kind": "regex", "pattern": pattern, "message": "Ошибка"})


def test_normalize_allows_single_quantified_group() -> None:
    rule = normalize_text_validation({"kind": "regex", "pattern": r"^(ab)+$", "message": "Ошибка"})

    assert rule is not None


def test_normalize_allows_the_agreed_portable_regex_grammar() -> None:
    rule = normalize_text_validation(
        {
            "kind": "regex",
            "pattern": r"^(А|Б)[А-Я]{1,2} [0-9]+$",
            "message": "Ошибка",
        }
    )

    assert rule is not None


@pytest.mark.parametrize(
    "rule",
    [
        {"kind": "russian_text", "message": "Ошибка", "pattern": ".+"},
        {"kind": "regex", "pattern": ".+", "message": "Ошибка", "extra": "нет"},
    ],
)
def test_normalize_rejects_unknown_rule_keys(rule: dict[str, str]) -> None:
    with pytest.raises(TextValidationError):
        normalize_text_validation(rule)


@pytest.mark.parametrize(
    "rule",
    [
        {"kind": "russian_text", "message": 42},
        {"kind": "regex", "pattern": 42, "message": "Ошибка"},
        {"kind": "regex", "pattern": ".+", "message": None},
    ],
)
def test_normalize_rejects_non_string_rule_values(rule: dict[str, object]) -> None:
    with pytest.raises(TextValidationError):
        normalize_text_validation(rule)


def test_normalize_rejects_unsupported_kind() -> None:
    with pytest.raises(TextValidationError):
        normalize_text_validation({"kind": "email", "message": "Ошибка"})


def test_normalize_returns_none_for_absent_rule() -> None:
    assert normalize_text_validation(None) is None
