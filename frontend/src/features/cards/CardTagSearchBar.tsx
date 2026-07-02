import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { listReferenceItems } from "@/api/client";
import type { CardFieldFilterPayload, FormFieldRead, OrganizationRead } from "@/api/types";
import { fieldTypeLabel, uiText } from "@/app/uiText";

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

type OrganizationTreeNode = OrganizationRead & {
  children: OrganizationTreeNode[];
};

export function CardTagSearchBar({
  token,
  textQuery,
  fieldFilters,
  fields,
  organizations,
  selectedOrganizationIds,
  includeDescendantOrganizations,
  includeArchive,
  onTextQueryChange,
  onFieldFiltersChange,
  onSelectedOrganizationIdsChange,
  onIncludeDescendantOrganizationsChange,
  onIncludeArchiveChange,
}: {
  token: string;
  textQuery: string;
  fieldFilters: CardFieldFilterPayload[];
  fields: FormFieldRead[];
  organizations: OrganizationRead[];
  selectedOrganizationIds: string[];
  includeDescendantOrganizations: boolean;
  includeArchive: boolean;
  onTextQueryChange: (value: string) => void;
  onFieldFiltersChange: (value: CardFieldFilterPayload[]) => void;
  onSelectedOrganizationIdsChange: (value: string[]) => void;
  onIncludeDescendantOrganizationsChange: (value: boolean) => void;
  onIncludeArchiveChange: (value: boolean) => void;
}) {
  const searchRootRef = useRef<HTMLDivElement | null>(null);
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

  useEffect(() => {
    if (!isTagMenuOpen && !isOrganizationFilterOpen) {
      return;
    }

    function closeSearchPopovers() {
      setIsTagMenuOpen(false);
      setIsOrganizationFilterOpen(false);
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && searchRootRef.current?.contains(target)) {
        return;
      }
      closeSearchPopovers();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeSearchPopovers();
        setDraftFilter(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOrganizationFilterOpen, isTagMenuOpen]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draftFilter) {
      submitDraftFieldFilter();
      return;
    }
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
    setSearchInput("");
    setDraftFilter({
      field,
      value: field.field_type === "bool" ? "true" : "",
    });
  }

  function openOrganizationFilter() {
    setIsTagMenuOpen(false);
    setIsOrganizationFilterOpen(true);
  }

  function submitDraftFieldFilter() {
    if (!draftFilter) {
      return;
    }
    const payload = buildFieldFilterPayload(draftFilter);
    if (!payload) {
      return;
    }
    onFieldFiltersChange([...fieldFilters, payload]);
    setDraftFilter(null);
    setSearchInput("");
  }

  function removeFieldFilter(index: number) {
    onFieldFiltersChange(fieldFilters.filter((_, itemIndex) => itemIndex !== index));
  }

  function toggleOrganization(organizationId: string) {
    if (selectedOrganizationIds.includes(organizationId)) {
      onSelectedOrganizationIdsChange(
        selectedOrganizationIds.filter((selectedId) => selectedId !== organizationId),
      );
      return;
    }
    onSelectedOrganizationIdsChange([...selectedOrganizationIds, organizationId]);
  }

  function clearOrganizationFilter() {
    onSelectedOrganizationIdsChange([]);
  }

  return (
    <div
      ref={searchRootRef}
      className="card-tag-search"
      role="group"
      aria-label={uiText.cardTagSearch}
    >
      <div
        className={[
          "card-tag-row",
          isTagMenuOpen || isOrganizationFilterOpen || draftFilter ? "is-focused" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
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
        {selectedOrganizationIds.length > 0 && (
          <span className="search-chip search-chip-filter">
            <button type="button" onClick={openOrganizationFilter}>
              {organizationFilterSummary}
            </button>
            <button
              type="button"
              aria-label={`${uiText.removeFilter} ${organizationFilterSummary}`}
              onClick={clearOrganizationFilter}
            >
              x
            </button>
          </span>
        )}
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
        {includeArchive && (
          <span className="search-chip">
            <span>{uiText.archivedCardsTag}</span>
            <button
              type="button"
              aria-label={`${uiText.removeFilter} ${uiText.archivedCardsTag}`}
              onClick={() => onIncludeArchiveChange(false)}
            >
              x
            </button>
          </span>
        )}
        <form className="card-tag-input-form" onSubmit={submitSearch}>
          <label>
            <span>{uiText.cardSearch}</span>
            {draftFilter && <span className="search-draft-prefix">{draftFilter.field.label}:</span>}
            {draftFilter?.field.field_type === "bool" ? (
              <select
                aria-label={`${uiText.filterValue} ${draftFilter.field.label}`}
                value={draftFilter.value}
                onChange={(event) => {
                  const nextDraft = { ...draftFilter, value: event.currentTarget.value };
                  setDraftFilter(nextDraft);
                  const payload = buildFieldFilterPayload(nextDraft);
                  if (payload) {
                    onFieldFiltersChange([...fieldFilters, payload]);
                    setDraftFilter(null);
                  }
                }}
              >
                <option value="true">{uiText.yes}</option>
                <option value="false">{uiText.no}</option>
              </select>
            ) : draftFilter?.field.field_type === "select" ||
              draftFilter?.field.field_type === "multi_select" ? (
              <select
                aria-label={`${uiText.filterValue} ${draftFilter.field.label}`}
                value={draftFilter.value}
                onChange={(event) => {
                  const nextDraft = { ...draftFilter, value: event.currentTarget.value };
                  setDraftFilter(nextDraft);
                  const payload = buildFieldFilterPayload(nextDraft);
                  if (payload) {
                    onFieldFiltersChange([...fieldFilters, payload]);
                    setDraftFilter(null);
                  }
                }}
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
                aria-label={uiText.cardSearch}
                placeholder={
                  draftFilter
                    ? `${draftFilter.field.label}: ${uiText.filterValue.toLowerCase()}`
                    : uiText.cardSearchPlaceholder
                }
                value={draftFilter ? draftFilter.value : searchInput}
                onChange={(event) => {
                  if (draftFilter) {
                    setDraftFilter({ ...draftFilter, value: event.currentTarget.value });
                    return;
                  }
                  setSearchInput(event.currentTarget.value);
                }}
                onFocus={() => {
                  if (!draftFilter) {
                    setIsTagMenuOpen(true);
                    setIsOrganizationFilterOpen(false);
                  }
                }}
                onClick={() => {
                  if (!draftFilter) {
                    setIsTagMenuOpen(true);
                    setIsOrganizationFilterOpen(false);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setIsTagMenuOpen(false);
                    setIsOrganizationFilterOpen(false);
                    setDraftFilter(null);
                  }
                }}
              />
            )}
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
            <button
              type="button"
              className="search-tag-option"
              disabled={includeArchive}
              onClick={() => {
                onIncludeArchiveChange(true);
                setIsTagMenuOpen(false);
              }}
            >
              <span>{uiText.showArchivedCards}</span>
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
      {isOrganizationFilterOpen && (
        <div className="organization-search-popover">
          <div className="tag-filter-actions">
            <button type="button" className="ghost-button" onClick={clearOrganizationFilter}>
              {uiText.allAccessibleOrganizationsAction}
            </button>
          </div>
          <label className="checkbox-control">
            <input
              type="checkbox"
              checked={includeDescendantOrganizations}
              onChange={(event) =>
                onIncludeDescendantOrganizationsChange(event.currentTarget.checked)
              }
            />
            <span>{uiText.includeDescendantOrganizations}</span>
          </label>
          <div className="organization-filter-tree">
            {buildOrganizationTree(organizations).map((organization) => (
              <OrganizationFilterNode
                key={organization.id}
                organization={organization}
                depth={0}
                selectedIds={new Set(selectedOrganizationIds)}
                onToggle={toggleOrganization}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OrganizationFilterNode({
  organization,
  depth,
  selectedIds,
  onToggle,
}: {
  organization: OrganizationTreeNode;
  depth: number;
  selectedIds: Set<string>;
  onToggle: (organizationId: string) => void;
}) {
  return (
    <div>
      <label
        className="checkbox-control organization-filter-option"
        style={{ paddingLeft: `${depth * 16}px` }}
      >
        <input
          type="checkbox"
          checked={selectedIds.has(organization.id)}
          onChange={() => onToggle(organization.id)}
        />
        <span>{organization.name}</span>
      </label>
      {organization.children.map((child) => (
        <OrganizationFilterNode
          key={child.id}
          organization={child}
          depth={depth + 1}
          selectedIds={selectedIds}
          onToggle={onToggle}
        />
      ))}
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

function buildOrganizationTree(organizations: OrganizationRead[]) {
  const visibleIds = new Set(organizations.map((organization) => organization.id));
  const byParent = new Map<string | null, OrganizationRead[]>();
  for (const organization of organizations) {
    const parentId =
      organization.parent_id && visibleIds.has(organization.parent_id)
        ? organization.parent_id
        : null;
    byParent.set(parentId, [...(byParent.get(parentId) ?? []), organization]);
  }

  function build(parentId: string | null): OrganizationTreeNode[] {
    return [...(byParent.get(parentId) ?? [])]
      .sort((left, right) => left.code.localeCompare(right.code) || left.id.localeCompare(right.id))
      .map((organization) => ({
        ...organization,
        children: build(organization.id),
      }));
  }

  return build(null);
}
