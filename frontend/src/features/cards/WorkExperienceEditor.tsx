import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";

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
  const [revision, setRevision] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const [previousValue, setPreviousValue] = useState(value);
  const editorRef = useRef<HTMLDivElement>(null);

  if (previousValue !== value) {
    setPreviousValue(value);
    if (!isFocused) {
      setDraft(durationDraft(normalizedValue));
    }
  }

  function handleInput(event: FormEvent<HTMLDivElement>) {
    if (disabled) {
      return;
    }

    const nextDraft = draftFromEditor(event.currentTarget, draft);
    setDraft(nextDraft);
    setRevision((currentRevision) => currentRevision + 1);
    const parsed = parseDurationDraft(nextDraft);
    if (parsed) {
      onChange(workExperiencePayload(parsed));
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled || event.key !== " ") {
      return;
    }

    const activePart = selectionPart(event.currentTarget);
    if (!activePart) {
      return;
    }

    event.preventDefault();
    if (activePart === "days") {
      focusPart("months");
    }
    if (activePart === "months") {
      focusPart("years");
    }
  }

  function focusPart(part: WorkExperiencePart) {
    const editor = editorRef.current;
    const partElement = editor?.querySelector<HTMLElement>(`[data-work-experience-part="${part}"]`);
    if (!editor || !partElement) {
      return;
    }

    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(partElement);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  return (
    <div
      ref={editorRef}
      aria-disabled={disabled || undefined}
      aria-label={label}
      aria-multiline="false"
      className="work-experience-editor"
      contentEditable={!disabled}
      onBlur={() => {
        setIsFocused(false);
        onBlur?.();
      }}
      onFocus={() => setIsFocused(true)}
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      role="textbox"
      suppressContentEditableWarning
    >
      {parts.map((part) => {
        const currentValue = draftPartValue(draft[part], normalizedValue[part]);
        return (
          <span className="work-experience-editor-fragment" key={part}>
            <span data-work-experience-part={part}>{draft[part]}</span>
            <span
              className="work-experience-editor-unit"
              contentEditable={false}
              key={`${part}-${currentValue}-${revision}`}
            >
              {` ${workExperienceUnitWord(currentValue, part)} `}
            </span>
          </span>
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

function draftFromEditor(editor: HTMLElement, fallback: DurationDraft): DurationDraft {
  return parts.reduce<DurationDraft>((nextDraft, part) => {
    const partElement = editor.querySelector<HTMLElement>(`[data-work-experience-part="${part}"]`);
    const text = partElement?.textContent ?? fallback[part];
    return { ...nextDraft, [part]: text.replace(/\D/g, "") };
  }, fallback);
}

function selectionPart(editor: HTMLElement): WorkExperiencePart | null {
  const selection = window.getSelection();
  const selectionNode = selection?.anchorNode;
  const selectionElement =
    selectionNode instanceof Element ? selectionNode : selectionNode?.parentElement;
  const part = selectionElement?.closest<HTMLElement>("[data-work-experience-part]")?.dataset
    .workExperiencePart;
  return parts.includes(part as WorkExperiencePart) && editor.contains(selectionElement ?? null)
    ? (part as WorkExperiencePart)
    : null;
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
