import type { FormBlockRead, FormFieldRead } from "@/api/types";
import { uiText } from "@/app/uiText";

import {
  A4_BLOCK_DRAG_TYPE,
  A4_FIELD_DRAG_TYPE,
  encodeA4DragPayload,
  setA4DragPayload,
} from "./a4DragPayload";

type A4TemplatePaletteProps = {
  blocks: FormBlockRead[];
  fields: FormFieldRead[];
  showTechnicalData: boolean;
  onAddExistingBlock: (block: FormBlockRead) => void;
  onAddExistingField: (field: FormFieldRead) => void;
  onAddHeading: () => void;
  onAddStaticText: () => void;
  onAddPanel: () => void;
  onAddRectangle: () => void;
  onAddDivider: () => void;
  onAddPrintDate: () => void;
  onAddPageNumber: () => void;
  onAddMetadata: (key: string) => void;
  onOpenNewField: () => void;
  onOpenNewBlock: () => void;
};

export function A4TemplatePalette({
  blocks,
  fields,
  showTechnicalData,
  onAddExistingBlock,
  onAddExistingField,
  onAddHeading,
  onAddStaticText,
  onAddPanel,
  onAddRectangle,
  onAddDivider,
  onAddPrintDate,
  onAddPageNumber,
  onAddMetadata,
  onOpenNewField,
  onOpenNewBlock,
}: A4TemplatePaletteProps) {
  return (
    <aside className="a4-template-palette" aria-label="Палитра элементов">
      <h4>Данные</h4>
      <button type="button" className="ghost-button" onClick={onOpenNewField}>
        Новое поле данных
      </button>
      <button type="button" className="ghost-button" onClick={onOpenNewBlock}>
        Новый блок данных
      </button>
      <h4>Существующие блоки</h4>
      <div className="a4-template-field-list">
        {blocks.length === 0 ? (
          <p className="data-empty">{uiText.noData}</p>
        ) : (
          blocks.map((block) => (
            <button
              key={block.id}
              type="button"
              className="a4-template-field-button"
              draggable
              onDragStart={(event) => {
                const payload = { kind: "block" as const, id: block.id };
                setA4DragPayload(payload);
                event.dataTransfer.effectAllowed = "copy";
                event.dataTransfer.setData(A4_BLOCK_DRAG_TYPE, block.id);
                event.dataTransfer.setData("text/plain", encodeA4DragPayload(payload));
              }}
              onClick={() => onAddExistingBlock(block)}
            >
              <strong>{block.title}</strong>
              {showTechnicalData && <span>{block.code}</span>}
            </button>
          ))
        )}
      </div>
      <h4>Существующие поля</h4>
      <div className="a4-template-field-list">
        {fields.length === 0 ? (
          <p className="data-empty">{uiText.noData}</p>
        ) : (
          fields.map((field) => (
            <button
              key={field.id}
              type="button"
              className="a4-template-field-button"
              draggable
              onDragStart={(event) => {
                const payload = { kind: "field" as const, id: field.id };
                setA4DragPayload(payload);
                event.dataTransfer.effectAllowed = "copy";
                event.dataTransfer.setData(A4_FIELD_DRAG_TYPE, field.id);
                event.dataTransfer.setData("text/plain", encodeA4DragPayload(payload));
              }}
              onClick={() => onAddExistingField(field)}
            >
              <strong>{field.label}</strong>
              {showTechnicalData && <span>{field.code}</span>}
            </button>
          ))
        )}
      </div>
      <h4>Текст и оформление</h4>
      <button type="button" className="ghost-button" onClick={onAddHeading}>
        Заголовок
      </button>
      <button type="button" className="ghost-button" onClick={onAddStaticText}>
        Статический текст формы
      </button>
      <button type="button" className="ghost-button" onClick={onAddPanel}>
        Панель / контейнер
      </button>
      <button type="button" className="ghost-button" onClick={onAddRectangle}>
        Прямоугольник
      </button>
      <button type="button" className="ghost-button" onClick={onAddDivider}>
        Линия / разделитель
      </button>
      <h4>Служебные данные</h4>
      <button type="button" className="ghost-button" onClick={onAddPrintDate}>
        Дата печати
      </button>
      <button type="button" className="ghost-button" onClick={onAddPageNumber}>
        Номер страницы
      </button>
      <button
        type="button"
        className="ghost-button"
        onClick={() => onAddMetadata("card.display_name")}
      >
        Название карточки
      </button>
      <button type="button" className="ghost-button" onClick={() => onAddMetadata("registry.name")}>
        Название реестра
      </button>
      <button
        type="button"
        className="ghost-button"
        disabled
        title="QR-код будет добавлен после выбора безопасной зависимости"
      >
        QR-код
      </button>
      <button
        type="button"
        className="ghost-button"
        disabled
        title="Изображения будут добавлены после отдельного storage-среза"
      >
        Изображение / логотип
      </button>
    </aside>
  );
}
