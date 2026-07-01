import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useState, type CSSProperties, type FormEvent } from "react";

import { archiveOrganization, createOrganization, updateOrganization } from "@/api/client";
import type { OrganizationRead, OrganizationTreeNodeRead } from "@/api/types";
import { generateTechnicalCode } from "@/app/technicalCode";
import { activityLabel, uiText } from "@/app/uiText";
import {
  AdminMutationDialog,
  AdminMutationForm,
  ArchiveConfirmation,
  MutationFeedback,
} from "@/components/common/AdminMutation";
import { Panel } from "@/components/common/DataSurfaces";

type OrganizationFormState = {
  mode: "create" | "edit";
  organizationId: string | null;
  code: string;
  name: string;
  parentId: string;
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
      setSuccessMessage(uiText.organizationArchived);
      await invalidateOrganizationData(queryClient, token);
    },
  });
  const mutationError = localError
    ? new Error(localError)
    : (createMutation.error ?? updateMutation.error ?? archiveMutation.error);
  const isFormSubmitting = createMutation.isPending || updateMutation.isPending;
  const rootOrganizationExists = organizations.some(
    (organization) => organization.is_active && organization.parent_id === null,
  );
  const canCreateRootOrganization = !rootOrganizationExists;
  const parentOptions = organizations.filter(
    (organization) => organization.is_active && organization.id !== formState?.organizationId,
  );

  function openCreateForm() {
    setLocalError(null);
    setSuccessMessage(null);
    setFormState({
      mode: "create",
      organizationId: null,
      code: "",
      name: "",
      parentId: "",
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

  return (
    <Panel title={uiText.organizations}>
      <div className="panel-toolbar">
        <button type="button" className="primary-button" onClick={openCreateForm}>
          {uiText.createOrganization}
        </button>
      </div>
      <div className="panel-feedback">
        <MutationFeedback
          error={formState ? null : mutationError}
          successMessage={successMessage}
        />
      </div>
      {formState && (
        <div className="panel-form">
          <AdminMutationForm
            title={
              formState.mode === "create" ? uiText.createOrganization : uiText.editOrganization
            }
            submitLabel={formState.mode === "create" ? uiText.create : uiText.save}
            isSubmitting={isFormSubmitting}
            error={mutationError}
            successMessage={null}
            onCancel={closeForm}
            onSubmit={handleFormSubmit}
          >
            <label>
              {uiText.organizationName} организации
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
                disabled={formState.mode === "edit"}
                onChange={(event) =>
                  setFormState({ ...formState, parentId: event.currentTarget.value })
                }
              >
                {(formState.mode === "edit" || canCreateRootOrganization) && (
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
          onEditOrganization={openEditForm}
          onArchiveOrganization={handleArchive}
        />
      ) : (
        <p className="data-empty">{uiText.noData}</p>
      )}
    </Panel>
  );
}

function OrganizationTree({
  nodes,
  onEditOrganization,
  onArchiveOrganization,
}: {
  nodes: OrganizationTreeNodeRead[];
  onEditOrganization: (organization: OrganizationRead) => void;
  onArchiveOrganization: (organization: OrganizationRead) => void;
}) {
  return (
    <ul className="organization-tree" role="tree" aria-label={uiText.organizationTree}>
      {nodes.map((node) => (
        <OrganizationTreeNode
          key={node.id}
          node={node}
          level={1}
          onEditOrganization={onEditOrganization}
          onArchiveOrganization={onArchiveOrganization}
        />
      ))}
    </ul>
  );
}

function OrganizationTreeNode({
  node,
  level,
  onEditOrganization,
  onArchiveOrganization,
}: {
  node: OrganizationTreeNodeRead;
  level: number;
  onEditOrganization: (organization: OrganizationRead) => void;
  onArchiveOrganization: (organization: OrganizationRead) => void;
}) {
  return (
    <li className="organization-tree-node">
      <div
        className="organization-tree-row"
        role="treeitem"
        aria-label={node.name}
        aria-level={level}
        style={{ "--tree-level": String(level - 1) } as CSSProperties}
      >
        <div className="organization-tree-main">
          <strong>{node.name}</strong>
          <span>
            {uiText.technicalCode}: {node.code}
          </span>
        </div>
        <span className="organization-tree-status">{activityLabel(node.is_active)}</span>
        <div className="row-actions">
          <button
            type="button"
            className="ghost-button"
            aria-label={`${uiText.editOrganization} ${node.name}`}
            onClick={() => onEditOrganization(node)}
          >
            {uiText.edit}
          </button>
          <button
            type="button"
            className="ghost-button"
            aria-label={`${uiText.archiveOrganization} ${node.name}`}
            onClick={() => onArchiveOrganization(node)}
          >
            {uiText.moveToArchive}
          </button>
        </div>
      </div>
      {node.children.length > 0 && (
        <ul role="group">
          {node.children.map((child) => (
            <OrganizationTreeNode
              key={child.id}
              node={child}
              level={level + 1}
              onEditOrganization={onEditOrganization}
              onArchiveOrganization={onArchiveOrganization}
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
