import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";

import {
  ApiError,
  convertCardTemplatePrintViewToLinkedCard,
  createCardTemplatePrintView,
  createFormBlock,
  createFormField,
  downloadBlankCardPrintLayoutDocx,
  downloadBlankCardPrintLayoutPdf,
  downloadGeneratedDocumentContent,
  generateCardTemplateLayoutDocx,
  generateCardTemplateLayoutPdf,
  getCardTemplateLayout,
  listReferenceLists,
  updateCardTemplate,
  updateCardTemplateFormLayout,
  updateCardTemplatePrintView,
  updateFormBlock,
  updateFormField,
} from "@/api/client";
import type {
  CardPrintLayout,
  CardPrintLayoutItem,
  CardPrintOverlayItem,
  CardTemplateFormLayoutRead,
  CardTemplateLayoutRead,
  CardTemplatePrintViewRead,
  CardTemplateRead,
  FormBlockRead,
  FormFieldRead,
  GeneratedDocumentRead,
  ReferenceListRead,
} from "@/api/types";
import { generateTechnicalCode } from "@/app/technicalCode";
import { DataAlert } from "@/components/common/DataSurfaces";
import { A4LinkedCardCanvas } from "@/features/cardLayout/A4LinkedCardCanvas";
import type { PrintOnlyItemKind } from "@/features/cardLayout/A4LinkedCardCanvas";
import {
  createLinkedCardPrintItem,
  isLinkedCardPrintLayout,
  markLinkedCardPrintLayout,
} from "@/features/cardLayout/a4LinkedCardLayout";
import { CardLayoutRenderer } from "@/features/cardLayout/CardLayoutRenderer";
import type { CardLayoutSelection } from "@/features/cardLayout/CardLayoutRenderer";
import type { CardLayoutCreatePosition } from "@/features/cardLayout/CardWebLayoutCanvas";
import type { LayoutGeometryCommand } from "@/features/cardLayout/useLayoutGeometrySession";

import { A4TemplatePropertiesPanel } from "./A4TemplatePropertiesPanel";
import {
  createEmptyCardPrintLayout,
  ensureItemGeometry,
  normalizeLayoutGeometry,
} from "./printLayoutGeometry";
import { validatePrintLayout } from "./printLayoutValidation";

const DEFAULT_OUTPUT_FILENAME = "{{ card.display_name }}.docx";
const STALE_LAYOUT_MESSAGE =
  "Макет изменён другим пользователем. Обновите данные перед сохранением.";

export type CardLayoutStudioProps = {
  token: string;
  registryId: string;
  cardTemplate: CardTemplateRead;
  blocks: FormBlockRead[];
  fields: FormFieldRead[];
  referenceLists?: ReferenceListRead[];
  selectedCardId?: string | null;
  onClose?: () => void;
  onSchemaChanged?: () => Promise<void> | void;
};

type StudioStage = "layout" | "a4" | "preview";

const stages: Array<{ id: StudioStage; label: string }> = [
  { id: "layout", label: "Макет карточки" },
  { id: "a4", label: "Печатная форма A4" },
  { id: "preview", label: "Предпросмотр" },
];

type InsertBlockDialogState = {
  position: CardLayoutCreatePosition;
  blockId: string;
};

type GeometryHistory = {
  undo: LayoutGeometryCommand[];
  redo: LayoutGeometryCommand[];
};

export function CardLayoutStudio(props: CardLayoutStudioProps) {
  const layoutQuery = useQuery({
    queryKey: ["card-template-layout", props.token, props.cardTemplate.id],
    queryFn: () => getCardTemplateLayout(props.token, props.cardTemplate.id),
    enabled: Boolean(props.token && props.cardTemplate.id),
  });

  if (!layoutQuery.data) {
    return (
      <section
        className="card-layout-studio"
        role="region"
        aria-label={`Редактор макета карточки ${props.cardTemplate.name}`}
      >
        <DataAlert error={layoutQuery.error} />
        {!layoutQuery.error ? <p className="data-empty">Загрузка макета карточки…</p> : null}
      </section>
    );
  }

  return <CardLayoutStudioSession {...props} initialLayout={layoutQuery.data} />;
}

function CardLayoutStudioSession({
  token,
  registryId,
  cardTemplate,
  blocks,
  fields,
  referenceLists,
  selectedCardId = null,
  onClose,
  onSchemaChanged,
  initialLayout,
}: CardLayoutStudioProps & { initialLayout: CardTemplateLayoutRead }) {
  const queryClient = useQueryClient();
  const initialDraft = useMemo(
    () => mergeExternalStructure(initialLayout, blocks, fields),
    [blocks, fields, initialLayout],
  );
  const [stage, setStage] = useState<StudioStage>("layout");
  const [draftLayout, setDraftLayoutState] = useState(initialDraft);
  const [selection, setSelection] = useState<CardLayoutSelection>(null);
  const [failedFormLayout, setFailedFormLayout] = useState<CardTemplateFormLayoutRead | null>(null);
  const [conflictServerLayout, setConflictServerLayout] = useState<CardTemplateLayoutRead | null>(
    null,
  );
  const [hasFormConflict, setHasFormConflict] = useState(false);
  const [conflictReviewPending, setConflictReviewPending] = useState(false);
  const [formSavePending, setFormSavePending] = useState(false);
  const [schemaPending, setSchemaPending] = useState(false);
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [insertDialog, setInsertDialog] = useState<InsertBlockDialogState | null>(null);
  const [printViews, setPrintViews] = useState(initialDraft.print_views);
  const initialPrintView = printViews[0];
  const [selectedPrintView, setSelectedPrintView] = useState(initialPrintView);
  const [printLayout, setPrintLayout] = useState(() =>
    preparePrintLayout(initialPrintView, cardTemplate.id),
  );
  const [printName, setPrintName] = useState(initialPrintView?.name ?? "Основная A4");
  const [outputFilename, setOutputFilename] = useState(
    initialPrintView?.output_filename_template || DEFAULT_OUTPUT_FILENAME,
  );
  const [selectedPrintItemId, setSelectedPrintItemId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.75);
  const [printSavePending, setPrintSavePending] = useState(false);
  const [generationPending, setGenerationPending] = useState(false);
  const [conversionPending, setConversionPending] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<GeneratedDocumentRead | null>(null);
  const [geometryHistory, setGeometryHistoryState] = useState<GeometryHistory>({
    undo: [],
    redo: [],
  });
  const temporaryBlockIds = useRef(new Set<string>());
  const temporaryFieldIds = useRef(new Set<string>());
  const temporaryCounter = useRef(0);
  const localStructure = useRef(initialDraft.structure);
  const draftLayoutRef = useRef(initialDraft);
  const latestDraftFormLayout = useRef(initialDraft.form_layout);
  const currentRevision = useRef(initialDraft.revision);
  const formSaveRunning = useRef(false);
  const formSaveFailed = useRef(false);
  const formSaveIdleWaiters = useRef<Array<() => void>>([]);
  const schemaWritesInFlight = useRef(0);
  const schemaWriteTail = useRef(Promise.resolve());
  const printSaveRunning = useRef(false);
  const generationRunning = useRef(false);
  const geometryHistoryRef = useRef<GeometryHistory>({ undo: [], redo: [] });
  const conflictActive = useRef(false);
  const queuedFormSave = useRef<{
    formLayout: CardTemplateFormLayoutRead;
    completed: Array<() => void>;
  } | null>(null);
  const templateFieldIds = useRef(
    new Set(
      Array.isArray(cardTemplate.field_schema_json?.field_ids)
        ? cardTemplate.field_schema_json.field_ids.map(String)
        : [],
    ),
  );
  const referenceListsQuery = useQuery({
    queryKey: ["reference-lists", token, registryId],
    queryFn: () => listReferenceLists(token, registryId),
    enabled: Boolean(token && registryId && !referenceLists),
  });

  const allBlocks = useMemo(
    () => mergeById(blocks, draftLayout.structure.blocks),
    [blocks, draftLayout.structure.blocks],
  );
  const allFields = useMemo(
    () => mergeById(fields, draftLayout.structure.fields),
    [draftLayout.structure.fields, fields],
  );
  const unusedBlocks = useMemo(() => {
    const used = new Set(
      draftLayout.form_layout.sections
        .map((section) => section.block_id)
        .filter((value): value is string => Boolean(value)),
    );
    return allBlocks.filter((block) => !used.has(block.id) && block.is_active);
  }, [allBlocks, draftLayout.form_layout.sections]);
  const effectiveReferenceLists = referenceLists ?? referenceListsQuery.data?.items ?? [];
  const legacyPrintView =
    Boolean(selectedPrintView?.document_template_id) &&
    !isLinkedCardPrintLayout(printLayout) &&
    hasLegacyCardComposition(printLayout);
  const selectedPrintItem = findPrintItem(printLayout, selectedPrintItemId);

  function updateDraftLayout(
    updater: CardTemplateLayoutRead | ((current: CardTemplateLayoutRead) => CardTemplateLayoutRead),
  ) {
    const next = typeof updater === "function" ? updater(draftLayoutRef.current) : updater;
    draftLayoutRef.current = next;
    setDraftLayoutState(next);
    return next;
  }

  function notifyFormSaveIdle() {
    if (formSaveRunning.current || queuedFormSave.current) return;
    const waiters = formSaveIdleWaiters.current.splice(0);
    waiters.forEach((resolve) => resolve());
  }

  function waitForFormSaveIdle() {
    if (!formSaveRunning.current && !queuedFormSave.current) return Promise.resolve();
    const idle = new Promise<void>((resolve) => formSaveIdleWaiters.current.push(resolve));
    void drainFormSaveQueue();
    return idle;
  }

  async function beginSchemaWrite() {
    const previous = schemaWriteTail.current;
    let releaseSlot: () => void = () => undefined;
    const slot = new Promise<void>((resolve) => {
      releaseSlot = resolve;
    });
    schemaWriteTail.current = previous.then(() => slot);
    await previous;
    await waitForFormSaveIdle();
    schemaWritesInFlight.current += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      schemaWritesInFlight.current = Math.max(0, schemaWritesInFlight.current - 1);
      releaseSlot();
      if (schemaWritesInFlight.current === 0) void drainFormSaveQueue();
    };
  }

  async function drainFormSaveQueue() {
    if (
      formSaveRunning.current ||
      conflictActive.current ||
      formSaveFailed.current ||
      schemaWritesInFlight.current > 0
    )
      return;
    if (!queuedFormSave.current) return;
    formSaveRunning.current = true;
    setFormSavePending(true);
    setLocalError(null);
    setLocalMessage(null);
    try {
      while (queuedFormSave.current && !conflictActive.current) {
        const request = queuedFormSave.current;
        queuedFormSave.current = null;
        try {
          const saved = await updateCardTemplateFormLayout(token, cardTemplate.id, {
            expected_revision: currentRevision.current,
            form_layout: request.formLayout,
          });
          const savedBaseline = {
            ...saved,
            structure: mergeStructure(saved.structure, localStructure.current),
            form_layout: request.formLayout,
          };
          currentRevision.current = saved.revision;
          localStructure.current = savedBaseline.structure;
          updateDraftLayout((current) => ({
            ...savedBaseline,
            structure: mergeStructure(savedBaseline.structure, current.structure),
            form_layout: latestDraftFormLayout.current,
          }));
          setFailedFormLayout(null);
          formSaveFailed.current = false;
          setHasFormConflict(false);
          setLocalMessage("Макет карточки сохранён");
          queryClient.setQueryData(["card-template-layout", token, cardTemplate.id], saved);
          request.completed.forEach((complete) => complete());
        } catch (error) {
          const queuedAfterFailure = queuedFormSave.current as {
            formLayout: CardTemplateFormLayoutRead;
            completed: Array<() => void>;
          } | null;
          const latestLocal = queuedAfterFailure?.formLayout ?? latestDraftFormLayout.current;
          const completions = [...request.completed, ...(queuedAfterFailure?.completed ?? [])];
          queuedFormSave.current = null;
          conflictActive.current = error instanceof ApiError && error.status === 409;
          formSaveFailed.current = !conflictActive.current;
          setHasFormConflict(conflictActive.current);
          setFailedFormLayout(latestLocal);
          setConflictServerLayout(null);
          updateDraftLayout((current) => ({ ...current, form_layout: latestLocal }));
          setLocalError(
            conflictActive.current ? STALE_LAYOUT_MESSAGE : `Не сохранено. ${errorMessage(error)}`,
          );
          completions.forEach((complete) => complete());
          break;
        }
      }
    } finally {
      formSaveRunning.current = false;
      setFormSavePending(false);
      notifyFormSaveIdle();
    }
  }

  function saveNextFormLayout(formLayout: CardTemplateFormLayoutRead): Promise<void> {
    latestDraftFormLayout.current = formLayout;
    updateDraftLayout((current) => ({ ...current, form_layout: formLayout }));
    setFailedFormLayout((current) =>
      conflictActive.current || formSaveFailed.current ? formLayout : current,
    );
    if (conflictActive.current || formSaveFailed.current) return Promise.resolve();
    const completion = new Promise<void>((resolve) => {
      if (queuedFormSave.current) {
        queuedFormSave.current = {
          formLayout,
          completed: [...queuedFormSave.current.completed, resolve],
        };
      } else {
        queuedFormSave.current = { formLayout, completed: [resolve] };
      }
    });
    void drainFormSaveQueue();
    return completion;
  }

  async function retryFailedFormLayout() {
    if (!failedFormLayout || hasFormConflict || formSaveRunning.current) return;
    formSaveFailed.current = false;
    setLocalError(null);
    await saveNextFormLayout(latestDraftFormLayout.current);
  }

  async function reviewServerFormLayout() {
    setConflictReviewPending(true);
    try {
      const latest = await getCardTemplateLayout(token, cardTemplate.id);
      const merged = mergeExternalStructure(latest, blocks, fields);
      setConflictServerLayout(merged);
      queryClient.setQueryData(["card-template-layout", token, cardTemplate.id], latest);
    } catch (error) {
      setLocalError(errorMessage(error));
    } finally {
      setConflictReviewPending(false);
    }
  }

  function acceptServerFormLayout() {
    if (!conflictServerLayout) return;
    localStructure.current = conflictServerLayout.structure;
    latestDraftFormLayout.current = conflictServerLayout.form_layout;
    currentRevision.current = conflictServerLayout.revision;
    conflictActive.current = false;
    formSaveFailed.current = false;
    queuedFormSave.current = null;
    updateDraftLayout(conflictServerLayout);
    setFailedFormLayout(null);
    setHasFormConflict(false);
    setConflictServerLayout(null);
    setLocalError(null);
    setLocalMessage("Принята версия макета с сервера");
    setSelection(null);
    updateGeometryHistory({ undo: [], redo: [] });
  }

  async function saveReviewedLocalFormLayout() {
    if (!failedFormLayout || !conflictServerLayout) return;
    const local = latestDraftFormLayout.current;
    currentRevision.current = conflictServerLayout.revision;
    conflictActive.current = false;
    formSaveFailed.current = false;
    setConflictServerLayout(null);
    setFailedFormLayout(null);
    setHasFormConflict(false);
    setLocalError(null);
    await saveNextFormLayout(local);
  }

  function updateGeometryHistory(next: GeometryHistory) {
    geometryHistoryRef.current = next;
    setGeometryHistoryState(next);
  }

  function handleGeometryCommit(command: LayoutGeometryCommand) {
    updateGeometryHistory({
      undo: [...geometryHistoryRef.current.undo, command],
      redo: [],
    });
    void saveNextFormLayout(applyGeometryCommand(draftLayoutRef.current.form_layout, command));
  }

  function undoGeometryChange() {
    const command = geometryHistoryRef.current.undo.at(-1);
    if (!command || conflictActive.current || schemaWritesInFlight.current > 0) return;
    updateGeometryHistory({
      undo: geometryHistoryRef.current.undo.slice(0, -1),
      redo: [...geometryHistoryRef.current.redo, command],
    });
    void saveNextFormLayout(
      applyGeometryCommand(draftLayoutRef.current.form_layout, {
        ...command,
        before: command.after,
        after: command.before,
      }),
    );
  }

  function redoGeometryChange() {
    const command = geometryHistoryRef.current.redo.at(-1);
    if (!command || conflictActive.current || schemaWritesInFlight.current > 0) return;
    updateGeometryHistory({
      undo: [...geometryHistoryRef.current.undo, command],
      redo: geometryHistoryRef.current.redo.slice(0, -1),
    });
    void saveNextFormLayout(applyGeometryCommand(draftLayoutRef.current.form_layout, command));
  }

  function startCreateBlock(position: CardLayoutCreatePosition) {
    const currentLayout = draftLayoutRef.current;
    const temporaryId = nextTemporaryId("block");
    const block: FormBlockRead = {
      id: temporaryId,
      registry_id: registryId,
      code: generateTechnicalCode(
        "Новый блок",
        "block",
        allBlocks.map((item) => item.code),
      ),
      title: "Новый блок",
      description: null,
      position: allBlocks.length,
      is_repeatable: false,
      is_active: true,
      public_visible: true,
      public_editable: false,
      layout_columns: 1,
      display_config_json: null,
    };
    const next = {
      ...currentLayout,
      structure: {
        ...currentLayout.structure,
        blocks: [...currentLayout.structure.blocks, block],
      },
      form_layout: {
        ...currentLayout.form_layout,
        sections: [
          ...currentLayout.form_layout.sections,
          {
            id: `layout-${temporaryId}`,
            block_id: temporaryId,
            ...position,
            items: [],
          },
        ],
      },
    };
    temporaryBlockIds.current.add(temporaryId);
    localStructure.current = next.structure;
    updateDraftLayout(next);
    setSelection({ kind: "block", id: temporaryId });
  }

  async function commitBlock(block: FormBlockRead) {
    let releaseGate: (() => void) | null = null;
    setSchemaPending(true);
    setLocalError(null);
    try {
      releaseGate = await beginSchemaWrite();
      if (temporaryBlockIds.current.has(block.id)) {
        const created = await createFormBlock(token, registryId, {
          code: block.code,
          title: block.title,
          description: block.description,
          position: block.position,
          is_repeatable: block.is_repeatable,
          public_visible: block.public_visible,
          public_editable: block.public_editable,
          layout_columns: block.layout_columns,
          display_config_json: block.display_config_json,
        });
        const next = replaceBlock(draftLayoutRef.current, block.id, created);
        temporaryBlockIds.current.delete(block.id);
        localStructure.current = next.structure;
        updateDraftLayout(next);
        const save = saveNextFormLayout(next.form_layout);
        releaseGate();
        releaseGate = null;
        await save;
        await onSchemaChanged?.();
        return true;
      }
      const updated = await updateFormBlock(token, block.id, {
        title: block.title,
        description: block.description,
        position: block.position,
        is_repeatable: block.is_repeatable,
        public_visible: block.public_visible,
        public_editable: block.public_editable,
        layout_columns: block.layout_columns,
        display_config_json: block.display_config_json,
      });
      updateDraftLayout((current) => {
        const structure = {
          ...current.structure,
          blocks: current.structure.blocks.map((item) => (item.id === updated.id ? updated : item)),
        };
        localStructure.current = structure;
        return { ...current, structure };
      });
      releaseGate();
      releaseGate = null;
      setLocalMessage("Блок сохранён");
      await onSchemaChanged?.();
      return true;
    } catch (error) {
      setLocalError(schemaErrorMessage(error));
      return false;
    } finally {
      releaseGate?.();
      setSchemaPending(false);
    }
  }

  function cancelBlock(blockId: string) {
    if (!temporaryBlockIds.current.delete(blockId)) return;
    const next = removeTemporaryBlock(draftLayoutRef.current, blockId);
    localStructure.current = next.structure;
    updateDraftLayout(next);
  }

  function startCreateField(blockId: string) {
    const currentLayout = draftLayoutRef.current;
    const section = currentLayout.form_layout.sections.find((item) => item.block_id === blockId);
    if (!section) return;
    const temporaryId = nextTemporaryId("field");
    const itemId = `layout-${temporaryId}`;
    const field: FormFieldRead = {
      id: temporaryId,
      block_id: blockId,
      code: generateTechnicalCode(
        "Новое поле",
        "field",
        allFields.map((item) => item.code),
      ),
      label: "Новое поле",
      description: null,
      field_type: "text",
      position: allFields.filter((item) => item.block_id === blockId).length,
      required_mode: "not_required",
      options_source_type: null,
      options_source_id: null,
      options_config_json: null,
      display_config_json: null,
      is_active: true,
      is_list_display: false,
      public_visible: true,
      public_editable: false,
    };
    const position = firstEmptyFieldPosition(section.items);
    const next = {
      ...currentLayout,
      structure: {
        ...currentLayout.structure,
        fields: [...currentLayout.structure.fields, field],
      },
      form_layout: {
        ...currentLayout.form_layout,
        sections: currentLayout.form_layout.sections.map((item) =>
          item.id === section.id
            ? {
                ...item,
                items: [
                  ...item.items,
                  {
                    id: itemId,
                    kind: "field",
                    field_id: temporaryId,
                    ...position,
                    text: null,
                  },
                ],
              }
            : item,
        ),
      },
    };
    temporaryFieldIds.current.add(temporaryId);
    localStructure.current = next.structure;
    updateDraftLayout(next);
    setSelection({ kind: "field", id: temporaryId });
  }

  async function commitField(field: FormFieldRead) {
    let releaseGate: (() => void) | null = null;
    setSchemaPending(true);
    setLocalError(null);
    try {
      releaseGate = await beginSchemaWrite();
      if (temporaryFieldIds.current.has(field.id)) {
        const created = await createFormField(token, field.block_id, {
          code: field.code,
          label: field.label,
          field_type: field.field_type,
          description: field.description,
          position: field.position,
          required_mode: field.required_mode,
          options_source_type: field.options_source_type,
          options_source_id: field.options_source_id,
          options_config_json: field.options_config_json,
          display_config_json: field.display_config_json,
          is_list_display: field.is_list_display,
          public_visible: field.public_visible,
          public_editable: field.public_editable,
        });
        await appendFieldsToTemplate([created.id]);
        const next = replaceField(draftLayoutRef.current, field.id, created);
        temporaryFieldIds.current.delete(field.id);
        localStructure.current = next.structure;
        updateDraftLayout(next);
        const save = saveNextFormLayout(next.form_layout);
        releaseGate();
        releaseGate = null;
        await save;
        await onSchemaChanged?.();
        return true;
      }
      const updated = await updateFormField(token, field.id, {
        code: field.code,
        label: field.label,
        description: field.description,
        field_type: field.field_type,
        position: field.position,
        required_mode: field.required_mode,
        options_source_type: field.options_source_type,
        options_source_id: field.options_source_id,
        options_config_json: field.options_config_json,
        display_config_json: field.display_config_json,
        is_active: field.is_active,
        is_list_display: field.is_list_display,
        public_visible: field.public_visible,
        public_editable: field.public_editable,
      });
      updateDraftLayout((current) => {
        const structure = {
          ...current.structure,
          fields: current.structure.fields.map((item) => (item.id === updated.id ? updated : item)),
        };
        localStructure.current = structure;
        return { ...current, structure };
      });
      releaseGate();
      releaseGate = null;
      setLocalMessage("Поле сохранено");
      await onSchemaChanged?.();
      return true;
    } catch (error) {
      setLocalError(schemaErrorMessage(error));
      return false;
    } finally {
      releaseGate?.();
      setSchemaPending(false);
    }
  }

  function cancelField(fieldId: string) {
    if (!temporaryFieldIds.current.delete(fieldId)) return;
    const next = removeTemporaryField(draftLayoutRef.current, fieldId);
    localStructure.current = next.structure;
    updateDraftLayout(next);
  }

  function openInsertBlock(position: CardLayoutCreatePosition) {
    setInsertDialog({ position, blockId: unusedBlocks[0]?.id ?? "" });
  }

  async function insertExistingBlock() {
    if (!insertDialog?.blockId) return;
    const insertPosition = insertDialog.position;
    const block = allBlocks.find((item) => item.id === insertDialog.blockId);
    if (!block) return;
    const blockFields = allFields.filter((field) => field.block_id === block.id && field.is_active);
    let releaseGate: (() => void) | null = null;
    setSchemaPending(true);
    try {
      releaseGate = await beginSchemaWrite();
      await appendFieldsToTemplate(blockFields.map((field) => field.id));
      const currentFormLayout = draftLayoutRef.current.form_layout;
      const nextFormLayout: CardTemplateFormLayoutRead = {
        ...currentFormLayout,
        sections: [
          ...currentFormLayout.sections,
          {
            id: `block-${block.id}`,
            block_id: block.id,
            ...insertPosition,
            items: blockFields.map((field, index) => ({
              id: `field-${field.id}`,
              kind: "field",
              field_id: field.id,
              row: Math.floor(index / 2) + 1,
              column: index % 2 === 0 ? 1 : 7,
              row_span: 1,
              column_span: 6,
              text: null,
            })),
          },
        ],
      };
      setInsertDialog(null);
      const save = saveNextFormLayout(nextFormLayout);
      releaseGate();
      releaseGate = null;
      await save;
      await onSchemaChanged?.();
    } catch (error) {
      setLocalError(errorMessage(error));
    } finally {
      releaseGate?.();
      setSchemaPending(false);
    }
  }

  async function appendFieldsToTemplate(fieldIds: string[]) {
    const missing = fieldIds.filter((fieldId) => !templateFieldIds.current.has(fieldId));
    if (missing.length === 0) return;
    const nextIds = [...templateFieldIds.current, ...missing];
    await updateCardTemplate(token, cardTemplate.id, {
      field_schema_json: { field_ids: nextIds },
    });
    templateFieldIds.current = new Set(nextIds);
  }

  async function savePrintDraft() {
    if (printSaveRunning.current) return null;
    printSaveRunning.current = true;
    setPrintSavePending(true);
    setLocalError(null);
    try {
      const normalized = normalizeLayoutGeometry(printLayout);
      const errors = validatePrintLayout(
        normalized,
        allFields,
        allBlocks,
        printName,
        outputFilename,
      ).filter((issue) => issue.level === "error");
      if (errors[0]) throw new Error(errors[0].message);
      const payload = {
        name: printName.trim(),
        is_default: true,
        layout_json: normalized,
        output_filename_template: outputFilename.trim(),
      };
      const saved = selectedPrintView?.document_template_id
        ? await updateCardTemplatePrintView(token, cardTemplate.id, selectedPrintView.id, payload)
        : await createCardTemplatePrintView(token, cardTemplate.id, payload);
      setSelectedPrintView(saved);
      setPrintViews((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setPrintLayout(normalized);
      setLocalMessage("Печатная форма сохранена");
      return saved;
    } catch (error) {
      setLocalError(errorMessage(error));
      return null;
    } finally {
      printSaveRunning.current = false;
      setPrintSavePending(false);
    }
  }

  function addPrintItem(kind: PrintOnlyItemKind) {
    const item = createPrintOnlyItem(kind, printLayout);
    if (isOverlayKind(item.kind)) {
      const overlay = printItemToOverlay(item);
      setPrintLayout((current) => ({
        ...current,
        overlays: [...(current.overlays ?? []), overlay],
      }));
    } else {
      setPrintLayout((current) => ({ ...current, items: [...current.items, item] }));
    }
    setSelectedPrintItemId(item.id);
    setLocalMessage(null);
  }

  function updateSelectedPrintItem(patch: Partial<CardPrintLayoutItem>) {
    if (!selectedPrintItem) return;
    setPrintLayout((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.id === selectedPrintItem.id
          ? ensureItemGeometry({ ...item, ...patch, override: true }, current)
          : item,
      ),
      overlays: current.overlays?.map((item) =>
        item.id === selectedPrintItem.id
          ? printItemToOverlay({ ...overlayToPrintItem(item), ...patch, override: true })
          : item,
      ),
    }));
  }

  function removeSelectedPrintItem() {
    if (!selectedPrintItem || selectedPrintItem.kind === "card_layout") return;
    setPrintLayout((current) => ({
      ...current,
      items: current.items.filter((item) => item.id !== selectedPrintItem.id),
      overlays: current.overlays?.filter((item) => item.id !== selectedPrintItem.id),
    }));
    setSelectedPrintItemId(null);
  }

  async function convertLegacyPrintView() {
    if (!selectedPrintView?.document_template_id) {
      setLocalError("Сначала сохраните печатное представление.");
      return;
    }
    setConversionPending(true);
    setLocalError(null);
    try {
      await convertCardTemplatePrintViewToLinkedCard(token, cardTemplate.id, selectedPrintView.id);
      const latest = await getCardTemplateLayout(token, cardTemplate.id);
      const converted =
        latest.print_views.find((item) => item.id === selectedPrintView.id) ??
        latest.print_views[0];
      setPrintViews(latest.print_views);
      setSelectedPrintView(converted);
      setPrintLayout(preparePrintLayout(converted, cardTemplate.id));
      setSelectedPrintItemId(null);
      setLocalMessage("Создана новая версия связанного макета");
      queryClient.setQueryData(["card-template-layout", token, cardTemplate.id], latest);
    } catch (error) {
      setLocalError(errorMessage(error));
    } finally {
      setConversionPending(false);
    }
  }

  async function generate(format: "docx" | "pdf") {
    if (generationRunning.current) return;
    generationRunning.current = true;
    setGenerationPending(true);
    setLocalError(null);
    try {
      if (selectedCardId) {
        const printView = await savePrintDraft();
        if (!printView) return;
        const generated =
          format === "docx"
            ? await generateCardTemplateLayoutDocx(token, selectedCardId, cardTemplate.id, {
                print_view_id: printView.id,
                title: printName,
              })
            : await generateCardTemplateLayoutPdf(token, selectedCardId, cardTemplate.id, {
                print_view_id: printView.id,
                title: printName,
              });
        setLastGenerated(generated.document);
        setLocalMessage(`${format.toUpperCase()} сформирован`);
        return;
      }
      const payload = {
        name: printName.trim(),
        card_template_id: cardTemplate.id,
        layout_json: normalizeLayoutGeometry(printLayout),
        output_filename_template: outputFilename.trim(),
      };
      const download =
        format === "docx"
          ? await downloadBlankCardPrintLayoutDocx(token, registryId, payload)
          : await downloadBlankCardPrintLayoutPdf(token, registryId, payload);
      triggerBrowserDownload(download.blob, download.filename);
      setLocalMessage(`Пустой ${format.toUpperCase()} скачан`);
    } catch (error) {
      setLocalError(errorMessage(error));
    } finally {
      generationRunning.current = false;
      setGenerationPending(false);
    }
  }

  async function downloadLast() {
    if (!lastGenerated) return;
    try {
      const download = await downloadGeneratedDocumentContent(token, lastGenerated.id);
      triggerBrowserDownload(download.blob, download.filename);
      setLocalMessage("Документ скачан");
    } catch (error) {
      setLocalError(errorMessage(error));
    }
  }

  function loadPrintView(printViewId: string) {
    const next = printViews.find((item) => item.id === printViewId);
    if (!next) return;
    setSelectedPrintView(next);
    setPrintName(next.name);
    setOutputFilename(next.output_filename_template || DEFAULT_OUTPUT_FILENAME);
    setPrintLayout(preparePrintLayout(next, cardTemplate.id));
    setSelectedPrintItemId(null);
  }

  function nextTemporaryId(kind: "block" | "field") {
    temporaryCounter.current += 1;
    return `draft-${kind}-${temporaryCounter.current}`;
  }

  const busy =
    formSavePending ||
    schemaPending ||
    printSavePending ||
    generationPending ||
    conversionPending ||
    conflictReviewPending;

  return (
    <section
      className="card-layout-studio"
      role="region"
      aria-label={`Редактор макета карточки ${cardTemplate.name}`}
      aria-busy={busy}
    >
      <header className="card-layout-studio-header">
        <div>
          <h3>{cardTemplate.name}</h3>
          <span className="card-layout-studio-save-status">
            {formSavePending
              ? "Сохранение…"
              : (localMessage ?? (localError ? "Не сохранено" : "Сохранено"))}
          </span>
        </div>
        <div className="row-actions" role="toolbar" aria-label="Действия макета карточки">
          <button
            type="button"
            className="ghost-button"
            aria-label="Отменить изменение"
            disabled={geometryHistory.undo.length === 0 || hasFormConflict || schemaPending}
            onClick={undoGeometryChange}
          >
            Отменить
          </button>
          <button
            type="button"
            className="ghost-button"
            aria-label="Повторить изменение"
            disabled={geometryHistory.redo.length === 0 || hasFormConflict || schemaPending}
            onClick={redoGeometryChange}
          >
            Повторить
          </button>
          <button
            type="button"
            className="ghost-button"
            disabled={busy}
            onClick={() => void generate("docx")}
          >
            DOCX
          </button>
          <button
            type="button"
            className="ghost-button"
            disabled={busy}
            onClick={() => void generate("pdf")}
          >
            PDF
          </button>
          {lastGenerated ? (
            <button
              type="button"
              className="ghost-button"
              disabled={busy}
              onClick={() => void downloadLast()}
            >
              Скачать
            </button>
          ) : null}
          {onClose ? (
            <button type="button" className="ghost-button" disabled={busy} onClick={onClose}>
              Закрыть
            </button>
          ) : null}
        </div>
      </header>

      {localError ? (
        <section className="card-layout-studio-recovery" aria-label="Восстановление макета">
          <p className="data-alert">{localError}</p>
          {failedFormLayout && !hasFormConflict ? (
            <div className="row-actions">
              <button
                type="button"
                className="primary-button"
                disabled={formSavePending || schemaPending}
                onClick={() => void retryFailedFormLayout()}
              >
                Повторить
              </button>
            </div>
          ) : null}
          {failedFormLayout && hasFormConflict ? (
            <>
              <div className="row-actions">
                <button
                  type="button"
                  className="ghost-button"
                  disabled={busy}
                  onClick={() => void reviewServerFormLayout()}
                >
                  Сравнить с версией сервера
                </button>
              </div>
              {conflictServerLayout ? (
                <section
                  className="card-layout-conflict-comparison"
                  role="region"
                  aria-label="Сравнение версий макета"
                >
                  <div>
                    <strong>Локальная версия</strong>
                    <pre data-testid="conflict-local-layout">
                      {formatFormLayoutForReview(failedFormLayout)}
                    </pre>
                  </div>
                  <div>
                    <strong>Версия на сервере</strong>
                    <pre data-testid="conflict-server-layout">
                      {formatFormLayoutForReview(conflictServerLayout.form_layout)}
                    </pre>
                  </div>
                  <div className="row-actions">
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={busy}
                      onClick={acceptServerFormLayout}
                    >
                      Принять версию сервера
                    </button>
                    <button
                      type="button"
                      className="primary-button"
                      disabled={busy}
                      onClick={() => void saveReviewedLocalFormLayout()}
                    >
                      Сохранить локальную версию
                    </button>
                  </div>
                </section>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}
      {localMessage ? <p className="inline-success">{localMessage}</p> : null}
      <DataAlert error={referenceListsQuery.error} />

      <div className="card-layout-studio-tabs" role="tablist" aria-label="Этапы макета карточки">
        {stages.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            data-stage-id={item.id}
            aria-selected={stage === item.id}
            disabled={busy}
            className={stage === item.id ? "is-active" : ""}
            onClick={() => {
              setStage(item.id);
              setSelection(null);
              setSelectedPrintItemId(null);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {stage === "layout" ? (
        <CardLayoutRenderer
          layout={draftLayout}
          blocks={allBlocks}
          fields={allFields}
          referenceLists={effectiveReferenceLists}
          mode="design"
          selection={selection}
          onSelectionChange={setSelection}
          onCreateBlock={startCreateBlock}
          onInsertBlock={openInsertBlock}
          onCreateField={startCreateField}
          onCommitBlock={commitBlock}
          onCancelBlock={cancelBlock}
          onCommitField={commitField}
          onCancelField={cancelField}
          onGeometryCommit={handleGeometryCommit}
        />
      ) : null}

      {stage === "a4" ? (
        <div className="card-layout-a4-workspace">
          <div className="card-layout-a4-controls">
            <label>
              Печатное представление
              <select
                value={selectedPrintView?.id ?? ""}
                disabled={busy}
                onChange={(event) => loadPrintView(event.currentTarget.value)}
              >
                {printViews.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Название печатной формы
              <input
                value={printName}
                disabled={busy}
                onChange={(event) => setPrintName(event.currentTarget.value)}
              />
            </label>
            <label>
              Масштаб
              <select
                value={zoom}
                disabled={busy}
                onChange={(event) => setZoom(Number(event.currentTarget.value))}
              >
                <option value={0.5}>50%</option>
                <option value={0.75}>75%</option>
                <option value={1}>100%</option>
              </select>
            </label>
            <button
              type="button"
              className="primary-button"
              disabled={busy || legacyPrintView}
              onClick={() => void savePrintDraft()}
            >
              Сохранить печатную форму
            </button>
            <details>
              <summary>Параметры файла</summary>
              <label>
                Имя файла
                <input
                  value={outputFilename}
                  disabled={busy}
                  onChange={(event) => setOutputFilename(event.currentTarget.value)}
                />
              </label>
            </details>
          </div>
          <A4LinkedCardCanvas
            layout={printLayout}
            cardLayout={draftLayout}
            blocks={allBlocks}
            fields={allFields}
            zoom={zoom}
            showGrid={false}
            selectedItemId={selectedPrintItemId}
            legacy={legacyPrintView}
            converting={conversionPending}
            disabled={busy}
            onSelectItem={setSelectedPrintItemId}
            onChangeLayout={setPrintLayout}
            onAddPrintItem={addPrintItem}
            onConvertLegacy={() => void convertLegacyPrintView()}
          />
          {selectedPrintItem && selectedPrintItem.kind !== "card_layout" ? (
            <A4TemplatePropertiesPanel
              item={selectedPrintItem}
              fields={allFields}
              showTechnicalData={false}
              onUpdateItem={updateSelectedPrintItem}
              onDeleteItem={removeSelectedPrintItem}
            />
          ) : null}
        </div>
      ) : null}

      {stage === "preview" ? (
        <div className="card-layout-preview-stage">
          <CardLayoutRenderer
            layout={draftLayout}
            blocks={allBlocks}
            fields={allFields}
            mode="preview"
          />
          <A4LinkedCardCanvas
            layout={printLayout}
            cardLayout={draftLayout}
            blocks={allBlocks}
            fields={allFields}
            zoom={0.5}
            showGrid={false}
            selectedItemId={null}
            readonly
            legacy={legacyPrintView}
          />
        </div>
      ) : null}

      {insertDialog ? (
        <div className="a4-template-dialog-backdrop" role="presentation">
          <section
            className="a4-template-dialog"
            role="dialog"
            aria-label="Вставка существующего блока"
          >
            <h4>Вставить существующий блок</h4>
            <label>
              Блок
              <select
                value={insertDialog.blockId}
                onChange={(event) =>
                  setInsertDialog({ ...insertDialog, blockId: event.currentTarget.value })
                }
              >
                {unusedBlocks.map((block) => (
                  <option key={block.id} value={block.id}>
                    {block.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="row-actions">
              <button
                type="button"
                className="primary-button"
                disabled={!insertDialog.blockId || busy}
                onClick={() => void insertExistingBlock()}
              >
                Вставить
              </button>
              <button
                type="button"
                className="ghost-button"
                disabled={busy}
                onClick={() => setInsertDialog(null)}
              >
                Отмена
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <span className="visually-hidden" aria-live="polite">
        {effectiveReferenceLists.length} справочников доступно.{" "}
        {busy ? "Выполняется сохранение." : ""}
      </span>
    </section>
  );
}

function mergeExternalStructure(
  layout: CardTemplateLayoutRead,
  blocks: FormBlockRead[],
  fields: FormFieldRead[],
): CardTemplateLayoutRead {
  return {
    ...layout,
    structure: {
      blocks: mergeById(layout.structure.blocks, blocks),
      fields: mergeById(layout.structure.fields, fields),
    },
  };
}

function mergeStructure(
  server: CardTemplateLayoutRead["structure"],
  local: CardTemplateLayoutRead["structure"],
) {
  return {
    blocks: mergeById(server.blocks, local.blocks),
    fields: mergeById(server.fields, local.fields),
  };
}

function mergeById<T extends { id: string }>(primary: T[], secondary: T[]): T[] {
  const result = new Map(primary.map((item) => [item.id, item]));
  for (const item of secondary) result.set(item.id, item);
  return [...result.values()];
}

function applyGeometryCommand(
  layout: CardTemplateFormLayoutRead,
  command: LayoutGeometryCommand,
): CardTemplateFormLayoutRead {
  if (command.target.kind === "block") {
    return {
      ...layout,
      sections: layout.sections.map((section) =>
        section.id === command.target.id
          ? {
              ...section,
              row: command.after.row,
              column: command.after.column,
              row_span: command.after.rowSpan,
              column_span: command.after.columnSpan,
            }
          : section,
      ),
    };
  }
  return {
    ...layout,
    sections: layout.sections.map((section) => ({
      ...section,
      items: section.items.map((item) =>
        item.id === command.target.id
          ? {
              ...item,
              row: command.after.row,
              column: command.after.column,
              row_span: command.after.rowSpan,
              column_span: command.after.columnSpan,
            }
          : item,
      ),
    })),
  };
}

function formatFormLayoutForReview(layout: CardTemplateFormLayoutRead) {
  return layout.sections
    .flatMap((section, sectionIndex) => [
      `Блок ${sectionIndex + 1}: строка ${section.row}, колонка ${section.column}, ` +
        `высота ${section.row_span}, ширина ${section.column_span}`,
      ...section.items.map(
        (item, itemIndex) =>
          `Поле ${itemIndex + 1}: строка ${item.row}, колонка ${item.column}, ` +
          `высота ${item.row_span}, ширина ${item.column_span}`,
      ),
    ])
    .join("\n");
}

function replaceBlock(
  layout: CardTemplateLayoutRead,
  temporaryId: string,
  block: FormBlockRead,
): CardTemplateLayoutRead {
  return {
    ...layout,
    structure: {
      ...layout.structure,
      blocks: layout.structure.blocks.map((item) => (item.id === temporaryId ? block : item)),
    },
    form_layout: {
      ...layout.form_layout,
      sections: layout.form_layout.sections.map((section) =>
        section.block_id === temporaryId
          ? { ...section, id: `block-${block.id}`, block_id: block.id }
          : section,
      ),
    },
  };
}

function replaceField(
  layout: CardTemplateLayoutRead,
  temporaryId: string,
  field: FormFieldRead,
): CardTemplateLayoutRead {
  return {
    ...layout,
    structure: {
      ...layout.structure,
      fields: layout.structure.fields.map((item) => (item.id === temporaryId ? field : item)),
    },
    form_layout: {
      ...layout.form_layout,
      sections: layout.form_layout.sections.map((section) => ({
        ...section,
        items: section.items.map((item) =>
          item.field_id === temporaryId
            ? { ...item, id: `field-${field.id}`, field_id: field.id }
            : item,
        ),
      })),
    },
  };
}

function removeTemporaryBlock(layout: CardTemplateLayoutRead, blockId: string) {
  return {
    ...layout,
    structure: {
      ...layout.structure,
      blocks: layout.structure.blocks.filter((item) => item.id !== blockId),
    },
    form_layout: {
      ...layout.form_layout,
      sections: layout.form_layout.sections.filter((section) => section.block_id !== blockId),
    },
  };
}

function removeTemporaryField(layout: CardTemplateLayoutRead, fieldId: string) {
  return {
    ...layout,
    structure: {
      ...layout.structure,
      fields: layout.structure.fields.filter((item) => item.id !== fieldId),
    },
    form_layout: {
      ...layout.form_layout,
      sections: layout.form_layout.sections.map((section) => ({
        ...section,
        items: section.items.filter((item) => item.field_id !== fieldId),
      })),
    },
  };
}

function firstEmptyFieldPosition(items: CardTemplateFormLayoutRead["sections"][number]["items"]) {
  for (let row = 1; row <= 4; row += 1) {
    for (const column of [1, 4, 7, 10]) {
      const collides = items.some(
        (item) =>
          column < item.column + item.column_span &&
          column + 3 > item.column &&
          row < item.row + item.row_span &&
          row + 1 > item.row,
      );
      if (!collides) return { row, column, row_span: 1 as const, column_span: 3 as const };
    }
  }
  return { row: 4, column: 10, row_span: 1 as const, column_span: 3 as const };
}

function preparePrintLayout(
  printView: CardTemplatePrintViewRead | undefined,
  cardTemplateId: string,
) {
  const layout = normalizeLayoutGeometry(printView?.layout_json ?? createEmptyCardPrintLayout());
  if (isLinkedCardPrintLayout(layout)) return markLinkedCardPrintLayout(layout);
  if (hasLegacyCardComposition(layout)) return layout;
  return markLinkedCardPrintLayout({
    ...layout,
    items: [createLinkedCardPrintItem(cardTemplateId), ...layout.items],
  });
}

function hasLegacyCardComposition(layout: CardPrintLayout) {
  return (
    layout.items.some((item) => item.kind === "field" || item.kind === "block") ||
    (layout.sections ?? []).some((section) => section.items.some((item) => item.kind === "field"))
  );
}

function createPrintOnlyItem(
  kind: PrintOnlyItemKind,
  layout: CardPrintLayout,
): CardPrintLayoutItem {
  const index = layout.items.length + (layout.overlays?.length ?? 0) + 1;
  const labels: Record<PrintOnlyItemKind, string> = {
    heading: "Заголовок",
    static_text: "Печатный текст",
    panel: "Панель",
    rectangle: "Прямоугольник",
    divider: "Линия",
    print_date: "Дата печати",
    page_number: "Номер страницы",
    metadata: "Название карточки",
  };
  const overlay = isOverlayKind(kind);
  return {
    id: `print-${kind}-${index}`,
    kind,
    page: 1,
    row: 1,
    column: 1,
    row_span: 1,
    column_span: kind === "heading" ? 12 : 6,
    x_mm: overlay ? 18 : kind === "page_number" ? 170 : 18,
    y_mm: overlay ? 12 : 274,
    width_mm: kind === "page_number" ? 22 : kind === "heading" ? 174 : 80,
    height_mm: kind === "divider" ? 1 : 9,
    text: labels[kind],
    label: labels[kind],
    metadata_key: kind === "metadata" ? "card.display_name" : undefined,
  };
}

function isOverlayKind(kind: CardPrintLayoutItem["kind"] | PrintOnlyItemKind) {
  return ["heading", "static_text", "panel", "rectangle", "divider"].includes(kind);
}

function printItemToOverlay(item: CardPrintLayoutItem): CardPrintOverlayItem {
  return {
    id: item.id,
    kind: item.kind as CardPrintOverlayItem["kind"],
    page: item.page,
    x_mm: item.x_mm ?? 0,
    y_mm: item.y_mm ?? 0,
    width_mm: item.width_mm ?? 1,
    height_mm: item.height_mm ?? 1,
    text: item.text,
    style: item.style,
  };
}

function overlayToPrintItem(item: CardPrintOverlayItem): CardPrintLayoutItem {
  return {
    ...item,
    row: 1,
    column: 1,
    row_span: 1,
    column_span: 1,
  };
}

function findPrintItem(layout: CardPrintLayout, itemId: string | null) {
  if (!itemId) return null;
  const item = layout.items.find((candidate) => candidate.id === itemId);
  if (item) return item;
  const overlay = layout.overlays?.find((candidate) => candidate.id === itemId);
  return overlay ? overlayToPrintItem(overlay) : null;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function schemaErrorMessage(error: unknown) {
  const message = errorMessage(error);
  if (message.includes("Field code already exists")) {
    return "Технический код уже используется другим полем этого реестра.";
  }
  if (message.includes("Field code format")) {
    return "Технический код должен начинаться с латинской буквы и содержать только строчные латинские буквы, цифры, дефисы и подчёркивания.";
  }
  return message;
}

function triggerBrowserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
