import { useId, useState } from "react";

import type { WorkExperienceValue } from "@/api/types";

import {
  defaultWorkExperienceValue,
  formatWorkExperience,
  workExperiencePayload,
  workExperienceValueFromUnknown,
} from "./workExperience";

type WorkExperiencePart = "days" | "months" | "years";

type RawWorkExperience = Record<WorkExperiencePart, string>;

type WorkExperienceDraft = {
  baseValue: WorkExperienceValue;
  rawValue: RawWorkExperience;
};

const fieldLabels: Record<WorkExperiencePart, string> = {
  days: "Дни",
  months: "Месяцы",
  years: "Годы",
};

export function WorkExperienceEditor({
  label,
  value,
  disabled = false,
  onBlur,
  onChange,
}: {
  label: string;
  value: WorkExperienceValue;
  disabled?: boolean;
  onBlur?: () => void;
  onChange: (value: WorkExperienceValue) => void;
}) {
  const normalizedValue = workExperienceValueFromUnknown(value) ?? defaultWorkExperienceValue();
  const editorId = useId();
  const [draft, setDraft] = useState<WorkExperienceDraft>(() => ({
    baseValue: normalizedValue,
    rawValue: toRawValue(normalizedValue),
  }));
  const rawValue = isSamePayload(draft.baseValue, normalizedValue)
    ? draft.rawValue
    : toRawValue(normalizedValue);

  const currentValue = toPayload(rawValue);

  function updatePart(part: WorkExperiencePart, nextRawValue: string) {
    if (!/^\d*$/.test(nextRawValue)) {
      return;
    }
    const nextRaw = { ...rawValue, [part]: nextRawValue };
    const nextValue = toPayload(nextRaw);
    setDraft({ baseValue: normalizedValue, rawValue: nextRaw });
    onChange(workExperiencePayload(nextValue));
  }

  return (
    <div aria-label={label} className="work-experience-editor" role="group">
      {(["days", "months", "years"] as const).map((part) => {
        const inputId = `${editorId}-${part}`;
        return (
          <div className="work-experience-editor-part" key={part}>
            <label htmlFor={inputId}>{fieldLabels[part]}</label>
            <input
              aria-label={fieldLabels[part]}
              disabled={disabled}
              id={inputId}
              inputMode="numeric"
              onBlur={onBlur}
              onChange={(event) => updatePart(part, event.currentTarget.value)}
              pattern="[0-9]*"
              type="text"
              value={rawValue[part]}
            />
          </div>
        );
      })}
      <output aria-live="polite">{formatWorkExperience(currentValue)}</output>
    </div>
  );
}

function toRawValue(value: WorkExperienceValue): RawWorkExperience {
  return {
    days: String(value.days),
    months: String(value.months),
    years: String(value.years),
  };
}

function toPayload(value: RawWorkExperience) {
  return {
    days: rawPartToNumber(value.days),
    months: rawPartToNumber(value.months),
    years: rawPartToNumber(value.years),
  };
}

function rawPartToNumber(value: string): number {
  return value === "" ? 0 : Number(value);
}

function isSamePayload(
  left: ReturnType<typeof toPayload>,
  right: ReturnType<typeof toPayload>,
): boolean {
  return left.days === right.days && left.months === right.months && left.years === right.years;
}
