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
  const [draftValue, setDraftValue] = useState(formattedValue);
  const [isFocused, setIsFocused] = useState(false);
  const [previousValue, setPreviousValue] = useState(value);

  if (previousValue !== value) {
    setPreviousValue(value);
    if (!isFocused) {
      setDraftValue(formattedValue);
    }
  }

  function handleBlur() {
    setIsFocused(false);
    const parsed = parseDurationDraft(draftValue);
    if (parsed) {
      setDraftValue(formatWorkExperience(parsed));
    }
    onBlur?.();
  }

  function handleChange(nextValue: string) {
    if (!/^[0-9 ]*$/.test(nextValue)) {
      setDraftValue(formattedValue);
      return;
    }

    const parsed = parseDurationDraft(nextValue);
    if (parsed) {
      onChange(workExperiencePayload(parsed));
      setDraftValue(nextValue);
      return;
    }

    setDraftValue(nextValue);
  }

  return (
    <div aria-label={label} className="work-experience-editor" role="group">
      <input
        aria-label={label}
        disabled={disabled}
        inputMode="numeric"
        onBlur={handleBlur}
        onChange={(event) => handleChange(event.currentTarget.value)}
        onFocus={() => setIsFocused(true)}
        type="text"
        value={draftValue}
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
