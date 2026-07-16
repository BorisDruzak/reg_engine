import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { listCardHistoryEvents } from "@/api/client";
import type { AuditEventRead, CardSummaryRead } from "@/api/types";
import { auditActionLabel, auditObjectTypeLabel, auditSourceLabel, uiText } from "@/app/uiText";
import { DataAlert, Panel, WorkspaceTabs } from "@/components/common/DataSurfaces";
import { formatDate } from "@/components/common/dataUtils";

import { AuditTable } from "./AuditTable";

type AuditTab = "technical" | "card_history";
type DiffSide = "old" | "new";

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
  const [openDiff, setOpenDiff] = useState<{ eventId: string; side: DiffSide } | null>(null);
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
                onChange={(event) => {
                  setSelectedCardId(event.target.value);
                  setOpenDiff(null);
                }}
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
                    openDiff={openDiff}
                    onToggleDiff={(eventId, side) =>
                      setOpenDiff((current) =>
                        current?.eventId === eventId && current.side === side ? null : { eventId, side },
                      )
                    }
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
  openDiff,
  onToggleDiff,
}: {
  events: AuditEventRead[];
  openDiff: { eventId: string; side: DiffSide } | null;
  onToggleDiff: (eventId: string, side: DiffSide) => void;
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
              openDiff={openDiff}
              onToggleDiff={onToggleDiff}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HistoryEventRow({
  event,
  openDiff,
  onToggleDiff,
}: {
  event: AuditEventRead;
  openDiff: { eventId: string; side: DiffSide } | null;
  onToggleDiff: (eventId: string, side: DiffSide) => void;
}) {
  const openSide = openDiff?.eventId === event.id ? openDiff.side : null;
  const actor = event.actor_display_name || actorTypeLabel(event.actor_type);

  return (
    <>
      <tr>
        <td>{auditActionLabel(event.action)}</td>
        <td>{auditObjectTypeLabel(event.object_type)}</td>
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
        <td>
          <button
            type="button"
            className="ghost-button"
            aria-expanded={openSide === "old"}
            onClick={() => onToggleDiff(event.id, "old")}
          >
            {uiText.before}
          </button>
        </td>
        <td>
          <button
            type="button"
            className="ghost-button"
            aria-expanded={openSide === "new"}
            onClick={() => onToggleDiff(event.id, "new")}
          >
            {uiText.after}
          </button>
        </td>
      </tr>
      {openSide && (
        <tr>
          <td colSpan={7}>
            <pre className="audit-diff-json">
              {formatAuditDiff(openSide === "old" ? event.old_data_json : event.new_data_json)}
            </pre>
          </td>
        </tr>
      )}
    </>
  );
}

function actorTypeLabel(actorType: string) {
  return actorType === "public_link" ? uiText.publicLink : actorType;
}

function formatAuditDiff(value: unknown) {
  return value === null || value === undefined ? uiText.none : JSON.stringify(value, null, 2);
}
