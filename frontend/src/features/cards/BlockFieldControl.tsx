import { useEffect, useRef, type ReactNode } from "react";

import type { FormFieldRead } from "@/api/types";

import { FieldEditorControl } from "./FieldEditorControl";
import type { FieldEditorState } from "./fieldEditorUtils";

export type BlockFieldControlProps = {
  field: FormFieldRead;
  value: FieldEditorState | undefined;
  editable: boolean;
  pending: boolean;
  error?: string;
  options?: ReadonlyArray<{ id: string; label: string }>;
  readValue: ReactNode;
  fileRefControl?: ReactNode;
  autoFocus?: boolean;
  onChange: (value: FieldEditorState) => void;
};

export function BlockFieldControl({
  field,
  value,
  editable,
  pending,
  error,
  options = [],
  readValue,
  fileRefControl,
  autoFocus = false,
  onChange,
}: BlockFieldControlProps) {
  const controlRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!autoFocus) return;
    controlRef.current?.querySelector<HTMLElement>("input, select, textarea, button")?.focus();
  }, [autoFocus]);

  if (field.field_type === "file_ref") {
    if (fileRefControl) {
      return (
        <fieldset className="filled-card-file-ref-control" disabled={pending}>
          {fileRefControl}
        </fieldset>
      );
    }
    return (
      <div className="filled-card-file-ref-readonly">
        <div>{readValue}</div>
        <small>Файл изменяется в разделе «Вложения»</small>
      </div>
    );
  }

  if (field.field_type === "static_text" || !editable || value === undefined) {
    return readValue;
  }

  return (
    <div ref={controlRef} className="filled-card-block-field-control" aria-busy={pending}>
      <FieldEditorControl
        fieldType={field.field_type}
        label={field.label}
        options={options.map((option) => ({ id: option.id, label: option.label }))}
        value={value}
        disabled={pending}
        onChange={onChange}
      />
      {error ? (
        <p className="inline-alert" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
