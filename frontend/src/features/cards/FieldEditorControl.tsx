import { useLayoutEffect, useRef, type ReactNode } from "react";

import { uiText } from "@/app/uiText";

import type { FieldEditorOption, FieldEditorState } from "./fieldEditorUtils";
import { inputTypeForField } from "./fieldEditorUtils";
import { SearchableChoicePicker } from "./SearchableChoicePicker";
import { WorkExperienceEditor } from "./WorkExperienceEditor";
import { defaultWorkExperienceValue, workExperienceValueFromUnknown } from "./workExperience";

export function FieldEditorControl({
  fieldType,
  label,
  hint,
  options,
  fileRefOptions = [],
  value,
  disabled = false,
  autoOpenChoice = false,
  onBlur,
  onChange,
}: {
  fieldType: string;
  label: string;
  hint?: string | null;
  options: Array<FieldEditorOption & { archived?: boolean }>;
  fileRefOptions?: FieldEditorFileRefOption[];
  value: FieldEditorState;
  disabled?: boolean;
  autoOpenChoice?: boolean;
  onBlur?: () => void;
  onChange: (value: FieldEditorState) => void;
}) {
  if (fieldType === "bool") {
    return (
      <ControlWithHint hint={hint}>
        <input
          aria-label={label}
          checked={Boolean(value)}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.checked)}
          type="checkbox"
        />
      </ControlWithHint>
    );
  }

  if (fieldType === "json") {
    return (
      <textarea
        aria-label={label}
        disabled={disabled}
        onBlur={onBlur}
        placeholder={hint || undefined}
        onChange={(event) => onChange(event.currentTarget.value)}
        value={typeof value === "string" ? value : "{}"}
      />
    );
  }

  if (fieldType === "multi_select") {
    return (
      <ControlWithHint hint={hint}>
        <SearchableChoicePicker
          label={label}
          hint={hint}
          options={options}
          mode="multiple"
          openOnMount={autoOpenChoice}
          value={Array.isArray(value) ? value : []}
          disabled={disabled}
          onChange={(nextValue) => onChange(Array.isArray(nextValue) ? nextValue : [])}
        />
      </ControlWithHint>
    );
  }

  if (fieldType === "organization_ref" || fieldType === "org_unit_ref") {
    return (
      <SearchableChoicePicker
        label={label}
        hint={hint}
        options={options}
        value={typeof value === "string" ? value : ""}
        mode="single"
        openOnMount={autoOpenChoice}
        hierarchy
        disabled={disabled}
        onChange={(nextValue) => onChange(typeof nextValue === "string" ? nextValue : "")}
      />
    );
  }

  if (fieldType === "select") {
    return (
      <SearchableChoicePicker
        label={label}
        hint={hint}
        options={options}
        mode="single"
        openOnMount={autoOpenChoice}
        value={typeof value === "string" ? value : ""}
        disabled={disabled}
        onChange={(nextValue) => onChange(typeof nextValue === "string" ? nextValue : "")}
      />
    );
  }

  if (fieldType === "file_ref") {
    const selectedValue = typeof value === "string" ? value : "";
    const selectedOption = fileRefOptions.find((item) => item.id === selectedValue);
    const hasActiveOptions = fileRefOptions.some((item) => !item.archived);
    return (
      <div className="file-ref-control">
        <select
          aria-label={label}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.value)}
          value={selectedValue}
        >
          <option value="">{uiText.selectFile}</option>
          {fileRefOptions.map((item) => (
            <option key={item.id} value={item.id} disabled={item.archived}>
              {item.archived ? `${item.label} / ${uiText.fileArchived}` : item.label}
            </option>
          ))}
        </select>
        {selectedValue && (
          <button
            type="button"
            className="ghost-button"
            disabled={disabled}
            onClick={() => onChange("")}
          >
            {uiText.clearFile}
          </button>
        )}
        {!hasActiveOptions && (
          <>
            <small>{uiText.noAttachments}</small>
            <small>{uiText.uploadFileFirst}</small>
          </>
        )}
        {selectedOption?.archived && <small>{uiText.fileArchived}</small>}
        {hint ? <small className="field-editor-hint">{hint}</small> : null}
      </div>
    );
  }

  if (fieldType === "work_experience") {
    const workExperienceValue =
      workExperienceValueFromUnknown(value) ?? defaultWorkExperienceValue();
    return (
      <ControlWithHint hint={hint}>
        <WorkExperienceEditor
          label={label}
          value={workExperienceValue}
          disabled={disabled}
          onBlur={onBlur}
          onChange={onChange}
        />
      </ControlWithHint>
    );
  }

  if (fieldType === "text") {
    return (
      <AutoSizingTextControl
        label={label}
        hint={hint}
        value={typeof value === "string" ? value : ""}
        disabled={disabled}
        onBlur={onBlur}
        onChange={(nextValue) => onChange(nextValue)}
      />
    );
  }

  const input = (
    <input
      aria-label={label}
      disabled={disabled}
      onBlur={onBlur}
      onChange={(event) => onChange(event.currentTarget.value)}
      placeholder={fieldType === "number" ? hint || uiText.empty : undefined}
      type={inputTypeForField(fieldType)}
      value={typeof value === "string" ? value : ""}
    />
  );
  return fieldType === "number" ? input : <ControlWithHint hint={hint}>{input}</ControlWithHint>;
}

function AutoSizingTextControl({
  label,
  hint,
  value,
  disabled,
  onBlur,
  onChange,
}: {
  label: string;
  hint?: string | null;
  value: string;
  disabled: boolean;
  onBlur?: () => void;
  onChange: (value: string) => void;
}) {
  const controlRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const control = controlRef.current;
    if (!control) return;
    control.style.height = "auto";
    control.style.height = `${control.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={controlRef}
      aria-label={label}
      className="field-editor-autosize-text"
      disabled={disabled}
      onBlur={onBlur}
      onChange={(event) => onChange(event.currentTarget.value)}
      placeholder={hint || uiText.empty}
      rows={1}
      value={value}
    />
  );
}

function ControlWithHint({ children, hint }: { children: ReactNode; hint?: string | null }) {
  return (
    <div className="field-editor-control-with-hint">
      {children}
      {hint ? <small className="field-editor-hint">{hint}</small> : null}
    </div>
  );
}

export type FieldEditorFileRefOption = {
  id: string;
  label: string;
  archived: boolean;
};
