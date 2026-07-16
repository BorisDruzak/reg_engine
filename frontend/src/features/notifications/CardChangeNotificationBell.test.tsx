import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { CardChangeNotificationBell } from "./CardChangeNotificationBell";

const token = "notification-reader-token";
const notificationId = "00000000-0000-4000-8000-000000000001";
const cardId = "00000000-0000-4000-8000-000000000002";

let inbox: { unread_count: number; items: NotificationItem[] };
let failInbox = false;
let readRequestCompleted = false;
let fetchCalls: { method: string; path: string }[];

type NotificationItem = {
  id: string;
  card_id: string;
  card_display_name: string;
  actor_display_name: string;
  changes: { label: string; before: unknown; after: unknown; description: string | null }[];
  read_at: string | null;
  created_at: string;
};

beforeEach(() => {
  inbox = {
    unread_count: 1,
    items: [
      {
        id: notificationId,
        card_id: cardId,
        card_display_name: "Карточка сотрудника",
        actor_display_name: "Иван Петров",
        changes: [
          { label: "Должность", before: "Специалист", after: "Руководитель", description: null },
          {
            label: "Служебные данные",
            before: { secret: "value" },
            after: null,
            description: null,
          },
        ],
        read_at: null,
        created_at: "2026-07-16T09:00:00Z",
      },
      {
        id: "00000000-0000-4000-8000-000000000003",
        card_id: "00000000-0000-4000-8000-000000000004",
        card_display_name: "Архивная карточка",
        actor_display_name: "Мария Сидорова",
        changes: [{ label: "Статус", before: "Черновик", after: "Архив", description: null }],
        read_at: "2026-07-16T09:02:00Z",
        created_at: "2026-07-16T09:01:00Z",
      },
    ],
  };
  failInbox = false;
  readRequestCompleted = false;
  fetchCalls = [];
  vi.stubGlobal("fetch", vi.fn(handleFetch));
});

afterEach(() => {
  focusManager.setEventListener((onFocus) => {
    const listener = () => onFocus();
    window.addEventListener("visibilitychange", listener, false);
    return () => window.removeEventListener("visibilitychange", listener);
  });
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("CardChangeNotificationBell", () => {
  test("shows unread notification changes and marks all items read", async () => {
    const user = userEvent.setup();
    renderBell();

    const bell = await screen.findByRole("button", { name: "Уведомления: 1 непрочитанное" });
    await user.click(bell);

    expect(screen.getByRole("dialog", { name: "Уведомления" })).toBeVisible();
    expect(screen.getByText("Карточка сотрудника")).toBeVisible();
    expect(screen.getByText("Иван Петров")).toBeVisible();
    expect(screen.getByText("Должность")).toBeVisible();
    expect(screen.getByText("Было: Специалист")).toBeVisible();
    expect(screen.getByText("Стало: Руководитель")).toBeVisible();
    expect(screen.getByText("Было: Недоступно")).toBeVisible();
    expect(screen.queryByText('{"secret":"value"}')).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Отметить все прочитанными" }));

    await waitFor(() =>
      expect(fetchCalls).toContainEqual({
        method: "POST",
        path: "/api/v1/card-change-notifications/read-all",
      }),
    );
  });

  test("marks an item read before opening its card", async () => {
    const user = userEvent.setup();
    const onOpenCard = vi.fn(() => expect(readRequestCompleted).toBe(true));
    renderBell(onOpenCard);

    await user.click(await screen.findByRole("button", { name: "Уведомления: 1 непрочитанное" }));
    await user.click(screen.getByRole("button", { name: /Карточка сотрудника/ }));

    await waitFor(() => expect(onOpenCard).toHaveBeenCalledWith(cardId));
  });

  test("shows an empty inbox without changing the top bar control", async () => {
    const user = userEvent.setup();
    inbox = { unread_count: 0, items: [] };
    renderBell();

    await user.click(await screen.findByRole("button", { name: "Уведомления: новых нет" }));
    expect(screen.getByText("Новых уведомлений нет")).toBeVisible();
  });

  test("shows a safely mapped error when the inbox is inaccessible", async () => {
    const user = userEvent.setup();
    failInbox = true;
    renderBell();
    await user.click(await screen.findByRole("button", { name: "Уведомления: новых нет" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Запрос не выполнен");
  });

  test("polls quietly after ten seconds without taking focus or refetching when the window regains focus", async () => {
    vi.useFakeTimers();
    listenForWindowFocusEvents();
    const { queryClient } = renderBellWithFocusedInput();
    const input = screen.getByRole("textbox", { name: "Проверяемое поле" });
    input.focus();

    await vi.advanceTimersByTimeAsync(0);
    expect(notificationInboxRequestCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(notificationInboxRequestCount()).toBe(2);
    expect(document.activeElement).toBe(input);

    queryClient
      .getQueryCache()
      .find({ queryKey: ["card-change-notifications", token] })
      ?.invalidate();
    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(0);

    expect(notificationInboxRequestCount()).toBe(2);
  });
});

function renderBell(onOpenCard = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <CardChangeNotificationBell token={token} onOpenCard={onOpenCard} />
      </QueryClientProvider>,
    ),
  };
}

function renderBellWithFocusedInput() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <label>
          Проверяемое поле
          <input type="text" />
        </label>
        <CardChangeNotificationBell token={token} onOpenCard={vi.fn()} />
      </QueryClientProvider>,
    ),
  };
}

function listenForWindowFocusEvents() {
  focusManager.setEventListener((onFocus) => {
    const listener = () => onFocus();
    window.addEventListener("focus", listener, false);
    return () => window.removeEventListener("focus", listener);
  });
}

function notificationInboxRequestCount() {
  return fetchCalls.filter(
    ({ method, path }) => method === "GET" && path === "/api/v1/card-change-notifications?limit=20",
  ).length;
}

async function handleFetch(input: RequestInfo | URL, init?: RequestInit) {
  const path = String(input);
  const method = init?.method ?? "GET";
  fetchCalls.push({ method, path });

  if (path === "/api/v1/card-change-notifications?limit=20" && method === "GET") {
    if (failInbox) {
      return jsonResponse({ detail: "internal details" }, 500);
    }
    return jsonResponse(inbox);
  }
  if (path === `/api/v1/card-change-notifications/${notificationId}/read` && method === "POST") {
    readRequestCompleted = true;
    return jsonResponse({ ...inbox.items[0], read_at: "2026-07-16T09:05:00Z" });
  }
  if (path === "/api/v1/card-change-notifications/read-all" && method === "POST") {
    return jsonResponse({ marked_count: 1 });
  }
  throw new Error(`Unexpected request: ${method} ${path}`);
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
