import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";

import { archiveAccessGrant, createAccessGrant } from "@/api/client";
import type {
  AccessGrantRead,
  OrganizationRead,
  RegistryRead,
  RoleRead,
  UserRead,
} from "@/api/types";
import { grantScopeLabel, roleDisplayNameLabel, uiText } from "@/app/uiText";
import {
  AdminMutationDialog,
  AdminMutationForm,
  MutationFeedback,
} from "@/components/common/AdminMutation";
import { Panel } from "@/components/common/DataSurfaces";
import { shortId } from "@/components/common/dataUtils";

type AccessGrantFormState = {
  userId: string;
  roleId: string;
  registryId: string;
  organizationId: string;
  includeDescendants: boolean;
  validFrom: string;
  validTo: string;
};

export function AccessGrantsTable({
  grants,
  users,
  roles,
  organizations,
  registries,
  token,
}: {
  grants: AccessGrantRead[];
  users: UserRead[];
  roles: RoleRead[];
  organizations: OrganizationRead[];
  registries: RegistryRead[];
  token: string;
}) {
  const queryClient = useQueryClient();
  const [formState, setFormState] = useState<AccessGrantFormState | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<AccessGrantRead | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const rolesById = useMemo(() => new Map(roles.map((role) => [role.id, role])), [roles]);
  const organizationsById = useMemo(
    () => new Map(organizations.map((organization) => [organization.id, organization])),
    [organizations],
  );
  const registriesById = useMemo(
    () => new Map(registries.map((registry) => [registry.id, registry])),
    [registries],
  );
  const createMutation = useMutation({
    mutationFn: (payload: {
      user_id: string;
      role_id: string;
      registry_id: string | null;
      organization_id: string | null;
      include_descendants: boolean;
      valid_from: string | null;
      valid_to: string | null;
    }) => createAccessGrant(token, payload),
    onSuccess: async () => {
      setFormState(null);
      setSuccessMessage(uiText.accessGrantCreated);
      await invalidateAccessGrantData(queryClient, token);
    },
  });
  const revokeMutation = useMutation({
    mutationFn: (grantId: string) => archiveAccessGrant(token, grantId),
    onSuccess: async () => {
      setRevokeTarget(null);
      setSuccessMessage(uiText.accessGrantRevoked);
      await invalidateAccessGrantData(queryClient, token);
    },
  });
  const mutationError = localError
    ? new Error(localError)
    : (createMutation.error ?? revokeMutation.error);

  function openCreateForm() {
    setLocalError(null);
    setSuccessMessage(null);
    setFormState({
      userId: "",
      roleId: "",
      registryId: "",
      organizationId: "",
      includeDescendants: false,
      validFrom: "",
      validTo: "",
    });
  }

  function closeForm() {
    setFormState(null);
    setLocalError(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!formState) {
      return;
    }

    if (!formState.userId || !formState.roleId) {
      setLocalError(uiText.requiredFields);
      return;
    }

    setLocalError(null);
    setSuccessMessage(null);
    createMutation.mutate({
      user_id: formState.userId,
      role_id: formState.roleId,
      registry_id: formState.registryId || null,
      organization_id: formState.organizationId || null,
      include_descendants: Boolean(formState.organizationId && formState.includeDescendants),
      valid_from: formState.validFrom || null,
      valid_to: formState.validTo || null,
    });
  }

  function openRevokeDialog(grant: AccessGrantRead) {
    setLocalError(null);
    setSuccessMessage(null);
    setRevokeTarget(grant);
  }

  return (
    <Panel title={uiText.accessGrants}>
      <div className="panel-toolbar">
        <button type="button" className="primary-button" onClick={openCreateForm}>
          {uiText.createAccessGrant}
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
            title={uiText.createAccessGrant}
            submitLabel={uiText.create}
            isSubmitting={createMutation.isPending}
            error={mutationError}
            successMessage={null}
            onCancel={closeForm}
            onSubmit={handleSubmit}
          >
            <label>
              {uiText.accessGrantUser}
              <select
                value={formState.userId}
                onChange={(event) =>
                  setFormState({ ...formState, userId: event.currentTarget.value })
                }
              >
                <option value="">{uiText.noData}</option>
                {users.map((user) => (
                  <option value={user.id} key={user.id}>
                    {user.email}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {uiText.accessGrantRole}
              <select
                value={formState.roleId}
                onChange={(event) =>
                  setFormState({ ...formState, roleId: event.currentTarget.value })
                }
              >
                <option value="">{uiText.noData}</option>
                {roles.map((role) => (
                  <option value={role.id} key={role.id}>
                    {roleDisplayNameLabel(role.code, role.name)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {uiText.accessGrantOrganization}
              <select
                value={formState.organizationId}
                onChange={(event) =>
                  setFormState({
                    ...formState,
                    organizationId: event.currentTarget.value,
                    includeDescendants: event.currentTarget.value
                      ? formState.includeDescendants
                      : false,
                  })
                }
              >
                <option value="">{uiText.noOrganizationScope}</option>
                {organizations.map((organization) => (
                  <option value={organization.id} key={organization.id}>
                    {organization.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {uiText.accessGrantRegistry}
              <select
                value={formState.registryId}
                onChange={(event) =>
                  setFormState({ ...formState, registryId: event.currentTarget.value })
                }
              >
                <option value="">{uiText.noRegistryScope}</option>
                {registries.map((registry) => (
                  <option value={registry.id} key={registry.id}>
                    {registry.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={formState.includeDescendants}
                disabled={!formState.organizationId}
                onChange={(event) =>
                  setFormState({ ...formState, includeDescendants: event.currentTarget.checked })
                }
              />
              {uiText.includeChildOrganizations}
            </label>
            <label>
              {uiText.validFrom}
              <input
                type="date"
                value={formState.validFrom}
                onChange={(event) =>
                  setFormState({ ...formState, validFrom: event.currentTarget.value })
                }
              />
            </label>
            <label>
              {uiText.validTo}
              <input
                type="date"
                value={formState.validTo}
                onChange={(event) =>
                  setFormState({ ...formState, validTo: event.currentTarget.value })
                }
              />
            </label>
            <p className="scope-summary">
              {formScopeSummary(formState, organizationsById, registriesById)}
            </p>
          </AdminMutationForm>
        </div>
      )}
      {revokeTarget && (
        <AdminMutationDialog title={uiText.revokeAccessGrant}>
          <div className="archive-confirmation">
            <p>
              {grantRowLabel(revokeTarget, usersById, rolesById, organizationsById, registriesById)}
            </p>
            <p>{uiText.revokeAccessGrant}</p>
            <div className="admin-mutation-actions">
              <button type="button" className="ghost-button" onClick={() => setRevokeTarget(null)}>
                {uiText.cancel}
              </button>
              <button
                type="button"
                className="danger-button"
                disabled={revokeMutation.isPending}
                onClick={() => revokeMutation.mutate(revokeTarget.id)}
              >
                {uiText.revoke}
              </button>
            </div>
          </div>
        </AdminMutationDialog>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{uiText.user}</th>
              <th>{uiText.role}</th>
              <th>{uiText.organization}</th>
              <th>{uiText.registry}</th>
              <th>{uiText.scope}</th>
              <th>{uiText.validity}</th>
              <th>{uiText.action}</th>
            </tr>
          </thead>
          <tbody>
            {grants.map((grant) => {
              const rowLabel = grantRowLabel(
                grant,
                usersById,
                rolesById,
                organizationsById,
                registriesById,
              );
              return (
                <tr key={grant.id}>
                  <td>{usersById.get(grant.user_id)?.email ?? shortId(grant.user_id)}</td>
                  <td>{roleLabel(grant.role_id, rolesById)}</td>
                  <td>{organizationLabel(grant.organization_id, organizationsById)}</td>
                  <td>{registryLabel(grant.registry_id, registriesById)}</td>
                  <td>{grantScopeLabel(grant.include_descendants)}</td>
                  <td>{validityLabel(grant)}</td>
                  <td>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => openRevokeDialog(grant)}
                    >
                      {uiText.revokeAccessGrant} {rowLabel}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function roleLabel(roleId: string, rolesById: Map<string, RoleRead>) {
  const role = rolesById.get(roleId);
  return role ? roleDisplayNameLabel(role.code, role.name) : shortId(roleId);
}

function organizationLabel(
  organizationId: string | null,
  organizationsById: Map<string, OrganizationRead>,
) {
  return organizationId
    ? (organizationsById.get(organizationId)?.name ?? shortId(organizationId))
    : uiText.global;
}

function registryLabel(registryId: string | null, registriesById: Map<string, RegistryRead>) {
  return registryId ? (registriesById.get(registryId)?.name ?? shortId(registryId)) : uiText.global;
}

function validityLabel(grant: AccessGrantRead) {
  if (!grant.valid_from && !grant.valid_to) {
    return uiText.unlimitedValidity;
  }
  return `${grant.valid_from ?? "…"} - ${grant.valid_to ?? "…"}`;
}

function formScopeSummary(
  formState: AccessGrantFormState,
  organizationsById: Map<string, OrganizationRead>,
  registriesById: Map<string, RegistryRead>,
) {
  const baseScope = formState.organizationId
    ? `${organizationsById.get(formState.organizationId)?.name ?? shortId(formState.organizationId)}, ${
        formState.includeDescendants ? "с дочерними организациями" : "только выбранная организация"
      }`
    : uiText.global;
  const registryScope = formState.registryId
    ? `; реестр: ${registriesById.get(formState.registryId)?.name ?? shortId(formState.registryId)}`
    : "";
  return `${uiText.accessScopeSummary}: ${baseScope}${registryScope}`;
}

function grantRowLabel(
  grant: AccessGrantRead,
  usersById: Map<string, UserRead>,
  rolesById: Map<string, RoleRead>,
  organizationsById: Map<string, OrganizationRead>,
  registriesById: Map<string, RegistryRead>,
) {
  const userLabel = usersById.get(grant.user_id)?.email ?? shortId(grant.user_id);
  return `${userLabel} ${roleLabel(grant.role_id, rolesById)} ${organizationLabel(
    grant.organization_id,
    organizationsById,
  )} ${registryLabel(grant.registry_id, registriesById)}`;
}

async function invalidateAccessGrantData(queryClient: QueryClient, token: string) {
  await queryClient.invalidateQueries({ queryKey: ["access-grants", token] });
  await queryClient.invalidateQueries({ queryKey: ["audit-events", token] });
}
