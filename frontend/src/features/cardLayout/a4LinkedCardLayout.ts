import type { CardPrintLayout, CardPrintLayoutItem } from "@/api/types";

export function isLinkedCardPrintLayout(layout: CardPrintLayout) {
  return layout.items.some((item) => item.kind === "card_layout");
}

export function markLinkedCardPrintLayout(layout: CardPrintLayout): CardPrintLayout {
  return { ...layout, composition_mode: "linked_card" };
}

export function createLinkedCardPrintItem(cardTemplateId: string): CardPrintLayoutItem {
  return {
    id: "linked-card-layout",
    kind: "card_layout",
    card_template_id: cardTemplateId,
    page: 1,
    row: 1,
    column: 1,
    row_span: 1,
    column_span: 12,
    x_mm: 12,
    y_mm: 26,
    width_mm: 186,
    height_mm: 240,
  };
}
