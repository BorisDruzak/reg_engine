import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { archiveUser, createUser, updateUser } from "@/api/client";
import type {
  BusinessRoleCode,
  OrganizationTreeNodeRead,
  UserCreatePayload,
  UserRead,
  UserUpdatePayload,
} from "@/api/types";
import { lifecycleStatusLabel, uiText, userDisplayNameLabel } from "@/app/uiText";
import { ArchiveConfirmation, MutationFeedback } from "@/components/common/AdminMutation";
import { Panel } from "@/components/common/DataSurfaces";

type UserProfileValues = {
  email: string;
  displayName: string;
  password: string;
  status: string;
  roleCode: BusinessRoleCode;
  organizationIds: string[];
  canManageAccess: boolean;
};

export function UsersAndRoles({
  users,
  organizationTree,
  canConfigureAccess,
  canToggleAccessDelegation,
  token,
}: {
  users: UserRead[];
  organizationTree: OrganizationTreeNodeRead[];
  canConfigureAccess: boolean;
  canToggleAccessDelegation: boolean;
  token: string;
}) {
  const queryClient = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<UserRead | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (payload: UserCreatePayload) => createUser(token, payload),
    onSuccess: async () => {
      setIsCreating(false);
      setSuccessMessage(uiText.userCreated);
      await invalidateUserData(queryClient, token);
    },
  });
  const updateMutation = useMutation({
    mutationFn: (payload: { userId: string; values: UserProfileValues }) => {
      const request: UserUpdatePayload = {
        email: payload.values.email,
        display_name: payload.values.displayName,
        status: payload.values.status,
      };
      if (payload.values.password.trim()) {
        request.password = payload.values.password.trim();
      }
      if (canConfigureAccess) {
        request.role_code = payload.values.roleCode;
        request.organization_ids = payload.values.organizationIds;
      }
      if (canToggleAccessDelegation) {
        request.can_manage_access = payload.values.canManageAccess;
      }
      return updateUser(token, payload.userId, request);
    },
    onSuccess: async () => {
      setSuccessMessage(uiText.userUpdated);
      await invalidateUserData(queryClient, token);
    },
  });
  const archiveMutation = useMutation({
    mutationFn: (userId: string) => archiveUser(token, userId),
    onSuccess: async () => {
      setArchiveTarget(null);
      setSelectedUserId(null);
      setSuccessMessage(uiText.userArchived);
      await invalidateUserData(queryClient, token);
    },
  });
  const mutationError = localError
    ? new Error(localError)
    : (createMutation.error ?? updateMutation.error ?? archiveMutation.error);

  function resetFeedback() {
    setLocalError(null);
    setSuccessMessage(null);
  }

  function openCreateForm() {
    resetFeedback();
    setSelectedUserId(null);
    setIsCreating(true);
  }

  return (
    <div className="stack">
      <Panel title={uiText.users}>
        <div className="panel-toolbar">
          {canConfigureAccess && (
            <button type="button" className="primary-button" onClick={openCreateForm}>
              {uiText.createUser}
            </button>
          )}
        </div>
        <div className="panel-feedback">
          <MutationFeedback error={mutationError} successMessage={successMessage} />
        </div>
        {isCreating && (
          <UserProfileEditor
            key="create-user"
            mode="create"
            organizationTree={organizationTree}
            canConfigureAccess={canConfigureAccess}
            canToggleAccessDelegation={canToggleAccessDelegation}
            isPending={createMutation.isPending}
            onCancel={() => setIsCreating(false)}
            onSubmit={(values) => {
              const payload: UserCreatePayload = {
                email: values.email,
                display_name: values.displayName,
                password: values.password,
                status: values.status,
              };
              if (canConfigureAccess) {
                payload.role_code = values.roleCode;
                payload.organization_ids = values.organizationIds;
              }
              if (canToggleAccessDelegation) {
                payload.can_manage_access = values.canManageAccess;
              }
              createMutation.mutate(payload);
            }}
            onValidationError={setLocalError}
          />
        )}
        {archiveTarget && (
          <div className="panel-form">
            <ArchiveConfirmation
              entityLabel={uiText.user}
              itemLabel={userDisplayNameLabel(archiveTarget.display_name)}
              isPending={archiveMutation.isPending}
              onCancel={() => setArchiveTarget(null)}
              onConfirm={() => archiveMutation.mutate(archiveTarget.id)}
            />
          </div>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{uiText.displayName}</th>
                <th>{uiText.role}</th>
                <th>{uiText.scope}</th>
                <th>{uiText.status}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const itemLabel = userDisplayNameLabel(user.display_name);
                const isSelected = user.id === selectedUserId;
                return (
                  <UserTableRow
                    key={user.id}
                    user={user}
                    itemLabel={itemLabel}
                    isSelected={isSelected}
                    organizationTree={organizationTree}
                    onSelect={() => {
                      resetFeedback();
                      setIsCreating(false);
                      setSelectedUserId(user.id);
                    }}
                  >
                    {isSelected && (
                      <UserProfileEditor
                        key={user.id}
                        mode="edit"
                        user={user}
                        organizationTree={organizationTree}
                        canConfigureAccess={canConfigureAccess}
                        canToggleAccessDelegation={canToggleAccessDelegation}
                        isPending={updateMutation.isPending}
                        onCancel={() => setSelectedUserId(null)}
                        onSubmit={(values) => updateMutation.mutate({ userId: user.id, values })}
                        onArchive={() => setArchiveTarget(user)}
                        onValidationError={setLocalError}
                      />
                    )}
                  </UserTableRow>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function UserTableRow({
  user,
  itemLabel,
  isSelected,
  organizationTree,
  onSelect,
  children,
}: {
  user: UserRead;
  itemLabel: string;
  isSelected: boolean;
  organizationTree: OrganizationTreeNodeRead[];
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <tr className={isSelected ? "is-selected" : undefined}>
        <td>
          <button
            type="button"
            className="user-row-select"
            aria-expanded={isSelected}
            onClick={onSelect}
          >
            {itemLabel}
          </button>
        </td>
        <td>{businessRoleLabel(user.role_code)}</td>
        <td>{organizationScopeSummary(user, organizationTree)}</td>
        <td>{lifecycleStatusLabel(user.status)}</td>
      </tr>
      {isSelected && (
        <tr className="user-inline-profile-row">
          <td colSpan={4}>{children}</td>
        </tr>
      )}
    </>
  );
}

function UserProfileEditor({
  mode,
  user,
  organizationTree,
  canConfigureAccess,
  canToggleAccessDelegation,
  isPending,
  onSubmit,
  onCancel,
  onArchive,
  onValidationError,
}: {
  mode: "create" | "edit";
  user?: UserRead;
  organizationTree: OrganizationTreeNodeRead[];
  canConfigureAccess: boolean;
  canToggleAccessDelegation: boolean;
  isPending: boolean;
  onSubmit: (values: UserProfileValues) => void;
  onCancel: () => void;
  onArchive?: () => void;
  onValidationError: (message: string | null) => void;
}) {
  const [values, setValues] = useState<UserProfileValues>(() =>
    user
      ? {
          email: user.email,
          displayName: user.display_name,
          password: "",
          status: user.status,
          roleCode: user.role_code,
          organizationIds: user.organization_ids,
          canManageAccess: user.can_manage_access,
        }
      : {
          email: "",
          displayName: "",
          password: "",
          status: "active",
          roleCode: "subordinate_organization_administrator",
          organizationIds: [],
          canManageAccess: false,
        },
  );
  const shouldChooseScope =
    canConfigureAccess && values.roleCode === "subordinate_organization_administrator";

  function updateValues(patch: Partial<UserProfileValues>) {
    setValues((current) => ({ ...current, ...patch }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = values.email.trim();
    const displayName = values.displayName.trim();
    if (!email || !displayName || (mode === "create" && !values.password.trim())) {
      onValidationError(uiText.requiredFields);
      return;
    }
    if (shouldChooseScope && values.organizationIds.length === 0) {
      onValidationError("Выберите хотя бы одну организацию для подведомственного администратора.");
      return;
    }
    onValidationError(null);
    onSubmit({ ...values, email, displayName, password: values.password.trim() });
  }

  return (
    <form className="user-inline-profile" onSubmit={submit}>
      <div className="user-inline-profile-heading">
        <strong>
          {mode === "create"
            ? uiText.createUser
            : user
              ? userDisplayNameLabel(user.display_name)
              : ""}
        </strong>
        {mode === "edit" && <span>{user?.email}</span>}
      </div>
      <div className="form-grid">
        <label>
          {uiText.userEmail}
          <input
            type="email"
            value={values.email}
            onChange={(event) => updateValues({ email: event.currentTarget.value })}
          />
        </label>
        <label>
          {uiText.userDisplayName}
          <input
            value={values.displayName}
            onChange={(event) => updateValues({ displayName: event.currentTarget.value })}
          />
        </label>
        <label>
          {mode === "create" ? uiText.userPassword : uiText.newPassword}
          <input
            type="password"
            value={values.password}
            placeholder={mode === "edit" ? "Оставьте пустым, чтобы не менять пароль" : undefined}
            onChange={(event) => updateValues({ password: event.currentTarget.value })}
          />
        </label>
        <label>
          {uiText.userStatus}
          <select
            value={values.status}
            onChange={(event) => updateValues({ status: event.currentTarget.value })}
          >
            <option value="active">{lifecycleStatusLabel("active")}</option>
            <option value="disabled">{lifecycleStatusLabel("disabled")}</option>
          </select>
        </label>
      </div>
      {canConfigureAccess ? (
        <div className="user-access-profile-controls">
          <label>
            Роль пользователя
            <select
              value={values.roleCode}
              onChange={(event) => {
                const roleCode = event.currentTarget.value as BusinessRoleCode;
                updateValues({
                  roleCode,
                  organizationIds:
                    roleCode === "subordinate_organization_administrator"
                      ? values.organizationIds
                      : [],
                });
              }}
            >
              {businessRoleOptions.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </label>
          {shouldChooseScope && (
            <fieldset className="organization-root-selector">
              <legend>Организации в зоне управления</legend>
              <p>Выбранная организация включает все дочерние организации.</p>
              <OrganizationRootSelector
                nodes={organizationTree}
                selectedIds={values.organizationIds}
                onChange={(organizationIds) => updateValues({ organizationIds })}
              />
            </fieldset>
          )}
          {canToggleAccessDelegation && (
            <label className="checkbox-control">
              <input
                type="checkbox"
                checked={values.canManageAccess}
                onChange={(event) => updateValues({ canManageAccess: event.currentTarget.checked })}
              />
              Разрешить назначение прав доступа
            </label>
          )}
        </div>
      ) : (
        <p className="user-profile-readonly-access">
          {businessRoleLabel(values.roleCode)} ·{" "}
          {organizationScopeSummary(
            { role_code: values.roleCode, organization_ids: values.organizationIds },
            organizationTree,
          )}
        </p>
      )}
      <div className="row-actions">
        <button type="submit" className="primary-button" disabled={isPending}>
          {uiText.save}
        </button>
        <button type="button" className="ghost-button" onClick={onCancel} disabled={isPending}>
          {uiText.cancel}
        </button>
        {onArchive && (
          <button type="button" className="danger-button" onClick={onArchive} disabled={isPending}>
            {uiText.archiveUser}
          </button>
        )}
      </div>
    </form>
  );
}

function OrganizationRootSelector({
  nodes,
  selectedIds,
  onChange,
  depth = 0,
}: {
  nodes: OrganizationTreeNodeRead[];
  selectedIds: string[];
  onChange: (organizationIds: string[]) => void;
  depth?: number;
}) {
  return (
    <div className="organization-root-options">
      {nodes.map((node) => {
        const checked = selectedIds.includes(node.id);
        return (
          <div
            key={node.id}
            className="organization-root-option"
            style={{ paddingInlineStart: depth * 16 }}
          >
            <label>
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) =>
                  onChange(
                    event.currentTarget.checked
                      ? [...selectedIds, node.id]
                      : selectedIds.filter((organizationId) => organizationId !== node.id),
                  )
                }
              />
              {node.name}
            </label>
            {node.children.length > 0 && (
              <OrganizationRootSelector
                nodes={node.children}
                selectedIds={selectedIds}
                onChange={onChange}
                depth={depth + 1}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

const businessRoleOptions: { label: string; value: BusinessRoleCode }[] = [
  { value: "administrator", label: "Администратор" },
  { value: "organization_administrator", label: "Администратор организации" },
  {
    value: "subordinate_organization_administrator",
    label: "Администратор подведомственной организации",
  },
];

function businessRoleLabel(roleCode: BusinessRoleCode) {
  return businessRoleOptions.find((role) => role.value === roleCode)?.label ?? uiText.role;
}

function organizationScopeSummary(
  profile: Pick<UserRead, "role_code" | "organization_ids">,
  organizationTree: OrganizationTreeNodeRead[],
) {
  if (profile.role_code !== "subordinate_organization_administrator") {
    return "Все организации";
  }
  const names = organizationNamesById(organizationTree);
  const selectedNames = profile.organization_ids.map((organizationId) => names.get(organizationId));
  return selectedNames.filter((name): name is string => Boolean(name)).join(", ") || "Не назначено";
}

function organizationNamesById(nodes: OrganizationTreeNodeRead[]) {
  const names = new Map<string, string>();
  function visit(items: OrganizationTreeNodeRead[]) {
    items.forEach((node) => {
      names.set(node.id, node.name);
      visit(node.children);
    });
  }
  visit(nodes);
  return names;
}

async function invalidateUserData(queryClient: QueryClient, token: string) {
  await queryClient.invalidateQueries({ queryKey: ["users", token] });
  await queryClient.invalidateQueries({ queryKey: ["audit-events", token] });
}
