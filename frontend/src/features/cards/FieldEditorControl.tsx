import type { FieldEditorOption, FieldEditorState } from "./fieldEditorUtils";
import { inputTypeForField } from "./fieldEditorUtils";

export function FieldEditorControl({
  fieldType,
  label,
  options,
  value,
  onChange,
}: {
  fieldType: string;
  label: string;
  options: FieldEditorOption[];
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
        <option value="">empty</option>
        {options.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
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
