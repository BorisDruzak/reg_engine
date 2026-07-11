import type {
  CardTemplateFormLayoutRead,
  CardTemplateFormLayoutSectionRead,
} from "@/api/types";

export type BlockOrderDirection = "up" | "down";

export function reorderBlockSections(
  layout: CardTemplateFormLayoutRead,
  sectionId: string,
  direction: BlockOrderDirection,
): CardTemplateFormLayoutRead | null {
  const ordered = [...layout.sections].sort(compareSections);
  const index = ordered.findIndex((section) => section.id === sectionId);
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || targetIndex < 0 || targetIndex >= ordered.length) {
    return null;
  }

  [ordered[index], ordered[targetIndex]] = [ordered[targetIndex], ordered[index]];
  let nextRow = 1;
  const sections = ordered.map((section) => {
    const column = Math.min(
      Math.max(1, section.column),
      Math.max(1, layout.columns - section.column_span + 1),
    );
    const placed = { ...section, row: nextRow, column };
    nextRow += section.row_span;
    return placed;
  });
  return { ...layout, sections };
}

function compareSections(
  left: CardTemplateFormLayoutSectionRead,
  right: CardTemplateFormLayoutSectionRead,
) {
  return left.row - right.row || left.column - right.column || left.id.localeCompare(right.id);
}
