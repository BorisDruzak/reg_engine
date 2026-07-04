import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type CSSProperties } from "react";

import {
  createCardPrintTemplate,
  createCardPrintTemplateVersion,
  listCardPrintTemplates,
} from "@/api/client";
import type {
  CardPrintLayout,
  CardPrintLayoutItem,
  CardTemplateRead,
  DocumentTemplateRead,
  FormBlockRead,
  FormFieldRead,
} from "@/api/types";
import { generateTechnicalCode } from "@/app/technicalCode";
import { uiText } from "@/app/uiText";
import { DataAlert } from "@/components/common/DataSurfaces";
import { MutationFeedback } from "@/components/common/AdminMutation";

const A4_ROW_COUNT = 34;
const CARD_PRINT_LAYOUT_VERSION = "card_print_layout_v1";
const defaultOutputFilename = "{{ card.display_name }}.docx";

type CardPrintTemplateEditorProps = {
  token: string;
  registryId: string;
  cardTemplate: CardTemplateRead;
  blocks: FormBlockRead[];
  fields: FormFieldRead[];
};

export function CardPrintTemplateEditor({
  token,
  registryId,
  cardTemplate,
  blocks,
  fields,
}: CardPrintTemplateEditorProps) {
  const queryClient = useQueryClient();
  const availableFields = useMemo(
    () => cardTemplateFields(cardTemplate, fields, blocks),
    [blocks, cardTemplate, fields],
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [name, setName] = useState(`${cardTemplate.name}: печать`);
  const [code, setCode] = useState(generateTechnicalCode(`${cardTemplate.code}-print`, "print", []));
  const [description, setDescription] = useState("");
  const [outputFilenameTemplate, setOutputFilenameTemplate] = useState(defaultOutputFilename);
  const [layout, setLayout] = useState<CardPrintLayout>(() => createDefaultLayout(availableFields));
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const printTemplatesQuery = useQuery({
    queryKey: ["card-print-templates", token, registryId, cardTemplate.id],
    queryFn: () => listCardPrintTemplates(token, registryId, cardTemplate.id),
    enabled: Boolean(token && registryId && cardTemplate.id),
  });
  const printTemplates = printTemplatesQuery.data?.items ?? [];
  const selectedItem = layout.items.find((item) => item.id === selectedItemId) ?? null;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const cleanName = name.trim();
      const cleanCode = code.trim();
      const cleanOutput = outputFilenameTemplate.trim();
      if (!cleanName || !cleanCode || !cleanOutput) {
        throw new Error("Заполните название, технический код и имя файла.");
      }
      if (selectedTemplateId) {
        await createCardPrintTemplateVersion(token, selectedTemplateId, {
          layout_json: layout,
        });
        return { templateId: selectedTemplateId };
      }
      const created = await createCardPrintTemplate(token, registryId, {
        code: cleanCode,
        name: cleanName,
        description: description.trim() || null,
        card_template_id: cardTemplate.id,
        layout_json: layout,
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
    },
    onError: (error) => setLocalError(error instanceof Error ? error.message : String(error)),
  });

  function startNewTemplate() {
    setSelectedTemplateId(null);
    setSelectedItemId(null);
    setName(`${cardTemplate.name}: печать`);
    setCode(generateTechnicalCode(`${cardTemplate.code}-print`, "print", []));
    setDescription("");
    setOutputFilenameTemplate(defaultOutputFilename);
    setLayout(createDefaultLayout(availableFields));
    setLocalMessage(null);
    setLocalError(null);
  }

  function loadPrintTemplate(template: DocumentTemplateRead) {
    setSelectedTemplateId(template.id);
    setSelectedItemId(template.current_layout_json?.items[0]?.id ?? null);
    setName(template.name);
    setCode(template.code);
    setDescription(template.description ?? "");
    setOutputFilenameTemplate(template.output_filename_template || defaultOutputFilename);
    setLayout(template.current_layout_json ?? createDefaultLayout(availableFields));
    setLocalMessage(null);
    setLocalError(null);
  }

  function addFieldItem(field: FormFieldRead) {
    addItem({
      id: createLayoutItemId("field", layout.items),
      kind: "field",
      page: 1,
      row: nextFreeRow(layout.items),
      column: 1,
      row_span: 2,
      column_span: 8,
      field_id: field.id,
      label: field.label,
      show_label: true,
    });
  }

  function addHeading() {
    addItem({
      id: createLayoutItemId("heading", layout.items),
      kind: "heading",
      page: 1,
      row: nextFreeRow(layout.items),
      column: 1,
      row_span: 2,
      column_span: 12,
      text: "Заголовок",
    });
  }

  function addStaticText() {
    addItem({
      id: createLayoutItemId("text", layout.items),
      kind: "static_text",
      page: 1,
      row: nextFreeRow(layout.items),
      column: 1,
      row_span: 2,
      column_span: 6,
      text: "Текст",
    });
  }

  function addDivider() {
    addItem({
      id: createLayoutItemId("line", layout.items),
      kind: "divider",
      page: 1,
      row: nextFreeRow(layout.items),
      column: 1,
      row_span: 1,
      column_span: 12,
    });
  }

  function addItem(item: CardPrintLayoutItem) {
    setLayout((current) => ({ ...current, items: [...current.items, item] }));
    setSelectedItemId(item.id);
  }

  function updateSelectedItem(patch: Partial<CardPrintLayoutItem>) {
    if (!selectedItem) {
      return;
    }
    setLayout((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.id === selectedItem.id ? clampLayoutItem({ ...item, ...patch }) : item,
      ),
    }));
  }

  function removeSelectedItem() {
    if (!selectedItem) {
      return;
    }
    setLayout((current) => ({
      ...current,
      items: current.items.filter((item) => item.id !== selectedItem.id),
    }));
    setSelectedItemId(null);
  }

  return (
    <section
      className="card-print-editor"
      role="region"
      aria-label={`Редактор печатного шаблона A4 ${cardTemplate.name}`}
    >
      <header className="card-print-editor-header">
        <div>
          <h3>Печатные шаблоны A4</h3>
          <span>{cardTemplate.name}</span>
        </div>
        <div className="row-actions">
          <button type="button" className="ghost-button" onClick={startNewTemplate}>
            Новый шаблон
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? uiText.saving : uiText.save}
          </button>
        </div>
      </header>

      <MutationFeedback error={localError ? new Error(localError) : null} successMessage={localMessage} />
      <DataAlert error={printTemplatesQuery.error} />

      <div className="card-print-template-bar">
        <label>
          Шаблон печати
          <select
            value={selectedTemplateId ?? ""}
            onChange={(event) => {
              const nextTemplateId = event.currentTarget.value;
              if (!nextTemplateId) {
                startNewTemplate();
                return;
              }
              const nextTemplate = printTemplates.find((template) => template.id === nextTemplateId);
              if (nextTemplate) {
                loadPrintTemplate(nextTemplate);
              }
            }}
          >
            <option value="">Новый шаблон</option>
            {printTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Название
          <input value={name} onChange={(event) => setName(event.currentTarget.value)} />
        </label>
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
      </div>

      <div className="card-print-workbench">
        <aside className="card-print-palette" aria-label="Палитра элементов">
          <h4>Элементы</h4>
          <button type="button" className="ghost-button" onClick={addHeading}>
            Заголовок
          </button>
          <button type="button" className="ghost-button" onClick={addStaticText}>
            Текст
          </button>
          <button type="button" className="ghost-button" onClick={addDivider}>
            Линия
          </button>
          <h4>Поля карточки</h4>
          <div className="card-print-field-list">
            {availableFields.length === 0 ? (
              <p className="data-empty">{uiText.noData}</p>
            ) : (
              availableFields.map((field) => (
                <button
                  key={field.id}
                  type="button"
                  className="card-print-field-button"
                  onClick={() => addFieldItem(field)}
                >
                  <strong>{field.label}</strong>
                  <span>{field.code}</span>
                </button>
              ))
            )}
          </div>
        </aside>

        <div className="card-print-canvas-area">
          <div className="card-print-ruler card-print-ruler-horizontal" aria-hidden="true" />
          <div className="card-print-ruler card-print-ruler-vertical" aria-hidden="true" />
          <div className="card-print-page-shell">
            <div className="card-print-page" aria-label="A4 канвас печатного шаблона">
              {layout.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={[
                    "card-print-item",
                    `card-print-item--${item.kind}`,
                    selectedItemId === item.id ? "is-selected" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={layoutItemStyle(item)}
                  onClick={() => setSelectedItemId(item.id)}
                >
                  {renderItemPreview(item, availableFields)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <aside className="card-print-properties" aria-label="Свойства элемента">
          <h4>Свойства</h4>
          {selectedItem ? (
            <div className="card-print-properties-form">
              <label>
                Тип
                <input value={kindLabel(selectedItem.kind)} readOnly />
              </label>
              <div className="card-print-position-grid">
                <NumberInput
                  label="Строка"
                  value={selectedItem.row}
                  min={1}
                  max={A4_ROW_COUNT}
                  onChange={(row) => updateSelectedItem({ row })}
                />
                <NumberInput
                  label="Колонка"
                  value={selectedItem.column}
                  min={1}
                  max={12}
                  onChange={(column) => updateSelectedItem({ column })}
                />
                <NumberInput
                  label="Высота"
                  value={selectedItem.row_span}
                  min={1}
                  max={A4_ROW_COUNT}
                  onChange={(row_span) => updateSelectedItem({ row_span })}
                />
                <NumberInput
                  label="Ширина"
                  value={selectedItem.column_span}
                  min={1}
                  max={12}
                  onChange={(column_span) => updateSelectedItem({ column_span })}
                />
              </div>
              {(selectedItem.kind === "heading" || selectedItem.kind === "static_text") && (
                <label>
                  Текст
                  <textarea
                    value={selectedItem.text ?? ""}
                    onChange={(event) => updateSelectedItem({ text: event.currentTarget.value })}
                  />
                </label>
              )}
              {selectedItem.kind === "field" && (
                <>
                  <label>
                    Поле
                    <select
                      value={selectedItem.field_id ?? ""}
                      onChange={(event) => {
                        const field = availableFields.find(
                          (item) => item.id === event.currentTarget.value,
                        );
                        updateSelectedItem({
                          field_id: event.currentTarget.value,
                          label: field?.label ?? selectedItem.label,
                        });
                      }}
                    >
                      {availableFields.map((field) => (
                        <option key={field.id} value={field.id}>
                          {field.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Подпись
                    <input
                      value={selectedItem.label ?? ""}
                      onChange={(event) => updateSelectedItem({ label: event.currentTarget.value })}
                    />
                  </label>
                  <label className="checkbox-inline">
                    <input
                      type="checkbox"
                      checked={selectedItem.show_label !== false}
                      onChange={(event) =>
                        updateSelectedItem({ show_label: event.currentTarget.checked })
                      }
                    />
                    Показывать подпись
                  </label>
                </>
              )}
              <button type="button" className="danger-button" onClick={removeSelectedItem}>
                Удалить элемент
              </button>
            </div>
          ) : (
            <p className="data-empty">Выберите элемент</p>
          )}
        </aside>
      </div>
      <label className="card-print-description">
        Описание
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
      </label>
    </section>
  );
}

function NumberInput({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(clampNumber(Number(event.currentTarget.value), min, max))}
      />
    </label>
  );
}

function createEmptyLayout(): CardPrintLayout {
  return {
    version: CARD_PRINT_LAYOUT_VERSION,
    page: {
      format: "A4",
      width_mm: 210,
      height_mm: 297,
      margin_mm: { top: 12, right: 12, bottom: 12, left: 12 },
    },
    grid: { columns: 12, row_height_mm: 8 },
    items: [],
  };
}

function createDefaultLayout(fields: FormFieldRead[]): CardPrintLayout {
  const layout = createEmptyLayout();
  layout.items = [
    {
      id: "title",
      kind: "heading",
      page: 1,
      row: 1,
      column: 1,
      row_span: 2,
      column_span: 12,
      text: "Печатная форма",
    },
    ...fields.slice(0, 8).map((field, index): CardPrintLayoutItem => {
      const row = 4 + index * 2;
      const column = index % 2 === 0 ? 1 : 7;
      return {
        id: `field-${field.id}`,
        kind: "field",
        page: 1,
        row: row + (index % 2 === 0 ? 0 : -2),
        column,
        row_span: 2,
        column_span: 6,
        field_id: field.id,
        label: field.label,
        show_label: true,
      };
    }),
  ];
  return layout;
}

function cardTemplateFields(
  template: CardTemplateRead,
  fields: FormFieldRead[],
  blocks: FormBlockRead[],
) {
  const fieldIds = templateFieldIds(template);
  const allowedIds = fieldIds.length > 0 ? new Set(fieldIds) : new Set(fields.map((field) => field.id));
  const blockOrder = new Map(blocks.map((block, index) => [block.id, index]));
  return fields
    .filter((field) => allowedIds.has(field.id) && field.field_type !== "static_text")
    .sort((left, right) => {
      const blockDiff = (blockOrder.get(left.block_id) ?? 0) - (blockOrder.get(right.block_id) ?? 0);
      return blockDiff || left.position - right.position || left.label.localeCompare(right.label);
    });
}

function templateFieldIds(template: CardTemplateRead) {
  const fieldIds = template.field_schema_json?.field_ids;
  return Array.isArray(fieldIds)
    ? fieldIds.filter((fieldId): fieldId is string => typeof fieldId === "string")
    : [];
}

function renderItemPreview(item: CardPrintLayoutItem, fields: FormFieldRead[]) {
  if (item.kind === "divider" || item.kind === "line") {
    return <span aria-hidden="true" className="card-print-line-preview" />;
  }
  if (item.kind === "field") {
    const field = fields.find((current) => current.id === item.field_id);
    return (
      <>
        {item.show_label !== false && <strong>{item.label || field?.label || "Поле"}</strong>}
        <span>{`{${field?.code ?? "field"}}`}</span>
      </>
    );
  }
  return <span>{item.text || kindLabel(item.kind)}</span>;
}

function layoutItemStyle(item: CardPrintLayoutItem): CSSProperties {
  return {
    gridColumn: `${item.column} / span ${item.column_span}`,
    gridRow: `${item.row} / span ${item.row_span}`,
  };
}

function nextFreeRow(items: CardPrintLayoutItem[]) {
  const lastRow = items.reduce((maxRow, item) => Math.max(maxRow, item.row + item.row_span), 1);
  return clampNumber(lastRow + 1, 1, A4_ROW_COUNT - 1);
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

function clampLayoutItem(item: CardPrintLayoutItem): CardPrintLayoutItem {
  const row = clampNumber(item.row, 1, A4_ROW_COUNT);
  const column = clampNumber(item.column, 1, 12);
  return {
    ...item,
    row,
    column,
    row_span: clampNumber(item.row_span, 1, A4_ROW_COUNT - row + 1),
    column_span: clampNumber(item.column_span, 1, 12 - column + 1),
  };
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

function kindLabel(kind: CardPrintLayoutItem["kind"]) {
  const labels: Record<CardPrintLayoutItem["kind"], string> = {
    field: "Поле",
    static_text: "Текст",
    heading: "Заголовок",
    container: "Контейнер",
    panel: "Панель",
    rectangle: "Прямоугольник",
    divider: "Линия",
    line: "Линия",
    metadata: "Данные карточки",
    page_number: "Номер страницы",
    print_date: "Дата печати",
    qr_code: "QR-код",
    image: "Изображение",
  };
  return labels[kind];
}
