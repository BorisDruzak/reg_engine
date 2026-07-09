import type { CSSProperties, ReactNode } from "react";

import type { CardTemplateFormLayoutItemRead, FormFieldRead } from "@/api/types";
import { fieldTypeLabel } from "@/app/uiText";
import { FieldEditorControl } from "@/features/cards/FieldEditorControl";
import type { FieldEditorFileRefOption } from "@/features/cards/FieldEditorControl";
import type { FieldEditorOption, FieldEditorState } from "@/features/cards/fieldEditorUtils";
import { formatValue, initialEditorValue } from "@/features/cards/fieldEditorUtils";

import type { CardLayoutRendererMode, CardLayoutSelection } from "./CardLayoutRenderer";
import { InlineFieldEditor } from "./InlineFieldEditor";

export type CardLayoutFieldRenderContext = {
  field: FormFieldRead;
  item: CardTemplateFormLayoutItemRead;
  value: unknown;
  mode: CardLayoutRendererMode;
};

export type CardFieldLayoutNodeProps = {
  item: CardTemplateFormLayoutItemRead;
  field: FormFieldRead | null;
  mode: CardLayoutRendererMode;
  selection: CardLayoutSelection;
  valueEditing?: boolean;
  renderedValue?: ReactNode;
  value?: unknown;
  options?: FieldEditorOption[];
  fileRefOptions?: FieldEditorFileRefOption[];
  showGeometryDiagnostics?: boolean;
  renderFieldValue?: (context: CardLayoutFieldRenderContext) => ReactNode;
  onSelect: (selection: CardLayoutSelection) => void;
  onCommitField?: (field: FormFieldRead) => void;
  onCancelField?: (fieldId: string) => void;
  onFieldValueChange?: (field: FormFieldRead, value: FieldEditorState) => void;
};

export function CardFieldLayoutNode({
  item,
  field,
  mode,
  selection,
  valueEditing = false,
  renderedValue,
  value,
  options = [],
  fileRefOptions = [],
  showGeometryDiagnostics = false,
  renderFieldValue,
  onSelect,
  onCommitField,
  onCancelField,
  onFieldValueChange,
}: CardFieldLayoutNodeProps) {
  const nodeId = field?.id ?? item.id;
  const designMode = mode === "design";
  const schemaEditing =
    designMode && Boolean(onCommitField) && selection?.kind === "field" && selection.id === nodeId;
  const blockValueEditing = mode === "block-edit" && valueEditing && Boolean(onFieldValueChange);
  const style: CSSProperties = {
    gridColumn: `${item.column} / span ${item.column_span}`,
    gridRow: `${item.row} / span ${item.row_span}`,
  };

  if (!field) {
    return (
      <article
        className="card-layout-field-node is-static-layout-item"
        data-testid={`layout-field-${item.id}`}
        style={style}
      >
        {item.text ?? "Поле недоступно"}
        {showGeometryDiagnostics ? (
          <small data-testid={`layout-field-${item.id}-geometry`}>
            {item.column_span} × {item.row_span}
          </small>
        ) : null}
      </article>
    );
  }

  return (
    <article
      className={`card-layout-field-node${schemaEditing || blockValueEditing ? " is-editing" : ""}`}
      data-testid={`layout-field-${item.id}`}
      style={style}
      onClick={(event) => event.stopPropagation()}
    >
      {schemaEditing && onCommitField ? (
        <InlineFieldEditor
          field={field}
          onCommit={(draft) => {
            onCommitField(draft);
            onSelect(null);
          }}
          onCancel={() => {
            onCancelField?.(field.id);
            onSelect(null);
          }}
        />
      ) : (
        <>
          <header className="card-layout-field-header">
            <div>
              <strong>{field.label}</strong>
              <small>{fieldTypeLabel(field.field_type)}</small>
            </div>
            {designMode && onCommitField ? (
              <button
                type="button"
                className="ghost-button"
                aria-label={`Изменить поле ${field.label}`}
                onClick={() => onSelect({ kind: "field", id: field.id })}
              >
                Изменить
              </button>
            ) : null}
          </header>
          {!designMode ? (
            <div className="card-layout-field-value">
              {blockValueEditing
                ? defaultFieldValue({
                    field,
                    mode,
                    value,
                    options,
                    fileRefOptions,
                    valueEditing: blockValueEditing,
                    onFieldValueChange,
                  })
                : renderedValue !== undefined
                  ? renderedValue
                  : renderFieldValue
                    ? renderFieldValue({ field, item, value, mode })
                    : defaultFieldValue({
                        field,
                        mode,
                        value,
                        options,
                        fileRefOptions,
                        valueEditing: blockValueEditing,
                        onFieldValueChange,
                      })}
            </div>
          ) : null}
        </>
      )}
      {showGeometryDiagnostics ? (
        <small
          className="card-layout-geometry-diagnostic"
          data-testid={`layout-field-${item.id}-geometry`}
          aria-label={`Размер поля: ${item.column_span} из 12 по ширине, ${item.row_span} из 4 по высоте`}
        >
          {item.column_span} × {item.row_span}
        </small>
      ) : null}
    </article>
  );
}

function defaultFieldValue({
  field,
  mode,
  value,
  options,
  fileRefOptions,
  valueEditing,
  onFieldValueChange,
}: {
  field: FormFieldRead;
  mode: CardLayoutRendererMode;
  value: unknown;
  options: FieldEditorOption[];
  fileRefOptions: FieldEditorFileRefOption[];
  valueEditing: boolean;
  onFieldValueChange?: (field: FormFieldRead, value: FieldEditorState) => void;
}) {
  if (field.field_type === "static_text") {
    const staticText = field.options_config_json?.static_text;
    return typeof staticText === "string" && staticText.trim() ? staticText : "Нет данных";
  }
  if ((mode === "public-edit" || valueEditing) && onFieldValueChange) {
    return (
      <FieldEditorControl
        fieldType={field.field_type}
        label={field.label}
        options={options}
        fileRefOptions={fileRefOptions}
        value={initialEditorValue({ field_type: field.field_type, value })}
        onChange={(nextValue) => onFieldValueChange(field, nextValue)}
      />
    );
  }
  return formatValue(value);
}
