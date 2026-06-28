import type { PermissionRead, RoleRead, UserRead } from "@/api/types";
import {
  booleanLabel,
  lifecycleStatusLabel,
  permissionDescriptionLabel,
  roleDisplayNameLabel,
  uiText,
  userDisplayNameLabel,
} from "@/app/uiText";
import { CompactList, Panel } from "@/components/common/DataSurfaces";

export function UsersAndRoles({
  users,
  roles,
  permissions,
}: {
  users: UserRead[];
  roles: RoleRead[];
  permissions: PermissionRead[];
}) {
  return (
    <div className="stack">
      <Panel title={uiText.users}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{uiText.displayName}</th>
                <th>{uiText.email}</th>
                <th>{uiText.status}</th>
                <th>{uiText.superuser}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{userDisplayNameLabel(user.display_name)}</td>
                  <td>{user.email}</td>
                  <td>{lifecycleStatusLabel(user.status)}</td>
                  <td>{booleanLabel(user.is_superuser)}</td>
                </tr>
              ))}
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
