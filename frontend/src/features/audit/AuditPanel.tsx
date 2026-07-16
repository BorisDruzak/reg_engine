import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { listCardHistoryEvents } from "@/api/client";
import type { AuditEventRead, CardHistoryFilters, CardSummaryRead, UserRead } from "@/api/types";
import {
  auditActionLabel,
  auditObjectTypeLabel,
  auditSourceLabel,
  lifecycleStatusLabel,
  uiText,
} from "@/app/uiText";
import { DataAlert, Panel, WorkspaceTabs } from "@/components/common/DataSurfaces";
import { formatDate } from "@/components/common/dataUtils";

import { AuditTable } from "./AuditTable";

type AuditTab = "technical" | "card_history";
export function AuditPanel({
  auditEvents,
  cards,
  token,
  users,
}: {
  auditEvents: AuditEventRead[];
  cards: CardSummaryRead[];
  token: string;
  users: UserRead[];
}) {
  const [activeTab, setActiveTab] = useState<AuditTab>("card_history");
  const [filters, setFilters] = useState<CardHistoryFilters>({ cardStatus: "active" });
  const historyQuery = useQuery({
    queryKey: ["card-history-events", token, filters],
    queryFn: () => listCardHistoryEvents(token, filters),
    enabled: Boolean(token && activeTab === "card_history"),
  });
  const groupedEvents = useMemo(
    () => groupHistoryEvents(historyQuery.data?.items ?? []),
    [historyQuery.data?.items],
  );
  const resetFilters = () => setFilters({ cardStatus: "active" });

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
            <div className="audit-history-filters">
              <label className="field-stack">
                <span>{uiText.cardHistoryStatus}</span>
                <select
                  aria-label={uiText.cardHistoryStatus}
                  value={filters.cardStatus}
                  onChange={(event) =>
                    setFilters((value) => ({
                      ...value,
                      cardStatus: event.target.value as CardHistoryFilters["cardStatus"],
                    }))
                  }
                >
                  <option value="active">{uiText.activeCards}</option>
                  <option value="archived">{uiText.archivedCards}</option>
                  <option value="all">{uiText.allCards}</option>
                </select>
              </label>
              <label className="field-stack">
                <span>{uiText.selectCard}</span>
                <select
                  aria-label={uiText.selectCard}
                  value={filters.cardId ?? ""}
                  onChange={(event) =>
                    setFilters((value) => ({ ...value, cardId: event.target.value || undefined }))
                  }
                >
                  <option value="">{uiText.selectCardForHistory}</option>
                  {cards.map((card) => (
                    <option key={card.id} value={card.id}>
                      {card.display_name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-stack">
                <span>{uiText.auditActor}</span>
                <select
                  aria-label={uiText.auditActor}
                  value={filters.actorUserId ?? ""}
                  onChange={(event) =>
                    setFilters((value) => ({ ...value, actorUserId: event.target.value || undefined }))
                  }
                >
                  <option value="">{uiText.allActors}</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.display_name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={resetFilters}>
                {uiText.resetHistoryFilters}
              </button>
            </div>
            <DataAlert error={historyQuery.error} />
            {historyQuery.isLoading ? (
              <p className="data-empty">{uiText.loading}</p>
            ) : (
              <CardHistoryGroups
                groups={groupedEvents}
                onSelectCard={(cardId) => setFilters((value) => ({ ...value, cardId }))}
              />
            )}
          </div>
        </Panel>
      )}
    </div>
  );
}

type CardHistoryGroup = {
  cardId: string | null;
  cardDisplayName: string;
  cardLifecycleStatus: string | null;
  events: AuditEventRead[];
};

function groupHistoryEvents(events: AuditEventRead[]): CardHistoryGroup[] {
  const groups = new Map<string, CardHistoryGroup>();
  for (const event of events) {
    const cardId = event.card_id ?? null;
    const key = cardId ?? event.id;
    const group = groups.get(key);
    if (group) {
      group.events.push(event);
      continue;
    }
    groups.set(key, {
      cardId,
      cardDisplayName: event.card_display_name || uiText.card,
      cardLifecycleStatus: event.card_lifecycle_status ?? null,
      events: [event],
    });
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      events: [...group.events].sort((left, right) => right.created_at.localeCompare(left.created_at)),
    }))
    .sort((left, right) => right.events[0].created_at.localeCompare(left.events[0].created_at));
}

function CardHistoryGroups({
  groups,
  onSelectCard,
}: {
  groups: CardHistoryGroup[];
  onSelectCard: (cardId: string) => void;
}) {
  if (groups.length === 0) {
    return <p className="data-empty">{uiText.noData}</p>;
  }

  return groups.map((group) => (
    <section key={group.cardId ?? group.events[0].id} className="audit-history-card-group">
      <div className="audit-history-card-heading">
        {group.cardId ? (
          <button type="button" onClick={() => onSelectCard(group.cardId!)}>
            {group.cardDisplayName}
          </button>
        ) : (
          <span>{group.cardDisplayName}</span>
        )}
        {group.cardLifecycleStatus && <small>{lifecycleStatusLabel(group.cardLifecycleStatus)}</small>}
      </div>
      <CardHistoryTable events={group.events} />
    </section>
  ));
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
      <td>{formatHistoryValue(event.old_data_json, "old")}</td>
      <td>{formatHistoryValue(event.new_data_json, "new")}</td>
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

type CompositeChange = { label: string; old: unknown; new: unknown };

function compositeChanges(value: unknown): CompositeChange[] | null {
  if (!value || typeof value !== "object" || !("changes" in value) || !Array.isArray(value.changes)) {
    return null;
  }
  return value.changes.filter(
    (change): change is CompositeChange =>
      Boolean(change) &&
      typeof change === "object" &&
      "label" in change &&
      typeof change.label === "string" &&
      "old" in change &&
      "new" in change,
  );
}

function formatHistoryValue(value: unknown, side: "old" | "new"): string {
  const changes = compositeChanges(value);
  if (changes) {
    return changes.length > 0
      ? changes.map((change) => `${change.label}: ${formatHistoryValue(change[side], side)}`).join("; ")
      : uiText.noValue;
  }
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
    return actualValue.map((item) => formatHistoryValue(item, side)).join(", ");
  }
  if (typeof actualValue === "object") {
    return uiText.noValue;
  }
  if (typeof actualValue === "string" && isUuid(actualValue)) {
    return uiText.noValue;
  }
  return String(actualValue);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
