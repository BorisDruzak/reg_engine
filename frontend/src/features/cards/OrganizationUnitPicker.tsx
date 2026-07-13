import { useMemo, useState } from "react";

import { uiText } from "@/app/uiText";

import type { FieldEditorOption, FieldEditorState } from "./fieldEditorUtils";

type OrganizationUnitOption = FieldEditorOption & { archived?: boolean };

export function OrganizationUnitPicker({
  label,
  hint,
  options,
  value,
  disabled = false,
  onChange,
}: {
  label: string;
  hint?: string | null;
  options: OrganizationUnitOption[];
  value: FieldEditorState;
  disabled?: boolean;
  onChange: (value: FieldEditorState) => void;
}) {
  const [search, setSearch] = useState("");
  const selectedValue = typeof value === "string" ? value : "";
  const matchingOptions = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    if (!normalizedSearch) return options;
    return options.filter((option) => option.label.toLocaleLowerCase().includes(normalizedSearch));
  }, [options, search]);

  return (
    <div className="organization-unit-picker">
      <input
        aria-label={uiText.searchOrganizationUnit}
        disabled={disabled}
        onChange={(event) => setSearch(event.currentTarget.value)}
        placeholder={uiText.searchOrganizationUnitPlaceholder}
        type="search"
        value={search}
      />
      <div className="organization-unit-picker-options" role="group" aria-label={label}>
        <button
          type="button"
          className={`organization-unit-picker-option${selectedValue === "" ? " is-selected" : ""}`}
          aria-pressed={selectedValue === ""}
          disabled={disabled}
          onClick={() => onChange("")}
        >
          {hint || uiText.empty}
        </button>
        {matchingOptions.map((option) => {
          // The safe card option API renders child departments as "Management → Department".
          const isDepartment = option.label.includes(" → ");
          const optionLabel = option.archived
            ? `${option.label} / ${uiText.archived}`
            : option.label;
          return (
            <button
              key={option.id}
              type="button"
              aria-label={optionLabel}
              aria-pressed={selectedValue === option.id}
              className={[
                "organization-unit-picker-option",
                isDepartment ? "is-department" : "is-management",
                selectedValue === option.id ? "is-selected" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              data-hierarchy-level={isDepartment ? 2 : 1}
              disabled={disabled || option.archived}
              onClick={() => onChange(option.id)}
            >
              {optionLabel}
            </button>
          );
        })}
        {matchingOptions.length === 0 && <p className="data-empty">{uiText.noData}</p>}
      </div>
    </div>
  );
}
