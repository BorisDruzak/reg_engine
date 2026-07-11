import { useCallback, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import type {
  CardTemplateLayoutRead,
  FormBlockRead,
  FormFieldRead,
  ReferenceListRead,
} from "@/api/types";
import type { FieldEditorFileRefOption } from "@/features/cards/FieldEditorControl";
import type { FieldEditorOption, FieldEditorState } from "@/features/cards/fieldEditorUtils";

import { CardBlockLayoutNode } from "./CardBlockLayoutNode";
import type { CardLayoutFieldRenderContext } from "./CardFieldLayoutNode";
import type { BlockOrderDirection } from "./blockOrdering";
import type {
  CardLayoutBlockActionsRenderer,
  CardLayoutBlockRenderContext,
  CardLayoutBlockPresentationRenderer,
  CardLayoutFieldPresentationRenderer,
  CardLayoutRendererMode,
  CardLayoutSelection,
} from "./CardLayoutRenderer";
import { LayoutLivePreview } from "./LayoutLivePreview";
import type { InlineReferenceEditorContext } from "./InlineReferenceEditor";
import { QUARTER_COLUMN_SPANS, rectsOverlap, snapQuarterRect } from "./layoutGeometry";
import type { LayoutRect } from "./layoutGeometry";
import { applyLayoutGeometryPreview, useLayoutGeometrySession } from "./useLayoutGeometrySession";
import type {
  LayoutGeometryCommand,
  LayoutGeometryResolution,
  LayoutGeometrySession,
} from "./useLayoutGeometrySession";

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
  referenceLists?: ReferenceListRead[];
  inlineReferenceEditorContext?: InlineReferenceEditorContext;
  responsive?: boolean;
  compactBlockHeight?: boolean;
  showGeometryDiagnostics?: boolean;
  testIdPrefix?: string;
  renderFieldValue?: (context: CardLayoutFieldRenderContext) => ReactNode;
  renderBlockActions?: CardLayoutBlockActionsRenderer;
  blockPresentation?: CardLayoutBlockPresentationRenderer;
  fieldPresentation?: CardLayoutFieldPresentationRenderer;
  canActivateBlock?: (context: CardLayoutBlockRenderContext) => boolean;
  onActivateBlock?: (context: CardLayoutBlockRenderContext) => void;
  onSelectionChange?: (selection: CardLayoutSelection) => void;
  onCreateBlock?: (position: CardLayoutCreatePosition) => void;
  onInsertBlock?: (position: CardLayoutCreatePosition) => void;
  onCreateField?: (blockId: string) => void;
  onCommitBlock?: (block: FormBlockRead) => boolean | void | Promise<boolean | void>;
  onCancelBlock?: (blockId: string) => void;
  onCommitField?: (field: FormFieldRead) => boolean | void | Promise<boolean | void>;
  onCancelField?: (fieldId: string) => void;
  onFieldValueChange?: (field: FormFieldRead, value: FieldEditorState) => void;
  onGeometryCommit?: (command: LayoutGeometryCommand) => void;
  onMoveBlock?: (sectionId: string, direction: BlockOrderDirection) => void;
  blockOrderingDisabled?: boolean;
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
  referenceLists,
  inlineReferenceEditorContext,
  responsive = true,
  compactBlockHeight = true,
  showGeometryDiagnostics = false,
  testIdPrefix = "layout",
  renderFieldValue,
  renderBlockActions,
  blockPresentation,
  fieldPresentation,
  canActivateBlock,
  onActivateBlock,
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
  onMoveBlock,
  blockOrderingDisabled = false,
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
  const resolveGeometry = useCallback(
    (
      session: LayoutGeometrySession,
      previous: LayoutGeometrySession | null,
      boundaryReason: string | null,
      verticalDirection: number,
      horizontalDirection: number,
    ) =>
      resolveFieldMove(
        layout,
        session,
        previous,
        boundaryReason,
        verticalDirection,
        horizontalDirection,
      ),
    [layout],
  );
  const handleGeometryCommit = useCallback(
    (command: LayoutGeometryCommand) => onGeometryCommit?.(command),
    [onGeometryCommit],
  );
  const geometry = useLayoutGeometrySession({
    onCommit: handleGeometryCommit,
    resolve: resolveGeometry,
    validate: validateGeometry,
  });
  const geometryActive = Boolean(geometry.session);
  const geometryEnabled = designMode && Boolean(onGeometryCommit) && !semanticEditing;
  const displayLayout = useMemo(
    () => applyLayoutGeometryPreview(layout, geometry.session),
    [geometry.session, layout],
  );
  const orderedSections = useMemo(
    () => rowMajor(displayLayout.form_layout.sections),
    [displayLayout.form_layout.sections],
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
    gridTemplateRows: compactBlockHeight
      ? "repeat(4, minmax(0, auto))"
      : "repeat(4, minmax(6rem, 1fr))",
    minHeight: compactBlockHeight ? "0" : "24rem",
    alignItems: "start",
  };

  return (
    <>
      <div
        className={`card-web-layout-canvas${responsive ? " card-layout-responsive-grid" : ""} is-${mode}${geometryActive ? " is-geometry-active" : ""}`}
        data-testid="card-layout-canvas"
        data-layout-grid="canvas"
        style={canvasStyle}
      >
        {orderedSections.map((section, index) => {
          const block = section.block_id ? (blocksById.get(section.block_id) ?? null) : null;
          return (
            <CardBlockLayoutNode
              key={section.id}
              section={section}
              block={block}
              fieldsById={fieldsById}
              mode={mode}
              selection={activeSelection}
              renderedValues={renderedValues}
              fieldValues={fieldValues}
              fieldOptions={fieldOptions}
              fileRefOptions={fileRefOptions}
              referenceLists={referenceLists}
              inlineReferenceEditorContext={inlineReferenceEditorContext}
              compactBlockHeight={compactBlockHeight}
              showGeometryDiagnostics={showGeometryDiagnostics}
              testIdPrefix={testIdPrefix}
              renderFieldValue={renderFieldValue}
              renderBlockActions={renderBlockActions}
              blockPresentation={block ? blockPresentation?.({ block, section, mode }) : undefined}
              fieldPresentation={fieldPresentation}
              canActivateBlock={canActivateBlock}
              onActivateBlock={onActivateBlock}
              onSelect={select}
              onCreateField={onCreateField}
              onCommitBlock={onCommitBlock}
              onCancelBlock={onCancelBlock}
              onCommitField={onCommitField}
              onCancelField={onCancelField}
              onFieldValueChange={onFieldValueChange}
              geometry={geometryEnabled ? geometry : undefined}
              onMoveBlock={onMoveBlock}
              canMoveBlockUp={index > 0}
              canMoveBlockDown={index < orderedSections.length - 1}
              blockOrderingDisabled={blockOrderingDisabled}
            />
          );
        })}
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

const NO_FIELD_SPACE_MESSAGE = "В выбранной строке нет свободного места для поля такого размера.";

function resolveFieldMove(
  layout: CardTemplateLayoutRead,
  session: LayoutGeometrySession,
  previous: LayoutGeometrySession | null,
  boundaryReason: string | null,
  verticalDirection: number,
  horizontalDirection: number,
): LayoutGeometryResolution {
  if (session.targetKind !== "field" || session.operation !== "move") {
    return { session };
  }
  const lastPreview =
    previous?.targetId === session.targetId && previous.targetKind === session.targetKind
      ? previous.preview
      : session.original;
  if (boundaryReason) {
    return { session: { ...session, preview: lastPreview } };
  }
  const owner = layout.form_layout.sections.find((section) =>
    section.items.some((item) => item.id === session.targetId),
  );
  if (!owner) {
    return { session };
  }
  const obstacles = owner.items.filter((item) => item.id !== session.targetId).map(toLayoutRect);
  if (!obstacles.some((obstacle) => rectsOverlap(session.preview, obstacle))) {
    return { session };
  }
  const availablePlacement = nearestAvailablePlacement(
    session.preview,
    verticalDirection,
    horizontalDirection,
    obstacles,
  );
  if (availablePlacement) {
    return {
      session: {
        ...session,
        preview: availablePlacement,
      },
    };
  }
  return {
    session: { ...session, preview: lastPreview },
    invalidReason: NO_FIELD_SPACE_MESSAGE,
  };
}

function nearestAvailablePlacement(
  preview: LayoutRect,
  verticalDirection: number,
  horizontalDirection: number,
  obstacles: LayoutRect[],
): LayoutRect | null {
  const sameRowPlacement = nearestAvailableRect(preview, obstacles, horizontalDirection);
  if (sameRowPlacement) {
    return sameRowPlacement;
  }
  const direction = Math.sign(verticalDirection);
  if (direction === 0) {
    return null;
  }
  const maximumRow = 4 - preview.rowSpan + 1;
  for (let row = preview.row + direction; row >= 1 && row <= maximumRow; row += direction) {
    const candidate = { ...preview, row };
    const placement = nearestAvailableRect(candidate, obstacles, horizontalDirection);
    if (placement) {
      return placement;
    }
  }
  return null;
}

function nearestAvailableRect(
  preview: LayoutRect,
  obstacles: LayoutRect[],
  horizontalDirection: number,
) {
  const intervals = freeColumnIntervals(preview, obstacles).filter(
    (interval) => interval.end - interval.start + 1 >= QUARTER_COLUMN_SPANS[0],
  );
  const previewEnd = preview.column + preview.columnSpan - 1;
  const previewCenter = (preview.column + previewEnd) / 2;
  intervals.sort((left, right) => {
    const overlapDifference =
      intervalOverlap(right, preview.column, previewEnd) -
      intervalOverlap(left, preview.column, previewEnd);
    if (overlapDifference !== 0) {
      return overlapDifference;
    }
    const distanceDifference =
      intervalDistance(left, preview.column, previewEnd) -
      intervalDistance(right, preview.column, previewEnd);
    if (distanceDifference !== 0) {
      return distanceDifference;
    }
    const directionDifference =
      intervalDirectionPenalty(left, previewCenter, horizontalDirection) -
      intervalDirectionPenalty(right, previewCenter, horizontalDirection);
    if (directionDifference !== 0) {
      return directionDifference;
    }
    return right.end - right.start - (left.end - left.start) || left.start - right.start;
  });
  const interval = intervals[0];
  if (!interval) {
    return null;
  }
  const intervalWidth = interval.end - interval.start + 1;
  const columnSpan = [...QUARTER_COLUMN_SPANS]
    .reverse()
    .find((span) => span <= preview.columnSpan && span <= intervalWidth);
  if (!columnSpan) {
    return null;
  }
  const column = Math.min(interval.end - columnSpan + 1, Math.max(interval.start, preview.column));
  return { ...preview, column, columnSpan };
}

type FreeColumnInterval = { start: number; end: number };

function freeColumnIntervals(preview: LayoutRect, obstacles: LayoutRect[]) {
  const occupied = Array.from({ length: 12 }, () => false);
  for (const obstacle of obstacles) {
    const rowsOverlap =
      preview.row < obstacle.row + obstacle.rowSpan && obstacle.row < preview.row + preview.rowSpan;
    if (!rowsOverlap) {
      continue;
    }
    for (
      let column = obstacle.column;
      column < obstacle.column + obstacle.columnSpan;
      column += 1
    ) {
      occupied[column - 1] = true;
    }
  }
  const intervals: FreeColumnInterval[] = [];
  let start: number | null = null;
  for (let index = 0; index <= occupied.length; index += 1) {
    if (index < occupied.length && !occupied[index]) {
      start ??= index + 1;
      continue;
    }
    if (start !== null) {
      intervals.push({ start, end: index });
      start = null;
    }
  }
  return intervals;
}

function intervalOverlap(interval: FreeColumnInterval, start: number, end: number) {
  return Math.max(0, Math.min(interval.end, end) - Math.max(interval.start, start) + 1);
}

function intervalDistance(interval: FreeColumnInterval, start: number, end: number) {
  if (interval.end < start) {
    return start - interval.end;
  }
  if (interval.start > end) {
    return interval.start - end;
  }
  return 0;
}

function intervalDirectionPenalty(
  interval: FreeColumnInterval,
  previewCenter: number,
  horizontalDirection: number,
) {
  if (horizontalDirection === 0) {
    return 0;
  }
  const intervalCenter = (interval.start + interval.end) / 2;
  return Math.sign(intervalCenter - previewCenter) === Math.sign(horizontalDirection) ? 0 : 1;
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

function rowMajor<T extends { row: number; column: number }>(items: T[]): T[] {
  return [...items].sort((left, right) => left.row - right.row || left.column - right.column);
}
