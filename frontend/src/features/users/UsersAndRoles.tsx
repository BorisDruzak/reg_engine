import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { archiveUser, createUser, updateUser } from "@/api/client";
import type { PermissionRead, RoleRead, UserRead } from "@/api/types";
import {
  booleanLabel,
  lifecycleStatusLabel,
  permissionDescriptionLabel,
  roleDisplayNameLabel,
  uiText,
  userDisplayNameLabel,
} from "@/app/uiText";
import {
  AdminMutationDialog,
  AdminMutationForm,
  ArchiveConfirmation,
  MutationFeedback,
} from "@/components/common/AdminMutation";
import { CompactList, Panel } from "@/components/common/DataSurfaces";

type UserFormState =
  | {
      mode: "create";
      userId: null;
      email: string;
      displayName: string;
      password: string;
      status: string;
      isSuperuser: boolean;
    }
  | {
      mode: "edit";
      userId: string;
      email: string;
      displayName: string;
      status: string;
      isSuperuser: boolean;
    }
  | {
      mode: "password";
      userId: string;
      itemLabel: string;
      password: string;
    };

export function UsersAndRoles({
  users,
  roles,
  permissions,
  token,
}: {
  users: UserRead[];
  roles: RoleRead[];
  permissions: PermissionRead[];
  token: string;
}) {
  const queryClient = useQueryClient();
  const [formState, setFormState] = useState<UserFormState | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<UserRead | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const createMutation = useMutation({
    mutationFn: (payload: {
      email: string;
      display_name: string;
      password: string;
      status: string;
      is_superuser: boolean;
    }) => createUser(token, payload),
    onSuccess: async () => {
      setFormState(null);
      setSuccessMessage(uiText.userCreated);
      await invalidateUserData(queryClient, token);
    },
  });
  const updateProfileMutation = useMutation({
    mutationFn: (payload: {
      userId: string;
      email: string;
      display_name: string;
      status: string;
      is_superuser: boolean;
    }) =>
      updateUser(token, payload.userId, {
        email: payload.email,
        display_name: payload.display_name,
        status: payload.status,
        is_superuser: payload.is_superuser,
      }),
    onSuccess: async () => {
      setFormState(null);
      setSuccessMessage(uiText.userUpdated);
      await invalidateUserData(queryClient, token);
    },
  });
  const updatePasswordMutation = useMutation({
    mutationFn: (payload: { userId: string; password: string }) =>
      updateUser(token, payload.userId, { password: payload.password }),
    onSuccess: async () => {
      setFormState(null);
      setSuccessMessage(uiText.passwordUpdated);
      await invalidateUserData(queryClient, token);
    },
  });
  const archiveMutation = useMutation({
    mutationFn: (userId: string) => archiveUser(token, userId),
    onSuccess: async () => {
      setArchiveTarget(null);
      setSuccessMessage(uiText.userArchived);
      await invalidateUserData(queryClient, token);
    },
  });
  const mutationError = localError
    ? new Error(localError)
    : (createMutation.error ??
      updateProfileMutation.error ??
      updatePasswordMutation.error ??
      archiveMutation.error);
  const isFormSubmitting =
    createMutation.isPending || updateProfileMutation.isPending || updatePasswordMutation.isPending;

  function resetFeedback() {
    setLocalError(null);
    setSuccessMessage(null);
  }

  function openCreateForm() {
    resetFeedback();
    setFormState({
      mode: "create",
      userId: null,
      email: "",
      displayName: "",
      password: "",
      status: "active",
      isSuperuser: false,
    });
  }

  function openEditForm(user: UserRead) {
    resetFeedback();
    setFormState({
      mode: "edit",
      userId: user.id,
      email: user.email,
      displayName: user.display_name,
      status: user.status,
      isSuperuser: user.is_superuser,
    });
  }

  function openPasswordForm(user: UserRead) {
    resetFeedback();
    setFormState({
      mode: "password",
      userId: user.id,
      itemLabel: userDisplayNameLabel(user.display_name),
      password: "",
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

    if (formState.mode === "password") {
      const password = formState.password.trim();
      if (!password) {
        setLocalError(uiText.requiredFields);
        return;
      }
      setLocalError(null);
      setSuccessMessage(null);
      updatePasswordMutation.mutate({ userId: formState.userId, password });
      return;
    }

    const email = formState.email.trim();
    const displayName = formState.displayName.trim();
    if (!email || !displayName || (formState.mode === "create" && !formState.password.trim())) {
      setLocalError(uiText.requiredFields);
      return;
    }

    setLocalError(null);
    setSuccessMessage(null);
    if (formState.mode === "create") {
      createMutation.mutate({
        email,
        display_name: displayName,
        password: formState.password.trim(),
        status: formState.status,
        is_superuser: formState.isSuperuser,
      });
      return;
    }

    updateProfileMutation.mutate({
      userId: formState.userId,
      email,
      display_name: displayName,
      status: formState.status,
      is_superuser: formState.isSuperuser,
    });
  }

  function handleArchive(user: UserRead) {
    resetFeedback();
    setArchiveTarget(user);
  }

  return (
    <div className="stack">
      <Panel title={uiText.users}>
        <div className="panel-toolbar">
          <button type="button" className="primary-button" onClick={openCreateForm}>
            {uiText.createUser}
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
                formState.mode === "create"
                  ? uiText.createUser
                  : formState.mode === "edit"
                    ? uiText.editUser
                    : uiText.resetUserPassword
              }
              description={formState.mode === "password" ? formState.itemLabel : undefined}
              submitLabel={formState.mode === "create" ? uiText.create : uiText.save}
              isSubmitting={isFormSubmitting}
              error={mutationError}
              successMessage={null}
              onCancel={closeForm}
              onSubmit={handleFormSubmit}
            >
              {formState.mode !== "password" && (
                <>
                  <label>
                    {uiText.userEmail}
                    <input
                      type="email"
                      value={formState.email}
                      onChange={(event) =>
                        setFormState({ ...formState, email: event.currentTarget.value })
                      }
                    />
                  </label>
                  <label>
                    {uiText.userDisplayName}
                    <input
                      value={formState.displayName}
                      onChange={(event) =>
                        setFormState({ ...formState, displayName: event.currentTarget.value })
                      }
                    />
                  </label>
                  {formState.mode === "create" && (
                    <label>
                      {uiText.userPassword}
                      <input
                        type="password"
                        value={formState.password}
                        onChange={(event) =>
                          setFormState({ ...formState, password: event.currentTarget.value })
                        }
                      />
                    </label>
                  )}
                  <label>
                    {uiText.userStatus}
                    <select
                      value={formState.status}
                      onChange={(event) =>
                        setFormState({ ...formState, status: event.currentTarget.value })
                      }
                    >
                      <option value="active">{lifecycleStatusLabel("active")}</option>
                      <option value="inactive">{lifecycleStatusLabel("inactive")}</option>
                    </select>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={formState.isSuperuser}
                      onChange={(event) =>
                        setFormState({ ...formState, isSuperuser: event.currentTarget.checked })
                      }
                    />
                    {uiText.superuser}
                  </label>
                </>
              )}
              {formState.mode === "password" && (
                <label>
                  {uiText.newPassword}
                  <input
                    type="password"
                    value={formState.password}
                    onChange={(event) =>
                      setFormState({ ...formState, password: event.currentTarget.value })
                    }
                  />
                </label>
              )}
            </AdminMutationForm>
          </div>
        )}
        {archiveTarget && (
          <AdminMutationDialog title={uiText.archiveUser}>
            <ArchiveConfirmation
              entityLabel={uiText.user}
              itemLabel={userDisplayNameLabel(archiveTarget.display_name)}
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
                <th>{uiText.displayName}</th>
                <th>{uiText.email}</th>
                <th>{uiText.status}</th>
                <th>{uiText.superuser}</th>
                <th>{uiText.action}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const itemLabel = userDisplayNameLabel(user.display_name);
                return (
                  <tr key={user.id}>
                    <td>{itemLabel}</td>
                    <td>{user.email}</td>
                    <td>{lifecycleStatusLabel(user.status)}</td>
                    <td>{booleanLabel(user.is_superuser)}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => openEditForm(user)}
                        >
                          {uiText.editUser} {itemLabel}
                        </button>
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => openPasswordForm(user)}
                        >
                          {uiText.resetUserPassword} {itemLabel}
                        </button>
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => handleArchive(user)}
                        >
                          {uiText.archiveUser} {itemLabel}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
      <div className="split-grid">
        <Panel title={uiText.roles}>
          <CompactList
            items={roles.map((role) => ({
              id: role.id,
              title: roleDisplayNameLabel(role.code, role.name),
              detail: `${uiText.technicalCode}: ${role.code}`,
            }))}
          />
        </Panel>
        <Panel title={uiText.permissions}>
          <CompactList
            items={permissions.map((permission) => ({
              id: permission.id,
              title: permissionDescriptionLabel(permission.code, permission.description),
              detail: `${uiText.technicalCode}: ${permission.code}`,
            }))}
          />
        </Panel>
      </div>
    </div>
  );
}

async function invalidateUserData(queryClient: QueryClient, token: string) {
  await queryClient.invalidateQueries({ queryKey: ["users", token] });
  await queryClient.invalidateQueries({ queryKey: ["audit-events", token] });
}
