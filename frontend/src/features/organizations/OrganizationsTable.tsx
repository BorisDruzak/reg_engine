import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { archiveOrganization, createOrganization, updateOrganization } from "@/api/client";
import type { OrganizationRead } from "@/api/types";
import { activityLabel, organizationTypeLabel, uiText } from "@/app/uiText";
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
  organizationType: string;
};

const defaultOrganizationType = "organization";

export function OrganizationsTable({
  organizations,
  token,
}: {
  organizations: OrganizationRead[];
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
    mutationFn: (payload: { organizationId: string; name: string; organization_type: string }) =>
      updateOrganization(token, payload.organizationId, {
        name: payload.name,
        organization_type: payload.organization_type,
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

  function openCreateForm() {
    setLocalError(null);
    setSuccessMessage(null);
    setFormState({
      mode: "create",
      organizationId: null,
      code: "",
      name: "",
      parentId: "",
      organizationType: defaultOrganizationType,
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
      organizationType: organization.type,
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

    const code = formState.code.trim();
    const name = formState.name.trim();
    if (!name || (formState.mode === "create" && !code)) {
      setLocalError(uiText.requiredFields);
      return;
    }

    setLocalError(null);
    setSuccessMessage(null);
    if (formState.mode === "create") {
      createMutation.mutate({
        code,
        name,
        parent_id: formState.parentId || null,
        organization_type: formState.organizationType,
      });
      return;
    }

    if (formState.organizationId) {
      updateMutation.mutate({
        organizationId: formState.organizationId,
        name,
        organization_type: formState.organizationType,
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
            {formState.mode === "create" && (
              <label>
                {uiText.organizationCode}
                <input
                  value={formState.code}
                  onChange={(event) =>
                    setFormState({ ...formState, code: event.currentTarget.value })
                  }
                />
              </label>
            )}
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
                <option value="">{uiText.noParentOrganization}</option>
                {organizations
                  .filter((organization) => organization.id !== formState.organizationId)
                  .map((organization) => (
                    <option value={organization.id} key={organization.id}>
                      {organization.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              {uiText.organizationType}
              <select
                value={formState.organizationType}
                onChange={(event) =>
                  setFormState({ ...formState, organizationType: event.currentTarget.value })
                }
              >
                <option value="organization">{organizationTypeLabel("organization")}</option>
                <option value="department">{organizationTypeLabel("department")}</option>
                <option value="unit">{organizationTypeLabel("unit")}</option>
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
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{uiText.organizationName}</th>
              <th>{uiText.code}</th>
              <th>{uiText.type}</th>
              <th>{uiText.status}</th>
              <th>{uiText.action}</th>
            </tr>
          </thead>
          <tbody>
            {organizations.map((organization) => (
              <tr key={organization.id}>
                <td>{organization.name}</td>
                <td>{organization.code}</td>
                <td>{organizationTypeLabel(organization.type)}</td>
                <td>{activityLabel(organization.is_active)}</td>
                <td>
                  <div className="row-actions">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => openEditForm(organization)}
                    >
                      {uiText.editOrganization} {organization.name}
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => handleArchive(organization)}
                    >
                      {uiText.archiveOrganization} {organization.name}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

async function invalidateOrganizationData(queryClient: QueryClient, token: string) {
  await queryClient.invalidateQueries({ queryKey: ["organizations", token] });
  await queryClient.invalidateQueries({ queryKey: ["audit-events", token] });
}
