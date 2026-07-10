import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type {
  PublicLinkAttachmentListRead,
  PublicLinkPreviewRead,
  PublicLinkSafeStatusRead,
} from "@/api/types";

import { PublicLinkEditPage } from "./PublicLinkEditPage";

const rawToken = "public-review-token";

let status: PublicLinkSafeStatusRead;
let preview: PublicLinkPreviewRead & { form_layout: PublicFormLayout };
let attachments: PublicLinkAttachmentListRead;
let fetchCalls: { method: string; path: string; body: unknown }[];
let editResponseMode: "success" | "deferred" | "error";
let deferredEditResponses: Array<(response: Response) => void>;

beforeEach(() => {
  status = safeStatus("active");
  preview = publicPreview();
  attachments = {
    items: [],
    max_attachment_uploads: 2,
    attachment_upload_count: 0,
    can_upload_attachments: true,
  };
  fetchCalls = [];
  editResponseMode = "success";
  deferredEditResponses = [];
  vi.stubGlobal("fetch", vi.fn(handleFetch));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PublicLinkEditPage", () => {
  test("renders active public fields and attachments at configured card geometry", async () => {
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Публичное заполнение карточки" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Публичное редактирование карточки" }),
    ).toBeInTheDocument();

    expect(screen.getByTestId("public-block-section-main")).toHaveStyle({
      gridColumn: "4 / span 6",
      gridRow: "2 / span 2",
    });
    expect(screen.getByTestId("public-field-item-status")).toHaveStyle({
      gridColumn: "1 / span 6",
      gridRow: "1 / span 1",
    });

    expect(screen.getByRole("textbox", { name: "Публичный статус" })).toHaveValue("drafted");
    expect(screen.getByRole("checkbox", { name: "Подтверждено" })).not.toBeChecked();
    expect(screen.getByRole("combobox", { name: "Категория" })).toHaveValue("option-active");
    expect(screen.queryByRole("textbox", { name: "Файл из карточки" })).not.toBeInTheDocument();

    const attachmentsPanel = screen.getByRole("heading", { name: "Вложения" }).closest("section");
    expect(attachmentsPanel).not.toBeNull();
    expect(within(attachmentsPanel!).getByText("Нет файлов")).toBeInTheDocument();
  });

  test("serializes field autosaves and confirms only the latest local value", async () => {
    editResponseMode = "deferred";
    renderPage();
    const statusInput = await screen.findByRole("textbox", { name: "Публичный статус" });

    fireEvent.change(statusInput, { target: { value: "first" } });
    expect(await screen.findByText("Сохранение…")).toBeInTheDocument();
    await waitFor(() => expect(editCalls()).toHaveLength(1));

    fireEvent.change(statusInput, { target: { value: "latest" } });
    expect(statusInput).toHaveValue("latest");
    expect(editCalls()).toHaveLength(1);

    resolveNextEdit("first");
    await waitFor(() => expect(editCalls()).toHaveLength(2));
    expect(screen.getByText("Сохранение…")).toBeInTheDocument();
    expect(screen.queryByText("Все изменения сохранены")).not.toBeInTheDocument();

    resolveNextEdit("latest");
    expect(await screen.findByText("Все изменения сохранены")).toBeInTheDocument();
    expect(editCalls().map((call) => (call.body as { value: unknown }).value)).toEqual([
      "first",
      "latest",
    ]);
  });

  test("keeps a rejected local value visible and shows the server error", async () => {
    editResponseMode = "error";
    renderPage();
    const statusInput = await screen.findByRole("textbox", { name: "Публичный статус" });

    fireEvent.change(statusInput, { target: { value: "rejected locally" } });

    expect(await screen.findByText("Запрос не выполнен")).toBeInTheDocument();
    expect(statusInput).toHaveValue("rejected locally");
    expect(screen.queryByText("Все изменения сохранены")).not.toBeInTheDocument();
  });

  test("renders and saves every explicit repeatable block instance in the same layout", async () => {
    const block = preview.blocks[0];
    block.is_repeatable = true;
    block.instances = [
      { ...block.instances[0], block_instance_id: "instance-main-1", ordinal: 0 },
      {
        ...block.instances[0],
        block_instance_id: "instance-main-2",
        ordinal: 1,
        fields: block.instances[0].fields.map((field) => ({
          ...field,
          value: field.field_id === "field-status" ? "second instance" : field.value,
        })),
      },
    ];

    renderPage();
    const statusInputs = await screen.findAllByRole("textbox", { name: "Публичный статус" });

    expect(statusInputs).toHaveLength(2);
    expect(statusInputs[0]).toHaveValue("drafted");
    expect(statusInputs[1]).toHaveValue("second instance");
    fireEvent.change(statusInputs[1], { target: { value: "updated second" } });
    await waitFor(() => expect(editCalls()).toHaveLength(1));
    expect(editCalls()[0].body).toMatchObject({
      block_instance_id: "instance-main-2",
      value: "updated second",
    });
  });

  test("submits the editable card, clears private caches, and leaves only a safe receipt", async () => {
    const queryClient = renderPage();
    expect(await screen.findByRole("textbox", { name: "Публичный статус" })).toBeInTheDocument();
    await waitFor(() => {
      expect(queryClient.getQueryData(["public-link-preview", rawToken])).toBeDefined();
      expect(queryClient.getQueryData(["public-link-attachments", rawToken])).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: "Отправить на проверку" }));

    expect(
      await screen.findByRole("heading", { name: "Карточка отправлена на проверку" }),
    ).toBeInTheDocument();
    expect(queryClient.getQueryData(["public-link-preview", rawToken])).toBeUndefined();
    expect(queryClient.getQueryData(["public-link-attachments", rawToken])).toBeUndefined();
    expect(screen.queryByRole("textbox", { name: "Публичный статус" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Вложения" })).not.toBeInTheDocument();
  });

  test("shows the review comment and allows a corrected card to be resubmitted", async () => {
    status = safeStatus("changes_requested", {
      review_comment: "Уточните публичный статус",
      reviewed_at: "2026-07-10T10:30:00Z",
    });

    renderPage();

    expect(await screen.findByText("Уточните публичный статус")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Публичный статус" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Повторно отправить на проверку" })).toBeEnabled();
  });

  test.each([
    ["submitted", "Карточка отправлена на проверку"],
    ["approved", "Заполнение завершено"],
    ["disabled", "Доступ к карточке закрыт"],
    ["expired", "Срок действия ссылки истёк"],
  ] as const)(
    "never renders cached card or attachment data when status is %s",
    async (nextStatus, receiptTitle) => {
      status = safeStatus(nextStatus, {
        submitted_at: nextStatus === "submitted" ? "2026-07-10T10:00:00Z" : null,
        reviewed_at: nextStatus === "approved" ? "2026-07-10T11:00:00Z" : null,
      });
      const cachedPreview = {
        ...publicPreview(),
        display_name: "PRIVATE CACHED CARD",
      };
      const queryClient = renderPage((client) => {
        client.setQueryData(["public-link-preview", rawToken], cachedPreview);
        client.setQueryData(["public-link-attachments", rawToken], {
          ...attachments,
          items: [{ id: "private-attachment", title: "PRIVATE CACHED ATTACHMENT" }],
        });
      });

      expect(await screen.findByRole("heading", { name: receiptTitle })).toBeInTheDocument();
      expect(screen.queryByText("PRIVATE CACHED CARD")).not.toBeInTheDocument();
      expect(screen.queryByText("PRIVATE CACHED ATTACHMENT")).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Вложения" })).not.toBeInTheDocument();
      expect(fetchCalls.some((call) => call.path === "/api/v1/public-links/preview")).toBe(false);
      expect(fetchCalls.some((call) => call.path === "/api/v1/public-links/attachments")).toBe(
        false,
      );
      expect(queryClient.getQueryData(["public-link-status", rawToken])).toMatchObject({
        status: nextStatus,
      });
    },
  );
});

function renderPage(setup?: (queryClient: QueryClient) => void) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  setup?.(queryClient);
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/public/edit/${rawToken}`]}>
        <Routes>
          <Route path="/public/edit/:rawToken" element={<PublicLinkEditPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return queryClient;
}

async function handleFetch(input: RequestInfo | URL, init?: RequestInit) {
  const path = String(input);
  const method = init?.method ?? "GET";
  const body =
    init?.body && !(init.body instanceof FormData) ? JSON.parse(String(init.body)) : null;
  fetchCalls.push({ method, path, body });
  if (path === "/api/v1/public-links/status") return jsonResponse(status);
  if (path === "/api/v1/public-links/preview") return jsonResponse(preview);
  if (path === "/api/v1/public-links/attachments") return jsonResponse(attachments);
  if (path === "/api/v1/public-links/edit") {
    if (editResponseMode === "deferred") {
      return new Promise<Response>((resolve) => deferredEditResponses.push(resolve));
    }
    if (editResponseMode === "error") {
      return jsonResponse({ detail: "Значение не удалось сохранить" }, 400);
    }
    return jsonResponse({ value: (body as { value?: unknown })?.value });
  }
  if (path === "/api/v1/public-links/submit") {
    status = safeStatus("submitted", {
      submitted_at: "2026-07-10T10:00:00Z",
      completed_public_fields: 3,
      total_public_fields: 3,
    });
    return jsonResponse(status);
  }
  throw new Error(`Unexpected request: ${method} ${path}`);
}

function editCalls() {
  return fetchCalls.filter((call) => call.path === "/api/v1/public-links/edit");
}

function resolveNextEdit(value: unknown) {
  const resolve = deferredEditResponses.shift();
  if (!resolve) throw new Error("No deferred edit request");
  resolve(jsonResponse({ value }));
}

function safeStatus(
  nextStatus: PublicLinkSafeStatusRead["status"],
  overrides: Partial<PublicLinkSafeStatusRead> = {},
): PublicLinkSafeStatusRead {
  return {
    status: nextStatus,
    can_edit: nextStatus === "active" || nextStatus === "changes_requested",
    submitted_at: null,
    reviewed_at: null,
    review_comment: null,
    completed_public_fields: null,
    total_public_fields: null,
    ...overrides,
  };
}

function publicPreview(): PublicLinkPreviewRead & { form_layout: PublicFormLayout } {
  return {
    card_id: "card-public",
    display_name: "Публичная карточка",
    expires_at: "2099-07-17T10:00:00Z",
    can_edit: true,
    form_layout: {
      columns: 12,
      sections: [
        {
          id: "section-main",
          block_id: "block-main",
          row: 2,
          column: 4,
          row_span: 2,
          column_span: 6,
          items: [
            layoutItem("item-status", "field-status", 1, 1, 1, 6),
            layoutItem("item-approved", "field-approved", 1, 7, 1, 6),
            layoutItem("item-category", "field-category", 2, 1, 1, 6),
            layoutItem("item-file", "field-file", 2, 7, 1, 6),
          ],
        },
      ],
    },
    blocks: [
      {
        block_id: "block-main",
        code: "main",
        title: "Основные сведения",
        is_repeatable: false,
        layout_columns: 12,
        display_config_json: null,
        instances: [
          {
            block_instance_id: "instance-main",
            ordinal: 0,
            fields: [
              previewField("field-status", "status", "Публичный статус", "text", "drafted"),
              previewField("field-approved", "approved", "Подтверждено", "bool", false),
              previewField("field-category", "category", "Категория", "select", "option-active", {
                options: [{ id: "option-active", code: "active", label: "Активная" }],
              }),
              previewField("field-file", "file", "Файл из карточки", "file_ref", {
                attachment_id: "attachment-private-shape",
              }),
            ],
          },
        ],
      },
    ],
  } as PublicLinkPreviewRead & { form_layout: PublicFormLayout };
}

function previewField(
  field_id: string,
  code: string,
  label: string,
  field_type: string,
  value: unknown,
  overrides: Record<string, unknown> = {},
) {
  return {
    field_id,
    code,
    label,
    field_type,
    required_mode: "not_required",
    value,
    options_source_type: null,
    options_source_id: null,
    options_config_json: null,
    display_config_json: null,
    options: [],
    ...overrides,
  };
}

function layoutItem(
  id: string,
  field_id: string,
  row: number,
  column: number,
  row_span: number,
  column_span: number,
) {
  return { id, kind: "field", field_id, row, column, row_span, column_span, text: null };
}

function jsonResponse(body: unknown, statusCode = 200) {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { "Content-Type": "application/json" },
  });
}

type PublicFormLayout = {
  columns: number;
  sections: Array<{
    id: string;
    block_id: string;
    row: number;
    column: number;
    row_span: number;
    column_span: number;
    items: Array<{
      id: string;
      kind: string;
      field_id: string;
      row: number;
      column: number;
      row_span: number;
      column_span: number;
      text: null;
    }>;
  }>;
};
