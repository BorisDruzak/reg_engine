import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";

import type { CardTemplateFormLayoutItemRead, FormFieldRead } from "@/api/types";
import { fieldTypeLabel } from "@/app/uiText";
import { FieldEditorControl } from "@/features/cards/FieldEditorControl";
import type { FieldEditorFileRefOption } from "@/features/cards/FieldEditorControl";
import type { FieldEditorOption, FieldEditorState } from "@/features/cards/fieldEditorUtils";
import { formatValue, initialEditorValue } from "@/features/cards/fieldEditorUtils";

import type { CardLayoutRendererMode, CardLayoutSelection } from "./CardLayoutRenderer";
import { InlineFieldEditor } from "./InlineFieldEditor";
import { snapQuarterRect } from "./layoutGeometry";
import type { LayoutRect, ResizeHandle } from "./layoutGeometry";
import type { LayoutGeometryControls, LayoutGeometryTarget } from "./useLayoutGeometrySession";

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
  geometry?: LayoutGeometryControls;
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
  geometry,
}: CardFieldLayoutNodeProps) {
  const nodeId = field?.id ?? item.id;
  const designMode = mode === "design";
  const geometryActive = Boolean(geometry?.session);
  const geometryTarget =
    geometry?.session?.targetKind === "field" && geometry.session.targetId === item.id;
  const schemaEditing =
    designMode &&
    !geometryActive &&
    Boolean(onCommitField) &&
    selection?.kind === "field" &&
    selection.id === nodeId;
  const blockValueEditing = mode === "block-edit" && valueEditing && Boolean(onFieldValueChange);
  const style: CSSProperties = {
    gridColumn: `${item.column} / span ${item.column_span}`,
    gridRow: `${item.row} / span ${item.row_span}`,
    position: "relative",
  };
  const geometryTargetDescriptor: LayoutGeometryTarget = {
    targetId: item.id,
    targetKind: "field",
    original: toLayoutRect(item),
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
        {geometryTarget ? (
          <small className="card-layout-geometry-dimension-badge">
            Размер: {item.column_span} из 12 × {item.row_span} из 4
          </small>
        ) : null}
        {geometry && (!geometryActive || geometryTarget) ? (
          <FieldGeometryAffordances
            objectLabel={item.text ?? "Статический элемент"}
            target={geometryTargetDescriptor}
            geometry={geometry}
          />
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
            {designMode && !geometryActive && onCommitField ? (
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
      {geometryTarget ? (
        <small
          className="card-layout-geometry-dimension-badge"
          data-testid={`layout-field-${item.id}-active-geometry`}
        >
          Размер: {item.column_span} из 12 × {item.row_span} из 4
        </small>
      ) : null}
      {geometry && (!geometryActive || geometryTarget) && !schemaEditing ? (
        <FieldGeometryAffordances
          objectLabel={field.label}
          target={geometryTargetDescriptor}
          geometry={geometry}
        />
      ) : null}
    </article>
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

function FieldGeometryAffordances({
  objectLabel,
  target,
  geometry,
}: {
  objectLabel: string;
  target: LayoutGeometryTarget;
  geometry: LayoutGeometryControls;
}) {
  function gridFor(event: ReactPointerEvent<HTMLElement>) {
    return event.currentTarget.closest<HTMLElement>("[data-layout-grid='fields']");
  }
  const resizeHandles: ResizeHandle[] = geometry.session
    ? (Object.keys(RESIZE_HANDLE_LABELS) as ResizeHandle[])
    : ["bottom-right"];

  return (
    <span className="card-layout-geometry-affordances">
      <button
        type="button"
        className="card-layout-move-handle"
        aria-label={`Переместить поле ${objectLabel}`}
        aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
        title="Стрелки — перемещение; Shift + стрелки — изменение размера"
        style={{ position: "absolute", right: 6, top: 6, zIndex: 3, cursor: "move" }}
        onKeyDown={(event) => geometry.keyboard(event, target)}
        onPointerDown={(event) => {
          const grid = gridFor(event);
          if (grid) geometry.beginMove(event, target, grid);
        }}
        onPointerMove={geometry.pointerMove}
        onPointerUp={geometry.pointerUp}
        onPointerCancel={geometry.pointerCancel}
      >
        ⠿
      </button>
      {resizeHandles.map((handle) => (
        <button
          key={handle}
          type="button"
          className={`card-layout-resize-handle is-${handle}`}
          aria-label={`Изменить размер поля ${objectLabel}: ${RESIZE_HANDLE_LABELS[handle]}`}
          title={`Изменить размер: ${RESIZE_HANDLE_LABELS[handle]}`}
          style={{
            position: "absolute",
            width: 12,
            height: 12,
            padding: 0,
            zIndex: 3,
            ...RESIZE_HANDLE_STYLES[handle],
          }}
          onPointerDown={(event) => {
            const grid = gridFor(event);
            if (grid) geometry.beginResize(event, target, handle, grid);
          }}
          onPointerMove={geometry.pointerMove}
          onPointerUp={geometry.pointerUp}
          onPointerCancel={geometry.pointerCancel}
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
