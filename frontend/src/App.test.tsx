import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { App } from "@/App";

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

beforeEach(() => {
  localStorage.clear();
  window.history.pushState({}, "", "/");
  cardStatusValue = "drafted";
  cardApprovedValue = false;
  publicStatusValue = "drafted";
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

  expect(screen.getByRole("heading", { name: "Registry Engine" })).toBeInTheDocument();
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
  expect(screen.getByText("users.manage")).toBeInTheDocument();
  expect(screen.getByText("system_admin")).toBeInTheDocument();
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
  });
});
