import { expect, test } from "@playwright/test";

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
    items: [],
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
    items: [],
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

test("renders login shell and authenticated admin workspace", async ({ page }) => {
  let cardStatusValue = "drafted";
  let cardApprovedValue = false;
  let attachmentItems = [...apiPayloads.attachments.items];
  let generatedDocumentItems = [...apiPayloads.generatedDocuments.items];
  await page.route("http://127.0.0.1:8000/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const request = route.request();
    if (url.pathname === "/api/v1/cards/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/attachments") {
      if (request.method() === "POST") {
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
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify(created),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: attachmentItems }),
      });
      return;
    }
    if (url.pathname === "/api/v1/attachments/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee/content") {
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/plain",
          "X-Attachment-Filename": "akt.txt",
        },
        body: "attachment-bytes",
      });
      return;
    }
    if (url.pathname === "/api/v1/attachments/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee") {
      const archived = { ...attachmentItems[0], archived_at: "2026-06-28T12:02:00Z" };
      attachmentItems = [];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(archived),
      });
      return;
    }
    if (
      url.pathname === "/api/v1/registries/77777777-7777-4777-8777-777777777777/document-templates"
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(apiPayloads.documentTemplates),
      });
      return;
    }
    if (url.pathname === "/api/v1/cards/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/generated-documents") {
      if (request.method() === "POST") {
        const body = request.postDataJSON() as { template_id: string; title: string | null };
        const created = {
          id: "12121212-1212-4212-8212-121212121212",
          card_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          template_id: body.template_id,
          stored_file_id: "34343434-3434-4343-8434-343434343434",
          title: body.title ?? "Сводка карточки",
          output_filename: "Карточка актива.docx",
          content_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          render_status: "generated",
          created_at: "2026-06-28T12:03:00Z",
          archived_at: null,
        };
        generatedDocumentItems = [created];
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify(created),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: generatedDocumentItems }),
      });
      return;
    }
    if (
      url.pathname === "/api/v1/generated-documents/12121212-1212-4212-8212-121212121212/content"
    ) {
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "X-Document-Filename": "card.docx",
        },
        body: "docx-bytes",
      });
      return;
    }
    if (url.pathname === "/api/v1/generated-documents/12121212-1212-4212-8212-121212121212") {
      const archived = {
        ...generatedDocumentItems[0],
        archived_at: "2026-06-28T12:04:00Z",
      };
      generatedDocumentItems = [];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(archived),
      });
      return;
    }
    const payload = responsePayload(url.pathname, url.search, {
      approvedValue: cardApprovedValue,
      statusValue: cardStatusValue,
    });
    if (
      url.pathname ===
      "/api/v1/cards/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/fields/99999999-9999-4999-8999-999999999999"
    ) {
      const body = request.postDataJSON() as { value: string; block_instance_id: string | null };
      cardStatusValue = body.value;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          card_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          block_instance_id: body.block_instance_id,
          field_id: "99999999-9999-4999-8999-999999999999",
          value: cardStatusValue,
        }),
      });
      return;
    }
    if (
      url.pathname ===
      "/api/v1/cards/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/fields/99999999-9999-4999-8999-999999999998"
    ) {
      const body = request.postDataJSON() as { value: boolean; block_instance_id: string | null };
      cardApprovedValue = body.value;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc",
          card_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          block_instance_id: body.block_instance_id,
          field_id: "99999999-9999-4999-8999-999999999998",
          value: cardApprovedValue,
        }),
      });
      return;
    }
    await route.fulfill({
      status: payload ? 200 : 404,
      contentType: "application/json",
      body: JSON.stringify(payload ?? { detail: "Not Found" }),
    });
  });

  await page.goto("/");
  await expect(page).toHaveTitle("Реестровая система");
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  await expect(page.getByRole("heading", { name: "Реестровая система" })).toBeVisible();
  await expect(page.getByText("Registry Engine", { exact: true })).toHaveCount(0);
  await page.getByLabel("Электронная почта").fill("admin@example.test");
  await page.getByLabel("Пароль").fill("secret-pass");
  await page.getByRole("button", { name: "Войти" }).click();

  await expect(page.getByText("Системный администратор").first()).toBeVisible();
  await expect(page.getByText("Главная организация")).toBeVisible();

  await page.getByRole("button", { name: "Пользователи" }).click();
  await expect(page.getByText("Технический код: users.manage")).toBeVisible();
  await expect(page.getByText("Технический код: system_admin")).toBeVisible();
  await expect(page.getByText("Системный администратор").first()).toBeVisible();
  await expect(page.getByText("Управление пользователями.")).toBeVisible();
  await expect(page.getByText("System admin", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Manage users.", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Реестры" }).click();
  await expect(page.getByText("Реестр активов")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Статус" })).toBeVisible();

  await page.getByRole("button", { name: "Карточки" }).click();
  await expect(page.getByText("Карточка актива")).toBeVisible();
  await expect(page.getByLabel("Статус")).toHaveValue("drafted");
  await page.getByLabel("Статус").fill("published");
  await page.getByRole("button", { name: "Сохранить Статус" }).click();
  await expect(page.getByText("Сохранено: Статус")).toBeVisible();
  await page.getByLabel("Подтверждено").check();
  await page.getByRole("button", { name: "Сохранить Подтверждено" }).click();
  await expect(page.getByText("Сохранено: Подтверждено")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Вложения" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Документы" })).toBeVisible();
  await expect(page.getByText("Нет файлов")).toBeVisible();
  await expect(page.getByText("Нет документов")).toBeVisible();
  await page.getByLabel("Название файла").fill("Акт проверки");
  await page.getByLabel("Файл", { exact: true }).setInputFiles({
    name: "akt.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("hello world"),
  });
  await page.getByRole("button", { name: "Загрузить файл" }).click();
  await expect(page.getByText("Файл загружен")).toBeVisible();
  await expect(page.getByText("Акт проверки")).toBeVisible();
  await page.getByRole("button", { name: "Скачать файл Акт проверки" }).click();
  await expect(page.getByText("Файл скачан")).toBeVisible();
  await page.getByRole("button", { name: "Сформировать документ" }).click();
  await expect(page.getByText("Документ сформирован")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Скачать документ Сводка карточки" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Скачать документ Сводка карточки" }).click();
  await expect(page.getByText("Документ скачан")).toBeVisible();
  await page.getByRole("button", { name: "Архивировать файл Акт проверки" }).click();
  await expect(page.getByText("Файл архивирован")).toBeVisible();
  await page.getByRole("button", { name: "Архивировать документ Сводка карточки" }).click();
  await expect(page.getByText("Документ архивирован")).toBeVisible();

  await page.getByRole("button", { name: "Аудит" }).click();
  await expect(page.getByText("Создание")).toBeVisible();
});

test("renders public-link edit page and saves a field", async ({ page }) => {
  let publicStatusValue = "drafted";
  let fileEndpointCalls = 0;
  let editRequestBody: {
    raw_token?: string;
    field_id?: string;
    value?: unknown;
    block_instance_id?: string | null;
  } | null = null;

  await page.route("http://127.0.0.1:8000/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    if (
      url.pathname.includes("attachments") ||
      url.pathname.includes("generated-documents") ||
      url.pathname.includes("document-templates")
    ) {
      fileEndpointCalls += 1;
    }
    if (url.pathname === "/api/v1/public-links/preview") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(currentPublicPreview(publicStatusValue)),
      });
      return;
    }
    if (url.pathname === "/api/v1/public-links/edit") {
      editRequestBody = route.request().postDataJSON() as typeof editRequestBody;
      publicStatusValue = String(editRequestBody?.value ?? "");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbd",
          card_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          block_instance_id: editRequestBody?.block_instance_id ?? null,
          field_id: "99999999-9999-4999-8999-999999999997",
          value: publicStatusValue,
        }),
      });
      return;
    }
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Not Found" }),
    });
  });

  await page.goto("/public/edit/public-token");
  await expect(page.getByRole("heading", { name: "Публичная карточка" })).toBeVisible();
  await expect(page.getByText("Публичный блок")).toBeVisible();
  await expect(page.getByText("Публичное редактирование карточки")).toBeVisible();
  await expect(page.getByLabel("Публичный статус")).toHaveValue("drafted");
  await expect(page.getByRole("heading", { name: "Вложения" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Документы" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Загрузить файл" })).toHaveCount(0);

  await page.getByLabel("Публичный статус").fill("submitted");
  await page.getByRole("button", { name: "Сохранить Публичный статус" }).click();

  await expect(page.getByText("Сохранено: Публичный статус")).toBeVisible();
  expect(editRequestBody).toEqual({
    raw_token: "public-token",
    field_id: "99999999-9999-4999-8999-999999999997",
    value: "submitted",
    block_instance_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  });
  expect(fileEndpointCalls).toBe(0);
});

function responsePayload(
  pathname: string,
  search: string,
  cardValues: { approvedValue: boolean; statusValue: string },
) {
  if (pathname === "/api/v1/auth/login") {
    return apiPayloads.login;
  }
  if (pathname === "/api/v1/auth/me") {
    return apiPayloads.login.user;
  }
  if (pathname === "/api/v1/organizations") {
    return apiPayloads.organizations;
  }
  if (pathname === "/api/v1/users") {
    return apiPayloads.users;
  }
  if (pathname === "/api/v1/roles") {
    return apiPayloads.roles;
  }
  if (pathname === "/api/v1/permissions") {
    return apiPayloads.permissions;
  }
  if (pathname === "/api/v1/access-grants") {
    return apiPayloads.grants;
  }
  if (pathname === "/api/v1/registries") {
    return apiPayloads.registries;
  }
  if (pathname === "/api/v1/registries/77777777-7777-4777-8777-777777777777/schema") {
    return apiPayloads.schema;
  }
  if (pathname === "/api/v1/registries/77777777-7777-4777-8777-777777777777/cards") {
    return apiPayloads.cards;
  }
  if (pathname === "/api/v1/cards/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa") {
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
                  value: cardValues.statusValue,
                },
                approved: {
                  field_id: "99999999-9999-4999-8999-999999999998",
                  code: "approved",
                  field_type: "bool",
                  value: cardValues.approvedValue,
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
          value: cardValues.statusValue,
        },
        approved: {
          field_id: "99999999-9999-4999-8999-999999999998",
          code: "approved",
          field_type: "bool",
          value: cardValues.approvedValue,
        },
      },
    };
  }
  if (pathname === "/api/v1/audit-events" && search === "?limit=20") {
    return apiPayloads.audit;
  }
  return null;
}

function currentPublicPreview(statusValue: string) {
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
                value: statusValue,
              },
            ],
          },
        ],
      },
    ],
  };
}
