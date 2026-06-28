import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { App } from "@/App";
import type { AttachmentRead, DocumentTemplateRead, GeneratedDocumentRead } from "@/api/types";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

const apiPayloads = {
  login: {
    access_token: "test-token",
    token_type: "bearer",
    expires_at: "2026-06-28T12:00:00Z",
    user: {
      id: "11111111-1111-4111-8111-111111111111",
      email: "admin@example.test",
      display_name: "Системный администратор",
      status: "active",
      is_superuser: true,
    },
  },
  organizations: {
    items: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        parent_id: null,
        code: "root",
        name: "Главная организация",
        type: "organization",
        is_active: true,
      },
    ],
  },
  users: {
    items: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        email: "admin@example.test",
        display_name: "Системный администратор",
        status: "active",
        is_superuser: true,
        archived_at: null,
      },
    ],
  },
  roles: {
    items: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        code: "system_admin",
        name: "System admin",
        description: "Full system administration role.",
        is_system: true,
        archived_at: null,
      },
    ],
  },
  permissions: {
    items: [
      {
        id: "44444444-4444-4444-8444-444444444444",
        code: "users.manage",
        description: "Manage users.",
      },
    ],
  },
  grants: {
    items: [
      {
        id: "55555555-5555-4555-8555-555555555555",
        user_id: "11111111-1111-4111-8111-111111111111",
        role_id: "33333333-3333-4333-8333-333333333333",
        registry_id: null,
        organization_id: "22222222-2222-4222-8222-222222222222",
        include_descendants: true,
        valid_from: null,
        valid_to: null,
        created_by: "11111111-1111-4111-8111-111111111111",
        archived_at: null,
      },
    ],
  },
  audit: {
    items: [
      {
        id: "66666666-6666-4666-8666-666666666666",
        actor_type: "user",
        actor_user_id: "11111111-1111-4111-8111-111111111111",
        actor_public_link_id: null,
        action: "create",
        object_type: "user",
        object_id: "11111111-1111-4111-8111-111111111111",
        old_data_json: null,
        new_data_json: null,
        source: "api",
        ip_address: null,
        user_agent: null,
        request_id: "request-1",
        created_at: "2026-06-28T12:00:00Z",
      },
    ],
  },
  registries: {
    items: [
      {
        id: "77777777-7777-4777-8777-777777777777",
        code: "assets",
        name: "Реестр активов",
        description: "Учет активов",
        lifecycle_status: "active",
        schema_version: 1,
      },
    ],
  },
  schema: {
    registry: {
      id: "77777777-7777-4777-8777-777777777777",
      code: "assets",
      name: "Реестр активов",
      description: "Учет активов",
      lifecycle_status: "active",
      schema_version: 1,
    },
    blocks: [
      {
        id: "88888888-8888-4888-8888-888888888888",
        registry_id: "77777777-7777-4777-8777-777777777777",
        code: "main",
        title: "Основной блок",
        description: null,
        position: 0,
        is_repeatable: false,
        is_active: true,
        public_visible: true,
        public_editable: false,
      },
    ],
    fields: [
      {
        id: "99999999-9999-4999-8999-999999999999",
        block_id: "88888888-8888-4888-8888-888888888888",
        code: "status",
        label: "Статус",
        description: null,
        field_type: "text",
        position: 0,
        options_source_type: null,
        options_source_id: null,
        is_active: true,
        public_visible: true,
        public_editable: false,
      },
      {
        id: "99999999-9999-4999-8999-999999999998",
        block_id: "88888888-8888-4888-8888-888888888888",
        code: "approved",
        label: "Подтверждено",
        description: null,
        field_type: "bool",
        position: 1,
        options_source_type: null,
        options_source_id: null,
        is_active: true,
        public_visible: true,
        public_editable: false,
      },
    ],
  },
  cards: {
    items: [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        registry_id: "77777777-7777-4777-8777-777777777777",
        organization_id: "22222222-2222-4222-8222-222222222222",
        org_unit_id: null,
        display_name: "Карточка актива",
        lifecycle_status: "draft",
        public_view_enabled: false,
        public_edit_enabled: true,
      },
    ],
  },
  cardRead: {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    registry_id: "77777777-7777-4777-8777-777777777777",
    organization_id: "22222222-2222-4222-8222-222222222222",
    display_name: "Карточка актива",
    blocks: {
      main: {
        block_id: "88888888-8888-4888-8888-888888888888",
        code: "main",
        instances: [
          {
            block_instance_id: null,
            ordinal: 0,
            fields: {
              status: {
                field_id: "99999999-9999-4999-8999-999999999999",
                code: "status",
                field_type: "text",
                value: "drafted",
              },
            },
          },
        ],
      },
    },
    fields: {
      status: {
        field_id: "99999999-9999-4999-8999-999999999999",
        code: "status",
        field_type: "text",
        value: "drafted",
      },
    },
  },
  attachments: {
    items: [] as AttachmentRead[],
  },
  documentTemplates: {
    items: [
      {
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        registry_id: "77777777-7777-4777-8777-777777777777",
        code: "summary",
        name: "Сводка карточки",
        description: null,
        template_format: "docx_text_v1",
        output_filename_template: "{{ card.display_name }}.docx",
        output_content_type:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        is_active: true,
        created_at: "2026-06-28T12:00:00Z",
        archived_at: null,
      },
    ],
  },
  generatedDocuments: {
    items: [] as GeneratedDocumentRead[],
  },
  publicPreview: {
    card_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    display_name: "Публичная карточка",
    expires_at: "2026-06-29T12:00:00Z",
    can_edit: true,
    blocks: [
      {
        block_id: "88888888-8888-4888-8888-888888888888",
        code: "public",
        title: "Публичный блок",
        instances: [
          {
            block_instance_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            ordinal: 0,
            fields: [
              {
                field_id: "99999999-9999-4999-8999-999999999997",
                code: "public_status",
                label: "Публичный статус",
                field_type: "text",
                value: "drafted",
                options_source_type: null,
                options_source_id: null,
                options: [],
              },
            ],
          },
        ],
      },
    ],
  },
};

let cardStatusValue = "drafted";
let cardApprovedValue = false;
let publicStatusValue = "drafted";
let attachmentItems: typeof apiPayloads.attachments.items;
let documentTemplateItems: DocumentTemplateRead[];
let generatedDocumentItems: typeof apiPayloads.generatedDocuments.items;

beforeEach(() => {
  localStorage.clear();
  window.history.pushState({}, "", "/");
  cardStatusValue = "drafted";
  cardApprovedValue = false;
  publicStatusValue = "drafted";
  attachmentItems = [];
  documentTemplateItems = [...apiPayloads.documentTemplates.items];
  generatedDocumentItems = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.endsWith("/api/v1/public-links/preview")) {
        return jsonResponse(currentPublicPreview());
      }
      if (url.endsWith("/api/v1/public-links/edit")) {
        const payload = JSON.parse(String(init?.body)) as {
          raw_token: string;
          field_id: string;
          value: string;
          block_instance_id: string | null;
        };
        publicStatusValue = payload.value;
        return jsonResponse({
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbd",
          card_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          block_instance_id: payload.block_instance_id,
          field_id: payload.field_id,
          value: publicStatusValue,
        });
      }
      if (url.endsWith("/api/v1/public-links/attachments")) {
        return jsonResponse({ items: attachmentItems });
      }
      if (url.endsWith("/api/v1/public-links/attachments/upload")) {
        const created = {
          id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          card_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          title: "Публичный акт",
          description: null,
          position: 0,
          original_filename: "public.txt",
          content_type: "text/plain",
          content_length_bytes: 12,
          scanner_status: "deferred",
          created_at: "2026-06-28T12:05:00Z",
          archived_at: null,
        };
        attachmentItems = [created as (typeof apiPayloads.attachments.items)[number]];
        return jsonResponse(created, { status: 201 });
      }
      if (
        url.endsWith(
          "/api/v1/public-links/attachments/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee/content",
        )
      ) {
        return new Response("public-bytes", {
          status: 200,
          headers: {
            "Content-Type": "text/plain",
            "X-Attachment-Filename": "public.txt",
          },
        });
      }
      if (url.endsWith("/api/v1/auth/login")) {
        return jsonResponse(apiPayloads.login);
      }
      if (url.endsWith("/api/v1/auth/me")) {
        return jsonResponse(apiPayloads.login.user);
      }
      if (url.endsWith("/api/v1/organizations")) {
        return jsonResponse(apiPayloads.organizations);
      }
      if (url.endsWith("/api/v1/users")) {
        return jsonResponse(apiPayloads.users);
      }
      if (url.endsWith("/api/v1/roles")) {
        return jsonResponse(apiPayloads.roles);
      }
      if (url.endsWith("/api/v1/permissions")) {
        return jsonResponse(apiPayloads.permissions);
      }
      if (url.endsWith("/api/v1/access-grants")) {
        return jsonResponse(apiPayloads.grants);
      }
      if (url.endsWith("/api/v1/registries")) {
        return jsonResponse(apiPayloads.registries);
      }
      if (url.endsWith("/api/v1/registries/77777777-7777-4777-8777-777777777777/schema")) {
        return jsonResponse(apiPayloads.schema);
      }
      if (url.endsWith("/api/v1/registries/77777777-7777-4777-8777-777777777777/cards")) {
        return jsonResponse(apiPayloads.cards);
      }
      if (url.endsWith("/api/v1/cards/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/attachments")) {
        if (init?.method === "POST") {
          const headers = init.headers as Record<string, string> | undefined;
          if (headers?.["Content-Type"]) {
            return jsonResponse(
              { detail: "multipart content type must be browser-managed" },
              { status: 400 },
            );
          }
          const created = {
            id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
            card_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            stored_file_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
            title: "Акт проверки",
            description: null,
            position: 0,
            original_filename: "akt.txt",
            content_type: "text/plain",
            content_length_bytes: 11,
            checksum_sha256: "a".repeat(64),
            scanner_status: "deferred",
            created_at: "2026-06-28T12:01:00Z",
            archived_at: null,
          };
          attachmentItems = [created];
          return jsonResponse(created, { status: 201 });
        }
        return jsonResponse({ items: attachmentItems });
      }
      if (url.endsWith("/api/v1/attachments/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee/content")) {
        return new Response("attachment-bytes", {
          status: 200,
          headers: {
            "Content-Type": "text/plain",
            "X-Attachment-Filename": "akt.txt",
          },
        });
      }
      if (url.endsWith("/api/v1/attachments/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee")) {
        const archived = { ...attachmentItems[0], archived_at: "2026-06-28T12:02:00Z" };
        attachmentItems = [];
        return jsonResponse(archived);
      }
      if (
        url.endsWith("/api/v1/registries/77777777-7777-4777-8777-777777777777/document-templates")
      ) {
        if (init?.method === "POST") {
          const payload = JSON.parse(String(init.body ?? "{}")) as {
            code: string;
            name: string;
            description: string | null;
            template_body: string;
            output_filename_template: string;
          };
          const created: DocumentTemplateRead = {
            id: "abababab-abab-4aba-8bab-abababababab",
            registry_id: "77777777-7777-4777-8777-777777777777",
            code: payload.code,
            name: payload.name,
            description: payload.description,
            template_format: "docx_text_v1",
            output_filename_template: payload.output_filename_template,
            output_content_type:
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            is_active: true,
            created_at: "2026-06-28T12:05:00Z",
            archived_at: null,
          };
          documentTemplateItems = [...documentTemplateItems, created];
          return jsonResponse(created, { status: 201 });
        }
        return jsonResponse({ items: documentTemplateItems });
      }
      if (url.endsWith("/api/v1/document-templates/abababab-abab-4aba-8bab-abababababab")) {
        const archived = {
          ...documentTemplateItems.find(
            (item) => item.id === "abababab-abab-4aba-8bab-abababababab",
          )!,
          archived_at: "2026-06-28T12:06:00Z",
        };
        documentTemplateItems = documentTemplateItems.filter(
          (item) => item.id !== "abababab-abab-4aba-8bab-abababababab",
        );
        return jsonResponse(archived);
      }
      if (url.endsWith("/api/v1/cards/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/generated-documents")) {
        if (init?.method === "POST") {
          const payload = JSON.parse(String(init.body ?? "{}")) as {
            template_id: string;
            title: string | null;
          };
          const created = {
            id: "12121212-1212-4212-8212-121212121212",
            card_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            template_id: payload.template_id,
            stored_file_id: "34343434-3434-4343-8434-343434343434",
            title: payload.title ?? "Сводка карточки",
            output_filename: "Карточка актива.docx",
            content_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            render_status: "generated",
            created_at: "2026-06-28T12:03:00Z",
            archived_at: null,
          };
          generatedDocumentItems = [created];
          return jsonResponse(created, { status: 201 });
        }
        return jsonResponse({ items: generatedDocumentItems });
      }
      if (
        url.endsWith("/api/v1/generated-documents/12121212-1212-4212-8212-121212121212/content")
      ) {
        return new Response("docx-bytes", {
          status: 200,
          headers: {
            "Content-Type":
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "X-Document-Filename": "card.docx",
          },
        });
      }
      if (url.endsWith("/api/v1/generated-documents/12121212-1212-4212-8212-121212121212")) {
        const archived = {
          ...generatedDocumentItems[0],
          archived_at: "2026-06-28T12:04:00Z",
        };
        generatedDocumentItems = [];
        return jsonResponse(archived);
      }
      if (
        url.endsWith(
          "/api/v1/cards/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/fields/99999999-9999-4999-8999-999999999999",
        )
      ) {
        const payload = JSON.parse(String(init?.body)) as {
          value: string;
          block_instance_id: string | null;
        };
        cardStatusValue = payload.value;
        return jsonResponse({
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          card_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          block_instance_id: payload.block_instance_id,
          field_id: "99999999-9999-4999-8999-999999999999",
          value: cardStatusValue,
        });
      }
      if (
        url.endsWith(
          "/api/v1/cards/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/fields/99999999-9999-4999-8999-999999999998",
        )
      ) {
        const payload = JSON.parse(String(init?.body)) as {
          value: boolean;
          block_instance_id: string | null;
        };
        cardApprovedValue = payload.value;
        return jsonResponse({
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc",
          card_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          block_instance_id: payload.block_instance_id,
          field_id: "99999999-9999-4999-8999-999999999998",
          value: cardApprovedValue,
        });
      }
      if (url.endsWith("/api/v1/cards/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")) {
        return jsonResponse(currentCardRead());
      }
      if (url.endsWith("/api/v1/audit-events?limit=20")) {
        return jsonResponse(apiPayloads.audit);
      }
      return jsonResponse({ detail: "Not Found" }, { status: 404 });
    }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

function currentCardRead() {
  return {
    ...apiPayloads.cardRead,
    blocks: {
      main: {
        ...apiPayloads.cardRead.blocks.main,
        instances: [
          {
            block_instance_id: null,
            ordinal: 0,
            fields: {
              status: {
                field_id: "99999999-9999-4999-8999-999999999999",
                code: "status",
                field_type: "text",
                value: cardStatusValue,
              },
              approved: {
                field_id: "99999999-9999-4999-8999-999999999998",
                code: "approved",
                field_type: "bool",
                value: cardApprovedValue,
              },
            },
          },
        ],
      },
    },
    fields: {
      status: {
        field_id: "99999999-9999-4999-8999-999999999999",
        code: "status",
        field_type: "text",
        value: cardStatusValue,
      },
      approved: {
        field_id: "99999999-9999-4999-8999-999999999998",
        code: "approved",
        field_type: "bool",
        value: cardApprovedValue,
      },
    },
  };
}

function currentPublicPreview() {
  return {
    ...apiPayloads.publicPreview,
    blocks: [
      {
        ...apiPayloads.publicPreview.blocks[0],
        instances: [
          {
            ...apiPayloads.publicPreview.blocks[0].instances[0],
            fields: [
              {
                ...apiPayloads.publicPreview.blocks[0].instances[0].fields[0],
                value: publicStatusValue,
              },
            ],
          },
        ],
      },
    ],
  };
}

test("renders login screen before authentication", () => {
  render(<App />);

  expect(screen.getByRole("heading", { name: "Реестровая система" })).toBeInTheDocument();
  expect(screen.queryByText("Registry Engine")).not.toBeInTheDocument();
  expect(screen.getByLabelText(/электронная почта/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/пароль/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Войти" })).toBeInTheDocument();
});

test("logs in and renders authenticated admin workspace", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));

  expect(await screen.findByText("Системный администратор")).toBeInTheDocument();
  expect(await screen.findByText("Главная организация")).toBeInTheDocument();
  expect(screen.getByText("Панель администратора")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Выйти" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Пользователи" }));
  expect(screen.getByText("Технический код: users.manage")).toBeInTheDocument();
  expect(screen.getByText("Технический код: system_admin")).toBeInTheDocument();
  expect(screen.getAllByText("Системный администратор").length).toBeGreaterThan(0);
  expect(screen.getByText("Управление пользователями.")).toBeInTheDocument();
  expect(screen.queryByText("System admin")).not.toBeInTheDocument();
  expect(screen.queryByText("Manage users.")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Реестры" }));
  expect(await screen.findByText("Реестр активов")).toBeInTheDocument();
  expect(screen.getAllByText("Основной блок").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Статус").length).toBeGreaterThan(0);
  await user.click(screen.getByRole("button", { name: "Карточки" }));
  expect(await screen.findByText("Карточка актива")).toBeInTheDocument();
  expect(screen.getByDisplayValue("drafted")).toBeInTheDocument();
  const statusInput = await screen.findByLabelText("Статус");
  await user.clear(statusInput);
  await user.type(statusInput, "published");
  await user.click(screen.getByRole("button", { name: "Сохранить Статус" }));
  expect(await screen.findByText("Сохранено: Статус")).toBeInTheDocument();

  const approvedInput = await screen.findByLabelText("Подтверждено");
  await user.click(approvedInput);
  await user.click(screen.getByRole("button", { name: "Сохранить Подтверждено" }));
  expect(await screen.findByText("Сохранено: Подтверждено")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Аудит" }));
  expect(screen.getByText("Создание")).toBeInTheDocument();

  await waitFor(() => {
    const fetchMock = vi.mocked(fetch);
    expect(
      fetchMock.mock.calls.some(([, init]) => {
        const headers = init?.headers as Record<string, string> | undefined;
        return headers?.Authorization === "Bearer test-token";
      }),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const url = input instanceof Request ? input.url : String(input);
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          value?: unknown;
          block_instance_id?: unknown;
        };
        return (
          url.endsWith(
            "/api/v1/cards/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/fields/99999999-9999-4999-8999-999999999999",
          ) &&
          init?.method === "PATCH" &&
          body.value === "published" &&
          body.block_instance_id === null
        );
      }),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const url = input instanceof Request ? input.url : String(input);
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          value?: unknown;
          block_instance_id?: unknown;
        };
        return (
          url.endsWith(
            "/api/v1/cards/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/fields/99999999-9999-4999-8999-999999999998",
          ) &&
          init?.method === "PATCH" &&
          body.value === true &&
          body.block_instance_id === null
        );
      }),
    ).toBe(true);
  });
});

test("shows localized login error text", async () => {
  const user = userEvent.setup();
  vi.mocked(fetch).mockImplementationOnce(async () =>
    jsonResponse({ detail: "Invalid email or password." }, { status: 401 }),
  );
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "bad-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));

  expect(await screen.findByText("Неверная электронная почта или пароль.")).toBeInTheDocument();
  expect(screen.queryByText("Invalid email or password.")).not.toBeInTheDocument();
});

test("manages card attachments and generated documents in Russian UI", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Карточки" }));

  expect(await screen.findByRole("heading", { name: "Вложения" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Документы" })).toBeInTheDocument();
  expect(screen.getByText("Нет файлов")).toBeInTheDocument();
  expect(screen.getByText("Нет документов")).toBeInTheDocument();

  await user.type(screen.getByLabelText("Название файла"), "Акт проверки");
  await user.upload(
    screen.getByLabelText("Файл"),
    new File(["hello world"], "akt.txt", { type: "text/plain" }),
  );
  await user.click(screen.getByRole("button", { name: "Загрузить файл" }));

  expect(await screen.findByText("Файл загружен")).toBeInTheDocument();
  expect(screen.getByText("Акт проверки")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Скачать файл Акт проверки" }));
  expect(await screen.findByText("Файл скачан")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Сформировать документ" }));
  expect(await screen.findByText("Документ сформирован")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Скачать документ Сводка карточки" }),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Скачать документ Сводка карточки" }));
  expect(await screen.findByText("Документ скачан")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Архивировать файл Акт проверки" }));
  expect(await screen.findByText("Файл архивирован")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Архивировать документ Сводка карточки" }));
  expect(await screen.findByText("Документ архивирован")).toBeInTheDocument();

  await waitFor(() => {
    const fetchMock = vi.mocked(fetch);
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const url = input instanceof Request ? input.url : String(input);
        const headers = init?.headers as Record<string, string> | undefined;
        return (
          url.endsWith("/api/v1/cards/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/attachments") &&
          init?.method === "POST" &&
          init.body instanceof FormData &&
          headers?.Authorization === "Bearer test-token" &&
          headers?.["Content-Type"] === undefined
        );
      }),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const url = input instanceof Request ? input.url : String(input);
        if (
          !url.endsWith("/api/v1/cards/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/generated-documents") ||
          init?.method !== "POST"
        ) {
          return false;
        }
        const body = JSON.parse(String(init.body ?? "{}")) as { template_id?: string };
        return body.template_id === "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
      }),
    ).toBe(true);
  });
});

test("creates and archives document templates in Russian UI", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Карточки" }));

  expect(await screen.findByRole("heading", { name: "Шаблоны документов" })).toBeInTheDocument();

  await user.type(screen.getByLabelText("Код шаблона"), "acceptance_act");
  await user.type(screen.getByLabelText("Название шаблона"), "Акт приема");
  await user.type(screen.getByLabelText("Описание шаблона"), "Документ по карточке");
  fireEvent.change(screen.getByLabelText("Шаблон имени файла"), {
    target: { value: "{{ card.display_name }}-act.docx" },
  });
  fireEvent.change(screen.getByLabelText("Текст шаблона"), {
    target: { value: "Карточка: {{ card.display_name }}" },
  });
  await user.click(screen.getByRole("button", { name: "Создать шаблон" }));

  expect(await screen.findByText("Шаблон создан")).toBeInTheDocument();
  expect(screen.getAllByText("Акт приема").length).toBeGreaterThan(0);

  await user.click(screen.getByRole("button", { name: "Архивировать шаблон Акт приема" }));

  expect(await screen.findByText("Шаблон архивирован")).toBeInTheDocument();
  await waitFor(() => expect(screen.queryAllByText("Акт приема")).toHaveLength(0));

  await waitFor(() => {
    const fetchMock = vi.mocked(fetch);
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const url = input instanceof Request ? input.url : String(input);
        if (
          !url.endsWith(
            "/api/v1/registries/77777777-7777-4777-8777-777777777777/document-templates",
          ) ||
          init?.method !== "POST"
        ) {
          return false;
        }
        const body = JSON.parse(String(init.body ?? "{}")) as {
          code?: string;
          name?: string;
          description?: string | null;
          template_body?: string;
          output_filename_template?: string;
        };
        return (
          body.code === "acceptance_act" &&
          body.name === "Акт приема" &&
          body.description === "Документ по карточке" &&
          body.template_body === "Карточка: {{ card.display_name }}" &&
          body.output_filename_template === "{{ card.display_name }}-act.docx"
        );
      }),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const url = input instanceof Request ? input.url : String(input);
        return (
          url.endsWith("/api/v1/document-templates/abababab-abab-4aba-8bab-abababababab") &&
          init?.method === "DELETE"
        );
      }),
    ).toBe(true);
  });
});

test("edits a public-link card without authentication", async () => {
  const user = userEvent.setup();
  window.history.pushState({}, "", "/public/edit/public-token");
  render(<App />);

  expect(await screen.findByRole("heading", { name: "Публичная карточка" })).toBeInTheDocument();
  expect(screen.getByText("Публичный блок")).toBeInTheDocument();
  expect(screen.getByText("Публичное редактирование карточки")).toBeInTheDocument();

  const statusInput = await screen.findByLabelText("Публичный статус");
  expect(statusInput).toHaveValue("drafted");
  await user.clear(statusInput);
  await user.type(statusInput, "submitted");
  await user.click(screen.getByRole("button", { name: "Сохранить Публичный статус" }));

  expect(await screen.findByText("Сохранено: Публичный статус")).toBeInTheDocument();
  expect(await screen.findByRole("heading", { name: "Вложения" })).toBeInTheDocument();
  expect(screen.getByText("Нет файлов")).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Документы" })).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Шаблоны документов" })).not.toBeInTheDocument();

  await user.type(screen.getByLabelText("Название файла"), "Публичный акт");
  await user.upload(
    screen.getByLabelText("Файл"),
    new File(["public bytes"], "public.txt", { type: "text/plain" }),
  );
  await user.click(screen.getByRole("button", { name: "Загрузить файл" }));

  expect(await screen.findByText("Файл загружен")).toBeInTheDocument();
  expect(screen.getByText("Публичный акт")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Архивировать файл/ })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Скачать файл Публичный акт" }));
  expect(await screen.findByText("Файл скачан")).toBeInTheDocument();

  await waitFor(() => {
    const fetchMock = vi.mocked(fetch);
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const url = input instanceof Request ? input.url : String(input);
        const headers = init?.headers as Record<string, string> | undefined;
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          raw_token?: string;
          field_id?: string;
          value?: unknown;
          block_instance_id?: unknown;
        };
        return (
          url.endsWith("/api/v1/public-links/edit") &&
          init?.method === "POST" &&
          headers?.Authorization === undefined &&
          body.raw_token === "public-token" &&
          body.field_id === "99999999-9999-4999-8999-999999999997" &&
          body.value === "submitted" &&
          body.block_instance_id === "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
        );
      }),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const url = input instanceof Request ? input.url : String(input);
        const headers = init?.headers as Record<string, string> | undefined;
        return (
          url.endsWith("/api/v1/public-links/attachments/upload") &&
          init?.method === "POST" &&
          init.body instanceof FormData &&
          headers?.Authorization === undefined &&
          headers?.["Content-Type"] === undefined
        );
      }),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const url = input instanceof Request ? input.url : String(input);
        const headers = init?.headers as Record<string, string> | undefined;
        if (
          !url.endsWith(
            "/api/v1/public-links/attachments/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee/content",
          ) ||
          init?.method !== "POST"
        ) {
          return false;
        }
        const body = JSON.parse(String(init?.body ?? "{}")) as { raw_token?: string };
        return headers?.Authorization === undefined && body.raw_token === "public-token";
      }),
    ).toBe(true);
  });
});
