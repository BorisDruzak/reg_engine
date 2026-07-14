import type { CardTemplateFormLayoutRead, CardTemplateFormLayoutSectionRead } from "@/api/types";

export type BlockOrderDirection = "up" | "down";

export function normalizeWebBlockSections(
  layout: CardTemplateFormLayoutRead,
): CardTemplateFormLayoutRead {
  return {
    ...layout,
    sections: normalizeSections([...layout.sections].sort(compareSections)),
  };
}

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
  return { ...layout, sections: normalizeSections(ordered) };
}

function normalizeSections(sections: CardTemplateFormLayoutSectionRead[]) {
  return sections.map((section, index) => ({
    ...section,
    row: index + 1,
    column: 1,
    row_span: 1 as const,
    column_span: 12 as const,
  }));
}

function compareSections(
  left: CardTemplateFormLayoutSectionRead,
  right: CardTemplateFormLayoutSectionRead,
) {
  return left.row - right.row || left.column - right.column || left.id.localeCompare(right.id);
}
