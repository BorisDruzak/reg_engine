import type { AuditEventRead, OrganizationRead, UserRead } from "@/api/types";
import { uiText } from "@/app/uiText";
import { CompactList, Panel } from "@/components/common/DataSurfaces";
import { AuditTable } from "@/features/audit/AuditTable";

export function Overview({
  metrics,
  organizations,
  users,
  auditEvents,
}: {
  metrics: { label: string; value: number }[];
  organizations: OrganizationRead[];
  users: UserRead[];
  auditEvents: AuditEventRead[];
}) {
  return (
    <div className="stack">
      <section className="summary-grid" aria-label={uiText.summary}>
        {metrics.map((metric) => (
          <div className="metric-card" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </div>
        ))}
      </section>
      <div className="split-grid">
        <Panel title={uiText.organizations}>
          <CompactList
            items={organizations.slice(0, 5).map((item) => ({
              id: item.id,
              title: item.name,
              detail: item.code,
            }))}
          />
        </Panel>
        <Panel title={uiText.users}>
          <CompactList
            items={users.slice(0, 5).map((item) => ({
              id: item.id,
              title: item.display_name,
              detail: item.email,
            }))}
          />
        </Panel>
      </div>
      <AuditTable auditEvents={auditEvents.slice(0, 6)} />
    </div>
  );
}
