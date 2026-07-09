import { useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import type { CardTemplateLayoutRead, FormBlockRead, FormFieldRead } from "@/api/types";
import type { FieldEditorFileRefOption } from "@/features/cards/FieldEditorControl";
import type { FieldEditorOption, FieldEditorState } from "@/features/cards/fieldEditorUtils";

import { CardBlockLayoutNode } from "./CardBlockLayoutNode";
import type { CardLayoutFieldRenderContext } from "./CardFieldLayoutNode";
import type { CardLayoutRendererMode, CardLayoutSelection } from "./CardLayoutRenderer";

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
  const emptyPosition = useMemo(() => firstEmptyQuarterCell(layout), [layout]);

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
    <div
      className={`card-web-layout-canvas is-${mode}`}
      data-testid="card-layout-canvas"
      style={canvasStyle}
    >
      {layout.form_layout.sections.map((section) => (
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
        />
      ))}
      {designMode && emptyPosition && (onCreateBlock || onInsertBlock) ? (
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
