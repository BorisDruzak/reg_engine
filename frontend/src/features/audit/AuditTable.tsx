import type { AuditEventRead } from "@/api/types";
import { auditActionLabel, auditObjectTypeLabel, auditSourceLabel, uiText } from "@/app/uiText";
import { Panel } from "@/components/common/DataSurfaces";
import { formatDate } from "@/components/common/dataUtils";

export function AuditTable({ auditEvents }: { auditEvents: AuditEventRead[] }) {
  return (
    <Panel title={uiText.audit}>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{uiText.action}</th>
              <th>{uiText.object}</th>
              <th>{uiText.source}</th>
              <th>{uiText.time}</th>
            </tr>
          </thead>
          <tbody>
            {auditEvents.map((event) => (
              <tr key={event.id}>
                <td>{auditActionLabel(event.action)}</td>
                <td>{auditObjectTypeLabel(event.object_type)}</td>
                <td>{auditSourceLabel(event.source)}</td>
                <td>{formatDate(event.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
