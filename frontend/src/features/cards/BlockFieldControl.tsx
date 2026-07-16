import { useEffect, useRef, type ReactNode } from "react";

import type { FormFieldRead, TextValidationRule } from "@/api/types";

import { FieldEditorControl } from "./FieldEditorControl";
import type { FieldEditorState } from "./fieldEditorUtils";

const pickerFieldTypes = new Set(["select", "multi_select", "organization_ref", "org_unit_ref"]);

export type BlockFieldControlProps = {
  field: FormFieldRead;
  value: FieldEditorState | undefined;
  editable: boolean;
  pending: boolean;
  error?: string;
  validation?: TextValidationRule | null;
  options?: ReadonlyArray<{ id: string; label: string; archived?: boolean }>;
  readValue: ReactNode;
  fileRefControl?: ReactNode;
  autoFocus?: boolean;
  onChange: (value: FieldEditorState) => void;
  onBlur?: () => void;
};

export function BlockFieldControl({
  field,
  value,
  editable,
  pending,
  error,
  validation,
  options = [],
  readValue,
  fileRefControl,
  autoFocus = false,
  onChange,
  onBlur,
}: BlockFieldControlProps) {
  const controlRef = useRef<HTMLDivElement>(null);
  const autoOpenChoice = autoFocus && pickerFieldTypes.has(field.field_type);

  useEffect(() => {
    if (!autoFocus || autoOpenChoice) return;
    const initialControl = controlRef.current?.querySelector<HTMLElement>(
      "input, select, textarea, button",
    );
    initialControl?.focus();
    if (field.field_type === "work_experience" && initialControl instanceof HTMLInputElement) {
      initialControl.select();
    }
  }, [autoFocus, autoOpenChoice, field.field_type]);

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
    <div
      ref={controlRef}
      className="filled-card-block-field-control"
      aria-busy={pending}
      onBlurCapture={(event) => {
        const nextTarget = event.relatedTarget;
        if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
        onBlur?.();
      }}
    >
      <FieldEditorControl
        fieldType={field.field_type}
        label={field.label}
        hint={field.description}
        validation={validation ?? field.validation_json}
        options={options.map((option) => ({
          id: option.id,
          label: option.label,
          archived: option.archived,
        }))}
        value={value}
        disabled={false}
        autoOpenChoice={autoOpenChoice}
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
