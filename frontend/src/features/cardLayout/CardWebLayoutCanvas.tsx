import { useCallback, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import type { CardTemplateLayoutRead, FormBlockRead, FormFieldRead } from "@/api/types";
import type { FieldEditorFileRefOption } from "@/features/cards/FieldEditorControl";
import type { FieldEditorOption, FieldEditorState } from "@/features/cards/fieldEditorUtils";

import { CardBlockLayoutNode } from "./CardBlockLayoutNode";
import type { CardLayoutFieldRenderContext } from "./CardFieldLayoutNode";
import type { CardLayoutRendererMode, CardLayoutSelection } from "./CardLayoutRenderer";
import { LayoutLivePreview } from "./LayoutLivePreview";
import { rectsOverlap, snapQuarterRect } from "./layoutGeometry";
import type { LayoutRect } from "./layoutGeometry";
import { applyLayoutGeometryPreview, useLayoutGeometrySession } from "./useLayoutGeometrySession";
import type { LayoutGeometryCommand, LayoutGeometrySession } from "./useLayoutGeometrySession";

export type CardLayoutCreatePosition = {
  row: number;
  column: number;
  row_span: 1;
  column_span: 3;
};

export type CardWebLayoutCanvasProps = {
  layout: CardTemplateLayoutRead;
  blocks?: FormBlockRead[];
  fields?: FormFieldRead[];
  mode: CardLayoutRendererMode;
  selection?: CardLayoutSelection;
  renderedValues?: Readonly<Record<string, ReactNode>>;
  fieldValues?: Readonly<Record<string, unknown>>;
  fieldOptions?: Readonly<Record<string, FieldEditorOption[]>>;
  fileRefOptions?: Readonly<Record<string, FieldEditorFileRefOption[]>>;
  showGeometryDiagnostics?: boolean;
  renderFieldValue?: (context: CardLayoutFieldRenderContext) => ReactNode;
  onSelectionChange?: (selection: CardLayoutSelection) => void;
  onCreateBlock?: (position: CardLayoutCreatePosition) => void;
  onInsertBlock?: (position: CardLayoutCreatePosition) => void;
  onCreateField?: (blockId: string) => void;
  onCommitBlock?: (block: FormBlockRead) => void;
  onCancelBlock?: (blockId: string) => void;
  onCommitField?: (field: FormFieldRead) => void;
  onCancelField?: (fieldId: string) => void;
  onFieldValueChange?: (field: FormFieldRead, value: FieldEditorState) => void;
  onGeometryCommit?: (command: LayoutGeometryCommand) => void;
};

export function CardWebLayoutCanvas({ mode, ...props }: CardWebLayoutCanvasProps) {
  return <CardWebLayoutCanvasSession key={mode} mode={mode} {...props} />;
}

function CardWebLayoutCanvasSession({
  layout,
  blocks = layout.structure.blocks,
  fields = layout.structure.fields,
  mode,
  selection,
  renderedValues,
  fieldValues,
  fieldOptions,
  fileRefOptions,
  showGeometryDiagnostics = false,
  renderFieldValue,
  onSelectionChange,
  onCreateBlock,
  onInsertBlock,
  onCreateField,
  onCommitBlock,
  onCancelBlock,
  onCommitField,
  onCancelField,
  onFieldValueChange,
  onGeometryCommit,
}: CardWebLayoutCanvasProps) {
  const selectionControlled = selection !== undefined;
  const [uncontrolledSelection, setUncontrolledSelection] = useState<CardLayoutSelection>(null);
  const blocksById = useMemo(() => new Map(blocks.map((block) => [block.id, block])), [blocks]);
  const fieldsById = useMemo(() => new Map(fields.map((field) => [field.id, field])), [fields]);
  const designMode = mode === "design";
  const selectionMode = designMode || mode === "block-edit";
  const activeSelection: CardLayoutSelection = selectionMode
    ? selectionControlled
      ? selection
      : uncontrolledSelection
    : null;
  const semanticEditing =
    designMode &&
    (activeSelection?.kind === "block"
      ? Boolean(onCommitBlock)
      : activeSelection?.kind === "field"
        ? Boolean(onCommitField)
        : false);
  const emptyPosition = useMemo(() => firstEmptyQuarterCell(layout), [layout]);
  const validateGeometry = useCallback(
    (session: LayoutGeometrySession) => geometryError(layout, session),
    [layout],
  );
  const handleGeometryCommit = useCallback(
    (command: LayoutGeometryCommand) => onGeometryCommit?.(command),
    [onGeometryCommit],
  );
  const geometry = useLayoutGeometrySession({
    onCommit: handleGeometryCommit,
    validate: validateGeometry,
  });
  const geometryActive = Boolean(geometry.session);
  const geometryEnabled = designMode && Boolean(onGeometryCommit) && !semanticEditing;
  const displayLayout = useMemo(
    () => applyLayoutGeometryPreview(layout, geometry.session),
    [geometry.session, layout],
  );

  function select(nextSelection: CardLayoutSelection) {
    if (!selectionControlled) {
      setUncontrolledSelection(nextSelection);
    }
    onSelectionChange?.(nextSelection);
  }

  const canvasStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
    gridTemplateRows: "repeat(4, minmax(6rem, auto))",
  };

  return (
    <>
      <div
        className={`card-web-layout-canvas is-${mode}${geometryActive ? " is-geometry-active" : ""}`}
        data-testid="card-layout-canvas"
        data-layout-grid="canvas"
        style={canvasStyle}
      >
        {displayLayout.form_layout.sections.map((section) => (
          <CardBlockLayoutNode
            key={section.id}
            section={section}
            block={section.block_id ? (blocksById.get(section.block_id) ?? null) : null}
            fieldsById={fieldsById}
            mode={mode}
            selection={activeSelection}
            renderedValues={renderedValues}
            fieldValues={fieldValues}
            fieldOptions={fieldOptions}
            fileRefOptions={fileRefOptions}
            showGeometryDiagnostics={showGeometryDiagnostics}
            renderFieldValue={renderFieldValue}
            onSelect={select}
            onCreateField={onCreateField}
            onCommitBlock={onCommitBlock}
            onCancelBlock={onCancelBlock}
            onCommitField={onCommitField}
            onCancelField={onCancelField}
            onFieldValueChange={onFieldValueChange}
            geometry={geometryEnabled ? geometry : undefined}
          />
        ))}
        {designMode && !geometryActive && emptyPosition && (onCreateBlock || onInsertBlock) ? (
          <div
            className="card-layout-empty-area-actions"
            data-testid="card-layout-empty-area"
            style={{
              gridColumn: `${emptyPosition.column} / span ${emptyPosition.column_span}`,
              gridRow: `${emptyPosition.row} / span ${emptyPosition.row_span}`,
            }}
            onClick={(event) => event.stopPropagation()}
          >
            {onCreateBlock ? (
              <button
                type="button"
                className="ghost-button"
                aria-label="Создать блок в этой области"
                onClick={() => onCreateBlock(emptyPosition)}
              >
                Создать блок
              </button>
            ) : null}
            {onInsertBlock ? (
              <button
                type="button"
                className="ghost-button"
                aria-label="Вставить существующий блок в эту область"
                onClick={() => onInsertBlock(emptyPosition)}
              >
                Вставить существующий блок
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {geometry.session ? (
        <aside className="card-layout-geometry-session" aria-label="Изменение геометрии макета">
          <div
            className={`card-layout-geometry-guide${geometry.validation.isValid ? " is-valid" : " is-invalid"}`}
            role="status"
            aria-live="polite"
          >
            {geometry.validation.message}
          </div>
          <div className="row-actions">
            <button type="button" onClick={geometry.commit} disabled={!geometry.validation.isValid}>
              Готово
            </button>
            <button
              type="button"
              className="ghost-button"
              aria-label="Отмена изменения геометрии"
              onClick={geometry.cancel}
            >
              Отмена
            </button>
          </div>
          <LayoutLivePreview layout={displayLayout} />
        </aside>
      ) : null}
    </>
  );
}

function firstEmptyQuarterCell(layout: CardTemplateLayoutRead): CardLayoutCreatePosition | null {
  for (let row = 1; row <= 4; row += 1) {
    for (const column of [1, 4, 7, 10]) {
      const occupied = layout.form_layout.sections.some((section) => {
        const candidateRight = column + 3;
        const candidateBottom = row + 1;
        const sectionRight = section.column + section.column_span;
        const sectionBottom = section.row + section.row_span;
        return !(
          candidateRight <= section.column ||
          sectionRight <= column ||
          candidateBottom <= section.row ||
          sectionBottom <= row
        );
      });
      if (!occupied) {
        return { row, column, row_span: 1, column_span: 3 };
      }
    }
  }
  return null;
}

function geometryError(layout: CardTemplateLayoutRead, session: LayoutGeometrySession) {
  if (!withinGrid(session.preview)) {
    return "Объект выходит за границы сетки 12 × 4.";
  }
  if (session.targetKind === "block") {
    const collides = layout.form_layout.sections.some(
      (section) =>
        section.id !== session.targetId && rectsOverlap(session.preview, toLayoutRect(section)),
    );
    return collides ? "Пересечение с другим блоком. Выберите свободную область." : null;
  }
  const owner = layout.form_layout.sections.find((section) =>
    section.items.some((item) => item.id === session.targetId),
  );
  if (!owner) {
    return "Поле не найдено в макете. Отмените изменение и обновите данные.";
  }
  const collides = owner.items.some(
    (item) => item.id !== session.targetId && rectsOverlap(session.preview, toLayoutRect(item)),
  );
  return collides ? "Пересечение с другим полем. Выберите свободную область." : null;
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

function withinGrid(rect: LayoutRect) {
  return (
    rect.row >= 1 &&
    rect.column >= 1 &&
    rect.row + rect.rowSpan <= 5 &&
    rect.column + rect.columnSpan <= 13
  );
}
