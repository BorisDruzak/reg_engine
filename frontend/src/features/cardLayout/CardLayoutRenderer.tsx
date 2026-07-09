import type { ComponentProps } from "react";

import { CardWebLayoutCanvas } from "./CardWebLayoutCanvas";

export type CardLayoutRendererMode =
  | "design"
  | "preview"
  | "readonly"
  | "block-edit"
  | "public-edit";

export type CardLayoutSelection = { kind: "block" | "field"; id: string } | null;

export type CardLayoutRendererProps = ComponentProps<typeof CardWebLayoutCanvas>;

const modeAccessibleNames: Record<CardLayoutRendererMode, string> = {
  design: "Редактор макета карточки",
  preview: "Предпросмотр макета карточки",
  readonly: "Макет карточки только для чтения",
  "block-edit": "Редактирование блока карточки",
  "public-edit": "Публичное редактирование карточки",
};

export function CardLayoutRenderer(props: CardLayoutRendererProps) {
  return (
    <section
      className={`card-layout-renderer is-${props.mode}`}
      role="region"
      aria-label={modeAccessibleNames[props.mode]}
    >
      <CardWebLayoutCanvas {...props} />
    </section>
  );
}
