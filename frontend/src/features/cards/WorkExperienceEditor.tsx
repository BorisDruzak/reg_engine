import { useState } from "react";

import type { WorkExperienceValue } from "@/api/types";

import {
  defaultWorkExperienceValue,
  formatWorkExperience,
  workExperiencePayload,
  workExperienceValueFromUnknown,
} from "./workExperience";

type ParsedDuration = { days: number; months: number; years: number };

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
  const formattedValue = formatWorkExperience(normalizedValue);
  const [previousValue, setPreviousValue] = useState(value);
  const [draftValue, setDraftValue] = useState(formattedValue);
  const valueChanged = previousValue !== value;

  if (valueChanged) {
    setPreviousValue(value);
    if (!isIncompleteDurationDraft(draftValue)) {
      setDraftValue(formattedValue);
    }
  }

  const inputValue =
    isIncompleteDurationDraft(draftValue) || !valueChanged ? draftValue : formattedValue;

  function handleChange(nextValue: string) {
    if (!/^[0-9 ]*$/.test(nextValue)) {
      setDraftValue(formattedValue);
      return;
    }

    const parsed = parseDurationDraft(nextValue);
    if (parsed) {
      onChange(workExperiencePayload(parsed));
      setDraftValue(formatWorkExperience(parsed));
      return;
    }

    if (isIncompleteDurationDraft(nextValue)) {
      setDraftValue(nextValue);
      return;
    }

    setDraftValue(formattedValue);
  }

  return (
    <div aria-label={label} className="work-experience-editor" role="group">
      <input
        aria-label={label}
        disabled={disabled}
        inputMode="numeric"
        onBlur={onBlur}
        onChange={(event) => handleChange(event.currentTarget.value)}
        pattern="[0-9 ]*"
        type="text"
        value={inputValue}
      />
    </div>
  );
}

function parseDurationDraft(value: string): ParsedDuration | null {
  const parts = value.trim().split(/\s+/);
  if (parts.length !== 3 || parts.some((part) => !/^\d+$/.test(part))) {
    return null;
  }

  const [days, months, years] = parts.map(Number);
  if (![days, months, years].every(Number.isSafeInteger)) {
    return null;
  }

  return { days, months, years };
}

function isIncompleteDurationDraft(value: string): boolean {
  if (!/^[0-9 ]*$/.test(value)) {
    return false;
  }

  const numericParts = value.trim().split(/\s+/).filter(Boolean);
  return numericParts.length < 3;
}
