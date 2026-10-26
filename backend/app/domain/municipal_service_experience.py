"""Versioned calendar calculation, independent from persistence and eligibility law.

Intervals include both dates. Whole forward calendar years/months are taken before
actual residual days; anniversaries clamp to the last day of their target month.
After unioning intervals, conscription doubles those calendar components. Only
then are residual days normalized at 30 days/month and months at 12 months/year.
That normalization is an approved software convention, not a legal assertion.
"""

from __future__ import annotations

import re
from calendar import monthrange
from collections.abc import Mapping
from datetime import date, timedelta
from typing import Any

METHOD = "calendar_remainder_30_v1"
KINDS = frozenset(
    {
        "municipal",
        "municipal_office",
        "civil",
        "state_office",
        "military_contract",
        "military_conscription",
        "other_state",
        "other_legal",
        "municipal_additional",
    }
)
_CUSTOM_KINDS = frozenset({"other_state", "other_legal", "municipal_additional"})
_STORAGE_KEYS = {"mode", "version", "method", "periods", "baseline"}
_PERIOD_KEYS = {
    "id",
    "kind",
    "start_date",
    "end_date",
    "included",
    "confirmed",
    "basis",
    "pension_only",
}
_BASELINE_KEYS = {"years", "months", "days", "as_of_date", "basis", "confirmed"}
_LAST_DATE = date(9998, 12, 31)


def parse_calculation(payload: object) -> dict[str, Any]:
    """Validate strict version-one JSON without rewriting or discarding history."""
    data = _object(payload, _STORAGE_KEYS, "расчёта")
    if (
        data["mode"] != "calculated"
        or type(data["version"]) is not int
        or data["version"] != 1
        or data["method"] != METHOD
    ):
        raise ValueError("Неподдерживаемая версия или метод расчёта стажа.")
    if not isinstance(data["periods"], list) or len(data["periods"]) > 200:
        raise ValueError("Список должен содержать не более 200 периодов.")

    periods: list[dict[str, Any]] = []
    identifiers: set[str] = set()
    for raw in data["periods"]:
        item = _object(raw, _PERIOD_KEYS, "периода")
        identifier = item["id"]
        if (
            not isinstance(identifier, str)
            or not identifier.strip()
            or len(identifier) > 200
            or identifier in identifiers
        ):
            raise ValueError("Идентификаторы периодов должны быть непустыми и уникальными.")
        identifiers.add(identifier)
        if not isinstance(item["kind"], str) or item["kind"] not in KINDS:
            raise ValueError("Неизвестная категория периода стажа.")
        for key in ("included", "confirmed", "pension_only"):
            _boolean(item[key])
        _basis(item["basis"])
        start = _iso_date(item["start_date"])
        end = _iso_date(item["end_date"]) if item["end_date"] is not None else None
        if end is not None and end < start:
            raise ValueError("Окончание периода не может быть раньше его начала.")
        periods.append(dict(item))

    baseline = None
    if data["baseline"] is not None:
        baseline = dict(_object(data["baseline"], _BASELINE_KEYS, "исходного стажа"))
        for key, maximum in (("years", 9998), ("months", 119987), ("days", 3652058)):
            value = baseline[key]
            if type(value) is not int or value < 0 or value > maximum:
                raise ValueError(
                    "Компоненты исходного стажа должны быть допустимыми целыми числами."
                )
        baseline_date = _iso_date(baseline["as_of_date"])
        _basis(baseline["basis"])
        _boolean(baseline["confirmed"])
        if baseline["confirmed"] and baseline["basis"].strip():
            for item in periods:
                if _countable(item) and _iso_date(item["start_date"]) <= baseline_date:
                    raise ValueError("Период пересекает историю, уже учтённую в исходном стаже.")

    return {
        "mode": "calculated",
        "version": 1,
        "method": METHOD,
        "periods": periods,
        "baseline": baseline,
    }


def calculate_experience(
    payload: object, as_of_date: date, *, server_date: date | None = None
) -> dict[str, Any]:
    """Preview validated history; callers must refuse writes when can_save is false.

    Conflicting weighted periods are omitted in their entirety from the interim
    value, with an explicit warning. Source intervals, including future conflicts,
    determine save validity independently from the selected preview date.
    """
    calculation = parse_calculation(payload)
    _calendar_date(as_of_date)
    today = server_date if server_date is not None else date.today()
    _calendar_date(today)
    warnings: list[str] = []
    can_save = True
    years = months = days = 0
    baseline = calculation["baseline"]
    if baseline is not None:
        if as_of_date < _iso_date(baseline["as_of_date"]):
            raise ValueError("Расчёт на дату раньше исходного стажа недоступен.")
        if baseline["confirmed"] and baseline["basis"].strip():
            years, months, days = (baseline[key] for key in ("years", "months", "days"))
        else:
            can_save = False
            warnings.append("Подтвердите исходный стаж и укажите документальное основание.")

    included_count = excluded_count = review_count = 0
    intervals: list[tuple[date, date, int, str]] = []
    for item in calculation["periods"]:
        if not item["included"] or item["pension_only"]:
            excluded_count += 1
        elif not _countable(item):
            review_count += 1
            if item["confirmed"]:
                can_save = False
                warnings.append("Для дополнительного основания укажите подтверждающий документ.")
        else:
            included_count += 1
            intervals.append(
                (
                    _iso_date(item["start_date"]),
                    _iso_date(item["end_date"]) if item["end_date"] is not None else _LAST_DATE,
                    2 if item["kind"] == "military_conscription" else 1,
                    item["id"],
                )
            )
    if review_count:
        warnings.append("Неподтверждённые периоды и периоды без основания не включены в стаж.")

    overlaps: list[dict[str, Any]] = []
    conflicting_ids: set[str] = set()
    for index, left in enumerate(intervals):
        for right in intervals[index + 1 :]:
            start, end = max(left[0], right[0]), min(left[1], right[1])
            if start <= end:
                conflict = left[2] != right[2]
                overlaps.append(
                    {
                        "period_ids": [left[3], right[3]],
                        "start_date": start.isoformat(),
                        "end_date": end.isoformat(),
                        "conflict": conflict,
                    }
                )
                if conflict:
                    conflicting_ids.update((left[3], right[3]))
    if conflicting_ids:
        can_save = False
        warnings.append(
            "Пересекаются периоды с разными коэффициентами. Устраните пересечения перед "
            "сохранением; конфликтующие периоды целиком исключены из предварительного итога."
        )

    for multiplier in (1, 2):
        effective = sorted(
            (start, min(end, as_of_date))
            for start, end, weight, identifier in intervals
            if weight == multiplier and identifier not in conflicting_ids and start <= as_of_date
        )
        merged: list[tuple[date, date]] = []
        for start, end in effective:
            if merged and start <= merged[-1][1] + timedelta(days=1):
                merged[-1] = (merged[-1][0], max(end, merged[-1][1]))
            else:
                merged.append((start, end))
        for start, end in merged:
            part_years, part_months, part_days = _inclusive_duration(start, end)
            years += part_years * multiplier
            months += part_months * multiplier
            days += part_days * multiplier

    extra_months, days = divmod(days, 30)
    extra_years, months = divmod(months + extra_months, 12)
    years += extra_years
    if years > date.max.year - date.min.year:
        raise ValueError("Итоговый стаж выходит за поддерживаемый диапазон лет.")
    display = " ".join(
        (
            _unit(days, ("день", "дня", "дней")),
            _unit(months, ("месяц", "месяца", "месяцев")),
            _unit(years, ("год", "года", "лет")),
        )
    )
    return {
        "value": {"days": days, "months": months, "years": years, "display": display},
        "as_of_date": as_of_date.isoformat(),
        "server_date": today.isoformat(),
        "forecast": as_of_date > today,
        "included_count": included_count,
        "excluded_count": excluded_count,
        "review_count": review_count,
        "overlaps": overlaps,
        "warnings": list(dict.fromkeys(warnings)),
        "can_save": can_save,
    }


def _object(payload: object, keys: set[str], description: str) -> Mapping[str, Any]:
    if not isinstance(payload, Mapping) or set(payload) != keys:
        raise ValueError(f"Некорректный состав полей {description}.")
    return payload


def _boolean(value: object) -> None:
    if type(value) is not bool:
        raise ValueError("Признаки включения и подтверждения должны быть логическими значениями.")


def _basis(value: object) -> None:
    if not isinstance(value, str) or len(value) > 2000:
        raise ValueError("Основание должно быть текстом длиной не более 2000 символов.")


def _calendar_date(value: object) -> None:
    if type(value) is not date or not 1900 <= value.year <= 9998:
        raise ValueError("Допустимы даты с 1900 по 9998 год.")


def _iso_date(value: object) -> date:
    if not isinstance(value, str) or not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", value):
        raise ValueError("Дата должна иметь формат ГГГГ-ММ-ДД.")
    try:
        parsed = date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError("Указана некорректная календарная дата.") from exc
    _calendar_date(parsed)
    return parsed


def _countable(item: Mapping[str, Any]) -> bool:
    return bool(
        item["included"]
        and item["confirmed"]
        and not item["pension_only"]
        and (item["kind"] not in _CUSTOM_KINDS or item["basis"].strip())
    )


def _add_months(source: date, months: int) -> date:
    year, month_index = divmod(source.year * 12 + source.month - 1 + months, 12)
    month = month_index + 1
    return date(year, month, min(source.day, monthrange(year, month)[1]))


def _inclusive_duration(start: date, end: date) -> tuple[int, int, int]:
    exclusive_end = end + timedelta(days=1)
    years = exclusive_end.year - start.year
    while _add_months(start, years * 12) > exclusive_end:
        years -= 1
    after_years = _add_months(start, years * 12)
    months = (exclusive_end.year - after_years.year) * 12 + exclusive_end.month - after_years.month
    while _add_months(after_years, months) > exclusive_end:
        months -= 1
    return years, months, (exclusive_end - _add_months(after_years, months)).days


def _unit(value: int, forms: tuple[str, str, str]) -> str:
    index = 2
    if not 11 <= value % 100 <= 14:
        if value % 10 == 1:
            index = 0
        elif 2 <= value % 10 <= 4:
            index = 1
    return f"{value} {forms[index]}"
