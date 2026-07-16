import type { ReactNode } from "react";

export type CardBaseValue = {
  label: string;
  value: string;
  options?: readonly { id: string; label: string }[];
  onChange?: (value: string) => void;
  placeholder?: string;
};

export type CardBaseBlockSurfaceProps = {
  id: string;
  mode: "creation" | "admin" | "public";
  organization: CardBaseValue;
  template: CardBaseValue;
  displayName: CardBaseValue;
  headerAction?: ReactNode;
  publicAccessContent?: ReactNode;
  footer?: ReactNode;
  disabled?: boolean;
};

const modeDescriptions = {
  creation: "Основная информация для новой карточки",
  admin: "Основная информация и публичный доступ",
  public: "Основная информация карточки",
} as const;

export function CardBaseBlockSurface({
  id,
  mode,
  organization,
  template,
  displayName,
  headerAction,
  publicAccessContent,
  footer,
  disabled = false,
}: CardBaseBlockSurfaceProps) {
  const isCreation = mode === "creation";

  return (
    <section id={id} className="data-panel card-base-block" aria-label="Базовый блок">
      <header className="card-base-block-header">
        <div className="card-base-block-header-copy">
          <strong>Базовый блок</strong>
          <small>{modeDescriptions[mode]}</small>
        </div>
        {headerAction ? <div className="card-base-block-header-actions">{headerAction}</div> : null}
      </header>
      <div className="admin-mutation-body">
        <CardBaseBlockRow value={organization} editable={isCreation} disabled={disabled} />
        <CardBaseBlockRow value={template} editable={isCreation} disabled={disabled} />
        <CardBaseBlockRow value={displayName} editable={isCreation} disabled={disabled} />
      </div>
      {publicAccessContent ? (
        <details className="card-base-public-access">
          <summary>Публичный доступ</summary>
          {publicAccessContent}
        </details>
      ) : null}
      {footer ? <footer className="admin-mutation-actions">{footer}</footer> : null}
    </section>
  );
}

function CardBaseBlockRow({
  value,
  editable,
  disabled,
}: {
  value: CardBaseValue;
  editable: boolean;
  disabled: boolean;
}) {
  if (!editable) {
    return (
      <div className="card-base-block-row">
        <span>{value.label}</span>
        <output className="card-base-block-output">{value.value || "Нет данных"}</output>
      </div>
    );
  }

  const isDisabled = disabled || !value.onChange;
  if (value.options) {
    return (
      <label className="card-base-block-row">
        <span>{value.label}</span>
        <select
          aria-label={value.label}
          disabled={isDisabled}
          value={value.value}
          onChange={(event) => value.onChange?.(event.currentTarget.value)}
        >
          {value.placeholder ? <option value="">{value.placeholder}</option> : null}
          {value.options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <label className="card-base-block-row">
      <span>{value.label}</span>
      <input
        aria-label={value.label}
        disabled={isDisabled}
        placeholder={value.placeholder}
        value={value.value}
        onChange={(event) => value.onChange?.(event.currentTarget.value)}
      />
    </label>
  );
}
