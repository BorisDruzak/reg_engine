import { useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";

import type {
  CardTemplateFormLayoutItemRead,
  FormFieldRead,
  OrganizationRead,
  ReferenceListRead,
} from "@/api/types";
import { fieldTypeLabel } from "@/app/uiText";
import { FieldEditorControl } from "@/features/cards/FieldEditorControl";
import type { FieldEditorFileRefOption } from "@/features/cards/FieldEditorControl";
import type { FieldEditorOption, FieldEditorState } from "@/features/cards/fieldEditorUtils";
import { formatValue, initialEditorValue } from "@/features/cards/fieldEditorUtils";

import type {
  CardLayoutFieldActivationHandler,
  CardLayoutFieldActivationRenderer,
  CardLayoutFieldPresentation,
  CardLayoutFieldPresentationLayout,
  CardLayoutRendererMode,
  CardLayoutSelection,
} from "./CardLayoutRenderer";
import { InlineFieldEditor } from "./InlineFieldEditor";
import type { InlineReferenceEditorContext } from "./InlineReferenceEditor";
import { snapQuarterRect } from "./layoutGeometry";
import type { LayoutRect, ResizeHandle } from "./layoutGeometry";
import type {
  LayoutGeometryControls,
  LayoutGeometryTarget,
  LayoutPointerEvent,
} from "./useLayoutGeometrySession";

const DIRECT_MOVE_THRESHOLD_PX = 6;

type PendingMove = {
  pointerId: number;
  x: number;
  y: number;
};

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
  referenceLists?: ReferenceListRead[];
  organizations?: OrganizationRead[];
  inlineReferenceEditorContext?: InlineReferenceEditorContext;
  showGeometryDiagnostics?: boolean;
  testIdPrefix?: string;
  renderFieldValue?: (context: CardLayoutFieldRenderContext) => ReactNode;
  presentation?: CardLayoutFieldPresentation;
  fieldPresentationLayout?: CardLayoutFieldPresentationLayout;
  canActivateField?: CardLayoutFieldActivationRenderer;
  onActivateField?: CardLayoutFieldActivationHandler;
  onSelect: (selection: CardLayoutSelection) => void;
  onCommitField?: (field: FormFieldRead) => boolean | void | Promise<boolean | void>;
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
  referenceLists = [],
  organizations = [],
  inlineReferenceEditorContext,
  showGeometryDiagnostics = false,
  testIdPrefix = "layout",
  renderFieldValue,
  presentation,
  fieldPresentationLayout = "stacked",
  canActivateField,
  onActivateField,
  onSelect,
  onCommitField,
  onCancelField,
  onFieldValueChange,
  geometry,
}: CardFieldLayoutNodeProps) {
  const [retryDraft, setRetryDraft] = useState<FormFieldRead | null>(null);
  const pendingMoveRef = useRef<PendingMove | null>(null);
  const directMovePointerRef = useRef<number | null>(null);
  const directPointerCleanupRef = useRef<(() => void) | null>(null);
  const suppressClickRef = useRef(false);
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
  const fieldActivationContext = field ? { field, item, value, mode } : null;
  const fieldActivatable = Boolean(
    fieldActivationContext &&
    !designMode &&
    canActivateField?.(fieldActivationContext) &&
    onActivateField,
  );
  const directInteraction =
    designMode && Boolean(onCommitField) && !schemaEditing && !blockValueEditing;
  const style: CSSProperties = {
    gridColumn: `${item.column} / span ${item.column_span}`,
    gridRow: `${item.row} / span ${item.row_span}`,
    position: "relative",
    userSelect: directInteraction ? "none" : undefined,
    WebkitUserSelect: directInteraction ? "none" : undefined,
  };
  const geometryTargetDescriptor: LayoutGeometryTarget = {
    targetId: item.id,
    targetKind: "field",
    original: toLayoutRect(item),
  };
  const completionDescriptionId = presentation?.description
    ? `${testIdPrefix}-field-${item.id}-completion`
    : undefined;

  useEffect(
    () => () => {
      directPointerCleanupRef.current?.();
      directPointerCleanupRef.current = null;
    },
    [],
  );

  function openFieldEditor() {
    if (!field || !designMode || geometryActive || !onCommitField) {
      return;
    }
    setRetryDraft(null);
    onSelect({ kind: "field", id: field.id });
  }

  function fieldGrid(element: HTMLElement) {
    return element.closest<HTMLElement>("[data-layout-grid='fields']");
  }

  function stopDirectPointerTracking() {
    const cleanup = directPointerCleanupRef.current;
    directPointerCleanupRef.current = null;
    cleanup?.();
  }

  function startDirectPointerTracking(element: HTMLElement, pointerId: number) {
    stopDirectPointerTracking();
    const handleWindowPointerMove = (event: PointerEvent) => {
      if (event.pointerId === pointerId) {
        handlePointerMove(toLayoutPointerEvent(event, element));
      }
    };
    const handleWindowPointerUp = (event: PointerEvent) => {
      if (event.pointerId === pointerId) {
        handlePointerUp(toLayoutPointerEvent(event, element));
      }
    };
    const handleWindowPointerCancel = (event: PointerEvent) => {
      if (event.pointerId === pointerId) {
        handlePointerCancel(toLayoutPointerEvent(event, element));
      }
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", handleWindowPointerMove, true);
      window.removeEventListener("pointerup", handleWindowPointerUp, true);
      window.removeEventListener("pointercancel", handleWindowPointerCancel, true);
    };
    directPointerCleanupRef.current = cleanup;
    window.addEventListener("pointermove", handleWindowPointerMove, true);
    window.addEventListener("pointerup", handleWindowPointerUp, true);
    window.addEventListener("pointercancel", handleWindowPointerCancel, true);
  }

  function handlePointerDown(event: LayoutPointerEvent) {
    if (!geometry || geometryActive || schemaEditing || isInteractiveTarget(event.target)) {
      return;
    }
    pendingMoveRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    directMovePointerRef.current = null;
    suppressClickRef.current = false;
    startDirectPointerTracking(event.currentTarget, event.pointerId);
    if (typeof event.currentTarget.setPointerCapture === "function") {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // A browser may reject capture for a pointer that has already ended.
      }
    }
  }

  function handlePointerMove(event: LayoutPointerEvent) {
    if (geometryTarget || directMovePointerRef.current === event.pointerId) {
      geometry?.pointerMove(event);
      return;
    }
    const pending = pendingMoveRef.current;
    if (!pending || pending.pointerId !== event.pointerId || !geometry) {
      return;
    }
    if (
      Math.hypot(event.clientX - pending.x, event.clientY - pending.y) < DIRECT_MOVE_THRESHOLD_PX
    ) {
      return;
    }
    const grid = fieldGrid(event.currentTarget);
    if (!grid) {
      pendingMoveRef.current = null;
      return;
    }
    pendingMoveRef.current = null;
    directMovePointerRef.current = event.pointerId;
    suppressClickRef.current = true;
    geometry.beginMove(event, geometryTargetDescriptor, grid, {
      clientX: pending.x,
      clientY: pending.y,
    });
    geometry.pointerMove(event);
  }

  function handlePointerUp(event: LayoutPointerEvent) {
    if (geometryTarget || directMovePointerRef.current === event.pointerId) {
      stopDirectPointerTracking();
      directMovePointerRef.current = null;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
      geometry?.pointerUp(event);
      return;
    }
    if (pendingMoveRef.current?.pointerId === event.pointerId) {
      stopDirectPointerTracking();
      pendingMoveRef.current = null;
      if (typeof event.currentTarget.releasePointerCapture === "function") {
        try {
          event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {
          // The browser may already have released a click-only pointer.
        }
      }
    }
  }

  function handlePointerCancel(event: LayoutPointerEvent) {
    const pendingPointerId = pendingMoveRef.current?.pointerId;
    stopDirectPointerTracking();
    pendingMoveRef.current = null;
    suppressClickRef.current = false;
    if (geometryTarget || directMovePointerRef.current === event.pointerId) {
      directMovePointerRef.current = null;
      geometry?.pointerCancel(event);
    } else if (
      pendingPointerId === event.pointerId &&
      typeof event.currentTarget.releasePointerCapture === "function"
    ) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer cancellation can release capture before React handles it.
      }
    }
  }

  function handleLostPointerCapture(event: LayoutPointerEvent) {
    if (directPointerCleanupRef.current) {
      return;
    }
    pendingMoveRef.current = null;
    if (geometryTarget || directMovePointerRef.current === event.pointerId) {
      directMovePointerRef.current = null;
      geometry?.lostPointerCapture(event);
    }
  }

  function handleFieldKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.target !== event.currentTarget || !designMode || schemaEditing) {
      return;
    }
    if ((event.key === "Enter" || event.key === " ") && !geometryActive && onCommitField) {
      event.preventDefault();
      event.stopPropagation();
      openFieldEditor();
      return;
    }
    geometry?.keyboard(event, geometryTargetDescriptor);
  }

  if (!field) {
    return (
      <article
        className="card-layout-field-node is-static-layout-item"
        data-testid={`${testIdPrefix}-field-${item.id}`}
        style={style}
      >
        {item.text ?? "Поле недоступно"}
        {showGeometryDiagnostics ? (
          <small data-testid={`${testIdPrefix}-field-${item.id}-geometry`}>
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

  const fieldValue = !designMode
    ? blockValueEditing
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
            })
    : null;
  const inlineFieldPresentation =
    fieldPresentationLayout === "inline" &&
    !designMode &&
    !["file_ref", "static_text"].includes(field.field_type);

  return (
    <article
      className={`card-layout-field-node${schemaEditing || blockValueEditing ? " is-editing" : ""}${directInteraction ? " is-direct-interaction" : ""}${geometryTarget ? " is-geometry-target" : ""}${presentation?.editingState ? ` is-editor-${presentation.editingState}` : ""}${presentation?.state ? ` is-${presentation.state}` : ""}`}
      data-card-field-id={field.id}
      data-testid={`${testIdPrefix}-field-${item.id}`}
      style={style}
      tabIndex={designMode && onCommitField ? 0 : fieldActivatable ? 0 : undefined}
      aria-label={
        designMode && onCommitField
          ? `Поле ${field.label}. Нажмите, чтобы изменить; удерживайте и перетащите, чтобы переместить.`
          : fieldActivatable
            ? `Поле ${field.label}. Нажмите, чтобы изменить значение.`
            : undefined
      }
      aria-describedby={completionDescriptionId}
      onPointerDownCapture={(event) => {
        if (fieldActivatable && fieldActivationContext && !isInteractiveTarget(event.target)) {
          onActivateField?.(fieldActivationContext);
        }
      }}
      onClick={(event) => {
        event.stopPropagation();
        if (isInteractiveTarget(event.target)) {
          return;
        }
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          return;
        }
        if (fieldActivatable && fieldActivationContext) {
          onActivateField?.(fieldActivationContext);
          return;
        }
        openFieldEditor();
      }}
      onKeyDown={(event) => {
        if (
          fieldActivatable &&
          fieldActivationContext &&
          (event.key === "Enter" || event.key === " ") &&
          !isInteractiveTarget(event.target)
        ) {
          event.preventDefault();
          onActivateField?.(fieldActivationContext);
          return;
        }
        handleFieldKeyDown(event);
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onLostPointerCapture={handleLostPointerCapture}
    >
      {completionDescriptionId ? (
        <span id={completionDescriptionId} className="card-layout-presentation-description">
          {presentation?.description}
        </span>
      ) : null}
      {schemaEditing && onCommitField ? (
        <InlineFieldEditor
          field={retryDraft ?? field}
          referenceLists={referenceLists}
          organizations={organizations}
          inlineReferenceEditorContext={inlineReferenceEditorContext}
          onCommit={(draft) => {
            setRetryDraft(draft);
            onSelect(null);
            void Promise.resolve(onCommitField(draft))
              .then((saved) => {
                if (saved === false) {
                  onSelect({ kind: "field", id: field.id });
                } else {
                  setRetryDraft(null);
                }
              })
              .catch(() => onSelect({ kind: "field", id: field.id }));
          }}
          onClose={() => {
            setRetryDraft(null);
            onSelect(null);
          }}
          onDelete={() => {
            setRetryDraft(null);
            onCancelField?.(field.id);
            onSelect(null);
          }}
        />
      ) : inlineFieldPresentation ? (
        <div className="card-layout-inline-field">
          <header className="card-layout-field-header">
            <strong>{field.label}</strong>
          </header>
          <div className="card-layout-field-value">{fieldValue}</div>
        </div>
      ) : (
        <>
          <header className="card-layout-field-header">
            <div>
              <strong>{field.label}</strong>
              <small>{fieldTypeLabel(field.field_type)}</small>
            </div>
          </header>
          {!designMode ? <div className="card-layout-field-value">{fieldValue}</div> : null}
        </>
      )}
      {showGeometryDiagnostics ? (
        <small
          className="card-layout-geometry-diagnostic"
          data-testid={`${testIdPrefix}-field-${item.id}-geometry`}
          aria-label={`Размер поля: ${item.column_span} из 12 по ширине, ${item.row_span} из 4 по высоте`}
        >
          {item.column_span} × {item.row_span}
        </small>
      ) : null}
      {geometryTarget ? (
        <small
          className="card-layout-geometry-dimension-badge"
          data-testid={`${testIdPrefix}-field-${item.id}-active-geometry`}
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
  function gridFor(event: LayoutPointerEvent) {
    return event.currentTarget.closest<HTMLElement>("[data-layout-grid='fields']");
  }
  const resizeHandles = Object.keys(RESIZE_HANDLE_LABELS) as ResizeHandle[];

  return (
    <span className="card-layout-geometry-affordances">
      {resizeHandles.map((handle) => (
        <button
          key={handle}
          type="button"
          className={`card-layout-resize-handle is-${handle}`}
          data-layout-resize-handle
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
          onLostPointerCapture={geometry.lostPointerCapture}
        />
      ))}
    </span>
  );
}

function toLayoutPointerEvent(event: PointerEvent, currentTarget: HTMLElement): LayoutPointerEvent {
  return {
    pointerId: event.pointerId,
    clientX: event.clientX,
    clientY: event.clientY,
    target: event.target,
    currentTarget,
    preventDefault: () => event.preventDefault(),
    stopPropagation: () => event.stopPropagation(),
  };
}

function isInteractiveTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        "button, input, select, textarea, a, [contenteditable='true'], [data-layout-resize-handle]",
      ),
    )
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
        hint={field.description}
        validation={field.validation_json}
        options={options}
        fileRefOptions={fileRefOptions}
        value={initialEditorValue({ field_type: field.field_type, value })}
        onChange={(nextValue) => onFieldValueChange(field, nextValue)}
      />
    );
  }
  return formatValue(value);
}
