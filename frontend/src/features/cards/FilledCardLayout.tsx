import { useEffect, useMemo, useRef, type ReactNode } from "react";

import type {
  CardBlockInstanceRead,
  CardTemplateFormLayoutSectionRead,
  CardTemplateLayoutRead,
  FieldValueRead,
  FormBlockRead,
  FormFieldRead,
} from "@/api/types";
import { booleanLabel, formatUiDateTime, instanceLabel } from "@/app/uiText";
import { AdminMutationDialog } from "@/components/common/AdminMutation";
import { CardLayoutRenderer } from "@/features/cardLayout/CardLayoutRenderer";

import { BlockFieldControl } from "./BlockFieldControl";
import type { FieldEditorState } from "./fieldEditorUtils";
import { formatValue as formatEditorValue } from "./fieldEditorUtils";
import { blockEditorKey, type BlockEditorState } from "./useBlockEditor";

const referenceFieldTypes = new Set([
  "card_ref",
  "organization_ref",
  "org_unit_ref",
  "registry_ref",
  "select",
  "user_ref",
]);

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export type FilledCardReferenceOption = {
  id: string;
  label: string;
  href?: string;
};

export type FilledCardFileRefControlContext = {
  field: FormFieldRead;
  blockInstanceId: string | null;
  value: unknown;
  readValue: ReactNode;
};

export type FilledCardLayoutProps = {
  layout: CardTemplateLayoutRead;
  blocks: FormBlockRead[];
  fields: FormFieldRead[];
  blockInstances: CardBlockInstanceRead[];
  values: FieldValueRead[];
  editableFieldIds: ReadonlySet<string>;
  activeBlock?: { blockId: string; blockInstanceId: string | null } | null;
  onEditBlock?: (blockId: string, blockInstanceId: string | null) => void;
  blockEditor?: BlockEditorState;
  referenceOptions?: Readonly<Record<string, readonly FilledCardReferenceOption[]>>;
  renderFileRefControl?: (context: FilledCardFileRefControlContext) => ReactNode;
};

type FilledCardSurface = {
  key: string;
  blockInstanceId: string | null;
  instanceOrdinal: number | null;
  layout: CardTemplateLayoutRead;
};

export function FilledCardLayout({
  layout,
  blocks,
  fields,
  blockInstances,
  values,
  editableFieldIds,
  activeBlock = null,
  onEditBlock,
  blockEditor,
  referenceOptions = {},
  renderFileRefControl,
}: FilledCardLayoutProps) {
  const fieldsById = useMemo(() => new Map(fields.map((field) => [field.id, field])), [fields]);
  const surfaces = useMemo(
    () => buildSurfaces(layout, blocks, fieldsById, blockInstances),
    [blockInstances, blocks, fieldsById, layout],
  );
  const valuesByInstance = useMemo(
    () => buildValuesByInstance(blockInstances, values),
    [blockInstances, values],
  );
  const closeError = blockEditor ? Object.values(blockEditor.errors)[0] : undefined;
  const layoutRootRef = useRef<HTMLDivElement>(null);
  const lastEditorFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const editor = blockEditor;
    if (!editor?.target) return;
    const editorState: BlockEditorState = editor;
    const activeTarget = editor.target;
    function guardEditorClick(event: MouseEvent) {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest(".admin-mutation-dialog")) return;
      const clickedBlock = event.target.closest<HTMLElement>("[data-layout-block-id]");
      const clickedSurface = event.target.closest<HTMLElement>("[data-filled-card-instance]");
      if (
        clickedBlock?.dataset.layoutBlockId === activeTarget.blockId &&
        clickedSurface?.dataset.filledCardInstance === (activeTarget.blockInstanceId ?? "primary")
      ) {
        return;
      }
      const closeResult = editorState.requestClose();
      const insideLayout = Boolean(layoutRootRef.current?.contains(event.target));
      const switchingBlock = Boolean(event.target.closest(".filled-card-edit-block"));
      if (closeResult === "confirm-discard" && (!insideLayout || !switchingBlock)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }
    document.addEventListener("click", guardEditorClick, true);
    return () => document.removeEventListener("click", guardEditorClick, true);
  }, [blockEditor]);

  return (
    <>
      <div
        ref={layoutRootRef}
        className="filled-card-layout"
        data-testid="filled-card-layout"
        onFocusCapture={(event) => {
          if (blockEditor?.target && event.target instanceof HTMLElement) {
            lastEditorFocusRef.current = event.target;
          }
        }}
      >
        {surfaces.map((surface) => {
          const surfaceValues =
            valuesByInstance.get(instanceKey(surface.blockInstanceId)) ?? new Map();
          const fieldValues = Object.fromEntries(
            fields.map((field) => [field.id, surfaceValues.get(field.id)]),
          );
          const renderedValues = Object.fromEntries(
            fields.map((field) => [
              field.id,
              renderReadValue(field, surfaceValues.get(field.id), referenceOptions[field.id] ?? []),
            ]),
          );
          const editorTarget =
            blockEditor?.target?.blockInstanceId === surface.blockInstanceId
              ? blockEditor.target
              : null;
          const firstEditableId =
            editorTarget && blockEditor
              ? firstEditableFieldId(surface.layout, blockEditor)
              : undefined;
          const surfaceActiveBlock = blockEditor
            ? editorTarget
            : activeBlock?.blockInstanceId === surface.blockInstanceId
              ? activeBlock
              : null;

          return (
            <section
              key={surface.key}
              className={
                surface.blockInstanceId ? "filled-card-repeatable-instance" : "filled-card-primary"
              }
              data-filled-card-instance={surface.blockInstanceId ?? "primary"}
              aria-label={
                surface.instanceOrdinal === null
                  ? "Основные данные карточки"
                  : instanceLabel(surface.instanceOrdinal)
              }
            >
              {surface.instanceOrdinal === null ? null : (
                <h4 className="filled-card-instance-title">
                  {instanceLabel(surface.instanceOrdinal)}
                </h4>
              )}
              <CardLayoutRenderer
                layout={surface.layout}
                blocks={blocks}
                fields={fields}
                mode={surfaceActiveBlock ? "block-edit" : "readonly"}
                selection={
                  surfaceActiveBlock ? { kind: "block", id: surfaceActiveBlock.blockId } : null
                }
                renderedValues={editorTarget ? undefined : renderedValues}
                fieldValues={fieldValues}
                responsive
                showGeometryDiagnostics={false}
                testIdPrefix={surface.blockInstanceId ? `filled-${surface.key}` : "filled"}
                renderFieldValue={({ field, mode }) => {
                  const readValue = renderReadValue(
                    field,
                    surfaceValues.get(field.id),
                    referenceOptions[field.id] ?? [],
                  );
                  if (
                    mode !== "block-edit" ||
                    !blockEditor ||
                    editorTarget?.blockId !== field.block_id
                  ) {
                    return readValue;
                  }
                  const editable = Object.prototype.hasOwnProperty.call(
                    blockEditor.values,
                    field.id,
                  );
                  return (
                    <BlockFieldControl
                      field={field}
                      value={editable ? blockEditor.values[field.id] : undefined}
                      editable={editable}
                      pending={blockEditor.pending}
                      error={blockEditor.errors[field.id]}
                      options={referenceOptions[field.id]}
                      readValue={readValue}
                      fileRefControl={
                        field.field_type === "file_ref" && editableFieldIds.has(field.id)
                          ? renderFileRefControl?.({
                              field,
                              blockInstanceId: surface.blockInstanceId,
                              value: surfaceValues.get(field.id),
                              readValue,
                            })
                          : undefined
                      }
                      autoFocus={editable && firstEditableId === field.id}
                      onChange={(nextValue: FieldEditorState) =>
                        blockEditor.update(field.id, nextValue)
                      }
                    />
                  );
                }}
                renderBlockActions={({ block, section }) => {
                  if (
                    !block ||
                    !hasEditableSectionField(
                      block.id,
                      section,
                      fieldsById,
                      editableFieldIds,
                      Boolean(renderFileRefControl),
                    )
                  ) {
                    return null;
                  }
                  const editorActive =
                    blockEditor?.key === blockEditorKey(block.id, surface.blockInstanceId);
                  if (editorActive && blockEditor) {
                    return (
                      <div className="row-actions filled-card-block-edit-actions">
                        {blockEditor.errors._form && !blockEditor.confirmClose ? (
                          <p className="inline-alert" role="alert">
                            {blockEditor.errors._form}
                          </p>
                        ) : null}
                        <button
                          type="button"
                          className="primary-button"
                          aria-label={`Сохранить блок ${block.title}`}
                          disabled={blockEditor.pending}
                          onClick={() => void blockEditor.save()}
                        >
                          Сохранить
                        </button>
                        <button
                          type="button"
                          className="ghost-button"
                          aria-label={`Отмена блока ${block.title}`}
                          disabled={blockEditor.pending}
                          onClick={blockEditor.cancel}
                        >
                          Отмена
                        </button>
                      </div>
                    );
                  }
                  return (
                    <button
                      type="button"
                      className="ghost-button filled-card-edit-block"
                      aria-label={`Изменить блок ${block.title}`}
                      onClick={() => {
                        onEditBlock?.(block.id, surface.blockInstanceId);
                        blockEditor?.open(
                          block.id,
                          surface.blockInstanceId,
                          sectionValues(section, surfaceValues),
                        );
                      }}
                    >
                      Изменить блок
                    </button>
                  );
                }}
              />
            </section>
          );
        })}
      </div>
      {blockEditor?.confirmClose ? (
        <AdminMutationDialog
          title="Несохранённые изменения"
          onCancel={blockEditor.continueEditing}
          restoreFocusRef={lastEditorFocusRef}
        >
          <p>Сохранить изменения перед закрытием блока?</p>
          {closeError ? (
            <p className="inline-alert" role="alert">
              {closeError}
            </p>
          ) : null}
          <div className="admin-mutation-actions">
            <button
              type="button"
              className="primary-button"
              disabled={blockEditor.pending}
              onClick={() => void blockEditor.save()}
            >
              Сохранить
            </button>
            <button
              type="button"
              className="ghost-button"
              disabled={blockEditor.pending}
              onClick={blockEditor.discard}
            >
              Не сохранять
            </button>
            <button
              type="button"
              className="ghost-button"
              disabled={blockEditor.pending}
              onClick={blockEditor.continueEditing}
            >
              Продолжить редактирование
            </button>
          </div>
        </AdminMutationDialog>
      ) : null}
    </>
  );
}

function sectionValues(
  section: CardTemplateFormLayoutSectionRead,
  values: ReadonlyMap<string, unknown>,
) {
  return Object.fromEntries(
    section.items.flatMap((item) =>
      item.field_id ? [[item.field_id, values.get(item.field_id)]] : [],
    ),
  );
}

function firstEditableFieldId(layout: CardTemplateLayoutRead, editor: BlockEditorState) {
  const visibleFieldIds = layout.form_layout.sections.flatMap((section) =>
    section.items.flatMap((item) => (item.field_id ? [item.field_id] : [])),
  );
  return visibleFieldIds.find((fieldId) =>
    Object.prototype.hasOwnProperty.call(editor.values, fieldId),
  );
}

function buildSurfaces(
  layout: CardTemplateLayoutRead,
  blocks: FormBlockRead[],
  fieldsById: ReadonlyMap<string, FormFieldRead>,
  blockInstances: CardBlockInstanceRead[],
): FilledCardSurface[] {
  const blocksById = new Map(blocks.map((block) => [block.id, block]));
  const primarySections = layout.form_layout.sections.filter(
    (section) => !section.block_id || !blocksById.get(section.block_id)?.is_repeatable,
  );
  const surfaces: FilledCardSurface[] = [];

  if (primarySections.length > 0) {
    surfaces.push({
      key: "primary",
      blockInstanceId: null,
      instanceOrdinal: null,
      layout: layoutWithSections(layout, primarySections),
    });
  }

  for (const instance of blockInstances) {
    if (!instance.block_instance_id) continue;
    const blockId = inferInstanceBlockId(instance, fieldsById);
    const block = blockId ? blocksById.get(blockId) : null;
    const section = blockId
      ? layout.form_layout.sections.find((candidate) => candidate.block_id === blockId)
      : null;
    if (!block?.is_repeatable || !section) continue;

    surfaces.push({
      key: `instance-${instance.block_instance_id}`,
      blockInstanceId: instance.block_instance_id,
      instanceOrdinal: instance.ordinal,
      layout: {
        ...layoutWithSections(layout, [
          { ...section, id: `${section.id}-${instance.block_instance_id}` },
        ]),
        structure: {
          blocks: [block],
          fields: layout.structure.fields.filter((field) => field.block_id === block.id),
        },
      },
    });
  }
  return surfaces;
}

function layoutWithSections(
  layout: CardTemplateLayoutRead,
  sections: CardTemplateFormLayoutSectionRead[],
): CardTemplateLayoutRead {
  const blockIds = new Set(sections.map((section) => section.block_id).filter(Boolean));
  return {
    ...layout,
    structure: {
      blocks: layout.structure.blocks.filter((block) => blockIds.has(block.id)),
      fields: layout.structure.fields.filter((field) => blockIds.has(field.block_id)),
    },
    form_layout: { ...layout.form_layout, sections },
  };
}

function inferInstanceBlockId(
  instance: CardBlockInstanceRead,
  fieldsById: ReadonlyMap<string, FormFieldRead>,
) {
  for (const field of Object.values(instance.fields)) {
    const schemaField = fieldsById.get(field.field_id);
    if (schemaField) return schemaField.block_id;
  }
  return null;
}

function buildValuesByInstance(blockInstances: CardBlockInstanceRead[], values: FieldValueRead[]) {
  const result = new Map<string, Map<string, unknown>>();
  for (const instance of blockInstances) {
    const instanceValues = valueMap(result, instance.block_instance_id);
    for (const field of Object.values(instance.fields)) {
      instanceValues.set(field.field_id, field.value);
    }
  }
  for (const value of values) {
    valueMap(result, value.block_instance_id).set(value.field_id, value.value);
  }
  return result;
}

function valueMap(result: Map<string, Map<string, unknown>>, blockInstanceId: string | null) {
  const key = instanceKey(blockInstanceId);
  let instanceValues = result.get(key);
  if (!instanceValues) {
    instanceValues = new Map();
    result.set(key, instanceValues);
  }
  return instanceValues;
}

function instanceKey(blockInstanceId: string | null) {
  return blockInstanceId ?? "primary";
}

function hasEditableSectionField(
  blockId: string,
  section: CardTemplateFormLayoutSectionRead,
  fieldsById: ReadonlyMap<string, FormFieldRead>,
  editableFieldIds: ReadonlySet<string>,
  fileRefEditingAvailable: boolean,
) {
  return section.items.some((item) => {
    if (!item.field_id || !editableFieldIds.has(item.field_id)) return false;
    const field = fieldsById.get(item.field_id);
    return (
      field?.block_id === blockId &&
      field.is_active &&
      field.field_type !== "static_text" &&
      (field.field_type !== "file_ref" || fileRefEditingAvailable)
    );
  });
}

function renderReadValue(
  field: FormFieldRead,
  value: unknown,
  options: readonly FilledCardReferenceOption[],
): ReactNode {
  if (field.field_type === "static_text") {
    const staticText = field.options_config_json?.static_text;
    return typeof staticText === "string" && staticText.trim() ? staticText : emptyValue();
  }
  if (isEmptyValue(value)) return emptyValue();

  if (field.field_type === "bool") return booleanLabel(Boolean(value));
  if (field.field_type === "date" && typeof value === "string") {
    const date = new Date(`${value.slice(0, 10)}T00:00:00`);
    return Number.isNaN(date.getTime()) ? (
      value
    ) : (
      <time dateTime={value}>{dateFormatter.format(date)}</time>
    );
  }
  if (field.field_type === "datetime" && typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? (
      value
    ) : (
      <time dateTime={value}>{formatUiDateTime(value)}</time>
    );
  }
  if (field.field_type === "multi_select") {
    return renderChoiceValues(Array.isArray(value) ? value : [value], options);
  }
  if (referenceFieldTypes.has(field.field_type)) {
    return renderReferenceValue(field.field_type, value, options);
  }
  if (field.field_type === "json") {
    return <pre className="filled-card-json-value">{safeJson(value)}</pre>;
  }
  return formatEditorValue(value);
}

function renderChoiceValues(values: unknown[], options: readonly FilledCardReferenceOption[]) {
  const nonEmptyValues = values.filter((value) => !isEmptyValue(value));
  if (nonEmptyValues.length === 0) return emptyValue();
  return (
    <span className="filled-card-choice-list">
      {nonEmptyValues.map((value, index) => (
        <span
          className="filled-card-choice-chip"
          key={`${referenceId(value) ?? "choice"}-${index}`}
        >
          {referenceLabel(value, options)}
        </span>
      ))}
    </span>
  );
}

function renderReferenceValue(
  fieldType: string,
  value: unknown,
  options: readonly FilledCardReferenceOption[],
) {
  const id = referenceId(value);
  const option = id ? options.find((item) => item.id === id) : null;
  const label = referenceLabel(value, options);
  if (fieldType === "select") {
    return <span className="filled-card-choice-chip">{label}</span>;
  }
  const href = option?.href ?? referenceHref(value);
  return fieldType === "card_ref" && href ? <a href={href}>{label}</a> : label;
}

function referenceId(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value && typeof value.id === "string") {
    return value.id;
  }
  return null;
}

function referenceLabel(value: unknown, options: readonly FilledCardReferenceOption[]) {
  const id = referenceId(value);
  const option = id ? options.find((item) => item.id === id) : null;
  if (option) return option.label;
  if (value && typeof value === "object") {
    const candidate = value as Record<string, unknown>;
    for (const key of ["label", "display_name", "name", "title", "code"]) {
      if (typeof candidate[key] === "string" && candidate[key]) return candidate[key];
    }
  }
  return formatEditorValue(value);
}

function referenceHref(value: unknown) {
  if (!value || typeof value !== "object" || !("href" in value)) return null;
  return typeof value.href === "string" ? value.href : null;
}

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "Значение JSON недоступно для отображения";
  }
}

function isEmptyValue(value: unknown) {
  return (
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

function emptyValue() {
  return <span className="filled-card-empty-value">Не заполнено</span>;
}
