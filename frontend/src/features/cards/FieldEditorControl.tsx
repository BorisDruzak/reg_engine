import type { ReactNode } from "react";

import { uiText } from "@/app/uiText";

import type { FieldEditorOption, FieldEditorState } from "./fieldEditorUtils";
import { inputTypeForField } from "./fieldEditorUtils";

export function FieldEditorControl({
  fieldType,
  label,
  hint,
  options,
  fileRefOptions = [],
  value,
  disabled = false,
  onChange,
}: {
  fieldType: string;
  label: string;
  hint?: string | null;
  options: Array<FieldEditorOption & { archived?: boolean }>;
  fileRefOptions?: FieldEditorFileRefOption[];
  value: FieldEditorState;
  disabled?: boolean;
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
        placeholder={hint || undefined}
        onChange={(event) => onChange(event.currentTarget.value)}
        value={typeof value === "string" ? value : "{}"}
      />
    );
  }

  if (fieldType === "multi_select") {
    return (
      <ControlWithHint hint={hint}>
        <select
          aria-label={label}
          disabled={disabled}
          multiple
          onChange={(event) =>
            onChange(Array.from(event.currentTarget.selectedOptions).map((option) => option.value))
          }
          value={Array.isArray(value) ? value : []}
        >
          {options.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </ControlWithHint>
    );
  }

  if (fieldType === "select" || fieldType === "org_unit_ref") {
    return (
      <select
        aria-label={label}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
        value={typeof value === "string" ? value : ""}
      >
        <option value="">{hint || uiText.empty}</option>
        {options.map((item) => (
          <option key={item.id} value={item.id} disabled={item.archived}>
            {item.archived ? `${item.label} / ${uiText.archived}` : item.label}
          </option>
        ))}
      </select>
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

  const input = (
    <input
      aria-label={label}
      disabled={disabled}
      onChange={(event) => onChange(event.currentTarget.value)}
      placeholder={fieldType === "text" || fieldType === "number" ? hint || undefined : undefined}
      type={inputTypeForField(fieldType)}
      value={typeof value === "string" ? value : ""}
    />
  );
  return fieldType === "text" || fieldType === "number" ? (
    input
  ) : (
    <ControlWithHint hint={hint}>{input}</ControlWithHint>
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
