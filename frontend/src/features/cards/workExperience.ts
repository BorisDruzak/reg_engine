import type { WorkExperienceValue } from "@/api/types";

export type WorkExperiencePayload = Pick<WorkExperienceValue, "days" | "months" | "years">;

const zeroWorkExperience: WorkExperiencePayload = { days: 0, months: 0, years: 0 };

export function workExperienceValueFromUnknown(value: unknown): WorkExperienceValue | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  if (
    !isNonNegativeInteger(candidate.days) ||
    !isNonNegativeInteger(candidate.months) ||
    !isNonNegativeInteger(candidate.years)
  ) {
    return null;
  }
  return {
    days: candidate.days,
    months: candidate.months,
    years: candidate.years,
    ...(typeof candidate.display === "string" ? { display: candidate.display } : {}),
  };
}

export function defaultWorkExperienceValue(): WorkExperiencePayload {
  return { ...zeroWorkExperience };
}

export function workExperiencePayload(value: WorkExperienceValue): WorkExperiencePayload {
  return { days: value.days, months: value.months, years: value.years };
}

export function formatWorkExperience(value: WorkExperiencePayload): string {
  return `${value.days} ${declension(value.days, "день", "дня", "дней")} ${value.months} ${declension(value.months, "месяц", "месяца", "месяцев")} ${value.years} ${declension(value.years, "год", "года", "лет")}`;
}

export function formatStoredWorkExperience(value: WorkExperienceValue): string {
  return value.display || formatWorkExperience(value);
}

function declension(value: number, singular: string, paucal: string, plural: string): string {
  const lastTwoDigits = value % 100;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return plural;
  }
  const lastDigit = value % 10;
  if (lastDigit === 1) {
    return singular;
  }
  if (lastDigit >= 2 && lastDigit <= 4) {
    return paucal;
  }
  return plural;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
