import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
} from "react";

import type { CardPrintLayout, CardPrintLayoutItem, FormFieldRead } from "@/api/types";

import {
  A4_HEIGHT_MM,
  A4_WIDTH_MM,
  DEFAULT_PX_PER_MM,
  ensureItemGeometry,
  itemRectFromMm,
  itemStyleFromMm,
  moveItemByMm,
  normalizeLayoutGeometry,
  resizeItemByMm,
} from "./printLayoutGeometry";
import { fieldTypeIcon, itemDisplayText } from "./printSampleValues";

export type A4TemplateMode = "design" | "preview" | "fill" | "readonly";

type DragState = {
  itemId: string;
  mode: "move" | "resize";
  edge?: string;
  startClientX: number;
  startClientY: number;
  original: CardPrintLayoutItem;
};

type A4TemplateRendererProps = {
  layout: CardPrintLayout;
  fields: FormFieldRead[];
  mode: A4TemplateMode;
  zoom: number;
  showGrid: boolean;
  showTechnicalData: boolean;
  fieldValues?: Record<string, unknown>;
  metadataValues?: Record<string, string>;
  selectedItemId?: string | null;
  onSelectItem?: (itemId: string | null) => void;
  onChangeLayout?: (layout: CardPrintLayout) => void;
  onDropField?: (fieldId: string, point: { x_mm: number; y_mm: number }) => void;
};

const A4_FIELD_DRAG_TYPE = "application/x-reg-engine-field-id";

const RESIZE_HANDLES = [
  "top-left",
  "top",
  "top-right",
  "right",
  "bottom-right",
  "bottom",
  "bottom-left",
  "left",
];

export function A4TemplateRenderer({
  layout,
  fields,
  mode,
  zoom,
  showGrid,
  showTechnicalData,
  fieldValues = {},
  metadataValues = {},
  selectedItemId = null,
  onSelectItem,
  onChangeLayout,
  onDropField,
}: A4TemplateRendererProps) {
  const normalizedLayout = useMemo(() => normalizeLayoutGeometry(layout), [layout]);
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [copiedItem, setCopiedItem] = useState<CardPrintLayoutItem | null>(null);
  const scale = DEFAULT_PX_PER_MM * zoom;
  const interactive = mode === "design";
  const selectedItem = normalizedLayout.items.find((item) => item.id === selectedItemId) ?? null;

  const updateItem = useCallback(
    (nextItem: CardPrintLayoutItem) => {
      if (!onChangeLayout) {
        return;
      }
      onChangeLayout({
        ...normalizedLayout,
        items: normalizedLayout.items.map((item) => (item.id === nextItem.id ? nextItem : item)),
      });
    },
    [normalizedLayout, onChangeLayout],
  );

  useEffect(() => {
    if (!dragState || !onChangeLayout) {
      return undefined;
    }
    const currentDrag = dragState;
    function handlePointerMove(event: PointerEvent) {
      const deltaX = (event.clientX - currentDrag.startClientX) / scale;
      const deltaY = (event.clientY - currentDrag.startClientY) / scale;
      updateItem(
        currentDrag.mode === "resize"
          ? resizeItemByMm(
              currentDrag.original,
              normalizedLayout,
              currentDrag.edge ?? "right",
              deltaX,
              deltaY,
            )
          : moveItemByMm(currentDrag.original, normalizedLayout, deltaX, deltaY),
      );
    }
    function handlePointerUp() {
      setDragState(null);
    }
    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
    };
  }, [dragState, normalizedLayout, onChangeLayout, scale, updateItem]);

  function handleCanvasKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!interactive || !selectedItem || !onChangeLayout) {
      return;
    }
    const keyMap: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    if (event.key in keyMap) {
      const [x, y] = keyMap[event.key];
      const step = event.shiftKey ? 5 : 1;
      event.preventDefault();
      updateItem(moveItemByMm(selectedItem, normalizedLayout, x * step, y * step));
    }
    if (event.key === "Delete") {
      event.preventDefault();
      onChangeLayout({
        ...normalizedLayout,
        items: normalizedLayout.items.filter((item) => item.id !== selectedItem.id),
      });
      onSelectItem?.(null);
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
      event.preventDefault();
      setCopiedItem(selectedItem);
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v" && copiedItem) {
      event.preventDefault();
      const pasted = moveItemByMm(
        { ...copiedItem, id: nextDuplicateId(copiedItem.id, normalizedLayout.items) },
        normalizedLayout,
        5,
        5,
      );
      onChangeLayout({ ...normalizedLayout, items: [...normalizedLayout.items, pasted] });
      onSelectItem?.(pasted.id);
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
      event.preventDefault();
      const duplicate = moveItemByMm(
        { ...selectedItem, id: nextDuplicateId(selectedItem.id, normalizedLayout.items) },
        normalizedLayout,
        5,
        5,
      );
      onChangeLayout({ ...normalizedLayout, items: [...normalizedLayout.items, duplicate] });
      onSelectItem?.(duplicate.id);
    }
  }

  function handleCanvasDragOver(event: DragEvent<HTMLDivElement>) {
    if (!interactive || !onDropField) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleCanvasDrop(event: DragEvent<HTMLDivElement>) {
    if (!interactive || !onDropField) {
      return;
    }
    const fieldId = event.dataTransfer.getData(A4_FIELD_DRAG_TYPE);
    if (!fieldId) {
      return;
    }
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    onDropField(fieldId, {
      x_mm: Math.max(0, (event.clientX - rect.left) / scale),
      y_mm: Math.max(0, (event.clientY - rect.top) / scale),
    });
  }

  return (
    <div className="a4-template-workspace">
      <div className="a4-ruler a4-ruler-horizontal" aria-hidden="true">
        {Array.from({ length: 22 }, (_, index) => (
          <span key={index} style={{ left: `${index * 10 * scale}px` }}>
            {index * 10}
          </span>
        ))}
      </div>
      <div className="a4-ruler a4-ruler-vertical" aria-hidden="true">
        {Array.from({ length: 30 }, (_, index) => (
          <span key={index} style={{ top: `${index * 10 * scale}px` }}>
            {index * 10}
          </span>
        ))}
      </div>
      <div className="a4-page-shell">
        <div
          aria-label="A4 канвас печатного шаблона"
          className={[
            "a4-page",
            showGrid && mode === "design" ? "a4-page--grid" : "",
            interactive ? "a4-page--interactive" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          style={
            {
              "--a4-scale": scale,
              "--a4-grid-x": `${((A4_WIDTH_MM - 24) / 12) * scale}px`,
              "--a4-grid-y": `${8 * scale}px`,
              width: `${A4_WIDTH_MM * scale}px`,
              height: `${A4_HEIGHT_MM * scale}px`,
            } as CSSProperties
          }
          tabIndex={interactive ? 0 : undefined}
          onKeyDown={handleCanvasKeyDown}
          onDragOver={handleCanvasDragOver}
          onDrop={handleCanvasDrop}
          onClick={(event) => {
            if (event.currentTarget === event.target) {
              onSelectItem?.(null);
            }
          }}
        >
          <div className="a4-page-margin" aria-hidden="true" />
          {normalizedLayout.items.map((item) => (
            <A4TemplateElement
              key={item.id}
              item={item}
              field={fields.find((field) => field.id === item.field_id) ?? null}
              value={item.field_id ? fieldValues[item.field_id] : undefined}
              metadataValues={metadataValues}
              scale={scale}
              mode={mode}
              showTechnicalData={showTechnicalData}
              selected={selectedItemId === item.id}
              hovered={hoveredItemId === item.id}
              onSelect={() => onSelectItem?.(item.id)}
              onHover={(hovered) => setHoveredItemId(hovered ? item.id : null)}
              onDragStart={(event) => {
                if (!interactive) {
                  return;
                }
                event.preventDefault();
                onSelectItem?.(item.id);
                setDragState({
                  itemId: item.id,
                  mode: "move",
                  startClientX: event.clientX,
                  startClientY: event.clientY,
                  original: ensureItemGeometry(item, normalizedLayout),
                });
              }}
              onResizeStart={(event, edge) => {
                if (!interactive) {
                  return;
                }
                event.preventDefault();
                event.stopPropagation();
                onSelectItem?.(item.id);
                setDragState({
                  itemId: item.id,
                  mode: "resize",
                  edge,
                  startClientX: event.clientX,
                  startClientY: event.clientY,
                  original: ensureItemGeometry(item, normalizedLayout),
                });
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function A4TemplateElement({
  item,
  field,
  value,
  metadataValues,
  scale,
  mode,
  showTechnicalData,
  selected,
  hovered,
  onSelect,
  onHover,
  onDragStart,
  onResizeStart,
}: {
  item: CardPrintLayoutItem;
  field: FormFieldRead | null;
  value: unknown;
  metadataValues: Record<string, string>;
  scale: number;
  mode: A4TemplateMode;
  showTechnicalData: boolean;
  selected: boolean;
  hovered: boolean;
  onSelect: () => void;
  onHover: (hovered: boolean) => void;
  onDragStart: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onResizeStart: (event: React.PointerEvent<HTMLSpanElement>, edge: string) => void;
}) {
  const rect = itemRectFromMm(item);
  const style = item.style ?? {};
  const contentStyle: CSSProperties = {
    fontFamily: style.font_family || undefined,
    fontSize: `${style.font_size || (item.kind === "heading" ? 14 : 10)}px`,
    fontWeight: style.bold || item.kind === "heading" ? 700 : 400,
    fontStyle: style.italic ? "italic" : undefined,
    textAlign: style.align || (item.kind === "heading" ? "center" : "left"),
    color: style.text_color || undefined,
    backgroundColor: style.background_color || undefined,
    borderColor: style.border === "none" ? "transparent" : style.border_color || undefined,
    borderWidth: style.border === "medium" ? 2 : style.border === "none" ? 0 : 1,
    padding: `${(style.padding_mm ?? 1.5) * scale}px`,
    alignContent:
      style.vertical_align === "bottom"
        ? "end"
        : style.vertical_align === "middle"
          ? "center"
          : "start",
  };
  const label = item.label || field?.label || item.text || "Элемент";
  const displayValue =
    value !== undefined ? formatRendererValue(value) : itemDisplayText(item, field, metadataValues);
  const showLabel = item.kind === "field" && item.show_label !== false;
  const technicalText = showTechnicalData && field ? field.code : null;
  const readonly = mode !== "design";

  return (
    <button
      type="button"
      className={[
        "a4-template-element",
        `a4-template-element--${item.kind}`,
        selected ? "is-selected" : "",
        hovered ? "is-hovered" : "",
        readonly ? "is-readonly" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ ...itemStyleFromMm(item, scale), ...contentStyle }}
      title={technicalText ? `Технический код: ${technicalText}` : undefined}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      onPointerDown={onDragStart}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      {item.kind === "line" || item.kind === "divider" ? (
        <span className="a4-template-line" aria-hidden="true" />
      ) : (
        <>
          {showLabel && (
            <strong
              className={`a4-template-label a4-template-label--${style.label_position || "top"}`}
            >
              <span className="a4-template-field-icon" aria-hidden="true">
                {fieldTypeIcon(field)}
              </span>
              {label}
            </strong>
          )}
          <span className="a4-template-value">{displayValue}</span>
          {technicalText && (
            <small className="a4-template-technical">Технический код: {technicalText}</small>
          )}
        </>
      )}
      {mode === "design" && selected && (
        <span className="a4-resize-handles" aria-hidden="true">
          {RESIZE_HANDLES.map((edge) => (
            <span
              key={edge}
              className={`a4-resize-handle a4-resize-handle--${edge}`}
              onPointerDown={(event) => onResizeStart(event, edge)}
            />
          ))}
        </span>
      )}
      {showTechnicalData && (
        <small className="a4-template-rect">
          {rect.x_mm} x {rect.y_mm} мм
        </small>
      )}
    </button>
  );
}

function formatRendererValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  if (typeof value === "boolean") {
    return value ? "Да" : "Нет";
  }
  if (Array.isArray(value)) {
    return value.map(formatRendererValue).join(", ");
  }
  if (typeof value === "object") {
    const label =
      "label" in value && typeof value.label === "string"
        ? value.label
        : "title" in value && typeof value.title === "string"
          ? value.title
          : null;
    return label ?? JSON.stringify(value);
  }
  return String(value);
}

function nextDuplicateId(itemId: string, items: CardPrintLayoutItem[]) {
  const used = new Set(items.map((item) => item.id));
  let index = 1;
  let candidate = `${itemId}-copy`;
  while (used.has(candidate)) {
    index += 1;
    candidate = `${itemId}-copy-${index}`;
  }
  return candidate;
}
