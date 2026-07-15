import { useId, useState, type FocusEvent } from "react";

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
  emittedValue: WorkExperienceValue;
  rawValue: RawWorkExperience;
  sourceValue: WorkExperienceValue;
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
    emittedValue: normalizedValue,
    rawValue: toRawValue(normalizedValue),
    sourceValue: value,
  }));
  const rawValue =
    draft.sourceValue === value || isSamePayload(draft.emittedValue, normalizedValue)
      ? draft.rawValue
      : toRawValue(normalizedValue);

  const currentValue = toPayload(rawValue);

  function updatePart(part: WorkExperiencePart, nextRawValue: string) {
    if (!isSafeRawPart(nextRawValue)) {
      return;
    }
    const nextRaw = { ...rawValue, [part]: nextRawValue };
    const nextValue = toPayload(nextRaw);
    setDraft({ emittedValue: nextValue, rawValue: nextRaw, sourceValue: value });
    onChange(workExperiencePayload(nextValue));
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget)) {
      return;
    }
    onBlur?.();
  }

  return (
    <div aria-label={label} className="work-experience-editor" onBlur={handleBlur} role="group">
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

function isSafeRawPart(value: string): boolean {
  return /^\d*$/.test(value) && (value === "" || Number.isSafeInteger(Number(value)));
}

function isSamePayload(
  left: ReturnType<typeof toPayload>,
  right: ReturnType<typeof toPayload>,
): boolean {
  return left.days === right.days && left.months === right.months && left.years === right.years;
}
