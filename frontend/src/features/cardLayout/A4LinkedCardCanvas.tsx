import type {
  CardPrintLayout,
  CardTemplateLayoutRead,
  FormBlockRead,
  FormFieldRead,
} from "@/api/types";
import { A4LayoutRenderer } from "@/features/registry/print/A4LayoutRenderer";

export type A4LinkedCardCanvasProps = {
  layout: CardPrintLayout;
  cardLayout: CardTemplateLayoutRead;
  blocks: FormBlockRead[];
  fields: FormFieldRead[];
  zoom: number;
  showGrid: boolean;
  selectedItemId: string | null;
  readonly?: boolean;
  legacy: boolean;
  converting?: boolean;
  onSelectItem: (itemId: string | null) => void;
  onChangeLayout: (layout: CardPrintLayout) => void;
  onAddPrintItem: (kind: PrintOnlyItemKind) => void;
  onEditCardLayout: () => void;
  onConvertLegacy: () => void;
};

export type PrintOnlyItemKind =
  | "heading"
  | "static_text"
  | "panel"
  | "rectangle"
  | "divider"
  | "print_date"
  | "page_number"
  | "metadata";

const printOnlyActions: Array<{ kind: PrintOnlyItemKind; label: string }> = [
  { kind: "heading", label: "Добавить заголовок" },
  { kind: "static_text", label: "Добавить печатный текст" },
  { kind: "panel", label: "Добавить панель" },
  { kind: "rectangle", label: "Добавить прямоугольник" },
  { kind: "divider", label: "Добавить линию" },
  { kind: "print_date", label: "Добавить дату печати" },
  { kind: "page_number", label: "Добавить номер страницы" },
  { kind: "metadata", label: "Добавить название карточки" },
];

export function A4LinkedCardCanvas({
  layout,
  cardLayout,
  blocks,
  fields,
  zoom,
  showGrid,
  selectedItemId,
  readonly = false,
  legacy,
  converting = false,
  onSelectItem,
  onChangeLayout,
  onAddPrintItem,
  onEditCardLayout,
  onConvertLegacy,
}: A4LinkedCardCanvasProps) {
  return (
    <section className="a4-linked-card-stage" aria-label="Печатная форма A4">
      {legacy ? (
        <div className="a4-linked-card-legacy-notice" role="status">
          <div>
            <strong>Сохранена прежняя поэлементная печатная форма</strong>
            <span>
              Для редактирования как единого объекта создайте новую связанную версию. Предыдущая
              версия останется доступной.
            </span>
          </div>
          <button
            type="button"
            className="primary-button"
            disabled={converting}
            onClick={onConvertLegacy}
          >
            Преобразовать в связанный макет
          </button>
        </div>
      ) : readonly ? null : (
        <div className="a4-linked-card-actions" role="toolbar" aria-label="Печатные элементы A4">
          {printOnlyActions.map((action) => (
            <button
              key={action.kind}
              type="button"
              className="ghost-button"
              onClick={() => onAddPrintItem(action.kind)}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
      <A4LayoutRenderer
        layout={layout}
        fields={fields}
        blocks={blocks}
        linkedCardLayout={cardLayout}
        mode={legacy || readonly ? "preview" : "design"}
        zoom={zoom}
        showGrid={!legacy && !readonly && showGrid}
        showTechnicalData={false}
        selectedItemId={legacy || readonly ? null : selectedItemId}
        onSelectItem={legacy || readonly ? undefined : onSelectItem}
        onChangeLayout={legacy || readonly ? undefined : onChangeLayout}
        onEditLinkedCard={onEditCardLayout}
      />
    </section>
  );
}
