import { useRef, useState, type FocusEvent, type KeyboardEvent } from "react";

import type { WorkExperienceValue } from "@/api/types";

import {
  defaultWorkExperienceValue,
  workExperiencePayload,
  workExperienceUnitWord,
  workExperienceValueFromUnknown,
  type WorkExperiencePart,
} from "./workExperience";

type DurationDraft = Record<WorkExperiencePart, string>;

const partLabels: Record<WorkExperiencePart, string> = {
  days: "дни",
  months: "месяцы",
  years: "годы",
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
  const [draft, setDraft] = useState(() => durationDraft(normalizedValue));
  const [isFocused, setIsFocused] = useState(false);
  const [previousValue, setPreviousValue] = useState(value);
  const monthsRef = useRef<HTMLInputElement>(null);
  const yearsRef = useRef<HTMLInputElement>(null);

  if (previousValue !== value) {
    setPreviousValue(value);
    if (!isFocused) {
      setDraft(durationDraft(normalizedValue));
    }
  }

  function handleChange(part: WorkExperiencePart, nextPartValue: string) {
    if (!/^\d*$/.test(nextPartValue)) {
      return;
    }

    const nextDraft = { ...draft, [part]: nextPartValue };
    setDraft(nextDraft);
    const parsed = parseDurationDraft(nextDraft);
    if (parsed) {
      onChange(workExperiencePayload(parsed));
    }
  }

  function handleKeyDown(part: WorkExperiencePart, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== " ") {
      return;
    }

    event.preventDefault();
    if (part === "days") {
      monthsRef.current?.focus();
    }
    if (part === "months") {
      yearsRef.current?.focus();
    }
  }

  function handleGroupBlur(event: FocusEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget)) {
      return;
    }
    setIsFocused(false);
    onBlur?.();
  }

  return (
    <div
      aria-label={label}
      className="work-experience-editor"
      onBlur={handleGroupBlur}
      onFocus={() => setIsFocused(true)}
      role="group"
    >
      {(["days", "months", "years"] as const).map((part) => {
        const currentValue = draftPartValue(draft[part], normalizedValue[part]);
        return (
          <div className="work-experience-editor-segment" key={part}>
            <input
              ref={part === "months" ? monthsRef : part === "years" ? yearsRef : undefined}
              aria-label={label + ", " + partLabels[part]}
              disabled={disabled}
              inputMode="numeric"
              onChange={(event) => handleChange(part, event.currentTarget.value)}
              onKeyDown={(event) => handleKeyDown(part, event)}
              type="text"
              value={draft[part]}
            />
            <span className="work-experience-editor-unit">
              {workExperienceUnitWord(currentValue, part)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function durationDraft(value: WorkExperienceValue): DurationDraft {
  return {
    days: String(value.days),
    months: String(value.months),
    years: String(value.years),
  };
}

function parseDurationDraft(draft: DurationDraft): WorkExperienceValue | null {
  const values = [draft.days, draft.months, draft.years];
  if (values.some((value) => !/^\d+$/.test(value))) {
    return null;
  }

  const [days, months, years] = values.map(Number);
  if (![days, months, years].every(Number.isSafeInteger)) {
    return null;
  }

  return { days, months, years };
}

function draftPartValue(draft: string, fallback: number): number {
  if (!/^\d+$/.test(draft)) {
    return fallback;
  }
  const value = Number(draft);
  return Number.isSafeInteger(value) ? value : fallback;
}
