import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";

import type { AuditEventRead, CardSummaryRead, UserRead } from "@/api/types";

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

const users: UserRead[] = [
  {
    id: "user-1",
    email: "auditor@example.test",
    display_name: "Аудитор",
    status: "active",
    is_superuser: true,
    role_code: "administrator",
    organization_ids: [],
    can_manage_access: true,
    archived_at: null,
  },
];

afterEach(() => vi.unstubAllGlobals());

test("groups the default active history and applies card, actor, status, and reset filters", async () => {
  const user = userEvent.setup();
  const fetchMock = vi.fn(async () => Response.json({ items: [historyEvent] }));
  vi.stubGlobal("fetch", fetchMock);

  renderAuditPanel();

  expect(screen.getByRole("tab", { name: "История карточек" })).toHaveAttribute("aria-selected", "true");
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("scope=card_history&card_status=active&limit=50"),
      expect.anything(),
    );
  });
  expect(await screen.findByRole("button", { name: "Открыть историю карточки: Карточка для аудита" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Открыть историю карточки: Карточка для аудита" }));
  expect(screen.getByLabelText("Карточка")).toHaveValue(card.id);
  expect(screen.getByText(/Группа должностей/)).toBeVisible();
  expect(screen.getByText("Предыдущая группа")).toBeVisible();
  expect(screen.getByText("Новая группа")).toBeVisible();
  expect(screen.queryByText("11111111-1111-4111-8111-111111111111")).not.toBeInTheDocument();
  expect(screen.queryByText("22222222-2222-4222-8222-222222222222")).not.toBeInTheDocument();

  await user.selectOptions(screen.getByLabelText("Изменение выполнил"), "user-1");
  await waitFor(() => {
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining("actor_user_id=user-1"),
      expect.anything(),
    );
  });
  await user.selectOptions(screen.getByLabelText("Статус карточки"), "archived");
  await waitFor(() => {
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining("card_status=archived"),
      expect.anything(),
    );
  });
  await user.click(screen.getByRole("button", { name: "Сбросить фильтры" }));
  expect(screen.getByLabelText("Статус карточки")).toHaveValue("active");
  expect(screen.getByLabelText("Карточка")).toHaveValue("");
  expect(screen.getByLabelText("Изменение выполнил")).toHaveValue("");
});

test("renders create and archive as standalone history events without a fabricated value diff", async () => {
  const createEvent: AuditEventRead = {
    ...historyEvent,
    id: "audit-card-create-1",
    action: "create",
    object_type: "card",
    history_display: "standalone",
    history_description: "Карточка создана",
    old_data_json: null,
    new_data_json: null,
  };
  const archiveEvent: AuditEventRead = {
    ...createEvent,
    id: "audit-card-archive-1",
    action: "archive",
    history_description: "Карточка архивирована",
  };
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ items: [createEvent, archiveEvent] })));

  renderAuditPanel();

  expect(await screen.findByText("Карточка создана")).toBeVisible();
  expect(screen.getByText("Карточка архивирована")).toBeVisible();
  expect(screen.queryByText("Нет значения → Изменено")).not.toBeInTheDocument();
});

function renderAuditPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuditPanel auditEvents={[technicalEvent]} cards={[card]} token="test-token" users={users} />
    </QueryClientProvider>,
  );
}
