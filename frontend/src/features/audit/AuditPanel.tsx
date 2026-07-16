import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { listCardHistoryEvents } from "@/api/client";
import type { AuditEventRead, CardSummaryRead } from "@/api/types";
import { auditActionLabel, auditObjectTypeLabel, auditSourceLabel, uiText } from "@/app/uiText";
import { DataAlert, Panel, WorkspaceTabs } from "@/components/common/DataSurfaces";
import { formatDate } from "@/components/common/dataUtils";

import { AuditTable } from "./AuditTable";

type AuditTab = "technical" | "card_history";
export function AuditPanel({
  auditEvents,
  cards,
  token,
}: {
  auditEvents: AuditEventRead[];
  cards: CardSummaryRead[];
  token: string;
}) {
  const [activeTab, setActiveTab] = useState<AuditTab>("technical");
  const [selectedCardId, setSelectedCardId] = useState("");
  const historyQuery = useQuery({
    queryKey: ["card-history-events", token, selectedCardId],
    queryFn: () => listCardHistoryEvents(token, selectedCardId),
    enabled: Boolean(token && activeTab === "card_history" && selectedCardId),
  });

  return (
    <div className="stack">
      <WorkspaceTabs
        tabs={[
          { id: "technical", label: uiText.technicalAudit },
          { id: "card_history", label: uiText.cardChangeHistory },
        ]}
        activeTab={activeTab}
        ariaLabel={uiText.auditTabs}
        onChange={setActiveTab}
      />
      {activeTab === "technical" ? (
        <AuditTable auditEvents={auditEvents} />
      ) : (
        <Panel title={uiText.cardChangeHistory}>
          <div className="stack audit-history-panel">
            <label className="field-stack">
              <span>{uiText.selectCard}</span>
              <select
                aria-label={uiText.selectCard}
                value={selectedCardId}
                onChange={(event) => setSelectedCardId(event.target.value)}
              >
                <option value="">{uiText.selectCardForHistory}</option>
                {cards.map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.display_name}
                  </option>
                ))}
              </select>
            </label>
            {!selectedCardId ? (
              <p className="data-empty">{uiText.selectCardForHistory}</p>
            ) : (
              <>
                <DataAlert error={historyQuery.error} />
                {historyQuery.isLoading ? (
                  <p className="data-empty">{uiText.loading}</p>
                ) : (
                  <CardHistoryTable
                    events={historyQuery.data?.items ?? []}
                  />
                )}
              </>
            )}
          </div>
        </Panel>
      )}
    </div>
  );
}

function CardHistoryTable({
  events,
}: {
  events: AuditEventRead[];
}) {
  if (events.length === 0) {
    return <p className="data-empty">{uiText.noData}</p>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{uiText.action}</th>
            <th>{uiText.object}</th>
            <th>{uiText.auditActor}</th>
            <th>{uiText.source}</th>
            <th>{uiText.time}</th>
            <th>{uiText.before}</th>
            <th>{uiText.after}</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <HistoryEventRow
              event={event}
              key={event.id}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HistoryEventRow({
  event,
}: {
  event: AuditEventRead;
}) {
  const actor = event.actor_display_name || actorTypeLabel(event.actor_type);
  const field = fieldSnapshot(event.new_data_json) ?? fieldSnapshot(event.old_data_json);

  return (
    <tr>
      <td>{auditActionLabel(event.action)}</td>
      <td>
        {field ? (
          <>
            <div>{field.field.label || field.field.code}</div>
            <small>{auditObjectTypeLabel(event.object_type)}</small>
          </>
        ) : (
          auditObjectTypeLabel(event.object_type)
        )}
      </td>
      <td>
        <div>{actor}</div>
        {event.attributed_user_display_name && (
          <small>
            {uiText.publicLinkCreator}: {event.attributed_user_display_name}
          </small>
        )}
      </td>
      <td>{auditSourceLabel(event.source)}</td>
      <td>{formatDate(event.created_at)}</td>
      <td>{formatHistoryValue(event.old_data_json)}</td>
      <td>{formatHistoryValue(event.new_data_json)}</td>
    </tr>
  );
}

function actorTypeLabel(actorType: string) {
  return actorType === "public_link" ? uiText.publicLink : actorType;
}

type FieldSnapshot = {
  field: { code: string; label: string | null };
  value: unknown;
  display_value?: unknown;
};

function fieldSnapshot(value: unknown): FieldSnapshot | null {
  if (!value || typeof value !== "object" || !("field" in value) || !("value" in value)) {
    return null;
  }
  const field = value.field;
  if (!field || typeof field !== "object" || !("code" in field)) {
    return null;
  }
  return value as FieldSnapshot;
}

function formatHistoryValue(value: unknown): string {
  const snapshot = fieldSnapshot(value);
  const actualValue = snapshot?.display_value ?? snapshot?.value ?? value;
  if (actualValue === null || actualValue === undefined || actualValue === "") {
    return uiText.noValue;
  }
  if (
    typeof actualValue === "object" &&
    actualValue !== null &&
    "redacted" in actualValue &&
    actualValue.redacted === true
  ) {
    return uiText.redactedValue;
  }
  if (Array.isArray(actualValue)) {
    return actualValue.map(formatHistoryValue).join(", ");
  }
  if (typeof actualValue === "object") {
    return uiText.changed;
  }
  return String(actualValue);
}
