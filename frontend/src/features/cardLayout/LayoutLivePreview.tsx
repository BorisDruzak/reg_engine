import { useMemo } from "react";
import type { CSSProperties } from "react";

import type {
  CardTemplateFormLayoutSectionRead,
  CardTemplateLayoutRead,
  FormBlockRead,
  FormFieldRead,
} from "@/api/types";

export type LayoutLivePreviewProps = {
  layout: CardTemplateLayoutRead;
};

export function LayoutLivePreview({ layout }: LayoutLivePreviewProps) {
  const identity = useMemo(() => JSON.stringify(layout.form_layout), [layout.form_layout]);

  return (
    <div className="layout-live-preview" aria-label="Живой предпросмотр макета">
      <section
        className="layout-live-preview-surface is-web"
        role="region"
        aria-label="Предпросмотр веб-карточки"
        data-layout-identity={identity}
      >
        <h4>Веб-карточка</h4>
        <LiveLayoutComposition layout={layout} />
      </section>
      <section
        className="layout-live-preview-surface is-a4"
        role="region"
        aria-label="Предпросмотр связанной карточки A4"
        data-layout-identity={identity}
      >
        <h4>Связанная карточка A4</h4>
        <div className="layout-live-preview-a4-page">
          <LiveLayoutComposition layout={layout} />
        </div>
      </section>
    </div>
  );
}

function LiveLayoutComposition({ layout }: { layout: CardTemplateLayoutRead }) {
  const blocksById = new Map(layout.structure.blocks.map((block) => [block.id, block]));
  const fieldsById = new Map(layout.structure.fields.map((field) => [field.id, field]));
  return (
    <div className="layout-live-preview-grid" style={gridStyle(6)}>
      {layout.form_layout.sections.map((section) => (
        <LiveBlock
          key={section.id}
          section={section}
          block={section.block_id ? (blocksById.get(section.block_id) ?? null) : null}
          fieldsById={fieldsById}
        />
      ))}
    </div>
  );
}

function LiveBlock({
  section,
  block,
  fieldsById,
}: {
  section: CardTemplateFormLayoutSectionRead;
  block: FormBlockRead | null;
  fieldsById: ReadonlyMap<string, FormFieldRead>;
}) {
  return (
    <section
      className="layout-live-preview-block"
      data-testid={`live-layout-block-${section.id}`}
      style={rectStyle(section)}
      aria-label={block ? `Предпросмотр блока ${block.title}` : "Предпросмотр недоступного блока"}
    >
      <strong>{block?.title ?? "Блок недоступен"}</strong>
      <div className="layout-live-preview-field-grid" style={gridStyle(3)}>
        {section.items.map((item) => {
          const field = item.field_id ? fieldsById.get(item.field_id) : null;
          return (
            <span
              key={item.id}
              className="layout-live-preview-field"
              data-testid={`live-layout-field-${item.id}`}
              style={rectStyle(item)}
            >
              {field?.label ?? item.text ?? "Поле недоступно"}
            </span>
          );
        })}
      </div>
    </section>
  );
}

function gridStyle(minimumRowHeight: number): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
    gridTemplateRows: `repeat(4, minmax(${minimumRowHeight}rem, auto))`,
  };
}

function rectStyle(rect: {
  row: number;
  column: number;
  row_span: number;
  column_span: number;
}): CSSProperties {
  return {
    gridColumn: `${rect.column} / span ${rect.column_span}`,
    gridRow: `${rect.row} / span ${rect.row_span}`,
  };
}
