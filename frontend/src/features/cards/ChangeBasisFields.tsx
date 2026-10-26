import { useEffect, useId, useRef } from "react";

export function ChangeBasisFields({
  basisText,
  occurredOn,
  disabled,
  error,
  onBasisTextChange,
  onOccurredOnChange,
}: {
  basisText: string;
  occurredOn: string;
  disabled: boolean;
  error?: string;
  onBasisTextChange: (value: string) => void;
  onOccurredOnChange: (value: string) => void;
}) {
  const hintId = useId();
  const errorId = useId();
  const basisRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (error) basisRef.current?.focus();
  }, [error]);
  return (
    <div className="stack">
      <label className="field-editor-control">
        <span>Основание изменения</span>
        <textarea
          ref={basisRef}
          required
          rows={2}
          placeholder="Обязательно: укажите причину или документ-основание"
          aria-describedby={error ? `${hintId} ${errorId}` : hintId}
          aria-invalid={error ? true : undefined}
          value={basisText}
          disabled={disabled}
          onChange={(event) => onBasisTextChange(event.currentTarget.value)}
        />
      </label>
      <p id={hintId} className="muted-text">
        Основание обязательно для сохранения изменений. Укажите причину или документ-основание.
      </p>
      {error ? (
        <p id={errorId} className="inline-alert" role="alert">
          {error}
        </p>
      ) : null}
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
