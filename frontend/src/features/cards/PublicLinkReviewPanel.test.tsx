import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type {
  CardTemplateLayoutRead,
  FormBlockRead,
  FormFieldRead,
  PublicLinkRead,
  PublicLinkReviewRead,
} from "@/api/types";

import { PublicLinkReviewPanel } from "./PublicLinkReviewPanel";

const token = "admin-token";
const cardId = "card-1";
const block: FormBlockRead = {
  id: "block-main",
  registry_id: "registry-1",
  code: "main",
  title: "Основные сведения",
  description: null,
  position: 0,
  is_repeatable: false,
  is_active: true,
  public_visible: true,
  public_editable: true,
  layout_columns: 12,
};
const fields: FormFieldRead[] = [
  field("field-name", "name", "Имя"),
  field("field-surname", "surname", "Фамилия"),
  field("field-private", "private", "Служебное поле", { public_editable: false }),
  field("field-file", "file", "Файл", { field_type: "file_ref" }),
];
const layout: CardTemplateLayoutRead = {
  version: "card_template_layout_v1",
  revision: "review-layout-revision",
  card_template_id: "template-1",
  registry_id: "registry-1",
  structure: { blocks: [block], fields },
  form_layout: {
    columns: 12,
    sections: [
      {
        id: "section-main",
        block_id: block.id,
        row: 2,
        column: 4,
        row_span: 2,
        column_span: 6,
        items: [
          {
            id: "item-name",
            kind: "field",
            field_id: "field-name",
            row: 3,
            column: 7,
            row_span: 2,
            column_span: 5,
          },
          {
            id: "item-surname",
            kind: "field",
            field_id: "field-surname",
            row: 1,
            column: 1,
            row_span: 1,
            column_span: 6,
          },
        ],
      },
    ],
  },
  print_views: [],
  export_settings: { output_filename_template: "card", formats: ["pdf"] },
  sync_status: { has_errors: false, errors: [], warnings: [], mapping: {} },
};

let links: PublicLinkRead[];
let fetchCalls: { method: string; path: string; body: unknown }[];
let reviewRequestCount: number;
let reviewResponseMode: "success" | "slow" | "error";
let resolveReviewResponse: ((response: Response) => void) | null;
let clipboardWrite: ReturnType<typeof vi.fn>;

beforeEach(() => {
  links = [];
  fetchCalls = [];
  reviewRequestCount = 0;
  reviewResponseMode = "success";
  resolveReviewResponse = null;
  clipboardWrite = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: clipboardWrite },
  });
  vi.stubGlobal("fetch", vi.fn(handleFetch));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PublicLinkReviewPanel", () => {
  test("shows a notification switch only for a public-link creator and refreshes the link list", async () => {
    const user = userEvent.setup();
    links = [
      publicLink("creator", {
        can_manage_change_notifications: true,
        change_notifications_enabled: false,
      }),
      publicLink("card-manager", {
        can_manage_change_notifications: false,
        change_notifications_enabled: false,
      }),
    ];
    renderPanel();

    const button = await screen.findByRole("button", { name: "Уведомлять об изменениях" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(screen.getAllByRole("button", { name: "Уведомлять об изменениях" })).toHaveLength(1);

    await user.click(button);

    await waitFor(() =>
      expect(fetchCalls).toContainEqual({
        method: "PUT",
        path: "/api/v1/public-links/creator/change-notification-subscription",
        body: { enabled: true },
      }),
    );
    expect(await screen.findByRole("button", { name: "Уведомления включены" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await waitFor(() =>
      expect(
        fetchCalls.filter(
          (item) => item.method === "GET" && item.path === `/api/v1/cards/${cardId}/public-links`,
        ),
      ).toHaveLength(2),
    );
  });

  test("creates a review link from public-editable schema and keeps raw URL ephemeral", async () => {
    const user = userEvent.setup();
    clipboardWrite = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    const queryClient = renderPanel({ openCreateRequest: 1 });

    expect(
      await screen.findByRole("form", { name: "Отправить на заполнение" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/сохранённые.*значения сразу изменяют карточку/i)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Блок Основные сведения" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Поле Имя" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Поле Фамилия" })).toBeChecked();
    expect(screen.queryByRole("checkbox", { name: "Поле Служебное поле" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Поле Файл" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Поле Фамилия" }));
    await user.clear(screen.getByLabelText("Срок действия ссылки, дней"));
    await user.type(screen.getByLabelText("Срок действия ссылки, дней"), "5");
    await user.type(screen.getByLabelText("Лимит загрузок вложений"), "2");
    await user.click(screen.getByRole("button", { name: "Создать ссылку" }));

    const createCall = await waitFor(() => {
      const call = fetchCalls.find(
        (item) => item.method === "POST" && item.path === `/api/v1/cards/${cardId}/public-links`,
      );
      expect(call).toBeTruthy();
      return call!;
    });
    expect(createCall.body).toEqual({
      expires_in_days: 5,
      max_attachment_uploads: 2,
      review_enabled: true,
      allowed_block_ids: [block.id],
      allowed_field_ids: ["field-name"],
    });

    const urlInput = await screen.findByLabelText("Адрес публичной ссылки");
    expect((urlInput as HTMLInputElement).value).toMatch(/\/public\/edit\/raw-created-token$/);
    await user.click(screen.getByRole("button", { name: "Копировать ссылку" }));
    expect(clipboardWrite).toHaveBeenCalledWith(expect.stringContaining("raw-created-token"));
    expect(
      JSON.stringify(
        queryClient
          .getQueryCache()
          .getAll()
          .map((query) => query.state.data),
      ),
    ).not.toContain("raw-created-token");

    await user.click(screen.getByRole("button", { name: "Скрыть созданную ссылку" }));
    expect(screen.queryByLabelText("Адрес публичной ссылки")).not.toBeInTheDocument();
  });

  test("loads submitted review lazily and requires a correction comment", async () => {
    const user = userEvent.setup();
    links = [
      publicLink("submitted", { status: "submitted", submitted_at: "2026-07-10T10:00:00Z" }),
    ];
    renderPanel();

    expect(await screen.findByText("На проверке")).toBeInTheDocument();
    expect(reviewRequestCount).toBe(0);
    await user.click(screen.getByRole("button", { name: "Открыть проверку" }));

    expect(await screen.findByText("Основные сведения")).toBeInTheDocument();
    expect(screen.getByText("Имя")).toBeInTheDocument();
    expect(screen.getByText("Было: Пусто")).toBeInTheDocument();
    expect(screen.getByText("Стало: Иван")).toBeInTheDocument();
    expect(screen.getByText(/изменения уже применены к карточке/i)).toBeInTheDocument();
    expect(reviewRequestCount).toBe(1);

    await user.click(screen.getByRole("button", { name: "Вернуть на доработку" }));
    await user.click(screen.getByRole("button", { name: "Отправить замечание" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Введите комментарий для пользователя.");
    expect(fetchCalls.some((item) => item.path.endsWith("/request-changes"))).toBe(false);

    await user.type(screen.getByLabelText("Комментарий для пользователя"), "Уточните имя");
    await user.click(screen.getByRole("button", { name: "Отправить замечание" }));
    await waitFor(() =>
      expect(fetchCalls.find((item) => item.path.endsWith("/request-changes"))?.body).toEqual({
        comment: "Уточните имя",
      }),
    );
  });

  test("keeps review lifecycle actions unavailable until a slow review request succeeds", async () => {
    const user = userEvent.setup();
    reviewResponseMode = "slow";
    links = [
      publicLink("submitted", { status: "submitted", submitted_at: "2026-07-10T10:00:00Z" }),
    ];
    renderPanel();

    await user.click(await screen.findByRole("button", { name: "Открыть проверку" }));
    await waitFor(() => expect(reviewRequestCount).toBe(1));
    expect(screen.queryByRole("button", { name: "Вернуть на доработку" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Подтвердить и закрыть доступ" }),
    ).not.toBeInTheDocument();

    resolveReviewResponse?.(jsonResponse(review("submitted")));
    expect(
      await screen.findByRole("button", { name: "Подтвердить и закрыть доступ" }),
    ).toBeInTheDocument();
  });

  test("keeps review lifecycle actions unavailable when review loading fails", async () => {
    const user = userEvent.setup();
    reviewResponseMode = "error";
    links = [
      publicLink("submitted", { status: "submitted", submitted_at: "2026-07-10T10:00:00Z" }),
    ];
    renderPanel();

    await user.click(await screen.findByRole("button", { name: "Открыть проверку" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Вернуть на доработку" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Подтвердить и закрыть доступ" }),
    ).not.toBeInTheDocument();
  });

  test("keeps review lifecycle actions unavailable when review succeeds without a layout", async () => {
    const user = userEvent.setup();
    links = [
      publicLink("submitted", { status: "submitted", submitted_at: "2026-07-10T10:00:00Z" }),
    ];
    renderPanel({ panelLayout: null });

    await user.click(await screen.findByRole("button", { name: "Открыть проверку" }));
    expect(await screen.findByText("Макет карточки недоступен")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Вернуть на доработку" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Подтвердить и закрыть доступ" }),
    ).not.toBeInTheDocument();
  });

  test("renders review differences at configured form layout geometry", async () => {
    const user = userEvent.setup();
    links = [
      publicLink("submitted", { status: "submitted", submitted_at: "2026-07-10T10:00:00Z" }),
    ];
    renderPanel();

    await user.click(await screen.findByRole("button", { name: "Открыть проверку" }));
    await screen.findByText("Стало: Иван");

    expect(screen.getByTestId("review-block-section-main")).toHaveStyle({
      gridColumn: "4 / span 6",
      gridRow: "2 / span 2",
    });
    const nameField = screen.getByTestId("review-field-item-name");
    expect(nameField).toHaveStyle({
      gridColumn: "7 / span 5",
      gridRow: "3 / span 2",
    });
    expect(within(nameField).getByText("Было: Пусто")).toBeInTheDocument();
    expect(within(nameField).getByText("Стало: Иван")).toBeInTheDocument();
  });

  test("confirms approval, renders closed timeline, starts legacy review and preserves disable", async () => {
    const user = userEvent.setup();
    links = [
      publicLink("submitted", { status: "submitted", submitted_at: "2026-07-10T10:00:00Z" }),
      publicLink("legacy", { review_enabled: false }),
      publicLink("approved", {
        status: "approved",
        can_view: false,
        can_edit: false,
        reviewed_at: "2026-07-10T11:00:00Z",
        disabled_at: "2026-07-10T11:00:00Z",
      }),
    ];
    renderPanel();

    const approved = await screen.findByTestId("public-link-approved");
    expect(within(approved).getByText("Подтверждена")).toBeInTheDocument();
    expect(within(approved).getByText("Доступ закрыт")).toBeInTheDocument();

    const legacy = screen.getByTestId("public-link-legacy");
    await user.click(within(legacy).getByRole("button", { name: "Начать цикл проверки" }));
    await waitFor(() =>
      expect(fetchCalls.some((item) => item.path.endsWith("/start-review-cycle"))).toBe(true),
    );

    const submitted = screen.getByTestId("public-link-submitted");
    await user.click(within(submitted).getByRole("button", { name: "Открыть проверку" }));
    await screen.findByText("Стало: Иван");
    await user.click(screen.getByRole("button", { name: "Подтвердить и закрыть доступ" }));
    const approvalDialog = await screen.findByRole("dialog", { name: "Подтвердить карточку" });
    expect(within(approvalDialog).getByText(/публичный доступ будет закрыт/i)).toBeInTheDocument();
    await user.click(within(approvalDialog).getByRole("button", { name: "Подтвердить" }));
    await waitFor(() =>
      expect(fetchCalls.some((item) => item.path.endsWith("/approve"))).toBe(true),
    );

    const active = screen.getByTestId("public-link-legacy");
    await user.click(
      within(active).getByRole("button", { name: "Отключить публичную ссылку legacy" }),
    );
    const disableDialog = await screen.findByRole("dialog", { name: "Отключить публичную ссылку" });
    await user.click(within(disableDialog).getByRole("button", { name: "Отключить" }));
    await waitFor(() =>
      expect(
        fetchCalls.some(
          (item) => item.method === "DELETE" && item.path === "/api/v1/public-links/legacy",
        ),
      ).toBe(true),
    );
  });
});

function renderPanel({
  openCreateRequest = 0,
  panelLayout = layout,
}: {
  openCreateRequest?: number;
  panelLayout?: CardTemplateLayoutRead | null;
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <PublicLinkReviewPanelHarness
        initiallyOpen={openCreateRequest > 0}
        panelLayout={panelLayout}
      />
    </QueryClientProvider>,
  );
  return queryClient;
}

function PublicLinkReviewPanelHarness({
  initiallyOpen,
  panelLayout,
}: {
  initiallyOpen: boolean;
  panelLayout: CardTemplateLayoutRead | null;
}) {
  const [createFormOpen, setCreateFormOpen] = useState(initiallyOpen);
  return (
    <PublicLinkReviewPanel
      blocks={[block]}
      cardId={cardId}
      createFormOpen={createFormOpen}
      fields={fields}
      layout={panelLayout}
      onCreateFormOpenChange={setCreateFormOpen}
      token={token}
    />
  );
}

async function handleFetch(input: RequestInfo | URL, init?: RequestInit) {
  const path = String(input);
  const method = init?.method ?? "GET";
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  fetchCalls.push({ method, path, body });

  if (path === `/api/v1/cards/${cardId}/public-links` && method === "GET") {
    return jsonResponse({ items: links });
  }
  if (path === `/api/v1/cards/${cardId}/public-links` && method === "POST") {
    const created = publicLink("created");
    links = [created, ...links];
    return jsonResponse({
      id: created.id,
      card_id: cardId,
      raw_token: "raw-created-token",
      status: "active",
      can_edit: true,
      expires_at: created.expires_at,
      review_enabled: true,
    });
  }
  const subscriptionMatch = path.match(
    /^\/api\/v1\/public-links\/([^/]+)\/change-notification-subscription$/,
  );
  if (subscriptionMatch && method === "PUT") {
    const [, id] = subscriptionMatch;
    const change_notifications_enabled = Boolean((body as { enabled: boolean }).enabled);
    links = links.map((item) =>
      item.id === id ? { ...item, change_notifications_enabled } : item,
    );
    return jsonResponse({ enabled: change_notifications_enabled });
  }
  const reviewMatch = path.match(/^\/api\/v1\/public-links\/([^/]+)\/review$/);
  if (reviewMatch && method === "GET") {
    reviewRequestCount += 1;
    if (reviewResponseMode === "slow") {
      return new Promise<Response>((resolve) => {
        resolveReviewResponse = resolve;
      });
    }
    if (reviewResponseMode === "error") {
      return jsonResponse({ detail: "Проверка временно недоступна" }, 500);
    }
    return jsonResponse(review(reviewMatch[1]!));
  }
  const lifecycleMatch = path.match(
    /^\/api\/v1\/public-links\/([^/]+)\/(request-changes|approve|start-review-cycle)$/,
  );
  if (lifecycleMatch && method === "POST") {
    const [, id, action] = lifecycleMatch;
    links = links.map((item) => {
      if (item.id !== id) return item;
      if (action === "request-changes") {
        return {
          ...item,
          status: "changes_requested",
          can_edit: true,
          review_comment: "Уточните имя",
        };
      }
      if (action === "approve") {
        return {
          ...item,
          status: "approved",
          can_view: false,
          can_edit: false,
          reviewed_at: "2026-07-10T11:00:00Z",
          disabled_at: "2026-07-10T11:00:00Z",
        };
      }
      return { ...item, review_enabled: true };
    });
    return jsonResponse(links.find((item) => item.id === id));
  }
  const deleteMatch = path.match(/^\/api\/v1\/public-links\/([^/]+)$/);
  if (deleteMatch && method === "DELETE") {
    links = links.map((item) =>
      item.id === deleteMatch[1]
        ? {
            ...item,
            status: "disabled",
            can_view: false,
            can_edit: false,
            disabled_at: "2026-07-10T12:00:00Z",
          }
        : item,
    );
    return jsonResponse(links.find((item) => item.id === deleteMatch[1]));
  }
  throw new Error(`Unexpected request: ${method} ${path}`);
}

function publicLink(id: string, overrides: Partial<PublicLinkRead> = {}): PublicLinkRead {
  return {
    id,
    card_id: cardId,
    status: "active",
    can_view: true,
    can_edit: true,
    expires_at: "2099-07-17T10:00:00Z",
    max_uses: null,
    used_count: 0,
    max_attachment_uploads: null,
    attachment_upload_count: 0,
    disabled_at: null,
    submitted_at: null,
    reviewed_at: null,
    reviewed_by: null,
    review_comment: null,
    review_enabled: true,
    can_manage_change_notifications: false,
    change_notifications_enabled: false,
    completed_public_fields: null,
    total_public_fields: null,
    ...overrides,
  };
}

function review(id: string): PublicLinkReviewRead {
  return {
    public_link: links.find((item) => item.id === id) ?? publicLink(id, { status: "submitted" }),
    changed_field_count: 1,
    changed_attachment_count: 0,
    fields: [
      {
        block_id: block.id,
        field_id: "field-name",
        block_instance_id: null,
        label: "Имя",
        field_type: "text",
        before: null,
        after: "Иван",
        changed_at: "2026-07-10T10:00:00Z",
      },
    ],
    attachments: [],
  };
}

function field(
  id: string,
  code: string,
  label: string,
  overrides: Partial<FormFieldRead> = {},
): FormFieldRead {
  return {
    id,
    block_id: block.id,
    code,
    label,
    description: null,
    field_type: "text",
    position: 0,
    required_mode: "not_required",
    options_source_type: null,
    options_source_id: null,
    options_config_json: null,
    is_active: true,
    is_list_display: false,
    public_visible: true,
    public_editable: true,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
