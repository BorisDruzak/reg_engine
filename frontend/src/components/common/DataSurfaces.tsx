import type { ReactNode } from "react";

import { uiText } from "@/app/uiText";

import { errorText } from "./dataUtils";

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="data-panel">
      <header>
        <h3>{title}</h3>
      </header>
      {children}
    </section>
  );
}

export function SelectableList({
  items,
  selectedId,
  onSelect,
}: {
  items: { id: string; title: string; detail: string }[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  if (items.length === 0) {
    return <p className="data-empty">{uiText.noData}</p>;
  }

  return (
    <div className="selectable-list">
      {items.map((item) => (
        <button
          type="button"
          key={item.id}
          className={item.id === selectedId ? "selectable-row is-selected" : "selectable-row"}
          onClick={() => onSelect(item.id)}
        >
          <strong>{item.title}</strong>
          <span>{item.detail}</span>
        </button>
      ))}
    </div>
  );
}

export function WorkspaceTabs<T extends string>({
  tabs,
  activeTab,
  ariaLabel,
  onChange,
}: {
  tabs: { id: T; label: string }[];
  activeTab: T;
  ariaLabel: string;
  onChange: (tabId: T) => void;
}) {
  return (
    <div className="workspace-tabs" role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          className={activeTab === tab.id ? "workspace-tab is-active" : "workspace-tab"}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function CompactList({ items }: { items: { id: string; title: string; detail: string }[] }) {
  if (items.length === 0) {
    return <p className="data-empty">{uiText.noData}</p>;
  }

  return (
    <ul className="compact-list">
      {items.map((item) => (
        <li key={item.id}>
          <strong>{item.title}</strong>
          <span>{item.detail}</span>
        </li>
      ))}
    </ul>
  );
}

export function DataAlert({ error }: { error: Error | null | undefined }) {
  if (!error) {
    return null;
  }

  return <p className="data-alert">{errorText(error)}</p>;
}
