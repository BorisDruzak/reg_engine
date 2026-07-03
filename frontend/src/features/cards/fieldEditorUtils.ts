import { booleanLabel, uiText } from "@/app/uiText";

export type FieldEditorState = string | boolean | string[];

export type EditableFieldValue = {
  field_type: string;
  value: unknown;
};

export type FieldEditorOption = {
  id: string;
  label: string;
};

const nullableSingleReferenceTypes = new Set([
  "select",
  "card_ref",
  "user_ref",
  "organization_ref",
  "org_unit_ref",
  "registry_ref",
]);

export type FileRefValue = {
  attachment_id: string;
  title: string;
  original_filename: string;
  archived_at: string | null;
};

export function initialEditorValue(field: EditableFieldValue): FieldEditorState {
  if (field.field_type === "bool") {
    return Boolean(field.value);
  }
  if (field.field_type === "file_ref") {
    const fileRefValue = fileRefValueFromUnknown(field.value);
    if (fileRefValue) {
      return fileRefValue.attachment_id;
    }
    return typeof field.value === "string" ? field.value : "";
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
  if (fieldType === "file_ref") {
    return typeof value === "string" && value.trim() ? value : null;
  }
  if (nullableSingleReferenceTypes.has(fieldType)) {
    return typeof value === "string" && value.trim() ? value : null;
  }
  if (fieldType === "json") {
    if (typeof value !== "string") {
      throw new Error(uiText.jsonObjectRequired);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      throw new Error(uiText.jsonObjectRequired);
    }
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error(uiText.jsonObjectRequired);
    }
    return parsed;
  }
  if (fieldType === "number") {
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(uiText.numberRequired);
    }
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) {
      throw new Error(uiText.numberRequired);
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
    return uiText.empty;
  }
  const fileRefValue = fileRefValueFromUnknown(value);
  if (fileRefValue) {
    const title = fileRefValue.title || fileRefValue.original_filename;
    const archiveLabel = fileRefValue.archived_at ? `, ${uiText.fileArchived}` : "";
    return `${title} (${fileRefValue.original_filename})${archiveLabel}`;
  }
  if (Array.isArray(value)) {
    return value.map(formatValue).join(", ");
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") {
    return booleanLabel(value);
  }
  return String(value);
}

export function fileRefValueFromUnknown(value: unknown): FileRefValue | null {
  if (value === null || typeof value !== "object") {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.attachment_id !== "string" ||
    typeof candidate.original_filename !== "string"
  ) {
    return null;
  }
  return {
    attachment_id: candidate.attachment_id,
    title: typeof candidate.title === "string" ? candidate.title : candidate.original_filename,
    original_filename: candidate.original_filename,
    archived_at: typeof candidate.archived_at === "string" ? candidate.archived_at : null,
  };
}
