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
  card_display_name: card.display_name,
  card_lifecycle_status: card.lifecycle_status,
  action: "update",
  object_type: "field_value",
  object_id: "field-value-1",
  old_data_json: {
    field: { code: "position_group", label: "Группа должностей", type: "select" },
    value: "11111111-1111-4111-8111-111111111111",
    display_value: "Предыдущая группа",
  },
  new_data_json: {
    field: { code: "position_group", label: "Группа должностей", type: "select" },
    value: "22222222-2222-4222-8222-222222222222",
    display_value: "Новая группа",
  },
  source: "public_link",
  ip_address: null,
  user_agent: null,
  request_id: "request-2",
  created_at: "2026-07-16T11:00:00Z",
};

afterEach(() => vi.unstubAllGlobals());

test("shows a selected card's field change as values rather than JSON", async () => {
  const user = userEvent.setup();
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (
      url.endsWith(
        "/api/v1/audit-events?scope=card_history&card_status=active&limit=50&card_id=card-1",
      )
    ) {
      return Response.json({ items: [historyEvent] });
    }
    if (
      url.endsWith(
        "/api/v1/audit-events?scope=card_history&card_status=active&limit=50",
      )
    ) {
      return Response.json({ items: [] });
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
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("scope=card_history&card_status=active&limit=50"),
      expect.anything(),
    );
  });
  await user.selectOptions(screen.getByLabelText("Карточка"), card.id);

  expect(await screen.findByText(/Системный администратор/)).toBeVisible();
  expect(screen.getAllByText("Публичная ссылка")).toHaveLength(2);
  expect(screen.getByText(/Группа должностей/)).toBeVisible();
  expect(screen.getAllByText("Предыдущая группа")).toHaveLength(1);
  expect(screen.getAllByText("Новая группа")).toHaveLength(1);
  expect(screen.queryByText("11111111-1111-4111-8111-111111111111")).not.toBeInTheDocument();
  expect(screen.queryByText("22222222-2222-4222-8222-222222222222")).not.toBeInTheDocument();
  expect(screen.queryByText(/"value"/)).not.toBeInTheDocument();
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "/api/v1/audit-events?scope=card_history&card_status=active&limit=50&card_id=card-1",
      ),
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
      <AuditPanel auditEvents={[technicalEvent]} cards={[card]} token="test-token" users={[]} />
    </QueryClientProvider>,
  );
}
