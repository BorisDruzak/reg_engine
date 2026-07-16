import type { ComponentProps, ReactNode } from "react";

import type { CardTemplateFormLayoutSectionRead, FormBlockRead } from "@/api/types";

import { CardWebLayoutCanvas } from "./CardWebLayoutCanvas";
import type { CardLayoutFieldRenderContext } from "./CardFieldLayoutNode";

export type CardLayoutRendererMode =
  | "design"
  | "preview"
  | "readonly"
  | "block-edit"
  | "public-edit";

export type CardLayoutSelection = { kind: "block" | "field"; id: string } | null;

export type CardLayoutBlockRenderContext = {
  block: FormBlockRead | null;
  section: CardTemplateFormLayoutSectionRead;
  mode: CardLayoutRendererMode;
};

export type CardLayoutBlockActionsRenderer = (context: CardLayoutBlockRenderContext) => ReactNode;

export type CardLayoutBlockPresentation = {
  anchorId?: string;
  state?: "complete" | "attention" | "empty";
  description?: string;
};

export type CardLayoutFieldPresentation = {
  state?: "filled" | "required-missing" | "empty";
  editingState?: "active" | "dirty" | "saving";
  description?: string;
};

export type CardLayoutFieldPresentationLayout = "stacked" | "inline";

export type CardLayoutBlockPresentationRenderer = (
  context: CardLayoutBlockRenderContext,
) => CardLayoutBlockPresentation | undefined;

export type CardLayoutFieldPresentationRenderer = (
  context: CardLayoutFieldRenderContext,
) => CardLayoutFieldPresentation | undefined;

export type CardLayoutFieldActivationRenderer = (context: CardLayoutFieldRenderContext) => boolean;
export type CardLayoutFieldActivationHandler = (context: CardLayoutFieldRenderContext) => void;

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
