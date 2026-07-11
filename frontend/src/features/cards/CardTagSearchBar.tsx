import { useQuery } from "@tanstack/react-query";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import { listReferenceItems } from "@/api/client";
import type {
  CardFieldFilterPayload,
  CardTemplateRead,
  FormFieldRead,
  OrganizationRead,
  ReferenceItemRead,
} from "@/api/types";
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

type OrganizationTreeNode = OrganizationRead & {
  children: OrganizationTreeNode[];
};

type ActiveMenuItem =
  | { type: "templates" }
  | { type: "field"; fieldId: string }
  | { type: "organizations" };

type SearchDraft = { type: "text" } | { type: "field"; fieldId: string } | null;

export function CardTagSearchBar({
  token,
  textQuery,
  fieldFilters,
  fields,
  cardTemplates,
  organizations,
  selectedOrganizationIds,
  selectedCardTemplateIds,
  includeDescendantOrganizations,
  includeArchive,
  onTextQueryChange,
  onFieldFiltersChange,
  onSelectedOrganizationIdsChange,
  onSelectedCardTemplateIdsChange,
  onIncludeDescendantOrganizationsChange,
  onIncludeArchiveChange,
}: {
  token: string;
  textQuery: string;
  fieldFilters: CardFieldFilterPayload[];
  fields: FormFieldRead[];
  cardTemplates: CardTemplateRead[];
  organizations: OrganizationRead[];
  selectedOrganizationIds: string[];
  selectedCardTemplateIds: string[];
  includeDescendantOrganizations: boolean;
  includeArchive: boolean;
  onTextQueryChange: (value: string) => void;
  onFieldFiltersChange: (value: CardFieldFilterPayload[]) => void;
  onSelectedOrganizationIdsChange: (value: string[]) => void;
  onSelectedCardTemplateIdsChange: (value: string[]) => void;
  onIncludeDescendantOrganizationsChange: (value: boolean) => void;
  onIncludeArchiveChange: (value: boolean) => void;
}) {
  const searchRootRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [isTagMenuOpen, setIsTagMenuOpen] = useState(false);
  const [isOrganizationFilterOpen, setIsOrganizationFilterOpen] = useState(false);
  const [activeMenuItem, setActiveMenuItem] = useState<ActiveMenuItem | null>(null);
  const [searchDraft, setSearchDraft] = useState<SearchDraft>(null);
  const fieldById = useMemo(() => new Map(fields.map((field) => [field.id, field])), [fields]);
  const templatesById = useMemo(
    () => new Map(cardTemplates.map((template) => [template.id, template])),
    [cardTemplates],
  );
  const organizationsById = useMemo(
    () => new Map(organizations.map((organization) => [organization.id, organization])),
    [organizations],
  );
  const organizationFilterSummary = organizationFilterLabel({
    organizationsById,
    selectedOrganizationIds,
    includeDescendants: includeDescendantOrganizations,
  });
  const activeTemplates = useMemo(
    () =>
      [...cardTemplates]
        .filter((template) => template.is_active)
        .sort(
          (left, right) => left.position - right.position || left.name.localeCompare(right.name),
        ),
    [cardTemplates],
  );
  const searchableFields = useMemo(
    () =>
      fields
        .filter((field) => field.is_active && supportedFieldTypes.has(field.field_type))
        .sort(
          (left, right) => left.position - right.position || left.label.localeCompare(right.label),
        ),
    [fields],
  );
  const activeField =
    activeMenuItem?.type === "field" ? (fieldById.get(activeMenuItem.fieldId) ?? null) : null;
  const draftField =
    searchDraft?.type === "field" ? (fieldById.get(searchDraft.fieldId) ?? null) : null;
  const draftLabel =
    searchDraft?.type === "text"
      ? uiText.textSearchChoice
      : (draftField?.label ?? uiText.cardSearch);
  const searchInputLabel = searchDraft ? `${uiText.filterValue} ${draftLabel}` : uiText.cardSearch;
  const searchInputType = draftField ? scalarInputType(draftField) : "text";
  const searchTerm = searchDraft ? "" : searchInput.trim().toLocaleLowerCase();
  const matchesSearchTerm = (value: string) =>
    !searchTerm || value.toLocaleLowerCase().includes(searchTerm);
  const matchingTemplates = activeTemplates.filter((template) => matchesSearchTerm(template.name));
  const matchingFields = searchableFields.filter((field) => matchesSearchTerm(field.label));
  const showsTemplateTag = matchesSearchTerm(uiText.cardTemplate) || matchingTemplates.length > 0;
  const hasBasicTagMatch =
    [uiText.textSearchChoice, uiText.organizations, uiText.showArchivedCards].some(
      matchesSearchTerm,
    ) || showsTemplateTag;
  const activeReferenceListId =
    activeField && isReferenceFieldType(activeField.field_type)
      ? activeField.options_source_id
      : null;
  const referenceItemsQuery = useQuery({
    queryKey: ["card-search-reference-items", token, activeReferenceListId],
    queryFn: () => listReferenceItems(token, activeReferenceListId ?? ""),
    enabled: Boolean(token && activeReferenceListId),
  });

  useEffect(() => {
    if (searchDraft) {
      searchInputRef.current?.focus();
    }
  }, [searchDraft]);

  useEffect(() => {
    if (!isTagMenuOpen && !isOrganizationFilterOpen) {
      return;
    }

    function closeSearchPopovers() {
      setIsTagMenuOpen(false);
      setIsOrganizationFilterOpen(false);
      setActiveMenuItem(null);
      setSearchDraft(null);
      setSearchInput("");
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
        if (searchDraft) {
          event.preventDefault();
          setSearchDraft(null);
          setSearchInput("");
          return;
        }
        closeSearchPopovers();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOrganizationFilterOpen, isTagMenuOpen, searchDraft]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    applySearchDraft();
  }

  function applySearchDraft() {
    const value = searchInput.trim();
    if (!value || !searchDraft) {
      return;
    }
    if (searchDraft.type === "text") {
      onTextQueryChange(value);
    } else if (draftField) {
      const payload = buildFieldFilterPayload(draftField, value);
      if (payload) {
        applyFieldFilter(draftField, payload);
      }
    }
    setSearchInput("");
    setSearchDraft(null);
    setIsTagMenuOpen(false);
    setActiveMenuItem(null);
  }

  function handleSearchInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || !searchDraft) {
      return;
    }
    event.preventDefault();
    applySearchDraft();
  }

  function openTagMenu() {
    setIsTagMenuOpen(true);
    setIsOrganizationFilterOpen(false);
  }

  function openOrganizationFilter() {
    setIsTagMenuOpen(false);
    setIsOrganizationFilterOpen(true);
    setActiveMenuItem({ type: "organizations" });
    setSearchDraft(null);
    setSearchInput("");
  }

  function toggleTemplateFilter(templateId: string) {
    if (selectedCardTemplateIds.includes(templateId)) {
      onSelectedCardTemplateIdsChange(
        selectedCardTemplateIds.filter((selectedId) => selectedId !== templateId),
      );
      return;
    }
    onSelectedCardTemplateIdsChange([...selectedCardTemplateIds, templateId]);
  }

  function removeTemplateFilter(templateId: string) {
    onSelectedCardTemplateIdsChange(
      selectedCardTemplateIds.filter((selectedId) => selectedId !== templateId),
    );
  }

  function activateFieldMenu(field: FormFieldRead) {
    if (isScalarFieldType(field.field_type)) {
      setSearchDraft({ type: "field", fieldId: field.id });
      setSearchInput("");
      setActiveMenuItem(null);
      openTagMenu();
      return;
    }
    openTagMenu();
    setActiveMenuItem((current) =>
      current?.type === "field" && current.fieldId === field.id
        ? null
        : { type: "field", fieldId: field.id },
    );
  }

  function activateTextSearch() {
    setSearchDraft({ type: "text" });
    setSearchInput("");
    setIsOrganizationFilterOpen(false);
    setIsTagMenuOpen(true);
    setActiveMenuItem(null);
  }

  function addBoolFilter(field: FormFieldRead, value: boolean) {
    applyFieldFilter(field, {
      field_id: field.id,
      field_type: field.field_type,
      operator: "is",
      value,
    });
    setActiveMenuItem(null);
  }

  function addReferenceFilter(field: FormFieldRead, referenceItem: ReferenceItemRead) {
    const payload = buildReferenceFieldFilterPayload(field, referenceItem);
    if (field.field_type === "multi_select") {
      const existingFilterIndex = fieldFilters.findIndex((filter) =>
        matchesReferenceFilter(filter, field, referenceItem.id),
      );
      if (existingFilterIndex >= 0) {
        onFieldFiltersChange(
          fieldFilters.filter((_, filterIndex) => filterIndex !== existingFilterIndex),
        );
        return;
      }
      onFieldFiltersChange([...fieldFilters, payload]);
      return;
    }
    applyFieldFilter(field, payload);
    setActiveMenuItem(null);
  }

  function applyFieldFilter(field: FormFieldRead, payload: CardFieldFilterPayload) {
    if (field.field_type === "multi_select" && payload.operator === "contains") {
      onFieldFiltersChange([...fieldFilters, payload]);
      return;
    }
    onFieldFiltersChange([
      ...fieldFilters.filter((filter) => filter.field_id !== field.id),
      payload,
    ]);
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
        className={["card-tag-row", isTagMenuOpen || isOrganizationFilterOpen ? "is-focused" : ""]
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
        {selectedCardTemplateIds.map((templateId) => {
          const templateName = templatesById.get(templateId)?.name ?? templateId;
          const label = `${uiText.cardTemplate}: ${templateName}`;
          return (
            <span className="search-chip" key={templateId}>
              <span>{label}</span>
              <button
                type="button"
                aria-label={`${uiText.removeFilter} ${label}`}
                onClick={() => removeTemplateFilter(templateId)}
              >
                x
              </button>
            </span>
          );
        })}
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
            <span className={searchDraft ? "search-draft-prefix" : "search-input-label"}>
              {draftLabel}
            </span>
            <input
              ref={searchInputRef}
              aria-label={searchInputLabel}
              type={searchInputType}
              placeholder={searchDraft ? undefined : uiText.cardSearchPlaceholder}
              value={searchInput}
              onChange={(event) => setSearchInput(event.currentTarget.value)}
              onKeyDown={handleSearchInputKeyDown}
              onFocus={openTagMenu}
              onClick={openTagMenu}
            />
          </label>
        </form>
      </div>
      {isTagMenuOpen && (
        <div className="search-tag-popover" role="listbox" aria-label={uiText.searchTagMenu}>
          <div className="search-tag-section">
            <p>{uiText.basicSearchTags}</p>
            {!hasBasicTagMatch ? (
              <p className="data-empty">{uiText.noData}</p>
            ) : (
              <>
                {matchesSearchTerm(uiText.textSearchChoice) && (
                  <div className="search-filter-option">
                    <button
                      type="button"
                      className="search-tag-option"
                      onClick={activateTextSearch}
                    >
                      <span>{uiText.textSearchChoice}</span>
                    </button>
                  </div>
                )}
                {matchesSearchTerm(uiText.organizations) && (
                  <div className="search-filter-option">
                    <button
                      type="button"
                      className="search-tag-option"
                      onClick={openOrganizationFilter}
                    >
                      <span>{uiText.organizations}</span>
                      <small>{organizationFilterSummary}</small>
                    </button>
                  </div>
                )}
                {showsTemplateTag && (
                  <div className="search-filter-option">
                    <button
                      type="button"
                      className="search-tag-option"
                      aria-label={uiText.cardTemplate}
                      onClick={() =>
                        setActiveMenuItem((current) =>
                          current?.type === "templates" ? null : { type: "templates" },
                        )
                      }
                    >
                      <span>{uiText.cardTemplate}</span>
                      <small>{selectedCardTemplateIds.length || fieldTypeLabel("select")}</small>
                    </button>
                    {activeMenuItem?.type === "templates" && (
                      <div className="search-inline-options">
                        {matchingTemplates.length === 0 ? (
                          <p className="data-empty">{uiText.noData}</p>
                        ) : (
                          matchingTemplates.map((template) => {
                            const isSelected = selectedCardTemplateIds.includes(template.id);
                            return (
                              <button
                                type="button"
                                key={template.id}
                                className={[
                                  "search-tag-option",
                                  "search-inline-option",
                                  isSelected ? "is-selected" : "",
                                ]
                                  .filter(Boolean)
                                  .join(" ")}
                                aria-label={template.name}
                                aria-pressed={isSelected}
                                onClick={() => toggleTemplateFilter(template.id)}
                              >
                                <span>{template.name}</span>
                                <small>{template.code}</small>
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                )}
                {matchesSearchTerm(uiText.showArchivedCards) && (
                  <div className="search-filter-option">
                    <button
                      type="button"
                      className="search-tag-option"
                      disabled={includeArchive}
                      onClick={() => {
                        onIncludeArchiveChange(true);
                        setIsTagMenuOpen(false);
                        setActiveMenuItem(null);
                      }}
                    >
                      <span>{uiText.showArchivedCards}</span>
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="search-tag-section">
            <p>{uiText.cardFields}</p>
            {matchingFields.length === 0 ? (
              <p className="data-empty">{uiText.noData}</p>
            ) : (
              <div className="search-field-menu">
                {matchingFields.map((field) => {
                  const isExpanded =
                    activeMenuItem?.type === "field" && activeMenuItem.fieldId === field.id;
                  return (
                    <div className="search-field-option" key={field.id}>
                      <button
                        type="button"
                        className="search-tag-option"
                        aria-label={field.label}
                        onClick={() => activateFieldMenu(field)}
                      >
                        <span>{field.label}</span>
                        <small>{fieldTypeLabel(field.field_type)}</small>
                      </button>
                      {isExpanded && (
                        <FieldInlineFilterControls
                          field={field}
                          referenceItems={referenceItemsQuery.data?.items ?? []}
                          isReferenceLoading={referenceItemsQuery.isLoading}
                          selectedFilters={fieldFilters}
                          onBoolSelect={(value) => addBoolFilter(field, value)}
                          onReferenceSelect={(item) => addReferenceFilter(field, item)}
                        />
                      )}
                    </div>
                  );
                })}
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

function FieldInlineFilterControls({
  field,
  referenceItems,
  isReferenceLoading,
  selectedFilters,
  onBoolSelect,
  onReferenceSelect,
}: {
  field: FormFieldRead;
  referenceItems: ReferenceItemRead[];
  isReferenceLoading: boolean;
  selectedFilters: CardFieldFilterPayload[];
  onBoolSelect: (value: boolean) => void;
  onReferenceSelect: (item: ReferenceItemRead) => void;
}) {
  if (field.field_type === "bool") {
    return (
      <div className="search-inline-options">
        <button type="button" className="search-tag-option" onClick={() => onBoolSelect(true)}>
          {uiText.yes}
        </button>
        <button type="button" className="search-tag-option" onClick={() => onBoolSelect(false)}>
          {uiText.no}
        </button>
      </div>
    );
  }

  if (isReferenceFieldType(field.field_type)) {
    return (
      <div className="search-inline-options">
        {isReferenceLoading ? (
          <p className="data-empty">{uiText.loadingCard}</p>
        ) : referenceItems.length === 0 ? (
          <p className="data-empty">{uiText.noData}</p>
        ) : (
          referenceItems.map((item) => {
            const isSelected = selectedFilters.some((filter) =>
              matchesReferenceFilter(filter, field, item.id),
            );
            return (
              <button
                type="button"
                className={[
                  "search-tag-option",
                  "search-inline-option",
                  isSelected ? "is-selected" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={item.id}
                aria-label={item.label}
                aria-pressed={field.field_type === "multi_select" ? isSelected : undefined}
                onClick={() => onReferenceSelect(item)}
              >
                <span>{item.label}</span>
                <small>{item.code}</small>
              </button>
            );
          })
        )}
      </div>
    );
  }

  return null;
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

function buildFieldFilterPayload(
  field: FormFieldRead,
  rawValue: string,
): CardFieldFilterPayload | null {
  const value = rawValue.trim();
  if (!value) {
    return null;
  }
  return {
    field_id: field.id,
    field_type: field.field_type,
    operator:
      field.field_type === "text" || field.field_type === "multi_select" ? "contains" : "is",
    value,
  };
}

function buildReferenceFieldFilterPayload(
  field: FormFieldRead,
  referenceItem: ReferenceItemRead,
): CardFieldFilterPayload {
  return {
    field_id: field.id,
    field_type: field.field_type,
    operator: field.field_type === "multi_select" ? "contains" : "is",
    value: referenceItem.id,
    value_label: referenceItem.label,
  };
}

function matchesReferenceFilter(
  filter: CardFieldFilterPayload,
  field: FormFieldRead,
  referenceItemId: string,
) {
  return filter.field_id === field.id && filter.value === referenceItemId;
}

function fieldFilterLabel(filter: CardFieldFilterPayload, fieldById: Map<string, FormFieldRead>) {
  const field = fieldById.get(filter.field_id);
  const label = field?.label ?? filter.field_id;
  return `${label}: ${formatFieldFilterValue(filter, field)}`;
}

function formatFieldFilterValue(filter: CardFieldFilterPayload, field: FormFieldRead | undefined) {
  if (typeof filter.value_label === "string" && filter.value_label.trim()) {
    return filter.value_label;
  }
  if (field && isReferenceFieldType(field.field_type) && typeof filter.value === "string") {
    return "выбранное значение";
  }
  if (field?.field_type === "bool") {
    return filter.value ? uiText.yes : uiText.no;
  }
  return String(filter.value);
}

function isReferenceFieldType(fieldType: string) {
  return fieldType === "select" || fieldType === "multi_select";
}

function isScalarFieldType(fieldType: string) {
  return (
    fieldType === "text" ||
    fieldType === "number" ||
    fieldType === "date" ||
    fieldType === "datetime"
  );
}

function scalarInputType(field: FormFieldRead) {
  if (field.field_type === "date") return "date";
  if (field.field_type === "datetime") return "datetime-local";
  if (field.field_type === "number") return "number";
  return "text";
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
