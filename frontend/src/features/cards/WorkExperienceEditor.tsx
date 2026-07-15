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

const parts: WorkExperiencePart[] = ["days", "months", "years"];

const partLabels: Record<WorkExperiencePart, string> = {
  days: "дни",
  months: "месяцы",
  years: "годы",
};

const partLength: Record<WorkExperiencePart, number> = {
  days: 2,
  months: 2,
  years: 4,
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
  const daysRef = useRef<HTMLInputElement>(null);
  const monthsRef = useRef<HTMLInputElement>(null);
  const yearsRef = useRef<HTMLInputElement>(null);

  if (previousValue !== value) {
    setPreviousValue(value);
    if (!isFocused) {
      setDraft(durationDraft(normalizedValue));
    }
  }

  function handleChange(part: WorkExperiencePart, nextPartValue: string) {
    if (disabled) {
      return;
    }

    const digits = nextPartValue.replace(/\D/g, "").slice(0, partLength[part]);
    const nextDraft = { ...draft, [part]: digits };
    setDraft(nextDraft);
    const parsed = parseDurationDraft(nextDraft);
    if (parsed) {
      onChange(workExperiencePayload(parsed));
    }

    if (digits.length === partLength[part]) {
      focusNext(part);
    }
  }

  function handleKeyDown(part: WorkExperiencePart, event: KeyboardEvent<HTMLInputElement>) {
    if (disabled) {
      return;
    }

    if (event.key === " ") {
      event.preventDefault();
      focusNext(part);
      return;
    }

    if (
      event.key === "Backspace" &&
      event.currentTarget.value === "" &&
      (part === "months" || part === "years")
    ) {
      event.preventDefault();
      focusPrevious(part);
    }
  }

  function focusNext(part: WorkExperiencePart) {
    if (part === "days") {
      focusInput(monthsRef.current);
    }
    if (part === "months") {
      focusInput(yearsRef.current);
    }
  }

  function focusPrevious(part: "months" | "years") {
    focusInput(part === "months" ? daysRef.current : monthsRef.current);
  }

  return (
    <div
      aria-label={label}
      className="work-experience-editor"
      onBlur={(event) => handleGroupBlur(event)}
      onFocus={() => setIsFocused(true)}
      role="group"
    >
      {parts.map((part) => {
        const currentValue = draftPartValue(draft[part], normalizedValue[part]);
        return (
          <span className="work-experience-editor-fragment" key={part}>
            <input
              ref={part === "days" ? daysRef : part === "months" ? monthsRef : yearsRef}
              aria-label={`${label}, ${partLabels[part]}`}
              data-work-experience-part={part}
              disabled={disabled}
              inputMode="numeric"
              maxLength={partLength[part]}
              onClick={(event) => event.currentTarget.select()}
              onChange={(event) => handleChange(part, event.currentTarget.value)}
              onKeyDown={(event) => handleKeyDown(part, event)}
              type="text"
              value={draft[part]}
            />
            <span className="work-experience-editor-unit">
              {workExperienceUnitWord(currentValue, part)}
            </span>
          </span>
        );
      })}
    </div>
  );

  function handleGroupBlur(event: FocusEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget)) {
      return;
    }
    setIsFocused(false);
    onBlur?.();
  }
}

function focusInput(input: HTMLInputElement | null) {
  input?.focus();
  input?.select();
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
