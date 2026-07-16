import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { CardChangeNotificationToggle } from "./CardChangeNotificationToggle";

const token = "card-reader-token";
const cardId = "card-1";

let enabled = false;
let failUpdate = false;
let fetchCalls: { method: string; path: string; body: unknown }[];

beforeEach(() => {
  enabled = false;
  failUpdate = false;
  fetchCalls = [];
  vi.stubGlobal("fetch", vi.fn(handleFetch));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CardChangeNotificationToggle", () => {
  test("reads the confirmed subscription and updates it with the requested state", async () => {
    const user = userEvent.setup();
    const queryClient = renderToggle();

    const button = await screen.findByRole("button", { name: "Уведомлять об изменениях" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(fetchCalls).toContainEqual({
      method: "GET",
      path: `/api/v1/cards/${cardId}/change-notification-subscription`,
      body: undefined,
    });

    await user.click(button);

    await waitFor(() =>
      expect(fetchCalls).toContainEqual({
        method: "PUT",
        path: `/api/v1/cards/${cardId}/change-notification-subscription`,
        body: { enabled: true },
      }),
    );
    expect(await screen.findByRole("button", { name: "Уведомления включены" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await waitFor(() =>
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ["card-change-notification-subscription", token, cardId],
      }),
    );
  });

  test("keeps the confirmed state and shows a safe inline error when the update fails", async () => {
    const user = userEvent.setup();
    failUpdate = true;
    renderToggle();

    const button = await screen.findByRole("button", { name: "Уведомлять об изменениях" });
    await user.click(button);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Не удалось изменить настройки уведомлений.",
    );
    expect(screen.getByRole("button", { name: "Уведомлять об изменениях" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});

function renderToggle() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  vi.spyOn(queryClient, "invalidateQueries");
  render(
    <QueryClientProvider client={queryClient}>
      <CardChangeNotificationToggle cardId={cardId} token={token} />
    </QueryClientProvider>,
  );
  return queryClient;
}

async function handleFetch(input: RequestInfo | URL, init?: RequestInit) {
  const path = String(input);
  const method = init?.method ?? "GET";
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  fetchCalls.push({ method, path, body });

  if (path === `/api/v1/cards/${cardId}/change-notification-subscription` && method === "GET") {
    return jsonResponse({ enabled });
  }
  if (path === `/api/v1/cards/${cardId}/change-notification-subscription` && method === "PUT") {
    if (failUpdate) {
      return jsonResponse({ detail: "internal details" }, 500);
    }
    enabled = Boolean((body as { enabled: boolean }).enabled);
    return jsonResponse({ enabled });
  }
  throw new Error(`Unexpected request: ${method} ${path}`);
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
