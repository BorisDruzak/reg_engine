import { useMemo, useState } from "react";

import type { OrganizationRead } from "@/api/types";
import { uiText } from "@/app/uiText";

type OrganizationTreeNode = OrganizationRead & {
  children: OrganizationTreeNode[];
};

export function CardOrganizationFilter({
  organizations,
  selectedOrganizationIds,
  includeDescendants,
  isOpen: controlledIsOpen,
  className,
  onOpenChange,
  onSelectedOrganizationIdsChange,
  onIncludeDescendantsChange,
}: {
  organizations: OrganizationRead[];
  selectedOrganizationIds: string[];
  includeDescendants: boolean;
  isOpen?: boolean;
  className?: string;
  onOpenChange?: (value: boolean) => void;
  onSelectedOrganizationIdsChange: (value: string[]) => void;
  onIncludeDescendantsChange: (value: boolean) => void;
}) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = controlledIsOpen ?? internalIsOpen;
  const selectedIds = useMemo(() => new Set(selectedOrganizationIds), [selectedOrganizationIds]);
  const organizationsById = useMemo(
    () => new Map(organizations.map((organization) => [organization.id, organization])),
    [organizations],
  );
  const organizationTree = useMemo(() => buildOrganizationTree(organizations), [organizations]);
  const label = organizationFilterLabel({
    organizationsById,
    selectedOrganizationIds,
    includeDescendants,
  });

  function setIsOpen(value: boolean) {
    if (onOpenChange) {
      onOpenChange(value);
      return;
    }
    setInternalIsOpen(value);
  }

  function toggleOrganization(organizationId: string) {
    if (selectedIds.has(organizationId)) {
      onSelectedOrganizationIdsChange(
        selectedOrganizationIds.filter((selectedId) => selectedId !== organizationId),
      );
      return;
    }
    onSelectedOrganizationIdsChange([...selectedOrganizationIds, organizationId]);
  }

  return (
    <div className={["tag-filter", className].filter(Boolean).join(" ")}>
      <button
        type="button"
        className="ghost-button tag-filter-button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
      >
        {label}
      </button>
      {isOpen && (
        <div className="tag-filter-popover">
          <div className="tag-filter-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={() => onSelectedOrganizationIdsChange([])}
            >
              {uiText.allAccessibleOrganizationsAction}
            </button>
          </div>
          <label className="checkbox-control">
            <input
              type="checkbox"
              checked={includeDescendants}
              onChange={(event) => onIncludeDescendantsChange(event.currentTarget.checked)}
            />
            <span>{uiText.includeDescendantOrganizations}</span>
          </label>
          <div className="organization-filter-tree">
            {organizationTree.map((organization) => (
              <OrganizationFilterNode
                key={organization.id}
                organization={organization}
                depth={0}
                selectedIds={selectedIds}
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
