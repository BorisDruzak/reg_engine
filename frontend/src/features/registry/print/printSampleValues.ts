import type { CardPrintLayoutItem, FormFieldRead } from "@/api/types";

export const CARD_PRINT_METADATA_LABELS: Record<string, string> = {
  "card.display_name": "Название карточки",
  "card.id": "ID карточки",
  "registry.name": "Название реестра",
  "organization.name": "Организация",
};

export function sampleValueForField(field?: FormFieldRead | null) {
  switch (field?.field_type) {
    case "number":
      return "123";
    case "date":
      return "24.05.2026";
    case "datetime":
      return "24.05.2026 09:30";
    case "bool":
      return "Да";
    case "select":
      return "Активен";
    case "multi_select":
      return "Вариант 1, Вариант 2";
    case "file_ref":
      return "document.pdf";
    case "json":
      return '{"status":"ok"}';
    case "card_ref":
      return "Связанная карточка";
    case "user_ref":
      return "Пользователь";
    case "organization_ref":
      return "Организация";
    case "org_unit_ref":
      return "Подразделение";
    case "registry_ref":
      return "Реестр";
    case "static_text":
      return field?.label || "Информационный текст";
    default:
      return "Иванов Иван Иванович";
  }
}

export function itemDisplayText(
  item: CardPrintLayoutItem,
  field?: FormFieldRead | null,
  metadataValues: Record<string, string> = {},
) {
  if (item.kind === "heading" || item.kind === "static_text") {
    return item.text || (item.kind === "heading" ? "Заголовок" : "Текст");
  }
  if (item.kind === "field") {
    return sampleValueForField(field);
  }
  if (item.kind === "metadata") {
    if (item.metadata_key && metadataValues[item.metadata_key]) {
      return metadataValues[item.metadata_key];
    }
    if (item.metadata_key === "card.id") {
      return "00000000-0000-0000-0000-000000000000";
    }
    if (item.metadata_key === "registry.name") {
      return "Реестр карточек";
    }
    if (item.metadata_key === "organization.name") {
      return "Организация";
    }
    return "Карточка";
  }
  if (item.kind === "page_number") {
    return "1";
  }
  if (item.kind === "print_date") {
    return "24.05.2026";
  }
  if (item.kind === "block") {
    return item.label || item.text || "Блок данных";
  }
  return item.text || "";
}

export function fieldTypeIcon(field?: FormFieldRead | null) {
  switch (field?.field_type) {
    case "number":
      return "№";
    case "date":
    case "datetime":
      return "Д";
    case "bool":
      return "✓";
    case "select":
    case "multi_select":
      return "⌄";
    case "file_ref":
      return "Ф";
    case "json":
      return "{}";
    default:
      return "T";
  }
}
