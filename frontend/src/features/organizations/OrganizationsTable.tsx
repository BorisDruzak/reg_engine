import type { OrganizationRead } from "@/api/types";
import { activityLabel, organizationTypeLabel, uiText } from "@/app/uiText";
import { Panel } from "@/components/common/DataSurfaces";

export function OrganizationsTable({ organizations }: { organizations: OrganizationRead[] }) {
  return (
    <Panel title={uiText.organizations}>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{uiText.organizationName}</th>
              <th>{uiText.code}</th>
              <th>{uiText.type}</th>
              <th>{uiText.status}</th>
            </tr>
          </thead>
          <tbody>
            {organizations.map((organization) => (
              <tr key={organization.id}>
                <td>{organization.name}</td>
                <td>{organization.code}</td>
                <td>{organizationTypeLabel(organization.type)}</td>
                <td>{activityLabel(organization.is_active)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
