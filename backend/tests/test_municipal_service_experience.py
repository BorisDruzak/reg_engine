from copy import deepcopy
from datetime import date
from typing import Any

import pytest

from app.domain.municipal_service_experience import calculate_experience, parse_calculation


def period(
    identifier: str = "first",
    start: str = "2024-01-01",
    end: str | None = "2024-12-31",
    **changes: Any,
) -> dict[str, Any]:
    return {
        "id": identifier,
        "kind": "municipal",
        "start_date": start,
        "end_date": end,
        "included": True,
        "confirmed": True,
        "basis": "Документ",
        "pension_only": False,
        **changes,
    }


def calculation(*periods: dict[str, Any], baseline: Any = None) -> dict[str, Any]:
    return {
        "mode": "calculated",
        "version": 1,
        "method": "calendar_remainder_30_v1",
        "periods": list(periods),
        "baseline": baseline,
    }


def result(payload: Any, as_of: date = date(2025, 1, 1)) -> dict[str, Any]:
    return calculate_experience(payload, as_of, server_date=date(2025, 1, 1))


@pytest.mark.parametrize(
    ("start", "end", "expected"),
    [
        ("2024-01-01", "2024-01-01", (0, 0, 1)),
        ("2024-02-01", "2024-02-29", (0, 1, 0)),
        ("2023-02-01", "2023-02-28", (0, 1, 0)),
        ("2024-01-01", "2024-12-31", (1, 0, 0)),
        ("2023-03-01", "2024-02-29", (1, 0, 0)),
        ("2024-01-31", "2024-02-28", (0, 1, 0)),
        ("2024-01-31", "2024-02-29", (0, 1, 1)),
    ],
)
def test_inclusive_calendar_duration_preserves_full_months_and_leap_years(
    start: str,
    end: str,
    expected: tuple[int, int, int],
) -> None:
    value = result(calculation(period(start=start, end=end)))["value"]
    assert (value["years"], value["months"], value["days"]) == expected


def test_closed_period_does_not_accrue_and_open_period_uses_preview_date() -> None:
    payload = calculation(period(end=None))
    assert result(payload, date(2024, 2, 29))["value"]["months"] == 2
    assert result(payload, date(2024, 12, 31))["value"]["years"] == 1
    closed = calculation(period())
    assert result(closed, date(2025, 1, 1))["value"] == result(closed, date(2026, 1, 1))["value"]
    forecast = result(payload, date(2026, 1, 1))
    assert forecast["forecast"] is True
    assert forecast["server_date"] == "2025-01-01"
    assert forecast["as_of_date"] == "2026-01-01"


def test_period_starting_after_preview_does_not_contribute() -> None:
    assert result(calculation(period()), date(2023, 12, 31))["value"]["years"] == 0


def test_adjacent_and_overlapping_same_multiplier_records_are_unioned_before_duration() -> None:
    payload = calculation(
        period("a", "2024-01-01", "2024-01-20"),
        period("b", "2024-01-10", "2024-01-31", kind="civil"),
        period("c", "2024-02-01", "2024-02-29"),
    )
    preview = result(payload)
    assert preview["value"]["months"] == 2
    assert preview["value"]["days"] == 0
    assert preview["included_count"] == 3
    assert preview["can_save"] is True
    assert preview["overlaps"] == [
        {
            "period_ids": ["a", "b"],
            "start_date": "2024-01-10",
            "end_date": "2024-01-20",
            "conflict": False,
        }
    ]


def test_conflicting_weighted_overlap_blocks_save_without_presenting_a_double_sum() -> None:
    preview = result(
        calculation(
            period("a", "2024-01-01", "2024-01-31"),
            period("b", "2024-01-15", "2024-01-31", kind="military_conscription"),
        )
    )
    assert preview["can_save"] is False
    assert preview["warnings"]
    assert preview["overlaps"] == [
        {
            "period_ids": ["a", "b"],
            "start_date": "2024-01-15",
            "end_date": "2024-01-31",
            "conflict": True,
        }
    ]
    assert preview["value"]["days"] == 0
    assert preview["value"]["months"] == 0


def test_conscription_doubles_calendar_components_before_residual_normalization() -> None:
    preview = result(
        calculation(
            period("a", "2024-01-01", "2024-02-20", kind="military_conscription"),
            period("b", "2024-05-01", "2024-05-20"),
        )
    )
    # (1 month + 20 days) * 2 + 20 days = 2 months + 60 days = 4 months.
    assert preview["value"] == {
        "days": 0,
        "months": 4,
        "years": 0,
        "display": "0 дней 4 месяца 0 лет",
    }


def test_excluded_unconfirmed_pension_only_and_unproven_custom_periods_do_not_count() -> None:
    preview = result(
        calculation(
            period("counted"),
            period("excluded", included=False),
            period("review", confirmed=False),
            period("pension", pension_only=True),
            period("custom", kind="other_legal", basis=""),
        )
    )
    assert preview["value"]["years"] == 1
    assert preview["included_count"] == 1
    assert preview["excluded_count"] == 2
    assert preview["review_count"] == 2
    assert preview["can_save"] is False
    assert preview["overlaps"] == []


def test_unconfirmed_records_can_be_retained_without_blocking_a_valid_save() -> None:
    preview = result(calculation(period(confirmed=False, basis="")))
    assert preview["can_save"] is True
    assert preview["review_count"] == 1
    assert preview["value"]["years"] == 0


def baseline(**changes: Any) -> dict[str, Any]:
    return {
        "years": 5,
        "months": 11,
        "days": 20,
        "as_of_date": "2023-12-31",
        "basis": "Справка о стаже",
        "confirmed": True,
        **changes,
    }


def test_baseline_is_constant_and_adds_only_history_strictly_after_its_date() -> None:
    preview = result(
        calculation(
            period(start="2024-01-01", end="2024-01-10"),
            baseline=baseline(),
        )
    )
    assert preview["value"] == {
        "years": 6,
        "months": 0,
        "days": 0,
        "display": "0 дней 0 месяцев 6 лет",
    }
    assert result(calculation(baseline=baseline()))["value"]["years"] == 5


def test_baseline_rejects_double_inclusion_and_unavailable_historical_preview() -> None:
    with pytest.raises(ValueError, match="[А-Яа-я]"):
        parse_calculation(calculation(period(start="2023-12-31"), baseline=baseline()))
    with pytest.raises(ValueError, match="[А-Яа-я]"):
        result(calculation(baseline=baseline()), date(2023, 12, 30))
    # Retained excluded history is not counted twice.
    assert (
        parse_calculation(
            calculation(
                period(start="2023-01-01", included=False),
                baseline=baseline(),
            )
        )["baseline"]
        == baseline()
    )


def test_unconfirmed_or_undocumented_baseline_cannot_save_or_contribute() -> None:
    for saved_baseline in [baseline(confirmed=False), baseline(basis=" ")]:
        preview = result(calculation(baseline=saved_baseline))
        assert preview["can_save"] is False
        assert preview["value"]["years"] == 0


def test_canonical_parse_preserves_source_history_and_returns_detached_json() -> None:
    payload = calculation(period(basis="  Исходное основание  "), period("old", included=False))
    original = deepcopy(payload)
    parsed = parse_calculation(payload)
    result(payload)
    assert parsed == original == payload
    parsed["periods"][0]["basis"] = "Изменено"
    assert payload == original


@pytest.mark.parametrize(
    "change",
    [
        {"mode": "manual"},
        {"version": True},
        {"version": 2},
        {"method": "days360"},
        {"extra": 1},
        {"periods": {}},
        {"baseline": []},
    ],
)
def test_parser_rejects_unknown_version_and_noncanonical_storage(change: dict[str, Any]) -> None:
    with pytest.raises(ValueError, match="[А-Яа-я]"):
        parse_calculation({**calculation(), **change})


@pytest.mark.parametrize(
    "change",
    [
        {"id": ""},
        {"kind": "institutional_job"},
        {"included": 1},
        {"confirmed": "yes"},
        {"pension_only": None},
        {"basis": "x" * 2001},
        {"basis": None},
        {"multiplier": 3},
        {"start_date": "20240101"},
        {"start_date": "1899-12-31"},
        {"start_date": "9999-01-01"},
        {"end_date": "2023-12-31"},
        {"end_date": "2024-02-30"},
        {"start_date": date(2024, 1, 1)},
    ],
)
def test_parser_rejects_invalid_periods(change: dict[str, Any]) -> None:
    with pytest.raises(ValueError, match="[А-Яа-я]"):
        parse_calculation(calculation(period(**change)))


def test_parser_enforces_unique_ids_period_count_and_required_keys() -> None:
    for payload in [
        calculation(period(), period()),
        calculation(*[period(str(index)) for index in range(201)]),
    ]:
        with pytest.raises(ValueError, match="[А-Яа-я]"):
            parse_calculation(payload)
    incomplete = period()
    del incomplete["confirmed"]
    with pytest.raises(ValueError, match="[А-Яа-я]"):
        parse_calculation(calculation(incomplete))


@pytest.mark.parametrize(
    "change",
    [
        {"years": -1},
        {"months": True},
        {"days": 1.5},
        {"years": 9999},
        {"as_of_date": "2023-13-01"},
        {"confirmed": 1},
        {"basis": "x" * 2001},
        {"extra": 1},
    ],
)
def test_parser_rejects_invalid_baseline(change: dict[str, Any]) -> None:
    with pytest.raises(ValueError, match="[А-Яа-я]"):
        parse_calculation(calculation(baseline=baseline(**change)))


def test_maximum_supported_date_is_safe_and_all_categories_have_fixed_multipliers() -> None:
    for kind in [
        "municipal",
        "municipal_office",
        "civil",
        "state_office",
        "military_contract",
        "military_conscription",
        "other_state",
        "other_legal",
        "municipal_additional",
    ]:
        preview = result(
            calculation(
                period(
                    start="9998-12-31",
                    end=None,
                    kind=kind,
                )
            ),
            date(9998, 12, 31),
        )
        assert preview["value"]["days"] == (2 if kind == "military_conscription" else 1)


def test_future_conflict_does_not_become_savable_by_selecting_a_historical_preview() -> None:
    preview = result(
        calculation(
            period("a", "2026-01-01", None),
            period("b", "2026-01-10", None, kind="military_conscription"),
        )
    )
    assert preview["can_save"] is False


def test_total_remains_within_the_existing_work_experience_contract() -> None:
    with pytest.raises(ValueError, match="[А-Яа-я]"):
        result(calculation(baseline=baseline(years=9998, months=12)))
