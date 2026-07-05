import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import {
  createCardPrintTemplate,
  createCardPrintTemplateVersion,
  createFormBlock,
  createFormField,
  createReferenceList,
  downloadBlankCardPrintLayoutDocx,
  downloadBlankCardPrintLayoutPdf,
  downloadGeneratedDocumentContent,
  generateDocument,
  generatePdfDocument,
  listCardPrintTemplates,
  listReferenceLists,
  updateCardTemplate,
} from "@/api/client";
import type {
  CardPrintLayout,
  CardPrintLayoutItem,
  CardTemplateRead,
  FormBlockRead,
  FormFieldRead,
  GeneratedDocumentRead,
  ReferenceListRead,
} from "@/api/types";
import { generateTechnicalCode } from "@/app/technicalCode";
import { DataAlert } from "@/components/common/DataSurfaces";
import { MutationFeedback } from "@/components/common/AdminMutation";

import { A4TemplatePalette } from "./A4TemplatePalette";
import { A4TemplatePropertiesPanel } from "./A4TemplatePropertiesPanel";
import { A4LayoutRenderer, type A4RendererMode } from "./A4LayoutRenderer";
import { A4TemplateToolbar } from "./A4TemplateToolbar";
import {
  A4_WIDTH_MM,
  createEmptyCardPrintLayout,
  ensureItemGeometry,
  normalizeLayoutGeometry,
} from "./printLayoutGeometry";
import { validatePrintLayout } from "./printLayoutValidation";

const defaultOutputFilename = "{{ card.display_name }}.docx";
const blockFieldGridColumns = 5;
const blockFieldPaddingMm = 4;
const blockFieldHeaderMm = 10;
const blockFieldGapMm = 3;
const blockFieldHeightMm = 12;

const FIELD_TYPES = [
  "text",
  "number",
  "date",
  "datetime",
  "bool",
  "json",
  "select",
  "multi_select",
  "card_ref",
  "user_ref",
  "organization_ref",
  "org_unit_ref",
  "registry_ref",
  "file_ref",
  "static_text",
];

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

type FieldDialogState = {
  label: string;
  fieldType: string;
  blockId: string;
  required: boolean;
  publicVisible: boolean;
  publicEditable: boolean;
  isListDisplay: boolean;
  referenceListId: string;
  newReferenceListName: string;
};

type BlockDialogState = {
  title: string;
  repeatable: boolean;
  repeatMode: "first_instance_only" | "repeat_section" | "table_rows";
  publicVisible: boolean;
  publicEditable: boolean;
};

type StudioMode = "composition" | "web" | "a4" | "preview" | "settings";

const studioModes: { id: StudioMode; label: string }[] = [
  { id: "composition", label: "Состав карточки" },
  { id: "web", label: "Веб-форма" },
  { id: "a4", label: "Печатная форма A4" },
  { id: "preview", label: "Предпросмотр карточки" },
  { id: "settings", label: "Настройки" },
];

export function CardLayoutStudio({
  token,
  registryId,
  cardTemplate,
  blocks,
  fields,
  referenceLists,
  selectedCardId = null,
  onClose,
  onSchemaChanged,
}: CardLayoutStudioProps) {
  const queryClient = useQueryClient();
  const [createdFields, setCreatedFields] = useState<FormFieldRead[]>([]);
  const [createdBlocks, setCreatedBlocks] = useState<FormBlockRead[]>([]);
  const allBlocks = useMemo(() => [...blocks, ...createdBlocks], [blocks, createdBlocks]);
  const allFields = useMemo(() => [...fields, ...createdFields], [fields, createdFields]);
  const availableFields = useMemo(
    () =>
      cardTemplateFields(
        cardTemplate,
        allFields,
        allBlocks,
        new Set(createdFields.map((field) => field.id)),
      ),
    [allBlocks, allFields, cardTemplate, createdFields],
  );
  const availableFieldsByBlockId = useMemo(() => {
    const grouped = new Map<string, FormFieldRead[]>();
    for (const field of availableFields) {
      grouped.set(field.block_id, [...(grouped.get(field.block_id) ?? []), field]);
    }
    for (const [blockId, blockFields] of grouped) {
      grouped.set(
        blockId,
        [...blockFields].sort((left, right) => left.position - right.position),
      );
    }
    return grouped;
  }, [availableFields]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [name, setName] = useState(`${cardTemplate.name}: печать`);
  const [code, setCode] = useState(
    generateTechnicalCode(`${cardTemplate.code}-print`, "print", []),
  );
  const [description, setDescription] = useState("");
  const [outputFilenameTemplate, setOutputFilenameTemplate] = useState(defaultOutputFilename);
  const [layout, setLayout] = useState<CardPrintLayout>(() => createEmptyCardPrintLayout());
  const [history, setHistory] = useState<CardPrintLayout[]>([]);
  const [future, setFuture] = useState<CardPrintLayout[]>([]);
  const [zoom, setZoom] = useState(0.75);
  const [showGrid, setShowGrid] = useState(true);
  const [showTechnicalData, setShowTechnicalData] = useState(false);
  const [studioMode, setStudioMode] = useState<StudioMode>("a4");
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [lastGenerated, setLastGenerated] = useState<GeneratedDocumentRead | null>(null);
  const [fieldDialog, setFieldDialog] = useState<FieldDialogState | null>(null);
  const [blockDialog, setBlockDialog] = useState<BlockDialogState | null>(null);

  const printTemplatesQuery = useQuery({
    queryKey: ["card-print-templates", token, registryId, cardTemplate.id],
    queryFn: () => listCardPrintTemplates(token, registryId, cardTemplate.id),
    enabled: Boolean(token && registryId && cardTemplate.id),
  });
  const referenceListsQuery = useQuery({
    queryKey: ["reference-lists", token, registryId],
    queryFn: () => listReferenceLists(token, registryId),
    enabled: Boolean(token && registryId && !referenceLists),
  });

  const printTemplates = (printTemplatesQuery.data?.items ?? []).filter(
    (template) => template.card_template_id === cardTemplate.id,
  );
  const effectiveReferenceLists = referenceLists ?? referenceListsQuery.data?.items ?? [];
  const selectedItem = layout.items.find((item) => item.id === selectedItemId) ?? null;
  const validationIssues = useMemo(
    () => validatePrintLayout(layout, availableFields, allBlocks, name, outputFilenameTemplate),
    [allBlocks, availableFields, layout, name, outputFilenameTemplate],
  );
  const validationErrors = validationIssues.filter((issue) => issue.level === "error");

  const saveMutation = useMutation({
    mutationFn: async () => {
      const normalizedLayout = normalizeLayoutGeometry(layout);
      const issues = validatePrintLayout(
        normalizedLayout,
        availableFields,
        allBlocks,
        name,
        outputFilenameTemplate,
      );
      const errors = issues.filter((issue) => issue.level === "error");
      if (errors.length > 0) {
        throw new Error(errors[0].message);
      }
      const cleanName = name.trim();
      const cleanCode = code.trim();
      const cleanOutput = outputFilenameTemplate.trim();
      if (selectedTemplateId) {
        await createCardPrintTemplateVersion(token, selectedTemplateId, {
          layout_json: normalizedLayout,
        });
        return { templateId: selectedTemplateId };
      }
      const created = await createCardPrintTemplate(token, registryId, {
        code: cleanCode,
        name: cleanName,
        description: description.trim() || null,
        card_template_id: cardTemplate.id,
        layout_json: normalizedLayout,
        output_filename_template: cleanOutput,
      });
      return { templateId: created.id };
    },
    onMutate: () => {
      setLocalError(null);
      setLocalMessage(null);
    },
    onSuccess: async (result) => {
      setLocalMessage("Печатный шаблон сохранен");
      await queryClient.invalidateQueries({
        queryKey: ["card-print-templates", token, registryId, cardTemplate.id],
      });
      setSelectedTemplateId(result.templateId);
      setLayout((current) => normalizeLayoutGeometry(current));
    },
    onError: (error) => setLocalError(error instanceof Error ? error.message : String(error)),
  });

  const generateDocxMutation = useMutation<GeneratedDocumentRead | null>({
    mutationFn: async () => {
      if (selectedCardId) {
        const { templateId } = await saveMutation.mutateAsync();
        return generateDocument(token, selectedCardId, templateId, name);
      }
      const download = await downloadBlankCardPrintLayoutDocx(
        token,
        registryId,
        blankLayoutDownloadPayload(),
      );
      triggerBrowserDownload(download.blob, download.filename);
      return null;
    },
    onSuccess: (generated) => {
      if (generated) {
        setLastGenerated(generated);
        setLocalMessage("DOCX сформирован");
      } else {
        setLocalMessage("Пустой DOCX скачан");
      }
    },
    onError: (error) => setLocalError(error instanceof Error ? error.message : String(error)),
  });

  const generatePdfMutation = useMutation<GeneratedDocumentRead | null>({
    mutationFn: async () => {
      if (selectedCardId) {
        const { templateId } = await saveMutation.mutateAsync();
        return generatePdfDocument(token, selectedCardId, templateId, name);
      }
      const download = await downloadBlankCardPrintLayoutPdf(
        token,
        registryId,
        blankLayoutDownloadPayload(),
      );
      triggerBrowserDownload(download.blob, download.filename);
      return null;
    },
    onSuccess: (generated) => {
      if (generated) {
        setLastGenerated(generated);
        setLocalMessage("PDF сформирован");
      } else {
        setLocalMessage("Пустой PDF скачан");
      }
    },
    onError: (error) => setLocalError(error instanceof Error ? error.message : String(error)),
  });

  const downloadLastMutation = useMutation({
    mutationFn: async () => {
      if (!lastGenerated) {
        throw new Error("Нет сформированного файла для скачивания.");
      }
      return downloadGeneratedDocumentContent(token, lastGenerated.id);
    },
    onSuccess: ({ blob, filename }) => {
      triggerBrowserDownload(blob, filename);
      setLocalMessage("Документ скачан");
    },
    onError: (error) => setLocalError(error instanceof Error ? error.message : String(error)),
  });

  const createFieldMutation = useMutation({
    mutationFn: async (state: FieldDialogState) => {
      const cleanLabel = state.label.trim();
      if (!cleanLabel) {
        throw new Error("Укажите название поля.");
      }
      const blockId = state.blockId || allBlocks[0]?.id;
      if (!blockId) {
        throw new Error("Сначала создайте блок данных.");
      }
      let referenceListId = state.referenceListId || null;
      if (usesReferenceList(state.fieldType) && state.newReferenceListName.trim()) {
        const createdReferenceList = await createReferenceList(token, registryId, {
          code: generateTechnicalCode(state.newReferenceListName, "ref", []),
          name: state.newReferenceListName.trim(),
        });
        referenceListId = createdReferenceList.id;
      }
      const field = await createFormField(token, blockId, {
        code: generateTechnicalCode(
          cleanLabel,
          "field",
          allFields.map((field) => field.code),
        ),
        label: cleanLabel,
        field_type: state.fieldType,
        required_mode: state.required ? "required" : "not_required",
        public_visible: state.publicVisible,
        public_editable: state.publicEditable,
        is_list_display: state.isListDisplay,
        options_source_type:
          usesReferenceList(state.fieldType) && referenceListId ? "reference_list" : null,
        options_source_id:
          usesReferenceList(state.fieldType) && referenceListId ? referenceListId : null,
      });
      await appendFieldToCardTemplate(field.id);
      return field;
    },
    onSuccess: async (field) => {
      setCreatedFields((current) => [...current, field]);
      addItem(createFieldItem(field, layout.items));
      setFieldDialog(null);
      await queryClient.invalidateQueries({ queryKey: ["reference-lists", token, registryId] });
      await onSchemaChanged?.();
      setLocalMessage("Поле создано и добавлено на A4");
    },
    onError: (error) => setLocalError(error instanceof Error ? error.message : String(error)),
  });

  const createBlockMutation = useMutation({
    mutationFn: async (state: BlockDialogState) => {
      const cleanTitle = state.title.trim();
      if (!cleanTitle) {
        throw new Error("Укажите название блока.");
      }
      return createFormBlock(token, registryId, {
        code: generateTechnicalCode(
          cleanTitle,
          "block",
          allBlocks.map((block) => block.code),
        ),
        title: cleanTitle,
        position: allBlocks.length,
        is_repeatable: state.repeatable,
        public_visible: state.publicVisible,
        public_editable: state.publicEditable,
        display_config_json: {
          print_repeat_mode: state.repeatMode,
        },
      });
    },
    onSuccess: async (block) => {
      setCreatedBlocks((current) => [...current, block]);
      addItem(
        createBlockItem(block, layout.items, blockDialog?.repeatMode ?? "first_instance_only"),
      );
      setBlockDialog(null);
      await onSchemaChanged?.();
      setLocalMessage("Блок создан и добавлен на A4");
    },
    onError: (error) => setLocalError(error instanceof Error ? error.message : String(error)),
  });

  const saveStatus = saveStatusText(
    saveMutation.isPending ? "saving" : "idle",
    localMessage,
    validationErrors.length,
  );
  const rendererMode: A4RendererMode = studioMode === "preview" ? "preview" : "design";
  const isDesignMode = studioMode === "a4";

  async function appendFieldToCardTemplate(fieldId: string) {
    const currentFieldIds = templateFieldIds(cardTemplate);
    if (currentFieldIds.includes(fieldId)) {
      return;
    }
    await updateCardTemplate(token, cardTemplate.id, {
      field_schema_json: {
        ...cardTemplate.field_schema_json,
        field_ids: [...currentFieldIds, fieldId],
      },
    });
  }

  function commitLayout(nextLayout: CardPrintLayout) {
    setHistory((current) => [...current.slice(-24), layout]);
    setFuture([]);
    setLayout(normalizeLayoutGeometry(nextLayout));
    setLocalMessage(null);
  }

  function addItems(items: CardPrintLayoutItem[]) {
    const nextItems = [...layout.items];
    let selectedId: string | null = null;
    for (const item of items) {
      const normalizedItem = ensureItemGeometry(item, { ...layout, items: nextItems });
      nextItems.push(normalizedItem);
      selectedId = normalizedItem.id;
    }
    commitLayout({ ...layout, items: nextItems });
    setSelectedItemId(selectedId);
  }

  function addItem(item: CardPrintLayoutItem) {
    addItems([item]);
  }

  function addExistingFieldAt(fieldId: string, point: { x_mm: number; y_mm: number }) {
    const field = availableFields.find((candidate) => candidate.id === fieldId);
    if (!field) {
      setLocalError("Поле не найдено в текущем шаблоне карточки.");
      return;
    }
    addItem(
      createFieldItem(field, layout.items, {
        x_mm: point.x_mm,
        y_mm: point.y_mm,
        width_mm: 78,
        height_mm: 12,
      }),
    );
  }

  function addExistingBlock(block: FormBlockRead) {
    addItems(
      createBlockItems(block, availableFields, layout.items, printRepeatModeForBlock(block)),
    );
  }

  function addExistingBlockAt(blockId: string, point: { x_mm: number; y_mm: number }) {
    const block = allBlocks.find((candidate) => candidate.id === blockId);
    if (!block) {
      setLocalError("Блок не найден в текущем реестре.");
      return;
    }
    addItems(
      createBlockItems(block, availableFields, layout.items, printRepeatModeForBlock(block), {
        x_mm: point.x_mm,
        y_mm: point.y_mm,
        width_mm: A4_WIDTH_MM - 30,
        height_mm: 42,
      }),
    );
  }

  function blankLayoutDownloadPayload() {
    const normalizedLayout = validateCurrentLayout();
    return {
      name: name.trim(),
      card_template_id: cardTemplate.id,
      layout_json: normalizedLayout,
      output_filename_template: outputFilenameTemplate.trim(),
    };
  }

  function validateCurrentLayout() {
    const normalizedLayout = normalizeLayoutGeometry(layout);
    const issues = validatePrintLayout(
      normalizedLayout,
      availableFields,
      allBlocks,
      name,
      outputFilenameTemplate,
    );
    const errors = issues.filter((issue) => issue.level === "error");
    if (errors.length > 0) {
      throw new Error(errors[0].message);
    }
    return normalizedLayout;
  }

  function updateSelectedItem(patch: Partial<CardPrintLayoutItem>) {
    if (!selectedItem) {
      return;
    }
    commitLayout({
      ...layout,
      items: layout.items.map((item) =>
        item.id === selectedItem.id ? ensureItemGeometry({ ...item, ...patch }, layout) : item,
      ),
    });
  }

  function removeSelectedItem() {
    if (!selectedItem) {
      return;
    }
    commitLayout({ ...layout, items: layout.items.filter((item) => item.id !== selectedItem.id) });
    setSelectedItemId(null);
  }

  function undo() {
    const previous = history.at(-1);
    if (!previous) {
      return;
    }
    setFuture((current) => [layout, ...current]);
    setHistory((current) => current.slice(0, -1));
    setLayout(previous);
  }

  function redo() {
    const next = future[0];
    if (!next) {
      return;
    }
    setHistory((current) => [...current, layout]);
    setFuture((current) => current.slice(1));
    setLayout(next);
  }

  function startNewTemplate() {
    setSelectedTemplateId(null);
    setSelectedItemId(null);
    setName(`${cardTemplate.name}: печать`);
    setCode(generateTechnicalCode(`${cardTemplate.code}-print`, "print", []));
    setDescription("");
    setOutputFilenameTemplate(defaultOutputFilename);
    setLayout(createEmptyCardPrintLayout());
    setHistory([]);
    setFuture([]);
    setLocalMessage(null);
    setLocalError(null);
  }

  function loadPrintTemplate(templateId: string) {
    if (!templateId) {
      startNewTemplate();
      return;
    }
    const template = printTemplates.find((candidate) => candidate.id === templateId);
    if (!template) {
      return;
    }
    const nextLayout = normalizeLayoutGeometry(
      template.current_layout_json ?? createEmptyCardPrintLayout(),
    );
    setSelectedTemplateId(template.id);
    setSelectedItemId(nextLayout.items[0]?.id ?? null);
    setName(template.name);
    setCode(template.code);
    setDescription(template.description ?? "");
    setOutputFilenameTemplate(template.output_filename_template || defaultOutputFilename);
    setLayout(nextLayout);
    setHistory([]);
    setFuture([]);
    setLocalMessage(null);
    setLocalError(null);
  }

  return (
    <section
      className="card-print-editor a4-template-editor"
      role="region"
      aria-label={`Редактор печатного шаблона A4 ${cardTemplate.name}`}
    >
      <A4TemplateToolbar
        templateName={name}
        saveStatus={saveStatus}
        zoom={zoom}
        showGrid={showGrid}
        previewMode={studioMode === "preview"}
        canGenerate={
          validationErrors.length === 0 &&
          !saveMutation.isPending &&
          !generateDocxMutation.isPending &&
          !generatePdfMutation.isPending
        }
        canDownloadLast={Boolean(lastGenerated)}
        onTemplateNameChange={setName}
        onZoomChange={setZoom}
        onToggleGrid={() => setShowGrid((current) => !current)}
        onTogglePreview={() =>
          setStudioMode((current) => (current === "preview" ? "a4" : "preview"))
        }
        onOpenSettings={() => setStudioMode("settings")}
        onSave={() => saveMutation.mutate()}
        onGenerateDocx={() => generateDocxMutation.mutate()}
        onGeneratePdf={() => generatePdfMutation.mutate()}
        onDownloadLast={() => downloadLastMutation.mutate()}
      />
      <MutationFeedback
        error={localError ? new Error(localError) : null}
        successMessage={localMessage}
      />
      <DataAlert error={printTemplatesQuery.error ?? referenceListsQuery.error} />

      <div className="card-layout-studio-tabs" role="tablist" aria-label="Режимы редактора шаблона">
        {studioModes.map((studioModeOption) => (
          <button
            key={studioModeOption.id}
            type="button"
            role="tab"
            aria-selected={studioMode === studioModeOption.id}
            className={studioMode === studioModeOption.id ? "is-active" : ""}
            onClick={() => setStudioMode(studioModeOption.id)}
          >
            {studioModeOption.label}
          </button>
        ))}
        {onClose && (
          <button type="button" className="ghost-button" onClick={onClose}>
            Закрыть
          </button>
        )}
      </div>

      <div className="a4-template-subbar">
        <label>
          Шаблон печати
          <select
            value={selectedTemplateId ?? ""}
            onChange={(event) => loadPrintTemplate(event.currentTarget.value)}
          >
            <option value="">Новый шаблон</option>
            {printTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>
        <label className="checkbox-inline">
          <input
            type="checkbox"
            checked={showTechnicalData}
            onChange={(event) => setShowTechnicalData(event.currentTarget.checked)}
          />
          Показать технические данные
        </label>
        <div className="row-actions">
          <button
            type="button"
            className="ghost-button"
            disabled={history.length === 0}
            onClick={undo}
          >
            Отменить
          </button>
          <button
            type="button"
            className="ghost-button"
            disabled={future.length === 0}
            onClick={redo}
          >
            Повторить
          </button>
          <button type="button" className="ghost-button" onClick={startNewTemplate}>
            Новый шаблон
          </button>
        </div>
      </div>

      {studioMode === "settings" && (
        <aside className="a4-template-settings" aria-label="Настройки шаблона">
          <div className="a4-template-settings-header">
            <h4>Настройки шаблона</h4>
            <button type="button" className="ghost-button" onClick={() => setStudioMode("a4")}>
              Закрыть
            </button>
          </div>
          <label>
            Технический код
            <input value={code} onChange={(event) => setCode(event.currentTarget.value)} />
          </label>
          <label>
            Имя файла
            <input
              value={outputFilenameTemplate}
              onChange={(event) => setOutputFilenameTemplate(event.currentTarget.value)}
            />
          </label>
          <label>
            Описание
            <textarea
              value={description}
              onChange={(event) => setDescription(event.currentTarget.value)}
            />
          </label>
        </aside>
      )}

      {(studioMode === "composition" || studioMode === "web") && (
        <section className="card-layout-structure" aria-label="Структура карточки">
          <header className="card-layout-structure-header">
            <div>
              <h4>{studioMode === "composition" ? "Состав карточки" : "Веб-форма"}</h4>
              <span>
                {studioMode === "composition"
                  ? "Блоки и поля текущего шаблона карточки"
                  : "Порядок блоков и полей для заполнения карточки в вебе"}
              </span>
            </div>
            <div className="row-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() =>
                  setBlockDialog({
                    title: "",
                    repeatable: false,
                    repeatMode: "first_instance_only",
                    publicVisible: true,
                    publicEditable: false,
                  })
                }
              >
                + Новый блок данных
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() =>
                  setFieldDialog({
                    label: "",
                    fieldType: "text",
                    blockId: allBlocks[0]?.id ?? "",
                    required: false,
                    publicVisible: true,
                    publicEditable: false,
                    isListDisplay: false,
                    referenceListId: "",
                    newReferenceListName: "",
                  })
                }
              >
                + Новое поле данных
              </button>
            </div>
          </header>
          <div className="card-layout-structure-list">
            {allBlocks.map((block) => {
              const blockFields = availableFieldsByBlockId.get(block.id) ?? [];
              return (
                <article key={block.id} className="card-layout-structure-block">
                  <header>
                    <div>
                      <h5>{block.title}</h5>
                      <span>Технический код: {block.code}</span>
                    </div>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => addExistingBlock(block)}
                    >
                      На A4
                    </button>
                  </header>
                  {blockFields.length > 0 ? (
                    <div className="card-layout-structure-fields">
                      {blockFields.map((field) => (
                        <div key={field.id} className="card-layout-structure-field">
                          <div>
                            <strong>{field.label}</strong>
                            <span>
                              {fieldTypeLabel(field.field_type)} /{" "}
                              {requiredModeLabel(field.required_mode)}
                            </span>
                            {studioMode === "web" && (
                              <small>
                                {field.public_visible
                                  ? "Видно в публичной ссылке"
                                  : "Скрыто в публичной ссылке"}
                              </small>
                            )}
                          </div>
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => addItem(createFieldItem(field, layout.items))}
                          >
                            На A4
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="muted-text">В блоке пока нет полей текущего шаблона.</p>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      {(studioMode === "a4" || studioMode === "preview") && (
        <div className={`a4-template-workbench ${studioMode === "preview" ? "is-preview" : ""}`}>
          {isDesignMode && (
            <A4TemplatePalette
              blocks={allBlocks}
              fields={availableFields}
              showTechnicalData={showTechnicalData}
              onAddExistingBlock={addExistingBlock}
              onAddExistingField={(field) => addItem(createFieldItem(field, layout.items))}
              onAddHeading={() => addItem(createTextItem("heading", "Заголовок", layout.items))}
              onAddStaticText={() => addItem(createTextItem("static_text", "Текст", layout.items))}
              onAddPanel={() => addItem(createDecorItem("panel", layout.items))}
              onAddRectangle={() => addItem(createDecorItem("rectangle", layout.items))}
              onAddDivider={() => addItem(createDecorItem("divider", layout.items))}
              onAddPrintDate={() => addItem(createServiceItem("print_date", layout.items))}
              onAddPageNumber={() => addItem(createServiceItem("page_number", layout.items))}
              onAddMetadata={(key) => addItem(createMetadataItem(key, layout.items))}
              onOpenNewField={() =>
                setFieldDialog({
                  label: "",
                  fieldType: "text",
                  blockId: allBlocks[0]?.id ?? "",
                  required: false,
                  publicVisible: true,
                  publicEditable: false,
                  isListDisplay: false,
                  referenceListId: "",
                  newReferenceListName: "",
                })
              }
              onOpenNewBlock={() =>
                setBlockDialog({
                  title: "",
                  repeatable: false,
                  repeatMode: "first_instance_only",
                  publicVisible: true,
                  publicEditable: false,
                })
              }
            />
          )}

          <main className="a4-template-canvas-column">
            <A4LayoutRenderer
              layout={layout}
              fields={availableFields}
              blocks={allBlocks}
              mode={rendererMode}
              zoom={zoom}
              showGrid={isDesignMode ? showGrid : false}
              showTechnicalData={isDesignMode ? showTechnicalData : false}
              selectedItemId={isDesignMode ? selectedItemId : null}
              onSelectItem={isDesignMode ? setSelectedItemId : undefined}
              onChangeLayout={isDesignMode ? commitLayout : undefined}
              onDropField={isDesignMode ? addExistingFieldAt : undefined}
              onDropBlock={isDesignMode ? addExistingBlockAt : undefined}
            />
            {validationIssues.length > 0 && (
              <div className="a4-template-validation" role="status">
                {validationIssues.map((issue, index) => (
                  <span key={`${issue.message}-${index}`} className={`is-${issue.level}`}>
                    {issue.message}
                  </span>
                ))}
              </div>
            )}
          </main>

          {isDesignMode && (
            <A4TemplatePropertiesPanel
              item={selectedItem}
              fields={availableFields}
              showTechnicalData={showTechnicalData}
              onUpdateItem={updateSelectedItem}
              onDeleteItem={removeSelectedItem}
            />
          )}
        </div>
      )}

      {fieldDialog && (
        <FieldDialog
          state={fieldDialog}
          blocks={allBlocks}
          referenceLists={effectiveReferenceLists}
          isPending={createFieldMutation.isPending}
          onChange={setFieldDialog}
          onCancel={() => setFieldDialog(null)}
          onSubmit={() => createFieldMutation.mutate(fieldDialog)}
        />
      )}
      {blockDialog && (
        <BlockDialog
          state={blockDialog}
          isPending={createBlockMutation.isPending}
          onChange={setBlockDialog}
          onCancel={() => setBlockDialog(null)}
          onSubmit={() => createBlockMutation.mutate(blockDialog)}
        />
      )}
    </section>
  );
}

function FieldDialog({
  state,
  blocks,
  referenceLists,
  isPending,
  onChange,
  onCancel,
  onSubmit,
}: {
  state: FieldDialogState;
  blocks: FormBlockRead[];
  referenceLists: { id: string; name: string }[];
  isPending: boolean;
  onChange: (state: FieldDialogState) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const referenceBacked = usesReferenceList(state.fieldType);
  return (
    <div className="admin-dialog-backdrop">
      <div
        className="admin-dialog a4-template-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Создание поля"
      >
        <h4>Создание поля</h4>
        <label>
          Название поля
          <input
            value={state.label}
            onChange={(event) => onChange({ ...state, label: event.currentTarget.value })}
          />
        </label>
        <label>
          Тип поля
          <select
            value={state.fieldType}
            onChange={(event) => onChange({ ...state, fieldType: event.currentTarget.value })}
          >
            {FIELD_TYPES.map((fieldType) => (
              <option key={fieldType} value={fieldType}>
                {fieldTypeLabel(fieldType)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Блок
          <select
            value={state.blockId}
            onChange={(event) => onChange({ ...state, blockId: event.currentTarget.value })}
          >
            {blocks.map((block) => (
              <option key={block.id} value={block.id}>
                {block.title}
              </option>
            ))}
          </select>
        </label>
        {referenceBacked && (
          <>
            <label>
              Справочник
              <select
                value={state.referenceListId}
                onChange={(event) =>
                  onChange({
                    ...state,
                    referenceListId: event.currentTarget.value,
                    newReferenceListName: "",
                  })
                }
              >
                <option value="">Создать или выбрать позже</option>
                {referenceLists.map((referenceList) => (
                  <option key={referenceList.id} value={referenceList.id}>
                    {referenceList.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Новый справочник
              <input
                value={state.newReferenceListName}
                onChange={(event) =>
                  onChange({
                    ...state,
                    newReferenceListName: event.currentTarget.value,
                    referenceListId: "",
                  })
                }
              />
            </label>
          </>
        )}
        <label className="checkbox-inline">
          <input
            type="checkbox"
            checked={state.required}
            onChange={(event) => onChange({ ...state, required: event.currentTarget.checked })}
          />
          Обязательное поле
        </label>
        <label className="checkbox-inline">
          <input
            type="checkbox"
            checked={state.isListDisplay}
            onChange={(event) => onChange({ ...state, isListDisplay: event.currentTarget.checked })}
          />
          Показывать в списке
        </label>
        <label className="checkbox-inline">
          <input
            type="checkbox"
            checked={state.publicVisible}
            onChange={(event) => onChange({ ...state, publicVisible: event.currentTarget.checked })}
          />
          Публичное поле
        </label>
        <label className="checkbox-inline">
          <input
            type="checkbox"
            checked={state.publicEditable}
            onChange={(event) =>
              onChange({ ...state, publicEditable: event.currentTarget.checked })
            }
          />
          Публичное редактирование
        </label>
        <div className="row-actions">
          <button type="button" className="ghost-button" onClick={onCancel}>
            Отмена
          </button>
          <button type="button" className="primary-button" disabled={isPending} onClick={onSubmit}>
            Создать поле
          </button>
        </div>
      </div>
    </div>
  );
}

function BlockDialog({
  state,
  isPending,
  onChange,
  onCancel,
  onSubmit,
}: {
  state: BlockDialogState;
  isPending: boolean;
  onChange: (state: BlockDialogState) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="admin-dialog-backdrop">
      <div
        className="admin-dialog a4-template-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Создание блока"
      >
        <h4>Создание блока</h4>
        <label>
          Название блока
          <input
            value={state.title}
            onChange={(event) => onChange({ ...state, title: event.currentTarget.value })}
          />
        </label>
        <label className="checkbox-inline">
          <input
            type="checkbox"
            checked={state.repeatable}
            onChange={(event) => onChange({ ...state, repeatable: event.currentTarget.checked })}
          />
          Повторяющийся блок
        </label>
        <label>
          Печать повторений
          <select
            value={state.repeatMode}
            onChange={(event) =>
              onChange({
                ...state,
                repeatMode: event.currentTarget.value as BlockDialogState["repeatMode"],
              })
            }
          >
            <option value="first_instance_only">Только первый экземпляр</option>
            <option value="repeat_section">Повторять секцию</option>
            <option value="table_rows">Строки таблицы</option>
          </select>
        </label>
        <label className="checkbox-inline">
          <input
            type="checkbox"
            checked={state.publicVisible}
            onChange={(event) => onChange({ ...state, publicVisible: event.currentTarget.checked })}
          />
          Публичный блок
        </label>
        <label className="checkbox-inline">
          <input
            type="checkbox"
            checked={state.publicEditable}
            onChange={(event) =>
              onChange({ ...state, publicEditable: event.currentTarget.checked })
            }
          />
          Публичное редактирование
        </label>
        <div className="row-actions">
          <button type="button" className="ghost-button" onClick={onCancel}>
            Отмена
          </button>
          <button type="button" className="primary-button" disabled={isPending} onClick={onSubmit}>
            Создать блок
          </button>
        </div>
      </div>
    </div>
  );
}

function createFieldItem(
  field: FormFieldRead,
  items: CardPrintLayoutItem[],
  rect = nextRect(items, 78, 12),
): CardPrintLayoutItem {
  return {
    id: createLayoutItemId("field", items),
    kind: "field",
    page: 1,
    row: 1,
    column: 1,
    row_span: 2,
    column_span: 6,
    field_id: field.id,
    label: field.label,
    show_label: true,
    style: { border: "thin", padding_mm: 1.5, label_position: "top", overflow: "wrap" },
    ...rect,
  };
}

function createBlockItem(
  block: FormBlockRead,
  items: CardPrintLayoutItem[],
  repeatMode: BlockDialogState["repeatMode"],
  rect = nextRect(items, A4_WIDTH_MM - 30, 42),
): CardPrintLayoutItem {
  return {
    id: createLayoutItemId("block", items),
    kind: "block",
    page: 1,
    row: 1,
    column: 1,
    row_span: 6,
    column_span: 12,
    block_id: block.id,
    label: block.title,
    text: block.title,
    repeat: { mode: repeatMode },
    style: { border: "thin", background_color: "#f8fafc", padding_mm: 3 },
    ...rect,
  };
}

function createBlockItems(
  block: FormBlockRead,
  fields: FormFieldRead[],
  items: CardPrintLayoutItem[],
  repeatMode: BlockDialogState["repeatMode"],
  rect = nextRect(items, A4_WIDTH_MM - 30, 42),
): CardPrintLayoutItem[] {
  const blockFields = fields
    .filter((field) => field.block_id === block.id)
    .sort(compareFieldsByVisualPlacement);
  const maxRow = blockFields.reduce(
    (max, field, index) => Math.max(max, printFieldLayoutRow(field, index + 1)),
    0,
  );
  const computedHeight =
    maxRow > 0
      ? blockFieldPaddingMm * 2 +
        blockFieldHeaderMm +
        maxRow * blockFieldHeightMm +
        Math.max(0, maxRow - 1) * blockFieldGapMm
      : 42;
  const blockRect = {
    ...rect,
    height_mm: Math.max(rect.height_mm, computedHeight),
  };
  const createdItems: CardPrintLayoutItem[] = [];
  const accumulatedItems = [...items];
  const blockItem = createBlockItem(block, accumulatedItems, repeatMode, blockRect);
  createdItems.push(blockItem);
  accumulatedItems.push(blockItem);

  for (const [index, field] of blockFields.entries()) {
    const fieldRect = fieldRectInsideBlock(blockRect, field, index);
    const fieldItem = createFieldItem(field, accumulatedItems, fieldRect);
    createdItems.push(fieldItem);
    accumulatedItems.push(fieldItem);
  }

  return createdItems;
}

function createTextItem(
  kind: "heading" | "static_text",
  text: string,
  items: CardPrintLayoutItem[],
  rect = nextRect(items, kind === "heading" ? 120 : 70, kind === "heading" ? 12 : 14),
): CardPrintLayoutItem {
  return {
    id: createLayoutItemId(kind, items),
    kind,
    page: 1,
    row: 1,
    column: 1,
    row_span: 2,
    column_span: kind === "heading" ? 12 : 6,
    text,
    style: {
      font_size: kind === "heading" ? 14 : 10,
      bold: kind === "heading",
      align: kind === "heading" ? "center" : "left",
      border: "none",
      padding_mm: 1.5,
    },
    ...rect,
  };
}

function createDecorItem(
  kind: "panel" | "rectangle" | "divider",
  items: CardPrintLayoutItem[],
): CardPrintLayoutItem {
  const line = kind === "divider";
  return {
    id: createLayoutItemId(kind, items),
    kind,
    page: 1,
    row: 1,
    column: 1,
    row_span: line ? 1 : 4,
    column_span: line ? 12 : 6,
    style: {
      border: line ? "none" : "thin",
      background_color: line ? "transparent" : "#ffffff",
      padding_mm: 1,
    },
    ...nextRect(items, line ? 160 : 80, line ? 4 : 28),
  };
}

function createServiceItem(
  kind: "print_date" | "page_number",
  items: CardPrintLayoutItem[],
): CardPrintLayoutItem {
  return {
    id: createLayoutItemId(kind, items),
    kind,
    page: 1,
    row: 1,
    column: 1,
    row_span: 1,
    column_span: 4,
    label: kind === "print_date" ? "Дата печати" : "Номер страницы",
    style: { border: "none", font_size: 8, padding_mm: 1 },
    ...nextRect(items, 42, 8),
  };
}

function createMetadataItem(key: string, items: CardPrintLayoutItem[]): CardPrintLayoutItem {
  return {
    id: createLayoutItemId("metadata", items),
    kind: "metadata",
    page: 1,
    row: 1,
    column: 1,
    row_span: 2,
    column_span: 6,
    metadata_key: key,
    style: { border: "thin", padding_mm: 1.5 },
    ...nextRect(items, 70, 12),
  };
}

function nextRect(items: CardPrintLayoutItem[], width_mm: number, height_mm: number) {
  const maxBottom = items.reduce(
    (max, item) => Math.max(max, (item.y_mm ?? 18) + (item.height_mm ?? 12)),
    18,
  );
  return {
    x_mm: 20,
    y_mm: Math.min(270, maxBottom + 5),
    width_mm,
    height_mm,
  };
}

function createLayoutItemId(prefix: string, items: CardPrintLayoutItem[]) {
  const usedIds = new Set(items.map((item) => item.id));
  let index = items.length + 1;
  let candidate = `${prefix}-${index}`;
  while (usedIds.has(candidate)) {
    index += 1;
    candidate = `${prefix}-${index}`;
  }
  return candidate;
}

function fieldRectInsideBlock(
  blockRect: NonNullable<Parameters<typeof createBlockItem>[3]>,
  field: FormFieldRead,
  index: number,
) {
  const row = printFieldLayoutRow(field, index + 1);
  const column = printFieldLayoutColumn(field, 1);
  const columnSpan = Math.min(printFieldColumnSpan(field), blockFieldGridColumns - column + 1);
  const contentWidth = Math.max(20, blockRect.width_mm - blockFieldPaddingMm * 2);
  const columnWidth =
    (contentWidth - blockFieldGapMm * (blockFieldGridColumns - 1)) / blockFieldGridColumns;
  return {
    x_mm: blockRect.x_mm + blockFieldPaddingMm + (column - 1) * (columnWidth + blockFieldGapMm),
    y_mm:
      blockRect.y_mm +
      blockFieldPaddingMm +
      blockFieldHeaderMm +
      (row - 1) * (blockFieldHeightMm + blockFieldGapMm),
    width_mm: columnWidth * columnSpan + blockFieldGapMm * Math.max(0, columnSpan - 1),
    height_mm: blockFieldHeightMm,
  };
}

function compareFieldsByVisualPlacement(left: FormFieldRead, right: FormFieldRead) {
  return (
    printFieldLayoutRow(left, left.position + 1) - printFieldLayoutRow(right, right.position + 1) ||
    printFieldLayoutColumn(left, 1) - printFieldLayoutColumn(right, 1) ||
    left.position - right.position ||
    left.label.localeCompare(right.label)
  );
}

function printFieldColumnSpan(field: FormFieldRead) {
  return Math.min(
    blockFieldGridColumns,
    Math.max(1, printDisplayConfigNumber(field, "column_span", 1)),
  );
}

function printFieldLayoutRow(field: FormFieldRead, fallback: number) {
  return Math.max(1, printDisplayConfigNumber(field, "layout_row", fallback));
}

function printFieldLayoutColumn(field: FormFieldRead, fallback: number) {
  return Math.min(
    blockFieldGridColumns,
    Math.max(1, printDisplayConfigNumber(field, "layout_column", fallback)),
  );
}

function printDisplayConfigNumber(field: FormFieldRead, key: string, fallback: number) {
  const value = field.display_config_json?.[key];
  return typeof value === "number" ? value : fallback;
}

function cardTemplateFields(
  template: CardTemplateRead,
  fields: FormFieldRead[],
  blocks: FormBlockRead[],
  extraAllowedIds = new Set<string>(),
) {
  const fieldIds = templateFieldIds(template);
  const allowedIds =
    fieldIds.length > 0
      ? new Set([...fieldIds, ...extraAllowedIds])
      : new Set(fields.map((field) => field.id));
  const blockOrder = new Map(blocks.map((block, index) => [block.id, index]));
  return fields
    .filter((field) => allowedIds.has(field.id) && field.field_type !== "static_text")
    .sort((left, right) => {
      const blockDiff =
        (blockOrder.get(left.block_id) ?? 0) - (blockOrder.get(right.block_id) ?? 0);
      return blockDiff || left.position - right.position || left.label.localeCompare(right.label);
    });
}

function templateFieldIds(template: CardTemplateRead) {
  const fieldIds = template.field_schema_json?.field_ids;
  return Array.isArray(fieldIds)
    ? fieldIds.filter((fieldId): fieldId is string => typeof fieldId === "string")
    : [];
}

function usesReferenceList(fieldType: string) {
  return fieldType === "select" || fieldType === "multi_select";
}

function fieldTypeLabel(fieldType: string) {
  const labels: Record<string, string> = {
    text: "Текст",
    number: "Число",
    date: "Дата",
    datetime: "Дата и время",
    bool: "Да / нет",
    json: "JSON",
    select: "Выбор",
    multi_select: "Множественный выбор",
    card_ref: "Ссылка на карточку",
    user_ref: "Пользователь",
    organization_ref: "Организация",
    org_unit_ref: "Подразделение",
    registry_ref: "Реестр",
    file_ref: "Файл",
    static_text: "Информационный текст карточки",
  };
  return labels[fieldType] ?? fieldType;
}

function requiredModeLabel(requiredMode: string) {
  return requiredMode === "required" ? "Обязательное" : "Не обязательное";
}

function printRepeatModeForBlock(block: FormBlockRead): BlockDialogState["repeatMode"] {
  const rawMode = block.display_config_json?.print_repeat_mode;
  if (
    rawMode === "first_instance_only" ||
    rawMode === "repeat_section" ||
    rawMode === "table_rows"
  ) {
    return rawMode;
  }
  return block.is_repeatable ? "repeat_section" : "first_instance_only";
}

function saveStatusText(
  status: "saving" | "idle",
  successMessage: string | null,
  errorCount: number,
) {
  if (status === "saving") {
    return "Сохранение...";
  }
  if (errorCount > 0) {
    return "Есть ошибки";
  }
  return successMessage ? "Сохранено" : "Черновик";
}

function triggerBrowserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
