import { useId, useMemo, useRef, useState } from "react";

import { uiText } from "@/app/uiText";

export type SearchableChoiceOption = {
  id: string;
  label: string;
  archived?: boolean;
};

export function SearchableChoicePicker({
  label,
  hint,
  options,
  mode,
  value,
  disabled = false,
  hierarchy = false,
  onChange,
}: {
  label: string;
  hint?: string | null;
  options: readonly SearchableChoiceOption[];
  mode: "single" | "multiple";
  value: string | string[];
  disabled?: boolean;
  hierarchy?: boolean;
  onChange: (value: string | string[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const listboxId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const usesListbox = mode === "single";
  const selectedIds = useMemo(
    () => new Set(Array.isArray(value) ? value : value ? [value] : []),
    [value],
  );
  const selectedOptions = useMemo(
    () => options.filter((option) => selectedIds.has(option.id)),
    [options, selectedIds],
  );
  const matchingOptions = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    if (!normalizedSearch) return options;
    return options.filter((option) => option.label.toLocaleLowerCase().includes(normalizedSearch));
  }, [options, search]);
  const triggerLabel = selectedOptions.length > 0 ? null : hint || uiText.empty;

  function closePopup(restoreFocus = false) {
    setIsOpen(false);
    setSearch("");
    if (restoreFocus) triggerRef.current?.focus();
  }

  function chooseSingle(nextValue: string) {
    onChange(nextValue);
    closePopup();
  }

  function toggleMultiple(optionId: string) {
    const nextIds = new Set(selectedIds);
    if (nextIds.has(optionId)) {
      nextIds.delete(optionId);
    } else {
      nextIds.add(optionId);
    }
    onChange(options.filter((option) => nextIds.has(option.id)).map((option) => option.id));
  }

  return (
    <div className="searchable-choice-picker" role="group" aria-label={label}>
      <button
        ref={triggerRef}
        type="button"
        className="searchable-choice-picker-trigger"
        role={usesListbox ? "combobox" : undefined}
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-haspopup={usesListbox ? "listbox" : undefined}
        aria-label={label}
        disabled={disabled}
        onClick={() => setIsOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "Escape") closePopup();
        }}
      >
        {triggerLabel ? (
          <span className="searchable-choice-picker-placeholder">{triggerLabel}</span>
        ) : (
          <ChoiceChips options={selectedOptions} />
        )}
      </button>
      {isOpen ? (
        <div className="searchable-choice-picker-popup">
          <input
            autoFocus
            aria-label={uiText.searchChoice}
            className="searchable-choice-picker-search"
            disabled={disabled}
            onChange={(event) => setSearch(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                closePopup(true);
              }
            }}
            placeholder={uiText.searchChoicePlaceholder}
            type="search"
            value={search}
          />
          <div
            id={listboxId}
            className="searchable-choice-picker-options"
            data-testid="searchable-choice-options"
            role={usesListbox ? "listbox" : "group"}
            aria-label={label}
          >
            {mode === "single" ? (
              <button
                type="button"
                role="option"
                aria-selected={selectedIds.size === 0}
                className="searchable-choice-picker-option"
                disabled={disabled}
                onClick={() => chooseSingle("")}
              >
                {hint || uiText.empty}
              </button>
            ) : null}
            {matchingOptions.map((option) => {
              const optionLabel = option.archived
                ? `${option.label} / ${uiText.archived}`
                : option.label;
              const isDepartment = hierarchy && option.label.includes(" → ");
              if (mode === "multiple") {
                return (
                  <label
                    key={option.id}
                    className={optionClassName(
                      isDepartment,
                      option.archived,
                      selectedIds.has(option.id),
                    )}
                    data-hierarchy-level={isDepartment ? 2 : undefined}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(option.id)}
                      disabled={disabled || option.archived}
                      onChange={() => toggleMultiple(option.id)}
                    />
                    <span>{optionLabel}</span>
                  </label>
                );
              }
              return (
                <button
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={selectedIds.has(option.id)}
                  aria-label={optionLabel}
                  className={optionClassName(
                    isDepartment,
                    option.archived,
                    selectedIds.has(option.id),
                  )}
                  data-hierarchy-level={isDepartment ? 2 : undefined}
                  disabled={disabled || option.archived}
                  onClick={() => chooseSingle(option.id)}
                >
                  {optionLabel}
                </button>
              );
            })}
            {matchingOptions.length === 0 ? (
              <p className="data-empty">{uiText.nothingFound}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ChoiceChips({ options }: { options: readonly SearchableChoiceOption[] }) {
  return (
    <span className="searchable-choice-picker-chips" data-testid="searchable-choice-chips">
      {options.map((option) => (
        <span key={option.id} className="searchable-choice-picker-chip">
          {option.label}
          {option.archived ? ` / ${uiText.archived}` : ""}
        </span>
      ))}
    </span>
  );
}

function optionClassName(isDepartment: boolean, archived: boolean | undefined, selected: boolean) {
  return [
    "searchable-choice-picker-option",
    isDepartment ? "is-department" : "is-management",
    archived ? "is-archived" : "",
    selected ? "is-selected" : "",
  ]
    .filter(Boolean)
    .join(" ");
}
