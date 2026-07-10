import type {
  CardPrintLayout,
  CardPrintLayoutItem,
  FormBlockRead,
  FormFieldRead,
} from "@/api/types";

import { itemRectFromMm, normalizeLayoutGeometry } from "./printLayoutGeometry";

export type PrintLayoutValidationIssue = {
  level: "error" | "warning";
  message: string;
  itemId?: string;
};

const SUPPORTED_KINDS = new Set<CardPrintLayoutItem["kind"]>([
  "field",
  "block",
  "static_text",
  "heading",
  "container",
  "panel",
  "rectangle",
  "divider",
  "line",
  "metadata",
  "page_number",
  "print_date",
  "qr_code",
  "image",
  "card_layout",
]);

const DECORATIVE_OVERLAP_KINDS = new Set<CardPrintLayoutItem["kind"]>([
  "block",
  "container",
  "panel",
  "rectangle",
  "divider",
  "line",
  "image",
  "qr_code",
]);

export function validatePrintLayout(
  layout: CardPrintLayout,
  fields: FormFieldRead[],
  blocks: FormBlockRead[],
  templateName: string,
  outputFilenameTemplate: string,
): PrintLayoutValidationIssue[] {
  const normalized = normalizeLayoutGeometry(layout);
  const fieldIds = new Set(fields.map((field) => field.id));
  const blockIds = new Set(blocks.map((block) => block.id));
  const issues: PrintLayoutValidationIssue[] = [];
  if (!templateName.trim()) {
    issues.push({ level: "error", message: "Укажите название шаблона." });
  }
  if (!outputFilenameTemplate.trim()) {
    issues.push({ level: "error", message: "Укажите имя файла в настройках шаблона." });
  }
  if (!outputFilenameTemplate.includes("{{") && !/\.(docx|pdf)$/i.test(outputFilenameTemplate)) {
    issues.push({
      level: "warning",
      message: "Имя файла лучше завершить расширением .docx или .pdf.",
    });
  }

  const linkedItemCount = normalized.items.filter((item) => item.kind === "card_layout").length;
  if (
    (normalized.composition_mode === "linked_card" || linkedItemCount > 0) &&
    linkedItemCount !== 1
  ) {
    issues.push({
      level: "error",
      message: "Связанный макет должен содержать ровно одну карточку.",
    });
  }

  const blockingItems = normalized.items.filter((item) => !DECORATIVE_OVERLAP_KINDS.has(item.kind));
  for (const item of normalized.items) {
    const rect = itemRectFromMm(item);
    if (!SUPPORTED_KINDS.has(item.kind)) {
      issues.push({ level: "error", itemId: item.id, message: "Неподдерживаемый тип элемента." });
    }
    if (rect.width_mm <= 0 || rect.height_mm <= 0) {
      issues.push({ level: "error", itemId: item.id, message: "Элемент имеет нулевой размер." });
    }
    if (
      rect.x_mm < 0 ||
      rect.y_mm < 0 ||
      rect.x_mm + rect.width_mm > 210 ||
      rect.y_mm + rect.height_mm > 297
    ) {
      issues.push({ level: "error", itemId: item.id, message: "Элемент выходит за границы A4." });
    }
    if (item.kind === "field" && (!item.field_id || !fieldIds.has(item.field_id))) {
      issues.push({
        level: "error",
        itemId: item.id,
        message: "Поле элемента не найдено в схеме.",
      });
    }
    if (item.kind === "block" && item.block_id && !blockIds.has(item.block_id)) {
      issues.push({ level: "error", itemId: item.id, message: "Блок элемента не найден в схеме." });
    }
    if (item.kind === "field" && (rect.width_mm < 25 || rect.height_mm < 8)) {
      issues.push({
        level: "warning",
        itemId: item.id,
        message: "Поле может быть слишком маленьким для подписи и значения.",
      });
    }
  }

  for (let index = 0; index < blockingItems.length; index += 1) {
    for (let nextIndex = index + 1; nextIndex < blockingItems.length; nextIndex += 1) {
      if (rectsOverlap(blockingItems[index], blockingItems[nextIndex])) {
        issues.push({
          level: "warning",
          itemId: blockingItems[nextIndex].id,
          message: "Элементы пересекаются на странице.",
        });
      }
    }
  }
  return issues;
}

function rectsOverlap(left: CardPrintLayoutItem, right: CardPrintLayoutItem) {
  if (left.page !== right.page) {
    return false;
  }
  const leftRect = itemRectFromMm(left);
  const rightRect = itemRectFromMm(right);
  return !(
    leftRect.x_mm + leftRect.width_mm <= rightRect.x_mm ||
    rightRect.x_mm + rightRect.width_mm <= leftRect.x_mm ||
    leftRect.y_mm + leftRect.height_mm <= rightRect.y_mm ||
    rightRect.y_mm + rightRect.height_mm <= leftRect.y_mm
  );
}
