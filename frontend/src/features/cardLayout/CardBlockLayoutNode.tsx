import type { CSSProperties, ReactNode } from "react";

import type { CardTemplateFormLayoutSectionRead, FormBlockRead, FormFieldRead } from "@/api/types";
import type { FieldEditorFileRefOption } from "@/features/cards/FieldEditorControl";
import type { FieldEditorOption, FieldEditorState } from "@/features/cards/fieldEditorUtils";

import { CardFieldLayoutNode, type CardLayoutFieldRenderContext } from "./CardFieldLayoutNode";
import type { CardLayoutRendererMode, CardLayoutSelection } from "./CardLayoutRenderer";
import { InlineBlockEditor } from "./InlineBlockEditor";

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
  showGeometryDiagnostics?: boolean;
  renderFieldValue?: (context: CardLayoutFieldRenderContext) => ReactNode;
  onSelect: (selection: CardLayoutSelection) => void;
  onCreateField?: (blockId: string) => void;
  onCommitBlock?: (block: FormBlockRead) => void;
  onCancelBlock?: (blockId: string) => void;
  onCommitField?: (field: FormFieldRead) => void;
  onCancelField?: (fieldId: string) => void;
  onFieldValueChange?: (field: FormFieldRead, value: FieldEditorState) => void;
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
  showGeometryDiagnostics = false,
  renderFieldValue,
  onSelect,
  onCreateField,
  onCommitBlock,
  onCancelBlock,
  onCommitField,
  onCancelField,
  onFieldValueChange,
}: CardBlockLayoutNodeProps) {
  const nodeId = block?.id ?? section.id;
  const designMode = mode === "design" || mode === "block-edit";
  const editing = selection?.kind === "block" && selection.id === nodeId;
  const style: CSSProperties = {
    gridColumn: `${section.column} / span ${section.column_span}`,
    gridRow: `${section.row} / span ${section.row_span}`,
  };

  return (
    <section
      className={`card-layout-block-node${editing ? " is-editing" : ""}`}
      data-testid={`layout-block-${section.id}`}
      style={style}
      aria-label={block ? `Блок ${block.title}` : "Недоступный блок"}
      onClick={(event) => event.stopPropagation()}
    >
      {editing && block && designMode ? (
        <InlineBlockEditor
          block={block}
          onCommit={(draft) => {
            onCommitBlock?.(draft);
            onSelect(null);
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
            {block && designMode ? (
              <div className="row-actions">
                <button
                  type="button"
                  className="ghost-button"
                  aria-label={`Создать поле в блоке ${block.title}`}
                  onClick={() => onCreateField?.(block.id)}
                >
                  Создать поле
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  aria-label={`Изменить блок ${block.title}`}
                  onClick={() => onSelect({ kind: "block", id: block.id })}
                >
                  Изменить блок
                </button>
              </div>
            ) : null}
          </header>
          <div
            className="card-layout-field-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
              gridTemplateRows: "repeat(4, minmax(3rem, auto))",
            }}
          >
            {section.items.map((item) => {
              const field = item.field_id ? (fieldsById.get(item.field_id) ?? null) : null;
              const valueKey = field?.id ?? item.id;
              return (
                <CardFieldLayoutNode
                  key={item.id}
                  item={item}
                  field={field}
                  mode={mode}
                  selection={selection}
                  renderedValue={renderedValues?.[valueKey]}
                  value={fieldValues?.[valueKey]}
                  options={fieldOptions?.[valueKey]}
                  fileRefOptions={fileRefOptions?.[valueKey]}
                  showGeometryDiagnostics={showGeometryDiagnostics}
                  renderFieldValue={renderFieldValue}
                  onSelect={onSelect}
                  onCommitField={onCommitField}
                  onCancelField={onCancelField}
                  onFieldValueChange={onFieldValueChange}
                />
              );
            })}
          </div>
        </>
      )}
      {showGeometryDiagnostics ? (
        <small
          className="card-layout-geometry-diagnostic"
          data-testid={`layout-block-${section.id}-geometry`}
          aria-label={`Размер блока: ${section.column_span} из 12 по ширине, ${section.row_span} из 4 по высоте`}
        >
          {section.column_span} × {section.row_span}
        </small>
      ) : null}
    </section>
  );
}
