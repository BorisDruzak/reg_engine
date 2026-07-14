import { useEffect, useMemo, useState } from "react";

import type { CardBlockCompletionState } from "./cardCompletion";

export type CardBlockNavigationItem = {
  anchorId: string;
  label: string;
  state: CardBlockCompletionState | "neutral";
  filledCount: number;
  totalCount: number;
  requiredMissingCount: number;
};

type CardBlockNavigatorProps = {
  items: readonly CardBlockNavigationItem[];
};

function itemStatus(item: CardBlockNavigationItem) {
  if (item.state === "neutral") return "дополнительный раздел";
  if (item.state === "attention") {
    return `нужно заполнить ${item.requiredMissingCount} из ${item.totalCount}`;
  }
  if (item.state === "complete") {
    return `заполнено ${item.filledCount} из ${item.totalCount}`;
  }
  return item.totalCount === 0 ? "нет полей" : "не заполнено";
}

function statusTitle(item: CardBlockNavigationItem) {
  if (item.state === "neutral") return "Раздел карточки";
  if (item.state === "attention") return "Нужно заполнить";
  if (item.state === "complete") return "Заполнено";
  return item.totalCount === 0 ? "Нет полей" : "Не заполнено";
}

function statusCount(item: CardBlockNavigationItem) {
  if (item.state === "neutral") return null;
  if (item.state === "attention") return `${item.requiredMissingCount} из ${item.totalCount}`;
  if (item.state === "complete") return `${item.filledCount} из ${item.totalCount}`;
  return item.totalCount > 0 ? `0 из ${item.totalCount}` : null;
}

export function CardBlockNavigator({ items }: CardBlockNavigatorProps) {
  const itemIds = useMemo(() => items.map((item) => item.anchorId), [items]);
  const [currentAnchorId, setCurrentAnchorId] = useState<string | null>(itemIds[0] ?? null);
  const activeAnchorId =
    currentAnchorId && itemIds.includes(currentAnchorId) ? currentAnchorId : (itemIds[0] ?? null);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      return;
    }
    const entriesByAnchorId = new Map<string, IntersectionObserverEntry>();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.target.id) {
            entriesByAnchorId.set(entry.target.id, entry);
          }
        });
        const readingLine = window.innerHeight * 0.15;
        const currentEntry = [...entriesByAnchorId.values()]
          .filter((entry) => entry.isIntersecting && itemIds.includes(entry.target.id))
          .sort(
            (left, right) =>
              Math.abs(left.boundingClientRect.top - readingLine) -
              Math.abs(right.boundingClientRect.top - readingLine),
          )[0];
        if (currentEntry?.target.id) {
          setCurrentAnchorId(currentEntry.target.id);
        }
      },
      { rootMargin: "-15% 0px -65%" },
    );
    const elements = itemIds
      .map((anchorId) => document.getElementById(anchorId))
      .filter((element): element is HTMLElement => Boolean(element));
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [itemIds]);

  if (items.length === 0) {
    return null;
  }

  return (
    <nav className="card-block-navigator" aria-label="Содержание карточки">
      <strong className="card-block-navigator-title">Блоки карточки</strong>
      <div className="card-block-navigator-list">
        {items.map((item) => (
          <button
            key={item.anchorId}
            type="button"
            className={`card-block-navigator-item is-${item.state}${activeAnchorId === item.anchorId ? " is-current" : ""}`}
            aria-current={activeAnchorId === item.anchorId ? "location" : undefined}
            aria-label={`${item.label}: ${itemStatus(item)}`}
            onClick={() => {
              setCurrentAnchorId(item.anchorId);
              document
                .getElementById(item.anchorId)
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
            <span>{item.label}</span>
            <small>
              <span>{statusTitle(item)}</span>
              {statusCount(item) ? ` ${statusCount(item)}` : null}
            </small>
          </button>
        ))}
      </div>
    </nav>
  );
}
