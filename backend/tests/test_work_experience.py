from datetime import date

import pytest

from app.domain.work_experience import (
    WorkExperience,
    anchor_for_experience,
    experience_for_anchor,
    format_work_experience,
    parse_work_experience,
    parse_work_experience_display,
    serialize_experience,
)


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (0, ("дней", "месяцев", "лет")),
        (1, ("день", "месяц", "год")),
        (2, ("дня", "месяца", "года")),
        (4, ("дня", "месяца", "года")),
        (5, ("дней", "месяцев", "лет")),
        (11, ("дней", "месяцев", "лет")),
        (12, ("дней", "месяцев", "лет")),
        (14, ("дней", "месяцев", "лет")),
        (19, ("дней", "месяцев", "лет")),
        (21, ("день", "месяц", "год")),
        (22, ("дня", "месяца", "года")),
        (25, ("дней", "месяцев", "лет")),
    ],
)
def test_format_work_experience_uses_russian_forms_for_every_unit(
    value: int,
    expected: tuple[str, str, str],
) -> None:
    assert format_work_experience(WorkExperience(days=value, months=value, years=value)) == (
        f"{value} {expected[0]} {value} {expected[1]} {value} {expected[2]}"
    )


def test_format_and_serialization_keep_zero_values_in_stable_order() -> None:
    value = WorkExperience(days=0, months=0, years=0)

    assert format_work_experience(value) == "0 дней 0 месяцев 0 лет"
    assert serialize_experience(value) == {
        "days": 0,
        "months": 0,
        "years": 0,
        "display": "0 дней 0 месяцев 0 лет",
    }


def test_parse_work_experience_accepts_complete_editor_payload() -> None:
    assert parse_work_experience({"days": 16, "months": 3, "years": 9}) == WorkExperience(
        days=16,
        months=3,
        years=9,
    )


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"days": 16, "months": 3},
        {"days": 16, "years": 9},
        {"months": 3, "years": 9},
        {"days": 16, "months": 3, "years": 9, "anchor_date": "2025-01-01"},
        {"days": True, "months": 3, "years": 9},
        {"days": 16, "months": False, "years": 9},
        {"days": 16, "months": 3, "years": True},
        {"days": -1, "months": 3, "years": 9},
        {"days": 16, "months": -1, "years": 9},
        {"days": 16, "months": 3, "years": -1},
        {"days": 1.5, "months": 3, "years": 9},
        {"days": 16, "months": 1.5, "years": 9},
        {"days": 16, "months": 3, "years": 1.5},
        {"days": "16", "months": 3, "years": 9},
        {"days": 16, "months": "3", "years": 9},
        {"days": 16, "months": 3, "years": "9"},
    ],
)
def test_parse_work_experience_rejects_incomplete_or_invalid_payloads(payload: object) -> None:
    with pytest.raises(ValueError):
        parse_work_experience(payload)


def test_parse_work_experience_display_accepts_only_complete_ordered_text() -> None:
    assert parse_work_experience_display("16 дней 3 месяца 9 лет") == WorkExperience(
        days=16,
        months=3,
        years=9,
    )


@pytest.mark.parametrize(
    "text",
    [
        "9 лет 3 месяца 16 дней",
        "16 дней 9 лет 3 месяца",
        "16 дней 3 месяца",
        "16 дней 9 лет",
        "16 дней, 3 месяца, 9 лет",
        "16 день 3 месяца 9 лет",
        "16 дней 3 месяца 9 года",
        "16 дней 3 месяца 9 лет ",
        " 16 дней 3 месяца 9 лет",
        "шестнадцать дней 3 месяца 9 лет",
    ],
)
def test_parse_work_experience_display_rejects_reordered_incomplete_or_malformed_text(
    text: str,
) -> None:
    with pytest.raises(ValueError):
        parse_work_experience_display(text)


def test_anchor_for_experience_subtracts_calendar_months_and_years_with_clamping() -> None:
    assert anchor_for_experience(
        WorkExperience(days=0, months=1, years=0),
        today=date(2025, 3, 31),
    ) == date(2025, 2, 28)
    assert anchor_for_experience(
        WorkExperience(days=0, months=0, years=1),
        today=date(2024, 2, 29),
    ) == date(2023, 2, 28)


def test_calendar_edge_dates_do_not_overflow_duration_conversion() -> None:
    zero = WorkExperience(days=0, months=0, years=0)

    assert anchor_for_experience(zero, today=date.max) == date.max
    assert experience_for_anchor(date.max, today=date.max) == zero


def test_experience_for_anchor_uses_matching_whole_calendar_subtractions() -> None:
    assert experience_for_anchor(date(2025, 2, 28), today=date(2025, 3, 31)) == WorkExperience(
        days=0,
        months=1,
        years=0,
    )
    assert experience_for_anchor(date(2023, 2, 28), today=date(2024, 2, 29)) == WorkExperience(
        days=0,
        months=0,
        years=1,
    )


def test_experience_for_anchor_adds_a_day_when_read_on_the_next_day() -> None:
    anchor = anchor_for_experience(
        WorkExperience(days=0, months=1, years=0),
        today=date(2025, 3, 31),
    )

    assert experience_for_anchor(anchor, today=date(2025, 4, 1)) == WorkExperience(
        days=1,
        months=1,
        years=0,
    )


def test_month_boundary_anchor_read_normalizes_ambiguous_submitted_duration() -> None:
    submitted = parse_work_experience({"days": 28, "months": 1, "years": 0})
    today = date(2025, 3, 31)

    anchor = anchor_for_experience(submitted, today=today)
    canonical = experience_for_anchor(anchor, today=today)

    assert anchor == date(2025, 1, 31)
    assert canonical == WorkExperience(days=0, months=2, years=0)
    assert serialize_experience(canonical) == {
        "days": 0,
        "months": 2,
        "years": 0,
        "display": "0 дней 2 месяца 0 лет",
    }


def test_experience_round_trip_on_the_same_date_preserves_entered_duration() -> None:
    entered = WorkExperience(days=16, months=3, years=9)
    today = date(2025, 7, 15)

    anchor = anchor_for_experience(entered, today=today)

    assert experience_for_anchor(anchor, today=today) == entered
