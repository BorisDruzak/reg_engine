export function ChangeBasisFields({
  basisText,
  occurredOn,
  disabled,
  onBasisTextChange,
  onOccurredOnChange,
}: {
  basisText: string;
  occurredOn: string;
  disabled: boolean;
  onBasisTextChange: (value: string) => void;
  onOccurredOnChange: (value: string) => void;
}) {
  return (
    <div className="stack">
      <label className="field-editor-control">
        <span>Основание изменения</span>
        <textarea
          required
          rows={2}
          value={basisText}
          disabled={disabled}
          onChange={(event) => onBasisTextChange(event.currentTarget.value)}
        />
      </label>
      <label className="field-editor-control">
        <span>Дата события (необязательно)</span>
        <input
          type="date"
          value={occurredOn}
          disabled={disabled}
          onChange={(event) => onOccurredOnChange(event.currentTarget.value)}
        />
      </label>
    </div>
  );
}
