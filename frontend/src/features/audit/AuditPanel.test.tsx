import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";

import type { AuditEventRead, CardSummaryRead } from "@/api/types";

import { AuditPanel } from "./AuditPanel";

const card: CardSummaryRead = {
  id: "card-1",
  registry_id: "registry-1",
  card_template_id: "template-1",
  card_template_name: "Основная карточка",
  organization_id: "organization-1",
  org_unit_id: null,
  display_name: "Карточка для аудита",
  lifecycle_status: "active",
  public_view_enabled: false,
  public_edit_enabled: true,
  list_fields: [],
};

const technicalEvent: AuditEventRead = {
  id: "audit-technical-1",
  actor_type: "user",
  actor_user_id: "user-1",
  actor_public_link_id: null,
  action: "create",
  object_type: "user",
  object_id: "user-1",
  source: "api",
  ip_address: null,
  user_agent: null,
  request_id: "request-1",
  created_at: "2026-07-16T10:00:00Z",
};

const historyEvent: AuditEventRead = {
  id: "audit-card-1",
  actor_type: "public_link",
  actor_user_id: null,
  actor_public_link_id: "public-link-1",
  attributed_user_id: "user-creator-1",
  actor_display_name: "Публичная ссылка",
  attributed_user_display_name: "Системный администратор",
  card_id: card.id,
  action: "update",
  object_type: "field_value",
  object_id: "field-value-1",
  old_data_json: { field: { code: "title", label: "Наименование" }, value: "Было" },
  new_data_json: { field: { code: "title", label: "Наименование" }, value: "Стало" },
  source: "public_link",
  ip_address: null,
  user_agent: null,
  request_id: "request-2",
  created_at: "2026-07-16T11:00:00Z",
};

afterEach(() => vi.unstubAllGlobals());

test("shows technical and card-history tabs, then loads a selected card's safe diff", async () => {
  const user = userEvent.setup();
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    if (
      String(input).endsWith(
        "/api/v1/audit-events?scope=card_history&card_id=card-1&limit=50",
      )
    ) {
      return Response.json({ items: [historyEvent] });
    }
    return Response.json({ detail: "Not Found" }, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);

  renderAuditPanel();

  expect(screen.getByRole("tab", { name: "Технический аудит" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(screen.getByRole("tab", { name: "История карточек" })).toHaveAttribute(
    "aria-selected",
    "false",
  );
  expect(screen.getByText("Создание")).toBeVisible();

  await user.click(screen.getByRole("tab", { name: "История карточек" }));
  await user.selectOptions(screen.getByLabelText("Карточка"), card.id);

  expect(await screen.findByText(/Системный администратор/)).toBeVisible();
  expect(screen.getAllByText("Публичная ссылка")).toHaveLength(2);
  await user.click(screen.getByRole("button", { name: "Было" }));
  expect(screen.getByText(/Наименование/)).toBeVisible();
  expect(screen.getByText(/"value": "Было"/)).toBeVisible();
  expect(screen.queryByText(/"value": "Стало"/)).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Стало" }));
  expect(screen.getByText(/"value": "Стало"/)).toBeVisible();
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/audit-events?scope=card_history&card_id=card-1&limit=50"),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer test-token" }) }),
    );
  });
});

function renderAuditPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuditPanel auditEvents={[technicalEvent]} cards={[card]} token="test-token" />
    </QueryClientProvider>,
  );
}
