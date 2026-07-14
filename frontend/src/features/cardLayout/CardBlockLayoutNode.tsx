import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";

import type {
  CardTemplateFormLayoutSectionRead,
  FormBlockRead,
  FormFieldRead,
  ReferenceListRead,
} from "@/api/types";
import type { FieldEditorFileRefOption } from "@/features/cards/FieldEditorControl";
import type { FieldEditorOption, FieldEditorState } from "@/features/cards/fieldEditorUtils";

import { CardFieldLayoutNode, type CardLayoutFieldRenderContext } from "./CardFieldLayoutNode";
import type { BlockOrderDirection } from "./blockOrdering";
import type {
  CardLayoutBlockActionsRenderer,
  CardLayoutBlockRenderContext,
  CardLayoutBlockPresentation,
  CardLayoutFieldActivationHandler,
  CardLayoutFieldActivationRenderer,
  CardLayoutFieldPresentationLayout,
  CardLayoutFieldPresentationRenderer,
  CardLayoutRendererMode,
  CardLayoutSelection,
} from "./CardLayoutRenderer";
import { InlineBlockEditor } from "./InlineBlockEditor";
import type { InlineReferenceEditorContext } from "./InlineReferenceEditor";
import { snapQuarterRect } from "./layoutGeometry";
import type { LayoutRect, ResizeHandle } from "./layoutGeometry";
import type { LayoutGeometryControls, LayoutGeometryTarget } from "./useLayoutGeometrySession";

export type CardBlockLayoutNodeProps = {
  section: CardTemplateFormLayoutSectionRead;
  block: FormBlockRead | null;
  fieldsById: ReadonlyMap<string, FormFieldRead>;
  mode: CardLayoutRendererMode;
  selection: CardLayoutSelection;
  renderedValues?: Readonly<Record<string, ReactNode>>;
  fieldValues?: Readonly<Record<string, unknown>>;
  fieldOptions?: Readonly<Record<string, FieldEditorOption[]>>;
  fileRefOptions?: Readonly<Record<string, FieldEditorFileRefOption[]>>;
  referenceLists?: ReferenceListRead[];
  inlineReferenceEditorContext?: InlineReferenceEditorContext;
  compactBlockHeight?: boolean;
  showGeometryDiagnostics?: boolean;
  testIdPrefix?: string;
  renderFieldValue?: (context: CardLayoutFieldRenderContext) => ReactNode;
  renderBlockActions?: CardLayoutBlockActionsRenderer;
  blockPresentation?: CardLayoutBlockPresentation;
  fieldPresentation?: CardLayoutFieldPresentationRenderer;
  fieldPresentationLayout?: CardLayoutFieldPresentationLayout;
  canActivateField?: CardLayoutFieldActivationRenderer;
  onActivateField?: CardLayoutFieldActivationHandler;
  canActivateBlock?: (context: CardLayoutBlockRenderContext) => boolean;
  onActivateBlock?: (context: CardLayoutBlockRenderContext) => void;
  onSelect: (selection: CardLayoutSelection) => void;
  onCreateField?: (blockId: string) => void;
  onCommitBlock?: (block: FormBlockRead) => boolean | void | Promise<boolean | void>;
  onCancelBlock?: (blockId: string) => void;
  onCommitField?: (field: FormFieldRead) => boolean | void | Promise<boolean | void>;
  onCancelField?: (fieldId: string) => void;
  onFieldValueChange?: (field: FormFieldRead, value: FieldEditorState) => void;
  geometry?: LayoutGeometryControls;
  onMoveBlock?: (sectionId: string, direction: BlockOrderDirection) => void;
  canMoveBlockUp?: boolean;
  canMoveBlockDown?: boolean;
  blockOrderingDisabled?: boolean;
};

export function CardBlockLayoutNode({
  section,
  block,
  fieldsById,
  mode,
  selection,
  renderedValues,
  fieldValues,
  fieldOptions,
  fileRefOptions,
  referenceLists,
  inlineReferenceEditorContext,
  compactBlockHeight = true,
  showGeometryDiagnostics = false,
  testIdPrefix = "layout",
  renderFieldValue,
  renderBlockActions,
  blockPresentation,
  fieldPresentation,
  fieldPresentationLayout,
  canActivateField,
  onActivateField,
  canActivateBlock,
  onActivateBlock,
  onSelect,
  onCreateField,
  onCommitBlock,
  onCancelBlock,
  onCommitField,
  onCancelField,
  onFieldValueChange,
  geometry,
  onMoveBlock,
  canMoveBlockUp = false,
  canMoveBlockDown = false,
  blockOrderingDisabled = false,
}: CardBlockLayoutNodeProps) {
  const nodeId = block?.id ?? section.id;
  const designMode = mode === "design";
  const geometryActive = Boolean(geometry?.session);
  const geometryTarget =
    geometry?.session?.targetKind === "block" && geometry.session.targetId === section.id;
  const schemaEditing =
    designMode &&
    !geometryActive &&
    Boolean(onCommitBlock) &&
    selection?.kind === "block" &&
    selection.id === nodeId;
  const valueEditing =
    mode === "block-edit" && selection?.kind === "block" && selection.id === nodeId;
  const blockActivationContext = block ? { block, section, mode } : null;
  const blockActivatable = Boolean(
    blockActivationContext &&
    !designMode &&
    !valueEditing &&
    canActivateBlock?.(blockActivationContext) &&
    onActivateBlock,
  );
  const occupiedRowCount = section.items.reduce(
    (lastRow, item) => Math.max(lastRow, item.row + item.row_span - 1),
    1,
  );
  const visibleRowCount = compactBlockHeight ? occupiedRowCount : 4;
  const style: CSSProperties = {
    gridColumn: `${section.column} / span ${section.column_span}`,
    gridRow: `${section.row} / span ${section.row_span}`,
    position: "relative",
    alignSelf: compactBlockHeight ? "start" : undefined,
  };
  const geometryTargetDescriptor: LayoutGeometryTarget = {
    targetId: section.id,
    targetKind: "block",
    original: toLayoutRect(section),
  };
  const completionDescriptionId = blockPresentation?.description
    ? `${testIdPrefix}-block-${section.id}-completion`
    : undefined;

  return (
    <section
      className={`card-layout-block-node${schemaEditing || valueEditing ? " is-editing" : ""}${blockActivatable ? " is-activatable" : ""}${blockPresentation?.state ? ` is-${blockPresentation.state}` : ""}`}
      id={blockPresentation?.anchorId}
      data-layout-block-id={nodeId}
      data-layout-block-activatable={blockActivatable || undefined}
      data-testid={`${testIdPrefix}-block-${section.id}`}
      style={style}
      aria-describedby={completionDescriptionId}
      aria-label={block ? `Блок ${block.title}` : "Недоступный блок"}
      onClick={(event) => {
        event.stopPropagation();
        if (blockActivatable && blockActivationContext && !isInteractiveTarget(event.target)) {
          onActivateBlock?.(blockActivationContext);
        }
      }}
    >
      {completionDescriptionId ? (
        <span id={completionDescriptionId} className="card-layout-presentation-description">
          {blockPresentation?.description}
        </span>
      ) : null}
      {schemaEditing && block && onCommitBlock ? (
        <InlineBlockEditor
          block={block}
          onCommit={(draft) => {
            onSelect(null);
            void Promise.resolve(onCommitBlock(draft))
              .then((saved) => {
                if (saved === false) onSelect({ kind: "block", id: block.id });
              })
              .catch(() => onSelect({ kind: "block", id: block.id }));
          }}
          onCancel={() => {
            onCancelBlock?.(block.id);
            onSelect(null);
          }}
        />
      ) : (
        <>
          <header className="card-layout-block-header">
            <div>
              <strong>{block?.title ?? "Блок недоступен"}</strong>
              {block?.is_repeatable ? <small>Повторяемый блок</small> : null}
            </div>
            {block && designMode && !geometryActive && (onCommitBlock || onMoveBlock) ? (
              <div className="row-actions">
                {onCommitBlock ? (
                  <button
                    type="button"
                    className="ghost-button"
                    aria-label={`Изменить блок ${block.title}`}
                    onClick={() => onSelect({ kind: "block", id: block.id })}
                  >
                    Изменить блок
                  </button>
                ) : null}
                {onMoveBlock ? (
                  <span
                    className="card-layout-block-order-actions"
                    aria-label={`Порядок блока ${block.title}`}
                  >
                    {canMoveBlockUp ? (
                      <button
                        type="button"
                        className="ghost-button card-layout-block-order-button"
                        aria-label={`Переместить блок ${block.title} вверх`}
                        disabled={blockOrderingDisabled}
                        onClick={() => onMoveBlock(section.id, "up")}
                      >
                        ↑
                      </button>
                    ) : null}
                    {canMoveBlockDown ? (
                      <button
                        type="button"
                        className="ghost-button card-layout-block-order-button"
                        aria-label={`Переместить блок ${block.title} вниз`}
                        disabled={blockOrderingDisabled}
                        onClick={() => onMoveBlock(section.id, "down")}
                      >
                        ↓
                      </button>
                    ) : null}
                  </span>
                ) : null}
              </div>
            ) : null}
            {block && !designMode ? renderBlockActions?.({ block, section, mode }) : null}
          </header>
          <div
            className="card-layout-field-grid card-layout-responsive-field-grid"
            data-layout-grid="fields"
            data-layout-grid-rows={visibleRowCount}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
              gridTemplateRows: `repeat(${visibleRowCount}, minmax(3rem, auto))`,
              minHeight: `${visibleRowCount * 3}rem`,
            }}
          >
            {rowMajor(section.items).map((item) => {
              const field = item.field_id ? (fieldsById.get(item.field_id) ?? null) : null;
              const valueKey = field?.id ?? item.id;
              const value = fieldValues?.[valueKey];
              return (
                <CardFieldLayoutNode
                  key={item.id}
                  item={item}
                  field={field}
                  mode={mode}
                  selection={selection}
                  valueEditing={valueEditing}
                  renderedValue={renderedValues?.[valueKey]}
                  value={value}
                  options={fieldOptions?.[valueKey]}
                  fileRefOptions={fileRefOptions?.[valueKey]}
                  referenceLists={referenceLists}
                  inlineReferenceEditorContext={inlineReferenceEditorContext}
                  showGeometryDiagnostics={showGeometryDiagnostics}
                  testIdPrefix={testIdPrefix}
                  renderFieldValue={renderFieldValue}
                  presentation={
                    field ? fieldPresentation?.({ field, item, value, mode }) : undefined
                  }
                  fieldPresentationLayout={fieldPresentationLayout}
                  canActivateField={canActivateField}
                  onActivateField={onActivateField}
                  onSelect={onSelect}
                  onCommitField={onCommitField}
                  onCancelField={onCancelField}
                  onFieldValueChange={onFieldValueChange}
                  geometry={geometry}
                />
              );
            })}
          </div>
          {block && designMode && !geometryActive && onCreateField ? (
            <footer className="card-layout-block-footer">
              <button
                type="button"
                className="ghost-button"
                aria-label={`Создать поле в блоке ${block.title}`}
                onClick={() => onCreateField(block.id)}
              >
                Создать поле
              </button>
            </footer>
          ) : null}
        </>
      )}
      {showGeometryDiagnostics && !designMode ? (
        <small
          className="card-layout-geometry-diagnostic"
          data-testid={`${testIdPrefix}-block-${section.id}-geometry`}
          aria-label={`Размер блока: ${section.column_span} из 12 по ширине, ${section.row_span} из 4 по высоте`}
        >
          {section.column_span} × {section.row_span}
        </small>
      ) : null}
      {geometryTarget && !designMode ? (
        <small
          className="card-layout-geometry-dimension-badge"
          data-testid={`${testIdPrefix}-block-${section.id}-active-geometry`}
        >
          Размер: {section.column_span} из 12 × {section.row_span} из 4
        </small>
      ) : null}
      {geometry && !designMode && (!geometryActive || geometryTarget) && !schemaEditing ? (
        <LayoutGeometryAffordances
          kindLabel="блока"
          objectLabel={block?.title ?? "Недоступный блок"}
          target={geometryTargetDescriptor}
          geometry={geometry}
          gridSelector="[data-layout-grid='canvas']"
        />
      ) : null}
    </section>
  );
}

const RESIZE_HANDLE_LABELS: Record<ResizeHandle, string> = {
  "top-left": "верхний левый угол",
  top: "верхняя сторона",
  "top-right": "верхний правый угол",
  right: "правая сторона",
  "bottom-right": "нижний правый угол",
  bottom: "нижняя сторона",
  "bottom-left": "нижний левый угол",
  left: "левая сторона",
};

const RESIZE_HANDLE_STYLES: Record<ResizeHandle, CSSProperties> = {
  "top-left": { left: -6, top: -6, cursor: "nwse-resize" },
  top: { left: "50%", top: -6, transform: "translateX(-50%)", cursor: "ns-resize" },
  "top-right": { right: -6, top: -6, cursor: "nesw-resize" },
  right: { right: -6, top: "50%", transform: "translateY(-50%)", cursor: "ew-resize" },
  "bottom-right": { bottom: -6, right: -6, cursor: "nwse-resize" },
  bottom: { bottom: -6, left: "50%", transform: "translateX(-50%)", cursor: "ns-resize" },
  "bottom-left": { bottom: -6, left: -6, cursor: "nesw-resize" },
  left: { left: -6, top: "50%", transform: "translateY(-50%)", cursor: "ew-resize" },
};

function LayoutGeometryAffordances({
  kindLabel,
  objectLabel,
  target,
  geometry,
  gridSelector,
}: {
  kindLabel: "блока";
  objectLabel: string;
  target: LayoutGeometryTarget;
  geometry: LayoutGeometryControls;
  gridSelector: string;
}) {
  function gridFor(event: ReactPointerEvent<HTMLElement>) {
    return event.currentTarget.closest<HTMLElement>(gridSelector);
  }
  const resizeHandles: ResizeHandle[] = geometry.session
    ? (Object.keys(RESIZE_HANDLE_LABELS) as ResizeHandle[])
    : ["bottom-right"];

  return (
    <span className="card-layout-geometry-affordances">
      {resizeHandles.map((handle) => (
        <button
          key={handle}
          type="button"
          className={`card-layout-resize-handle is-${handle}`}
          aria-label={`Изменить размер ${kindLabel} ${objectLabel}: ${RESIZE_HANDLE_LABELS[handle]}`}
          title={`Изменить размер: ${RESIZE_HANDLE_LABELS[handle]}`}
          style={{
            position: "absolute",
            width: 12,
            height: 12,
            padding: 0,
            zIndex: 2,
            ...RESIZE_HANDLE_STYLES[handle],
          }}
          onPointerDown={(event) => {
            const grid = gridFor(event);
            if (grid) geometry.beginResize(event, target, handle, grid);
          }}
          onPointerMove={geometry.pointerMove}
          onPointerUp={geometry.pointerUp}
          onPointerCancel={geometry.pointerCancel}
          onLostPointerCapture={geometry.lostPointerCapture}
        />
      ))}
    </span>
  );
}

function toLayoutRect(rect: {
  row: number;
  column: number;
  row_span: number;
  column_span: number;
}): LayoutRect {
  return snapQuarterRect({
    row: rect.row,
    column: rect.column,
    rowSpan: rect.row_span,
    columnSpan: rect.column_span,
  });
}

function rowMajor<T extends { row: number; column: number }>(items: T[]): T[] {
  return [...items].sort((left, right) => left.row - right.row || left.column - right.column);
}

function isInteractiveTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(
      target.closest("a, button, input, select, textarea, summary, [role='button'], [role='link']"),
    )
  );
}
