import { useEffect, useMemo, type ReactNode } from "react";

import type {
  CardBlockInstanceRead,
  CardTemplateFormLayoutSectionRead,
  CardTemplateLayoutRead,
  FieldValueRead,
  FormBlockRead,
  FormFieldRead,
} from "@/api/types";
import { booleanLabel, formatUiDateTime, instanceLabel } from "@/app/uiText";
import { CardLayoutRenderer } from "@/features/cardLayout/CardLayoutRenderer";

import { BlockFieldControl } from "./BlockFieldControl";
import { CardPresentationShell } from "./CardPresentationShell";
import type { CardBlockNavigationItem } from "./CardBlockNavigator";
import { buildBlockCompletions } from "./cardCompletion";
import type { FieldEditorState } from "./fieldEditorUtils";
import { formatValue as formatEditorValue } from "./fieldEditorUtils";
import type { BlockEditorState } from "./useBlockEditor";

const referenceFieldTypes = new Set([
  "card_ref",
  "organization_ref",
  "org_unit_ref",
  "registry_ref",
  "select",
  "user_ref",
]);

const immediateAutosaveFieldTypes = new Set(["bool", "multi_select", "select"]);

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

export type FilledCardBlockInstanceRead = CardBlockInstanceRead & {
  block_id: string;
};

export type FilledCardLayoutProps = {
  layout: CardTemplateLayoutRead;
  blocks: FormBlockRead[];
  fields: FormFieldRead[];
  blockInstances: FilledCardBlockInstanceRead[];
  values: FieldValueRead[];
  editableFieldIds: ReadonlySet<string>;
  activeBlock?: { blockId: string; blockInstanceId: string | null } | null;
  onEditBlock?: (blockId: string, blockInstanceId: string | null) => void;
  blockEditor?: BlockEditorState;
  referenceOptions?: Readonly<Record<string, readonly FilledCardReferenceOption[]>>;
  renderFileRefControl?: (context: FilledCardFileRefControlContext) => ReactNode;
  navigationBefore?: readonly CardBlockNavigationItem[];
  navigationAfter?: readonly CardBlockNavigationItem[];
  navigatorAction?: ReactNode;
  beforeContent?: ReactNode;
  afterContent?: ReactNode;
};

type FilledCardSurface = {
  key: string;
  surfaceInstanceId: string | null;
  blockInstanceIds: ReadonlyMap<string, string | null>;
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
  onEditBlock,
  blockEditor,
  referenceOptions = {},
  renderFileRefControl,
  navigationBefore = [],
  navigationAfter = [],
  navigatorAction,
  beforeContent,
  afterContent,
}: FilledCardLayoutProps) {
  const surfaces = useMemo(
    () => buildSurfaces(layout, blocks, blockInstances),
    [blockInstances, blocks, layout],
  );
  const valuesByInstance = useMemo(
    () => buildValuesByInstance(blockInstances, values),
    [blockInstances, values],
  );
  const completionBySurface = useMemo(
    () =>
      new Map(
        surfaces.map((surface) => {
          const blockIds = new Set(
            surface.layout.form_layout.sections.flatMap((section) =>
              section.block_id ? [section.block_id] : [],
            ),
          );
          return [
            surface.key,
            buildBlockCompletions({
              blocks: blocks.filter((block) => block.is_active && blockIds.has(block.id)),
              fields: fields.filter((field) => field.is_active && blockIds.has(field.block_id)),
              valueForField: (field) => {
                const blockInstanceId = surface.blockInstanceIds.get(field.block_id) ?? null;
                return valuesByInstance.get(instanceKey(blockInstanceId))?.get(field.id);
              },
            }),
          ] as const;
        }),
      ),
    [blocks, fields, surfaces, valuesByInstance],
  );
  const navigationItems = useMemo<readonly CardBlockNavigationItem[]>(
    () =>
      surfaces.flatMap((surface) => {
        const completions = completionBySurface.get(surface.key);
        return surface.layout.form_layout.sections.flatMap((section) => {
          const blockId = section.block_id;
          const block = blockId ? blocks.find((candidate) => candidate.id === blockId) : null;
          const completion = blockId ? completions?.blocks.get(blockId) : null;
          if (!block || !completion) return [];
          return [
            {
              anchorId: cardBlockAnchorId(surface, block.id),
              label:
                surface.instanceOrdinal === null
                  ? block.title
                  : `${block.title} — ${instanceLabel(surface.instanceOrdinal)}`,
              state: completion.state,
              filledCount: completion.filledCount,
              totalCount: completion.totalCount,
              requiredMissingCount: completion.requiredMissingCount,
            },
          ];
        });
      }),
    [blocks, completionBySurface, surfaces],
  );
  const activeFieldId = useMemo(
    () => (blockEditor ? (Object.keys(blockEditor.values)[0] ?? null) : null),
    [blockEditor?.values],
  );
  const commitAndClose = blockEditor?.commitAndClose;

  useEffect(() => {
    if (!activeFieldId || !commitAndClose) return;

    const closeFieldOnOutsidePointer = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return;
      const fieldNode = event.target.closest<HTMLElement>("[data-card-field-id]");
      if (fieldNode?.dataset.cardFieldId === activeFieldId) return;
      commitAndClose();
    };

    document.addEventListener("pointerdown", closeFieldOnOutsidePointer, true);
    return () => document.removeEventListener("pointerdown", closeFieldOnOutsidePointer, true);
  }, [activeFieldId, commitAndClose]);

  return (
    <>
      <CardPresentationShell
        items={[...navigationBefore, ...navigationItems, ...navigationAfter]}
        beforeContent={beforeContent}
        navigatorAction={navigatorAction}
      >
        <div className="filled-card-layout" data-testid="filled-card-layout">
          {surfaces.map((surface) => {
            const fieldValues = Object.fromEntries(
              fields.map((field) => [
                field.id,
                surfaceFieldValue(surface, field, valuesByInstance),
              ]),
            );
            const editorTarget =
              blockEditor?.target &&
              surface.blockInstanceIds.get(blockEditor.target.blockId) ===
                blockEditor.target.blockInstanceId
                ? blockEditor.target
                : null;
            const firstEditableId =
              editorTarget && blockEditor
                ? firstEditableFieldId(surface.layout, blockEditor)
                : undefined;
            const surfaceActiveBlock = editorTarget;

            return (
              <section
                key={surface.key}
                className={
                  surface.surfaceInstanceId
                    ? "filled-card-repeatable-instance"
                    : "filled-card-primary"
                }
                data-filled-card-instance={surface.surfaceInstanceId ?? "primary"}
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
                  fieldPresentationLayout="inline"
                  selection={
                    surfaceActiveBlock ? { kind: "block", id: surfaceActiveBlock.blockId } : null
                  }
                  fieldValues={fieldValues}
                  responsive
                  showGeometryDiagnostics={false}
                  testIdPrefix={surface.surfaceInstanceId ? `filled-${surface.key}` : "filled"}
                  blockPresentation={({ block }) => {
                    if (!block) return undefined;
                    const completion = completionBySurface.get(surface.key)?.blocks.get(block.id);
                    return completion
                      ? {
                          anchorId: cardBlockAnchorId(surface, block.id),
                          state: completion.state,
                          description: completion.label,
                        }
                      : undefined;
                  }}
                  fieldPresentation={({ field }) => {
                    const completion = completionBySurface.get(surface.key)?.fields.get(field.id);
                    return completion
                      ? {
                          state: completion.state,
                          description:
                            completion.state !== "filled"
                              ? field.description?.trim() || completion.label
                              : completion.label,
                        }
                      : undefined;
                  }}
                  canActivateField={({ field }) =>
                    Boolean(
                      blockEditor &&
                      editableFieldIds.has(field.id) &&
                      !["file_ref", "static_text"].includes(field.field_type),
                    )
                  }
                  onActivateField={({ field }) => {
                    const blockInstanceId = surface.blockInstanceIds.get(field.block_id) ?? null;
                    const blockValues =
                      valuesByInstance.get(instanceKey(blockInstanceId)) ?? new Map();
                    onEditBlock?.(field.block_id, blockInstanceId);
                    blockEditor?.openField(field.block_id, blockInstanceId, field.id, {
                      [field.id]: blockValues.get(field.id),
                    });
                  }}
                  renderFieldValue={({ field, mode }) => {
                    const blockInstanceId = surface.blockInstanceIds.get(field.block_id) ?? null;
                    const value = surfaceFieldValue(surface, field, valuesByInstance);
                    const readValue = renderReadValue(
                      field,
                      value,
                      referenceOptions[field.id] ?? [],
                    );
                    const displayReadValue =
                      editableFieldIds.has(field.id) &&
                      !["file_ref", "static_text"].includes(field.field_type) ? (
                        <div className="card-inline-field-read-value">{readValue}</div>
                      ) : (
                        readValue
                      );
                    if (
                      mode !== "block-edit" ||
                      !blockEditor ||
                      editorTarget?.blockId !== field.block_id
                    ) {
                      return displayReadValue;
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
                        readValue={displayReadValue}
                        fileRefControl={
                          field.field_type === "file_ref" && editableFieldIds.has(field.id)
                            ? renderFileRefControl?.({
                                field,
                                blockInstanceId,
                                value,
                                readValue: displayReadValue,
                              })
                            : undefined
                        }
                        autoFocus={editable && firstEditableId === field.id}
                        onChange={(nextValue: FieldEditorState) =>
                          blockEditor.updateAndSave(
                            field.id,
                            nextValue,
                            immediateAutosaveFieldTypes.has(field.field_type) ? 0 : null,
                          )
                        }
                        onBlur={blockEditor.flushPendingSave}
                      />
                    );
                  }}
                  renderBlockActions={() => null}
                />
              </section>
            );
          })}
          {afterContent}
        </div>
      </CardPresentationShell>
    </>
  );
}

function cardBlockAnchorId(surface: FilledCardSurface, blockId: string) {
  return `card-block-${surface.key}-${blockId}`;
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
  blockInstances: FilledCardBlockInstanceRead[],
): FilledCardSurface[] {
  const blocksById = new Map(blocks.map((block) => [block.id, block]));
  const instancesByBlockId = new Map<string, FilledCardBlockInstanceRead[]>();
  for (const instance of blockInstances) {
    const instances = instancesByBlockId.get(instance.block_id) ?? [];
    instances.push(instance);
    instancesByBlockId.set(instance.block_id, instances);
  }
  const primarySections = layout.form_layout.sections.filter(
    (section) => !section.block_id || !blocksById.get(section.block_id)?.is_repeatable,
  );
  const surfaces: FilledCardSurface[] = [];

  if (primarySections.length > 0) {
    surfaces.push({
      key: "primary",
      surfaceInstanceId: null,
      blockInstanceIds: new Map(
        primarySections.flatMap((section) => {
          if (!section.block_id) return [];
          const instance = instancesByBlockId.get(section.block_id)?.[0];
          return [[section.block_id, instance?.block_instance_id ?? null] as const];
        }),
      ),
      instanceOrdinal: null,
      layout: layoutWithSections(layout, primarySections),
    });
  }

  for (const instance of blockInstances) {
    if (!instance.block_instance_id) continue;
    const block = blocksById.get(instance.block_id);
    const section = layout.form_layout.sections.find(
      (candidate) => candidate.block_id === instance.block_id,
    );
    if (!block?.is_repeatable || !section) continue;

    surfaces.push({
      key: `instance-${instance.block_instance_id}`,
      surfaceInstanceId: instance.block_instance_id,
      blockInstanceIds: new Map([[instance.block_id, instance.block_instance_id]]),
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

function buildValuesByInstance(
  blockInstances: FilledCardBlockInstanceRead[],
  values: FieldValueRead[],
) {
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

function surfaceFieldValue(
  surface: FilledCardSurface,
  field: FormFieldRead,
  valuesByInstance: ReadonlyMap<string, ReadonlyMap<string, unknown>>,
) {
  const blockInstanceId = surface.blockInstanceIds.get(field.block_id) ?? null;
  return valuesByInstance.get(instanceKey(blockInstanceId))?.get(field.id);
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

function renderReadValue(
  field: FormFieldRead,
  value: unknown,
  options: readonly FilledCardReferenceOption[],
): ReactNode {
  if (field.field_type === "static_text") {
    const staticText = field.options_config_json?.static_text;
    return typeof staticText === "string" && staticText.trim() ? staticText : emptyValue();
  }
  if (isEmptyValue(value)) return emptyValue(field);

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

function emptyValue(field?: FormFieldRead) {
  const description = field?.description?.trim();
  return <span className="filled-card-empty-value">{description || "Не заполнено"}</span>;
}
