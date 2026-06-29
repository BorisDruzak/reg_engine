import { uiText } from "@/app/uiText";

import type { FieldEditorOption, FieldEditorState } from "./fieldEditorUtils";
import { inputTypeForField } from "./fieldEditorUtils";

export function FieldEditorControl({
  fieldType,
  label,
  options,
  fileRefOptions = [],
  value,
  onChange,
}: {
  fieldType: string;
  label: string;
  options: FieldEditorOption[];
  fileRefOptions?: FieldEditorFileRefOption[];
  value: FieldEditorState;
  onChange: (value: FieldEditorState) => void;
}) {
  if (fieldType === "bool") {
    return (
      <input
        aria-label={label}
        checked={Boolean(value)}
        onChange={(event) => onChange(event.currentTarget.checked)}
        type="checkbox"
      />
    );
  }

  if (fieldType === "json") {
    return (
      <textarea
        aria-label={label}
        onChange={(event) => onChange(event.currentTarget.value)}
        value={typeof value === "string" ? value : "{}"}
      />
    );
  }

  if (fieldType === "multi_select") {
    return (
      <select
        aria-label={label}
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
    );
  }

  if (fieldType === "select") {
    return (
      <select
        aria-label={label}
        onChange={(event) => onChange(event.currentTarget.value)}
        value={typeof value === "string" ? value : ""}
      >
        <option value="">{uiText.empty}</option>
        {options.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
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
          <button type="button" className="ghost-button" onClick={() => onChange("")}>
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
      </div>
    );
  }

  return (
    <input
      aria-label={label}
      onChange={(event) => onChange(event.currentTarget.value)}
      type={inputTypeForField(fieldType)}
      value={typeof value === "string" ? value : ""}
    />
  );
}

export type FieldEditorFileRefOption = {
  id: string;
  label: string;
  archived: boolean;
};
