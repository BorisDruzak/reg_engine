export type FieldEditorState = string | boolean | string[];

export type EditableFieldValue = {
  field_type: string;
  value: unknown;
};

export type FieldEditorOption = {
  id: string;
  label: string;
};

export function initialEditorValue(field: EditableFieldValue): FieldEditorState {
  if (field.field_type === "bool") {
    return Boolean(field.value);
  }
  if (field.field_type === "multi_select") {
    return Array.isArray(field.value) ? field.value.map(String) : [];
  }
  if (field.field_type === "json") {
    return field.value ? JSON.stringify(field.value, null, 2) : "{}";
  }
  if (field.value === null || field.value === undefined) {
    return "";
  }
  if (field.field_type === "datetime") {
    return String(field.value).slice(0, 16);
  }
  return String(field.value);
}

export function coerceEditorValue(fieldType: string, value: FieldEditorState): unknown {
  if (fieldType === "bool") {
    return Boolean(value);
  }
  if (fieldType === "multi_select") {
    return Array.isArray(value) ? value : [];
  }
  if (fieldType === "json") {
    if (typeof value !== "string") {
      throw new Error("JSON fields require an object value.");
    }
    const parsed = JSON.parse(value) as unknown;
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error("JSON fields require an object value.");
    }
    return parsed;
  }
  if (fieldType === "number") {
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error("Number fields require a numeric value.");
    }
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) {
      throw new Error("Number fields require a numeric value.");
    }
    return numberValue;
  }
  return typeof value === "string" ? value : "";
}

export function inputTypeForField(fieldType: string) {
  if (fieldType === "number") {
    return "number";
  }
  if (fieldType === "date") {
    return "date";
  }
  if (fieldType === "datetime") {
    return "datetime-local";
  }
  return "text";
}

export function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "empty";
  }
  if (Array.isArray(value)) {
    return value.map(formatValue).join(", ");
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}
