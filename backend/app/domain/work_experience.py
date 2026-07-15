"""Pure calendar-duration rules for the schema-driven work-experience field."""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date, timedelta

_COMPONENT_NAMES = frozenset({"days", "months", "years"})
_DISPLAY_PATTERN = re.compile(
    r"^([0-9]+) (день|дня|дней) ([0-9]+) (месяц|месяца|месяцев) ([0-9]+) (год|года|лет)$"
)


@dataclass(frozen=True, slots=True)
class WorkExperience:
    """An entered duration represented without an implicit anchor date."""

    days: int
    months: int
    years: int

    def __post_init__(self) -> None:
        for name, value in (
            ("days", self.days),
            ("months", self.months),
            ("years", self.years),
        ):
            _validate_component(name, value)


def parse_work_experience(payload: object) -> WorkExperience:
    """Parse the complete, strict API/editor representation of a duration."""
    if not isinstance(payload, Mapping) or set(payload) != _COMPONENT_NAMES:
        raise ValueError("Work experience must contain only days, months, and years.")

    return WorkExperience(
        days=payload["days"],
        months=payload["months"],
        years=payload["years"],
    )


def parse_work_experience_display(text: object) -> WorkExperience:
    """Parse an XLSX display value only when its complete Russian form is exact."""
    if not isinstance(text, str):
        raise ValueError("Work experience display must be text.")

    match = _DISPLAY_PATTERN.fullmatch(text)
    if match is None:
        raise ValueError("Work experience display has an invalid format.")

    value = WorkExperience(
        days=int(match.group(1)),
        months=int(match.group(3)),
        years=int(match.group(5)),
    )
    if format_work_experience(value) != text:
        raise ValueError("Work experience display has invalid Russian unit forms.")
    return value


def anchor_for_experience(value: WorkExperience, today: date) -> date:
    """Derive a calendar anchor by subtracting whole years, months, then days."""
    _validate_date("today", today)
    after_years = _subtract_years(today, value.years)
    after_months = _subtract_months(after_years, value.months)
    return after_months - timedelta(days=value.days)


def experience_for_anchor(anchor_date: date, today: date) -> WorkExperience:
    """Read a duration by matching whole calendar subtractions from ``today``."""
    _validate_date("anchor_date", anchor_date)
    _validate_date("today", today)
    if anchor_date > today:
        raise ValueError("Work experience anchor cannot be in the future.")

    years = today.year - anchor_date.year
    while years and _subtract_years(today, years) < anchor_date:
        years -= 1
    after_years = _subtract_years(today, years)

    months = (after_years.year - anchor_date.year) * 12 + after_years.month - anchor_date.month
    while months and _subtract_months(after_years, months) < anchor_date:
        months -= 1
    after_months = _subtract_months(after_years, months)

    return WorkExperience(
        days=(after_months - anchor_date).days,
        months=months,
        years=years,
    )


def serialize_experience(value: WorkExperience) -> dict[str, int | str]:
    """Return the stable API/XLSX-facing representation without derived anchors."""
    return {
        "days": value.days,
        "months": value.months,
        "years": value.years,
        "display": format_work_experience(value),
    }


def format_work_experience(value: WorkExperience) -> str:
    """Format every component in the fixed days, months, years display order."""
    return " ".join(
        (
            f"{value.days} {_russian_form(value.days, ('день', 'дня', 'дней'))}",
            f"{value.months} {_russian_form(value.months, ('месяц', 'месяца', 'месяцев'))}",
            f"{value.years} {_russian_form(value.years, ('год', 'года', 'лет'))}",
        )
    )


def _validate_component(name: str, value: object) -> None:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(f"Work experience {name} must be a non-negative integer.")


def _validate_date(name: str, value: object) -> None:
    if not isinstance(value, date):
        raise ValueError(f"{name} must be a date.")


def _russian_form(value: int, forms: tuple[str, str, str]) -> str:
    remainder = value % 100
    if 11 <= remainder <= 14:
        return forms[2]
    final_digit = value % 10
    if final_digit == 1:
        return forms[0]
    if 2 <= final_digit <= 4:
        return forms[1]
    return forms[2]


def _subtract_years(source: date, years: int) -> date:
    target_year = source.year - years
    return date(
        target_year, source.month, min(source.day, _days_in_month(target_year, source.month))
    )


def _subtract_months(source: date, months: int) -> date:
    month_index = source.year * 12 + source.month - 1 - months
    target_year, zero_based_month = divmod(month_index, 12)
    target_month = zero_based_month + 1
    return date(
        target_year,
        target_month,
        min(source.day, _days_in_month(target_year, target_month)),
    )


def _days_in_month(year: int, month: int) -> int:
    if month == 12:
        return (date(year + 1, 1, 1) - date(year, month, 1)).days
    return (date(year, month + 1, 1) - date(year, month, 1)).days
