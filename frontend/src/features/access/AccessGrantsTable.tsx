import { useMemo } from "react";

import type { AccessGrantRead, OrganizationRead, RoleRead, UserRead } from "@/api/types";
import { grantScopeLabel, roleDisplayNameLabel, uiText } from "@/app/uiText";
import { Panel } from "@/components/common/DataSurfaces";
import { shortId } from "@/components/common/dataUtils";

export function AccessGrantsTable({
  grants,
  users,
  roles,
  organizations,
}: {
  grants: AccessGrantRead[];
  users: UserRead[];
  roles: RoleRead[];
  organizations: OrganizationRead[];
}) {
  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const rolesById = useMemo(() => new Map(roles.map((role) => [role.id, role])), [roles]);
  const organizationsById = useMemo(
    () => new Map(organizations.map((organization) => [organization.id, organization])),
    [organizations],
  );

  return (
    <Panel title={uiText.accessGrants}>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{uiText.user}</th>
              <th>{uiText.role}</th>
              <th>{uiText.organization}</th>
              <th>{uiText.scope}</th>
            </tr>
          </thead>
          <tbody>
            {grants.map((grant) => (
              <tr key={grant.id}>
                <td>{usersById.get(grant.user_id)?.email ?? shortId(grant.user_id)}</td>
                <td>
                  {rolesById.has(grant.role_id)
                    ? roleDisplayNameLabel(
                        rolesById.get(grant.role_id)?.code ?? "",
                        rolesById.get(grant.role_id)?.name ?? "",
                      )
                    : shortId(grant.role_id)}
                </td>
                <td>
                  {grant.organization_id
                    ? (organizationsById.get(grant.organization_id)?.name ??
                      shortId(grant.organization_id))
                    : uiText.global}
                </td>
                <td>{grantScopeLabel(grant.include_descendants)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
