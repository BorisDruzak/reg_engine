import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from "react";

import { archiveOrganization, createOrganization, updateOrganization } from "@/api/client";
import type { OrganizationRead, OrganizationTreeNodeRead, OrgUnitType } from "@/api/types";
import { generateTechnicalCode } from "@/app/technicalCode";
import { activityLabel, uiText } from "@/app/uiText";
import {
  AdminMutationDialog,
  AdminMutationForm,
  ArchiveConfirmation,
  MutationFeedback,
} from "@/components/common/AdminMutation";
import { Panel } from "@/components/common/DataSurfaces";

import { OrganizationUnitsPanel } from "./OrganizationUnitsPanel";

type OrganizationFormState = {
  mode: "create" | "edit";
  organizationId: string | null;
  code: string;
  name: string;
  parentId: string;
  parentLocked: boolean;
};

const defaultOrganizationType = "organization";

export function OrganizationsTable({
  organizations,
  organizationTree,
  token,
}: {
  organizations: OrganizationRead[];
  organizationTree: OrganizationTreeNodeRead[];
  token: string;
}) {
  const queryClient = useQueryClient();
  const [formState, setFormState] = useState<OrganizationFormState | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<OrganizationRead | null>(null);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(null);
  const [unitCreateRequest, setUnitCreateRequest] = useState<{
    organizationId: string;
    requestId: number;
    unitType: OrgUnitType;
  } | null>(null);
  const unitCreateRequestCounter = useRef(0);
  const [localError, setLocalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const createMutation = useMutation({
    mutationFn: (payload: {
      code: string;
      name: string;
      parent_id: string | null;
      organization_type: string;
    }) => createOrganization(token, payload),
    onSuccess: async () => {
      setFormState(null);
      setSuccessMessage(uiText.organizationCreated);
      await invalidateOrganizationData(queryClient, token);
    },
  });
  const updateMutation = useMutation({
    mutationFn: (payload: { organizationId: string; name: string }) =>
      updateOrganization(token, payload.organizationId, {
        name: payload.name,
        organization_type: defaultOrganizationType,
      }),
    onSuccess: async () => {
      setFormState(null);
      setSuccessMessage(uiText.organizationUpdated);
      await invalidateOrganizationData(queryClient, token);
    },
  });
  const archiveMutation = useMutation({
    mutationFn: (organizationId: string) => archiveOrganization(token, organizationId),
    onSuccess: async () => {
      setArchiveTarget(null);
      setFormState(null);
      setSelectedOrganizationId(null);
      setSuccessMessage(uiText.organizationArchived);
      await invalidateOrganizationData(queryClient, token);
    },
  });
  const mutationError = localError
    ? new Error(localError)
    : (createMutation.error ?? updateMutation.error ?? archiveMutation.error);
  const inlineEditError = localError ? new Error(localError) : updateMutation.error;
  const isFormSubmitting = createMutation.isPending || updateMutation.isPending;
  const rootOrganizationExists = organizations.some(
    (organization) => organization.is_active && organization.parent_id === null,
  );
  const canCreateRootOrganization = !rootOrganizationExists;
  const parentOptions = organizations.filter(
    (organization) => organization.is_active && organization.id !== formState?.organizationId,
  );

  function openCreateForm(parentId?: string) {
    setLocalError(null);
    setSuccessMessage(null);
    setFormState({
      mode: "create",
      organizationId: null,
      code: "",
      name: "",
      parentId: parentId ?? defaultCreateParentId(organizations, rootOrganizationExists),
      parentLocked: parentId !== undefined,
    });
  }

  function openEditForm(organization: OrganizationRead) {
    setLocalError(null);
    setSuccessMessage(null);
    setFormState({
      mode: "edit",
      organizationId: organization.id,
      code: organization.code,
      name: organization.name,
      parentId: organization.parent_id ?? "",
      parentLocked: false,
    });
  }

  function closeForm() {
    setFormState(null);
    setLocalError(null);
  }

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!formState) {
      return;
    }

    const name = formState.name.trim();
    if (!name) {
      setLocalError(uiText.requiredFields);
      return;
    }
    if (formState.mode === "create" && rootOrganizationExists && !formState.parentId) {
      setLocalError(uiText.parentOrganizationRequired);
      return;
    }

    setLocalError(null);
    setSuccessMessage(null);
    if (formState.mode === "create") {
      createMutation.mutate({
        code: generateTechnicalCode(
          name,
          "org",
          organizations.map((organization) => organization.code),
        ),
        name,
        parent_id: formState.parentId || null,
        organization_type: defaultOrganizationType,
      });
      return;
    }

    if (formState.organizationId) {
      updateMutation.mutate({
        organizationId: formState.organizationId,
        name,
      });
    }
  }

  function handleArchive(organization: OrganizationRead) {
    setSuccessMessage(null);
    setArchiveTarget(organization);
  }

  function toggleOrganizationCard(organization: OrganizationRead) {
    setSelectedOrganizationId((currentId) =>
      currentId === organization.id ? null : organization.id,
    );
    setUnitCreateRequest(null);
  }

  return (
    <Panel title={uiText.organizations}>
      <div className="panel-toolbar">
        <button type="button" className="primary-button" onClick={() => openCreateForm()}>
          {uiText.createOrganization}
        </button>
      </div>
      <div className="panel-feedback">
        <MutationFeedback
          error={formState ? null : mutationError}
          successMessage={successMessage}
        />
      </div>
      {formState?.mode === "create" && (
        <div className="panel-form">
          <AdminMutationForm
            title={uiText.createOrganization}
            submitLabel={uiText.create}
            isSubmitting={isFormSubmitting}
            error={mutationError}
            successMessage={null}
            onCancel={closeForm}
            onSubmit={handleFormSubmit}
          >
            <label>
              {uiText.organizationName}
              <input
                value={formState.name}
                onChange={(event) =>
                  setFormState({ ...formState, name: event.currentTarget.value })
                }
              />
            </label>
            <label>
              {uiText.parentOrganization}
              <select
                value={formState.parentId}
                disabled={formState.parentLocked}
                onChange={(event) =>
                  setFormState({ ...formState, parentId: event.currentTarget.value })
                }
              >
                {canCreateRootOrganization && (
                  <option value="">{uiText.noParentOrganization}</option>
                )}
                {parentOptions.map((organization) => (
                  <option value={organization.id} key={organization.id}>
                    {organization.name}
                  </option>
                ))}
              </select>
            </label>
          </AdminMutationForm>
        </div>
      )}
      {archiveTarget && (
        <AdminMutationDialog title={uiText.archiveOrganization}>
          <ArchiveConfirmation
            entityLabel={uiText.organization}
            itemLabel={archiveTarget.name}
            isPending={archiveMutation.isPending}
            onCancel={() => setArchiveTarget(null)}
            onConfirm={() => archiveMutation.mutate(archiveTarget.id)}
          />
        </AdminMutationDialog>
      )}
      {organizationTree.length > 0 ? (
        <OrganizationTree
          nodes={organizationTree}
          formState={formState?.mode === "edit" ? formState : null}
          inlineEditError={inlineEditError}
          isInlineEditSubmitting={updateMutation.isPending}
          selectedOrganizationId={selectedOrganizationId}
          token={token}
          onEditOrganization={openEditForm}
          onArchiveOrganization={handleArchive}
          onCancelEdit={closeForm}
          onChangeEditName={(name) =>
            setFormState((current) => (current ? { ...current, name } : current))
          }
          onCreateChildOrganization={(organization) => openCreateForm(organization.id)}
          onCreateUnit={(organization, unitType) =>
            setUnitCreateRequest({
              organizationId: organization.id,
              requestId: ++unitCreateRequestCounter.current,
              unitType,
            })
          }
          unitCreateRequest={unitCreateRequest}
          onUnitCreateRequestConsumed={() => setUnitCreateRequest(null)}
          onSubmitEdit={handleFormSubmit}
          onToggleOrganizationCard={toggleOrganizationCard}
        />
      ) : (
        <p className="data-empty">{uiText.noData}</p>
      )}
    </Panel>
  );
}

function OrganizationTree({
  nodes,
  formState,
  inlineEditError,
  isInlineEditSubmitting,
  selectedOrganizationId,
  token,
  onEditOrganization,
  onArchiveOrganization,
  onCancelEdit,
  onChangeEditName,
  onCreateChildOrganization,
  onCreateUnit,
  unitCreateRequest,
  onUnitCreateRequestConsumed,
  onSubmitEdit,
  onToggleOrganizationCard,
}: {
  nodes: OrganizationTreeNodeRead[];
  formState: OrganizationFormState | null;
  inlineEditError: unknown;
  isInlineEditSubmitting: boolean;
  selectedOrganizationId: string | null;
  token: string;
  onEditOrganization: (organization: OrganizationRead) => void;
  onArchiveOrganization: (organization: OrganizationRead) => void;
  onCancelEdit: () => void;
  onChangeEditName: (name: string) => void;
  onCreateChildOrganization: (organization: OrganizationRead) => void;
  onCreateUnit: (organization: OrganizationRead, unitType: OrgUnitType) => void;
  unitCreateRequest: {
    organizationId: string;
    requestId: number;
    unitType: OrgUnitType;
  } | null;
  onUnitCreateRequestConsumed: () => void;
  onSubmitEdit: (event: FormEvent<HTMLFormElement>) => void;
  onToggleOrganizationCard: (organization: OrganizationRead) => void;
}) {
  return (
    <ul className="organization-tree" role="tree" aria-label={uiText.organizationTree}>
      {nodes.map((node) => (
        <OrganizationTreeNode
          key={node.id}
          node={node}
          level={1}
          formState={formState}
          inlineEditError={inlineEditError}
          isInlineEditSubmitting={isInlineEditSubmitting}
          selectedOrganizationId={selectedOrganizationId}
          token={token}
          onEditOrganization={onEditOrganization}
          onArchiveOrganization={onArchiveOrganization}
          onCancelEdit={onCancelEdit}
          onChangeEditName={onChangeEditName}
          onCreateChildOrganization={onCreateChildOrganization}
          onCreateUnit={onCreateUnit}
          unitCreateRequest={unitCreateRequest}
          onUnitCreateRequestConsumed={onUnitCreateRequestConsumed}
          onSubmitEdit={onSubmitEdit}
          onToggleOrganizationCard={onToggleOrganizationCard}
        />
      ))}
    </ul>
  );
}

function OrganizationTreeNode({
  node,
  level,
  formState,
  inlineEditError,
  isInlineEditSubmitting,
  selectedOrganizationId,
  token,
  onEditOrganization,
  onArchiveOrganization,
  onCancelEdit,
  onChangeEditName,
  onCreateChildOrganization,
  onCreateUnit,
  unitCreateRequest,
  onUnitCreateRequestConsumed,
  onSubmitEdit,
  onToggleOrganizationCard,
}: {
  node: OrganizationTreeNodeRead;
  level: number;
  formState: OrganizationFormState | null;
  inlineEditError: unknown;
  isInlineEditSubmitting: boolean;
  selectedOrganizationId: string | null;
  token: string;
  onEditOrganization: (organization: OrganizationRead) => void;
  onArchiveOrganization: (organization: OrganizationRead) => void;
  onCancelEdit: () => void;
  onChangeEditName: (name: string) => void;
  onCreateChildOrganization: (organization: OrganizationRead) => void;
  onCreateUnit: (organization: OrganizationRead, unitType: OrgUnitType) => void;
  unitCreateRequest: {
    organizationId: string;
    requestId: number;
    unitType: OrgUnitType;
  } | null;
  onUnitCreateRequestConsumed: () => void;
  onSubmitEdit: (event: FormEvent<HTMLFormElement>) => void;
  onToggleOrganizationCard: (organization: OrganizationRead) => void;
}) {
  const isEditing = formState?.organizationId === node.id;
  const isSelected = selectedOrganizationId === node.id;

  function handleRowKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    onToggleOrganizationCard(node);
  }

  return (
    <li className="organization-tree-node">
      <div
        className="organization-tree-row"
        role="treeitem"
        aria-label={node.name}
        aria-level={level}
        aria-expanded={isSelected}
        tabIndex={0}
        onClick={() => onToggleOrganizationCard(node)}
        onKeyDown={handleRowKeyDown}
        style={{ "--tree-level": String(level - 1) } as CSSProperties}
      >
        {isEditing ? (
          <form
            className="organization-inline-name-form"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            onSubmit={onSubmitEdit}
          >
            <label>
              {uiText.organizationName}
              <input
                autoFocus
                value={formState?.name ?? ""}
                onChange={(event) => onChangeEditName(event.currentTarget.value)}
              />
            </label>
            <div className="organization-inline-name-actions">
              <button type="submit" className="primary-button" disabled={isInlineEditSubmitting}>
                {isInlineEditSubmitting ? uiText.saving : uiText.save}
              </button>
              <button type="button" className="ghost-button" onClick={onCancelEdit}>
                {uiText.cancel}
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={() => onArchiveOrganization(node)}
              >
                {uiText.moveToArchive}
              </button>
            </div>
            <MutationFeedback error={inlineEditError} successMessage={null} />
          </form>
        ) : (
          <button
            type="button"
            className="organization-tree-name"
            onClick={(event) => {
              event.stopPropagation();
              onEditOrganization(node);
            }}
          >
            {node.name}
          </button>
        )}
        <span className="organization-tree-status">{activityLabel(node.is_active)}</span>
      </div>
      {isSelected && (
        <section
          className="organization-inline-card"
          style={{ "--tree-level": String(level - 1) } as CSSProperties}
        >
          <div className="organization-inline-card-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={() => onCreateChildOrganization(node)}
            >
              Добавить подведомственную организацию
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() => onCreateUnit(node, "management")}
            >
              {uiText.addManagement}
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() => onCreateUnit(node, "department")}
            >
              {uiText.addDepartment}
            </button>
          </div>
          <OrganizationUnitsPanel
            organization={node}
            token={token}
            createUnitRequest={
              unitCreateRequest?.organizationId === node.id
                ? {
                    requestId: unitCreateRequest.requestId,
                    unitType: unitCreateRequest.unitType,
                  }
                : null
            }
            onCreateUnitRequestConsumed={onUnitCreateRequestConsumed}
          />
        </section>
      )}
      {node.children.length > 0 && (
        <ul role="group">
          {node.children.map((child) => (
            <OrganizationTreeNode
              key={child.id}
              node={child}
              level={level + 1}
              formState={formState}
              inlineEditError={inlineEditError}
              isInlineEditSubmitting={isInlineEditSubmitting}
              selectedOrganizationId={selectedOrganizationId}
              token={token}
              onEditOrganization={onEditOrganization}
              onArchiveOrganization={onArchiveOrganization}
              onCancelEdit={onCancelEdit}
              onChangeEditName={onChangeEditName}
              onCreateChildOrganization={onCreateChildOrganization}
              onCreateUnit={onCreateUnit}
              unitCreateRequest={unitCreateRequest}
              onUnitCreateRequestConsumed={onUnitCreateRequestConsumed}
              onSubmitEdit={onSubmitEdit}
              onToggleOrganizationCard={onToggleOrganizationCard}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

async function invalidateOrganizationData(queryClient: QueryClient, token: string) {
  await queryClient.invalidateQueries({ queryKey: ["organizations", token] });
  await queryClient.invalidateQueries({ queryKey: ["organizations-tree", token] });
  await queryClient.invalidateQueries({ queryKey: ["audit-events", token] });
}

function defaultCreateParentId(organizations: OrganizationRead[], rootOrganizationExists: boolean) {
  if (!rootOrganizationExists) {
    return "";
  }
  return organizations.find((organization) => organization.is_active)?.id ?? "";
}
