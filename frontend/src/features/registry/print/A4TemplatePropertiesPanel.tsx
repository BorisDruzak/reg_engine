import { useState } from "react";

import type { CardPrintLayoutItem, CardPrintLayoutItemStyle, FormFieldRead } from "@/api/types";

type TabKey = "content" | "position" | "appearance" | "behavior" | "technical";

type A4TemplatePropertiesPanelProps = {
  item: CardPrintLayoutItem | null;
  fields: FormFieldRead[];
  showTechnicalData: boolean;
  onUpdateItem: (patch: Partial<CardPrintLayoutItem>) => void;
  onDeleteItem: () => void;
};

const TABS: { key: TabKey; label: string }[] = [
  { key: "content", label: "Содержимое" },
  { key: "position", label: "Положение" },
  { key: "appearance", label: "Внешний вид" },
  { key: "behavior", label: "Поведение" },
  { key: "technical", label: "Техническое" },
];

export function A4TemplatePropertiesPanel({
  item,
  fields,
  showTechnicalData,
  onUpdateItem,
  onDeleteItem,
}: A4TemplatePropertiesPanelProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("content");
  if (!item) {
    return (
      <aside className="a4-template-properties" aria-label="Свойства элемента">
        <h4>Свойства элемента</h4>
        <p className="data-empty">Выберите элемент на A4</p>
      </aside>
    );
  }
  const style = item.style ?? {};
  return (
    <aside className="a4-template-properties" aria-label="Свойства элемента">
      <h4>Свойства элемента</h4>
      <div className="a4-template-tabs" role="tablist" aria-label="Разделы свойств">
        {TABS.filter((tab) => showTechnicalData || tab.key !== "technical").map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={activeTab === tab.key ? "is-active" : ""}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="a4-template-property-body">
        {activeTab === "content" && (
          <>
            <label>
              Тип
              <input value={kindLabel(item.kind)} readOnly />
            </label>
            {(item.kind === "heading" || item.kind === "static_text") && (
              <label>
                Текст
                <textarea
                  value={item.text ?? ""}
                  onChange={(event) => onUpdateItem({ text: event.currentTarget.value })}
                />
              </label>
            )}
            {item.kind === "field" && (
              <>
                <label>
                  Поле
                  <select
                    value={item.field_id ?? ""}
                    onChange={(event) => {
                      const field = fields.find(
                        (candidate) => candidate.id === event.currentTarget.value,
                      );
                      onUpdateItem({
                        field_id: event.currentTarget.value,
                        label: field?.label ?? item.label,
                      });
                    }}
                  >
                    {fields.map((field) => (
                      <option key={field.id} value={field.id}>
                        {field.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Подпись
                  <input
                    value={item.label ?? ""}
                    onChange={(event) => onUpdateItem({ label: event.currentTarget.value })}
                  />
                </label>
                <label className="checkbox-inline">
                  <input
                    type="checkbox"
                    checked={item.show_label !== false}
                    onChange={(event) => onUpdateItem({ show_label: event.currentTarget.checked })}
                  />
                  Показывать подпись
                </label>
              </>
            )}
            {item.kind === "metadata" && (
              <label>
                Данные карточки
                <select
                  value={item.metadata_key ?? "card.display_name"}
                  onChange={(event) => onUpdateItem({ metadata_key: event.currentTarget.value })}
                >
                  <option value="card.display_name">Название карточки</option>
                  <option value="card.id">ID карточки</option>
                  <option value="registry.name">Название реестра</option>
                  <option value="organization.name">Организация</option>
                </select>
              </label>
            )}
          </>
        )}
        {activeTab === "position" && (
          <div className="a4-template-property-grid">
            <NumberField
              label="X, мм"
              value={item.x_mm ?? 0}
              min={0}
              max={210}
              onChange={(x_mm) => onUpdateItem({ x_mm })}
            />
            <NumberField
              label="Y, мм"
              value={item.y_mm ?? 0}
              min={0}
              max={297}
              onChange={(y_mm) => onUpdateItem({ y_mm })}
            />
            <NumberField
              label="Ширина, мм"
              value={item.width_mm ?? 20}
              min={1}
              max={210}
              onChange={(width_mm) => onUpdateItem({ width_mm })}
            />
            <NumberField
              label="Высота, мм"
              value={item.height_mm ?? 8}
              min={1}
              max={297}
              onChange={(height_mm) => onUpdateItem({ height_mm })}
            />
            <NumberField
              label="Строка"
              value={item.row}
              min={1}
              max={34}
              onChange={(row) => onUpdateItem({ row })}
            />
            <NumberField
              label="Колонка"
              value={item.column}
              min={1}
              max={12}
              onChange={(column) => onUpdateItem({ column })}
            />
            <NumberField
              label="Строк в сетке"
              value={item.row_span}
              min={1}
              max={34}
              onChange={(row_span) => onUpdateItem({ row_span })}
            />
            <NumberField
              label="Колонок"
              value={item.column_span}
              min={1}
              max={12}
              onChange={(column_span) => onUpdateItem({ column_span })}
            />
          </div>
        )}
        {activeTab === "appearance" && (
          <>
            <label>
              Шрифт
              <select
                value={style.font_family ?? "Inter"}
                onChange={(event) =>
                  onUpdateItem({ style: { ...style, font_family: event.currentTarget.value } })
                }
              >
                <option value="Inter">Inter</option>
                <option value="Arial">Arial</option>
                <option value="Times New Roman">Times New Roman</option>
              </select>
            </label>
            <div className="a4-template-property-grid">
              <NumberField
                label="Размер"
                value={style.font_size ?? 10}
                min={6}
                max={32}
                onChange={(font_size) => onUpdateItem({ style: { ...style, font_size } })}
              />
              <NumberField
                label="Отступ, мм"
                value={style.padding_mm ?? 1.5}
                min={0}
                max={10}
                step={0.5}
                onChange={(padding_mm) => onUpdateItem({ style: { ...style, padding_mm } })}
              />
            </div>
            <label className="checkbox-inline">
              <input
                type="checkbox"
                checked={Boolean(style.bold)}
                onChange={(event) =>
                  onUpdateItem({ style: { ...style, bold: event.currentTarget.checked } })
                }
              />
              Жирный
            </label>
            <label className="checkbox-inline">
              <input
                type="checkbox"
                checked={Boolean(style.italic)}
                onChange={(event) =>
                  onUpdateItem({ style: { ...style, italic: event.currentTarget.checked } })
                }
              />
              Курсив
            </label>
            <label>
              Выравнивание
              <select
                value={style.align ?? "left"}
                onChange={(event) =>
                  onUpdateItem({
                    style: {
                      ...style,
                      align: event.currentTarget.value as CardPrintLayoutItemStyle["align"],
                    },
                  })
                }
              >
                <option value="left">Слева</option>
                <option value="center">По центру</option>
                <option value="right">Справа</option>
              </select>
            </label>
            <label>
              Положение подписи
              <select
                value={style.label_position ?? "top"}
                onChange={(event) =>
                  onUpdateItem({
                    style: {
                      ...style,
                      label_position: event.currentTarget
                        .value as CardPrintLayoutItemStyle["label_position"],
                    },
                  })
                }
              >
                <option value="top">Сверху</option>
                <option value="left">Слева</option>
                <option value="right">Справа</option>
                <option value="bottom">Снизу</option>
              </select>
            </label>
            <div className="a4-template-property-grid">
              <label>
                Текст
                <input
                  type="color"
                  value={style.text_color ?? "#17324d"}
                  onChange={(event) =>
                    onUpdateItem({ style: { ...style, text_color: event.currentTarget.value } })
                  }
                />
              </label>
              <label>
                Фон
                <input
                  type="color"
                  value={style.background_color ?? "#ffffff"}
                  onChange={(event) =>
                    onUpdateItem({
                      style: { ...style, background_color: event.currentTarget.value },
                    })
                  }
                />
              </label>
            </div>
            <label>
              Граница
              <select
                value={style.border ?? "thin"}
                onChange={(event) =>
                  onUpdateItem({
                    style: {
                      ...style,
                      border: event.currentTarget.value as CardPrintLayoutItemStyle["border"],
                    },
                  })
                }
              >
                <option value="none">Нет</option>
                <option value="thin">Тонкая</option>
                <option value="medium">Средняя</option>
              </select>
            </label>
          </>
        )}
        {activeTab === "behavior" && (
          <>
            <label>
              Переполнение текста
              <select
                value={style.overflow ?? "wrap"}
                onChange={(event) =>
                  onUpdateItem({
                    style: {
                      ...style,
                      overflow: event.currentTarget.value as CardPrintLayoutItemStyle["overflow"],
                    },
                  })
                }
              >
                <option value="wrap">Переносить</option>
                <option value="truncate">Обрезать</option>
                <option value="expand_down">Расширять вниз</option>
              </select>
            </label>
            <label>
              Выводить в
              <select
                value={item.visible_in ?? "both"}
                onChange={(event) =>
                  onUpdateItem({
                    visible_in: event.currentTarget.value as CardPrintLayoutItem["visible_in"],
                  })
                }
              >
                <option value="both">PDF и DOCX</option>
                <option value="pdf">Только PDF</option>
                <option value="docx">Только DOCX</option>
              </select>
            </label>
            <label className="checkbox-inline">
              <input
                type="checkbox"
                checked={Boolean(item.required_marker)}
                onChange={(event) => onUpdateItem({ required_marker: event.currentTarget.checked })}
              />
              Показывать маркер обязательности
            </label>
          </>
        )}
        {activeTab === "technical" && showTechnicalData && (
          <>
            <label>
              ID элемента
              <input value={item.id} readOnly />
            </label>
            <label>
              ID поля
              <input value={item.field_id ?? ""} readOnly />
            </label>
            <label>
              JSON
              <textarea value={JSON.stringify(item, null, 2)} readOnly />
            </label>
          </>
        )}
      </div>
      <button type="button" className="danger-button" onClick={onDeleteItem}>
        Удалить элемент
      </button>
    </aside>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(clampNumber(Number(event.currentTarget.value), min, max))}
      />
    </label>
  );
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function kindLabel(kind: CardPrintLayoutItem["kind"]) {
  const labels: Record<CardPrintLayoutItem["kind"], string> = {
    field: "Поле",
    block: "Блок данных",
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
    card_layout: "Связанный макет карточки",
  };
  return labels[kind];
}
