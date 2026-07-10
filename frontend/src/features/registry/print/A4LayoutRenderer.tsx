import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
} from "react";

import type {
  CardPrintLayout,
  CardPrintLayoutItem,
  CardPrintOverlayItem,
  CardTemplateLayoutRead,
  FormBlockRead,
  FormFieldRead,
} from "@/api/types";
import { CardLayoutRenderer } from "@/features/cardLayout/CardLayoutRenderer";

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
import {
  A4_BLOCK_DRAG_TYPE,
  A4_FIELD_DRAG_TYPE,
  clearA4DragPayload,
  decodeA4DragPayload,
  getA4DragPayload,
} from "./a4DragPayload";

type DragState = {
  itemId: string;
  mode: "move" | "resize";
  edge?: string;
  startClientX: number;
  startClientY: number;
  original: CardPrintLayoutItem;
};

export type A4LayoutRendererProps = {
  layout: CardPrintLayout;
  fields: FormFieldRead[];
  blocks?: FormBlockRead[];
  mode: A4RendererMode;
  zoom: number;
  showGrid: boolean;
  showTechnicalData: boolean;
  fieldValues?: Record<string, unknown>;
  metadataValues?: Record<string, string>;
  linkedCardLayout?: CardTemplateLayoutRead;
  selectedItemId?: string | null;
  onSelectItem?: (itemId: string | null) => void;
  onChangeLayout?: (layout: CardPrintLayout) => void;
  onDropField?: (fieldId: string, point: { x_mm: number; y_mm: number }) => void;
  onDropBlock?: (blockId: string, point: { x_mm: number; y_mm: number }) => void;
};

export type A4RendererMode = "design" | "preview" | "fill" | "readonly";

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

export function A4LayoutRenderer({
  layout,
  fields,
  mode,
  zoom,
  showGrid,
  showTechnicalData,
  fieldValues = {},
  metadataValues = {},
  linkedCardLayout,
  selectedItemId = null,
  onSelectItem,
  onChangeLayout,
  onDropField,
  onDropBlock,
}: A4LayoutRendererProps) {
  const normalizedLayout = useMemo(() => normalizeLayoutGeometry(layout), [layout]);
  const renderedItems = useMemo(
    () => mergeLayoutItemsAndOverlays(normalizedLayout),
    [normalizedLayout],
  );
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [copiedItem, setCopiedItem] = useState<CardPrintLayoutItem | null>(null);
  const scale = DEFAULT_PX_PER_MM * zoom;
  const interactive = mode === "design";
  const effectiveShowTechnicalData = showTechnicalData && interactive;
  const selectedItem = renderedItems.find((item) => item.id === selectedItemId) ?? null;

  const updateItem = useCallback(
    (nextItem: CardPrintLayoutItem) => {
      if (!onChangeLayout) {
        return;
      }
      const overlayItem = normalizedLayout.overlays?.some((item) => item.id === nextItem.id);
      onChangeLayout(
        overlayItem
          ? {
              ...normalizedLayout,
              overlays: normalizedLayout.overlays?.map((item) =>
                item.id === nextItem.id ? printItemAsOverlay(nextItem) : item,
              ),
            }
          : {
              ...normalizedLayout,
              items: normalizedLayout.items.map((item) =>
                item.id === nextItem.id ? nextItem : item,
              ),
            },
      );
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
      updateItem(
        event.shiftKey
          ? resizeItemByMm(selectedItem, normalizedLayout, "bottom-right", x * step, y * step)
          : moveItemByMm(selectedItem, normalizedLayout, x * step, y * step),
      );
    }
    if (event.key === "Delete") {
      event.preventDefault();
      if (selectedItem.kind === "card_layout") return;
      onChangeLayout({
        ...normalizedLayout,
        items: normalizedLayout.items.filter((item) => item.id !== selectedItem.id),
        overlays: normalizedLayout.overlays?.filter((item) => item.id !== selectedItem.id),
      });
      onSelectItem?.(null);
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
      event.preventDefault();
      if (selectedItem.kind === "card_layout") return;
      setCopiedItem(selectedItem);
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v" && copiedItem) {
      event.preventDefault();
      if (copiedItem.kind === "card_layout") return;
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
      if (selectedItem.kind === "card_layout") return;
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
    if (!interactive || (!onDropField && !onDropBlock)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleCanvasDrop(event: DragEvent<HTMLDivElement>) {
    if (!interactive || (!onDropField && !onDropBlock)) {
      return;
    }
    const plainPayload = event.dataTransfer.getData("text/plain");
    const decodedPayload = decodeA4DragPayload(plainPayload) ?? getA4DragPayload();
    const fieldId =
      event.dataTransfer.getData(A4_FIELD_DRAG_TYPE) ||
      (decodedPayload?.kind === "field" ? decodedPayload.id : "");
    const blockId =
      event.dataTransfer.getData(A4_BLOCK_DRAG_TYPE) ||
      (decodedPayload?.kind === "block" ? decodedPayload.id : "");
    if (!fieldId && !blockId) {
      return;
    }
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const point = {
      x_mm: Math.max(0, (event.clientX - rect.left) / scale),
      y_mm: Math.max(0, (event.clientY - rect.top) / scale),
    };
    if (fieldId) {
      onDropField?.(fieldId, point);
      clearA4DragPayload();
      return;
    }
    onDropBlock?.(blockId, point);
    clearA4DragPayload();
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
          {renderedItems.map((item) => (
            <A4TemplateElement
              key={item.id}
              item={item}
              field={fields.find((field) => field.id === item.field_id) ?? null}
              value={item.field_id ? fieldValues[item.field_id] : undefined}
              metadataValues={metadataValues}
              linkedCardLayout={linkedCardLayout}
              scale={scale}
              mode={mode}
              showTechnicalData={effectiveShowTechnicalData}
              selected={selectedItemId === item.id}
              hovered={hoveredItemId === item.id}
              onSelect={interactive && onSelectItem ? () => onSelectItem(item.id) : undefined}
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
  linkedCardLayout,
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
  linkedCardLayout?: CardTemplateLayoutRead;
  scale: number;
  mode: A4RendererMode;
  showTechnicalData: boolean;
  selected: boolean;
  hovered: boolean;
  onSelect?: () => void;
  onHover: (hovered: boolean) => void;
  onDragStart: (event: React.PointerEvent<HTMLElement>) => void;
  onResizeStart: (event: React.PointerEvent<HTMLElement>, edge: string) => void;
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
  const interactive = mode === "design" && Boolean(onSelect);

  if (item.kind === "card_layout" && linkedCardLayout) {
    return (
      <div
        className={[
          "a4-template-element",
          "a4-template-element--card_layout",
          selected ? "is-selected" : "",
          hovered ? "is-hovered" : "",
          readonly ? "is-readonly" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        data-testid="a4-linked-card-item"
        style={{ ...itemStyleFromMm(item, scale), ...contentStyle }}
        onClick={
          interactive
            ? (event) => {
                event.stopPropagation();
                onSelect?.();
              }
            : undefined
        }
        onMouseEnter={interactive ? () => onHover(true) : undefined}
        onMouseLeave={interactive ? () => onHover(false) : undefined}
      >
        <div className="a4-linked-card-renderer">
          <CardLayoutRenderer
            layout={linkedCardLayout}
            mode="preview"
            responsive={false}
            compactBlockHeight={false}
          />
        </div>
        {mode === "design" ? (
          <button
            type="button"
            className="a4-linked-card-move-handle"
            aria-label="Переместить связанный макет карточки"
            onPointerDown={(event) => {
              event.stopPropagation();
              onDragStart(event);
            }}
          >
            ⠿
          </button>
        ) : null}
        {mode === "design" && selected ? (
          <span className="a4-resize-handles">
            {RESIZE_HANDLES.map((edge) => (
              <button
                key={edge}
                type="button"
                className={`a4-resize-handle a4-resize-handle--${edge}`}
                aria-label={`Изменить размер связанного макета карточки: ${resizeHandleLabel(edge)}`}
                onPointerDown={(event) => onResizeStart(event, edge)}
              />
            ))}
          </span>
        ) : null}
      </div>
    );
  }

  const elementClassName = [
    "a4-template-element",
    `a4-template-element--${item.kind}`,
    selected ? "is-selected" : "",
    hovered ? "is-hovered" : "",
    readonly ? "is-readonly" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const elementContent = (
    <>
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
      {showTechnicalData && (
        <small className="a4-template-rect">
          {rect.x_mm} x {rect.y_mm} мм
        </small>
      )}
    </>
  );

  if (readonly) {
    return (
      <div
        className={elementClassName}
        style={{ ...itemStyleFromMm(item, scale), ...contentStyle }}
        title={technicalText ? `Технический код: ${technicalText}` : undefined}
      >
        {elementContent}
      </div>
    );
  }

  return (
    <div
      className={elementClassName}
      style={{ ...itemStyleFromMm(item, scale), ...contentStyle }}
      title={technicalText ? `Технический код: ${technicalText}` : undefined}
      onClick={(event) => {
        event.stopPropagation();
        onSelect?.();
      }}
      onPointerDown={onDragStart}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      {elementContent}
      <button
        type="button"
        className="a4-linked-card-move-handle"
        aria-label={`Переместить элемент ${label}`}
        onFocus={() => onSelect?.()}
        onPointerDown={(event) => {
          event.stopPropagation();
          onDragStart(event);
        }}
      >
        ⠿
      </button>
      {selected ? (
        <span className="a4-resize-handles">
          {RESIZE_HANDLES.map((edge) => (
            <button
              key={edge}
              type="button"
              className={`a4-resize-handle a4-resize-handle--${edge}`}
              aria-label={`Изменить размер элемента ${label}: ${resizeHandleLabel(edge)}`}
              onPointerDown={(event) => onResizeStart(event, edge)}
            />
          ))}
        </span>
      ) : null}
    </div>
  );
}

function resizeHandleLabel(edge: string) {
  const labels: Record<string, string> = {
    "top-left": "верхний левый угол",
    top: "верхняя сторона",
    "top-right": "верхний правый угол",
    right: "правая сторона",
    "bottom-right": "нижний правый угол",
    bottom: "нижняя сторона",
    "bottom-left": "нижний левый угол",
    left: "левая сторона",
  };
  return labels[edge] ?? edge;
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

function mergeLayoutItemsAndOverlays(layout: CardPrintLayout): CardPrintLayoutItem[] {
  const seen = new Set(layout.items.map((item) => item.id));
  return [
    ...layout.items,
    ...(layout.overlays ?? [])
      .filter((overlay) => !seen.has(overlay.id))
      .map((overlay) => overlayAsPrintItem(overlay)),
  ];
}

function overlayAsPrintItem(overlay: CardPrintOverlayItem): CardPrintLayoutItem {
  return {
    ...overlay,
    row: 1,
    column: 1,
    row_span: 1,
    column_span: 1,
  };
}

function printItemAsOverlay(item: CardPrintLayoutItem): CardPrintOverlayItem {
  return {
    id: item.id,
    kind: item.kind as CardPrintOverlayItem["kind"],
    page: item.page,
    x_mm: item.x_mm ?? 0,
    y_mm: item.y_mm ?? 0,
    width_mm: item.width_mm ?? 1,
    height_mm: item.height_mm ?? 1,
    text: item.text,
    style: item.style,
  };
}
