type A4TemplateToolbarProps = {
  templateName: string;
  saveStatus: string;
  zoom: number;
  showGrid: boolean;
  previewMode: boolean;
  canGenerate: boolean;
  canDownloadLast: boolean;
  onTemplateNameChange: (value: string) => void;
  onZoomChange: (value: number) => void;
  onToggleGrid: () => void;
  onTogglePreview: () => void;
  onSave: () => void;
  onGenerateDocx: () => void;
  onGeneratePdf: () => void;
  onDownloadLast: () => void;
  onOpenSettings: () => void;
};

export function A4TemplateToolbar({
  templateName,
  saveStatus,
  zoom,
  showGrid,
  previewMode,
  canGenerate,
  canDownloadLast,
  onTemplateNameChange,
  onZoomChange,
  onToggleGrid,
  onTogglePreview,
  onSave,
  onGenerateDocx,
  onGeneratePdf,
  onDownloadLast,
  onOpenSettings,
}: A4TemplateToolbarProps) {
  return (
    <header className="a4-template-toolbar">
      <div className="a4-template-title-group">
        <label>
          Название шаблона
          <input
            value={templateName}
            onChange={(event) => onTemplateNameChange(event.currentTarget.value)}
          />
        </label>
        <span className="a4-template-save-status">{saveStatus}</span>
      </div>
      <div
        className="a4-template-toolbar-actions"
        role="toolbar"
        aria-label="Панель печатного шаблона"
      >
        <select
          aria-label="Масштаб"
          value={zoom}
          onChange={(event) => onZoomChange(Number(event.currentTarget.value))}
        >
          <option value={0.5}>50%</option>
          <option value={0.75}>75%</option>
          <option value={1}>100%</option>
          <option value={0.86}>По ширине</option>
          <option value={0.64}>Страница</option>
        </select>
        <button type="button" className="ghost-button" onClick={onToggleGrid}>
          {showGrid ? "Скрыть сетку" : "Показать сетку"}
        </button>
        <button type="button" className="ghost-button" onClick={onTogglePreview}>
          {previewMode ? "Редактировать" : "Предпросмотр"}
        </button>
        <button type="button" className="ghost-button" onClick={onOpenSettings}>
          Настройки шаблона
        </button>
        <button
          type="button"
          className="ghost-button"
          disabled={!canGenerate}
          onClick={onGenerateDocx}
        >
          DOCX
        </button>
        <button
          type="button"
          className="ghost-button"
          disabled={!canGenerate}
          onClick={onGeneratePdf}
        >
          PDF
        </button>
        <button
          type="button"
          className="ghost-button"
          disabled={!canDownloadLast}
          onClick={onDownloadLast}
        >
          Скачать
        </button>
        <button type="button" className="primary-button" onClick={onSave}>
          Сохранить
        </button>
      </div>
    </header>
  );
}
