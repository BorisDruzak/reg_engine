import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";

import { listReferenceItems } from "@/api/client";
import type { CardFieldFilterPayload, FormFieldRead, OrganizationRead } from "@/api/types";
import { fieldTypeLabel, uiText } from "@/app/uiText";

import { CardOrganizationFilter } from "./CardOrganizationFilter";

const supportedFieldTypes = new Set([
  "text",
  "number",
  "date",
  "datetime",
  "bool",
  "select",
  "multi_select",
]);

type DraftFilter = {
  field: FormFieldRead;
  value: string;
};

export function CardTagSearchBar({
  token,
  textQuery,
  fieldFilters,
  fields,
  organizations,
  selectedOrganizationIds,
  includeDescendantOrganizations,
  onTextQueryChange,
  onFieldFiltersChange,
  onSelectedOrganizationIdsChange,
  onIncludeDescendantOrganizationsChange,
}: {
  token: string;
  textQuery: string;
  fieldFilters: CardFieldFilterPayload[];
  fields: FormFieldRead[];
  organizations: OrganizationRead[];
  selectedOrganizationIds: string[];
  includeDescendantOrganizations: boolean;
  onTextQueryChange: (value: string) => void;
  onFieldFiltersChange: (value: CardFieldFilterPayload[]) => void;
  onSelectedOrganizationIdsChange: (value: string[]) => void;
  onIncludeDescendantOrganizationsChange: (value: boolean) => void;
}) {
  const [searchInput, setSearchInput] = useState("");
  const [isTagMenuOpen, setIsTagMenuOpen] = useState(false);
  const [isOrganizationFilterOpen, setIsOrganizationFilterOpen] = useState(false);
  const [draftFilter, setDraftFilter] = useState<DraftFilter | null>(null);
  const fieldById = useMemo(() => new Map(fields.map((field) => [field.id, field])), [fields]);
  const organizationsById = useMemo(
    () => new Map(organizations.map((organization) => [organization.id, organization])),
    [organizations],
  );
  const organizationFilterSummary = organizationFilterLabel({
    organizationsById,
    selectedOrganizationIds,
    includeDescendants: includeDescendantOrganizations,
  });
  const searchableFields = useMemo(
    () =>
      fields
        .filter((field) => field.is_active && supportedFieldTypes.has(field.field_type))
        .sort(
          (left, right) => left.position - right.position || left.label.localeCompare(right.label),
        ),
    [fields],
  );
  const draftReferenceListId =
    draftFilter?.field.field_type === "select" || draftFilter?.field.field_type === "multi_select"
      ? draftFilter.field.options_source_id
      : null;
  const referenceItemsQuery = useQuery({
    queryKey: ["card-search-reference-items", token, draftReferenceListId],
    queryFn: () => listReferenceItems(token, draftReferenceListId ?? ""),
    enabled: Boolean(token && draftReferenceListId),
  });

  function submitTextSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQuery = searchInput.trim();
    if (!nextQuery) {
      return;
    }
    onTextQueryChange(nextQuery);
    setSearchInput("");
    setIsTagMenuOpen(false);
  }

  function startFieldFilter(field: FormFieldRead) {
    setIsTagMenuOpen(false);
    setDraftFilter({
      field,
      value: field.field_type === "bool" ? "true" : "",
    });
  }

  function openOrganizationFilter() {
    setIsTagMenuOpen(false);
    setIsOrganizationFilterOpen(true);
  }

  function submitFieldFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draftFilter) {
      return;
    }
    const payload = buildFieldFilterPayload(draftFilter);
    if (!payload) {
      return;
    }
    onFieldFiltersChange([...fieldFilters, payload]);
    setDraftFilter(null);
  }

  function removeFieldFilter(index: number) {
    onFieldFiltersChange(fieldFilters.filter((_, itemIndex) => itemIndex !== index));
  }

  return (
    <div className="card-tag-search" role="group" aria-label={uiText.cardTagSearch}>
      <div className="card-tag-row">
        {textQuery && (
          <span className="search-chip">
            <span>
              {uiText.textSearchTag}: {textQuery}
            </span>
            <button
              type="button"
              aria-label={uiText.clearTextSearch}
              onClick={() => onTextQueryChange("")}
            >
              x
            </button>
          </span>
        )}
        <CardOrganizationFilter
          className="card-tag-organization-filter"
          organizations={organizations}
          selectedOrganizationIds={selectedOrganizationIds}
          includeDescendants={includeDescendantOrganizations}
          isOpen={isOrganizationFilterOpen}
          onOpenChange={(nextIsOpen) => {
            setIsOrganizationFilterOpen(nextIsOpen);
            if (nextIsOpen) {
              setIsTagMenuOpen(false);
            }
          }}
          onSelectedOrganizationIdsChange={onSelectedOrganizationIdsChange}
          onIncludeDescendantsChange={onIncludeDescendantOrganizationsChange}
        />
        {fieldFilters.map((filter, index) => (
          <span className="search-chip" key={`${filter.field_id}-${index}`}>
            <span>{fieldFilterLabel(filter, fieldById)}</span>
            <button
              type="button"
              aria-label={`${uiText.removeFilter} ${fieldFilterLabel(filter, fieldById)}`}
              onClick={() => removeFieldFilter(index)}
            >
              x
            </button>
          </span>
        ))}
        <form className="card-tag-input-form" onSubmit={submitTextSearch}>
          <label>
            <span>{uiText.cardSearch}</span>
            <input
              placeholder={uiText.cardSearchPlaceholder}
              value={searchInput}
              onChange={(event) => setSearchInput(event.currentTarget.value)}
              onFocus={() => setIsTagMenuOpen(true)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setIsTagMenuOpen(false);
                }
              }}
            />
          </label>
        </form>
      </div>
      {isTagMenuOpen && (
        <div className="search-tag-popover" role="listbox" aria-label={uiText.searchTagMenu}>
          <div className="search-tag-section">
            <p>{uiText.basicSearchTags}</p>
            <button type="button" className="search-tag-option" onClick={openOrganizationFilter}>
              <span>{uiText.organizations}</span>
              <small>{organizationFilterSummary}</small>
            </button>
          </div>
          <div className="search-tag-section">
            <p>{uiText.cardFields}</p>
            {searchableFields.length === 0 ? (
              <p className="data-empty">{uiText.noData}</p>
            ) : (
              <div className="search-field-menu">
                {searchableFields.map((field) => (
                  <button
                    type="button"
                    className="search-tag-option"
                    key={field.id}
                    aria-label={field.label}
                    onClick={() => startFieldFilter(field)}
                  >
                    <span>{field.label}</span>
                    <small>{fieldTypeLabel(field.field_type)}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {draftFilter && (
        <form className="search-filter-draft" onSubmit={submitFieldFilter}>
          <label>
            <span>
              {uiText.filterValue} {draftFilter.field.label}
            </span>
            {draftFilter.field.field_type === "bool" ? (
              <select
                value={draftFilter.value}
                onChange={(event) =>
                  setDraftFilter({ ...draftFilter, value: event.currentTarget.value })
                }
              >
                <option value="true">{uiText.yes}</option>
                <option value="false">{uiText.no}</option>
              </select>
            ) : draftFilter.field.field_type === "select" ||
              draftFilter.field.field_type === "multi_select" ? (
              <select
                value={draftFilter.value}
                onChange={(event) =>
                  setDraftFilter({ ...draftFilter, value: event.currentTarget.value })
                }
              >
                <option value="">{uiText.noData}</option>
                {(referenceItemsQuery.data?.items ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={draftFilter.value}
                onChange={(event) =>
                  setDraftFilter({ ...draftFilter, value: event.currentTarget.value })
                }
              />
            )}
          </label>
          <button type="submit" className="primary-button">
            {uiText.add}
          </button>
          <button type="button" className="ghost-button" onClick={() => setDraftFilter(null)}>
            {uiText.cancel}
          </button>
        </form>
      )}
    </div>
  );
}

function buildFieldFilterPayload(draftFilter: DraftFilter): CardFieldFilterPayload | null {
  const value = draftFilter.value.trim();
  if (!value) {
    return null;
  }
  if (draftFilter.field.field_type === "bool") {
    return {
      field_id: draftFilter.field.id,
      field_type: draftFilter.field.field_type,
      operator: "is",
      value: value === "true",
    };
  }
  return {
    field_id: draftFilter.field.id,
    field_type: draftFilter.field.field_type,
    operator:
      draftFilter.field.field_type === "text" || draftFilter.field.field_type === "multi_select"
        ? "contains"
        : "is",
    value,
  };
}

function fieldFilterLabel(filter: CardFieldFilterPayload, fieldById: Map<string, FormFieldRead>) {
  const label = fieldById.get(filter.field_id)?.label ?? filter.field_id;
  return `${label}: ${String(filter.value)}`;
}

function organizationFilterLabel({
  organizationsById,
  selectedOrganizationIds,
  includeDescendants,
}: {
  organizationsById: Map<string, OrganizationRead>;
  selectedOrganizationIds: string[];
  includeDescendants: boolean;
}) {
  if (selectedOrganizationIds.length === 0) {
    return `${uiText.organizations}: ${uiText.allAccessibleOrganizations}`;
  }

  const suffix = includeDescendants ? ` + ${uiText.descendantOrganizationsShort}` : "";
  if (selectedOrganizationIds.length === 1) {
    const organizationName =
      organizationsById.get(selectedOrganizationIds[0])?.name ?? selectedOrganizationIds[0];
    return `${uiText.organizations}: ${organizationName}${suffix}`;
  }
  return `${uiText.organizations}: ${selectedOrganizationIds.length} ${uiText.selectedCount}${suffix}`;
}
