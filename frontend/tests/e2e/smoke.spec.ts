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
  orgUnits: {
    items: [
      {
        id: "2f2f2f2f-2f2f-42f2-82f2-2f2f2f2f2f2f",
        organization_id: "22222222-2222-4222-8222-222222222222",
        parent_id: null,
        code: "accounting",
        name: "Отдел учета",
        is_active: true,
        archived_at: null,
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
      {
        id: "8d8d8d8d-8d8d-48d8-88d8-8d8d8d8d8d8d",
        registry_id: "77777777-7777-4777-8777-777777777777",
        code: "details",
        title: "Детали карточки",
        description: null,
        position: 1,
        is_repeatable: true,
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
      {
        id: "9d9d9d9d-9d9d-49d9-89d9-9d9d9d9d9d9d",
        block_id: "8d8d8d8d-8d8d-48d8-88d8-8d8d8d8d8d8d",
        code: "comment",
        label: "Комментарий",
        description: null,
        field_type: "text",
        position: 0,
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
  publicLinks: {
    items: [
      {
        id: "41414141-4141-4141-8141-414141414141",
        card_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        status: "active",
        can_view: true,
        can_edit: true,
        expires_at: "2099-07-05T12:00:00Z",
        max_uses: 5,
        used_count: 1,
        max_attachment_uploads: 3,
        attachment_upload_count: 1,
        disabled_at: null,
      },
    ],
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
  referenceLists: {
    items: [
      {
        id: "abababab-abab-4aba-8aba-abababababab",
        registry_id: "77777777-7777-4777-8777-777777777777",
        owner_organization_id: "22222222-2222-4222-8222-222222222222",
        code: "asset_statuses",
        name: "Статусы актива",
        description: "Статусы карточек",
        inherit_to_descendants: true,
        locked_for_descendants: true,
        managed_by_system_only: false,
        is_active: true,
      },
    ],
  },
  referenceItems: {
    items: [
      {
        id: "bcbcbcbc-bcbc-4bcb-8bcb-bcbcbcbcbcbc",
        list_id: "abababab-abab-4aba-8aba-abababababab",
        parent_id: null,
        code: "active",
        label: "Активен",
        description: "Активная карточка",
        position: 0,
        is_active: true,
      },
    ],
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
  let newCardStatusValue = "";
  let newCardApprovedValue = false;
  let newCardCommentValue = "";
  let cardItems = [...apiPayloads.cards.items];
  let createdCard: {
    id: string;
    registry_id: string;
    organization_id: string;
    org_unit_id: string | null;
    display_name: string;
    lifecycle_status: string;
    public_view_enabled: boolean;
    public_edit_enabled: boolean;
  } | null = null;
  let repeatableInstances: { block_instance_id: string; ordinal: number; value: string }[] = [];
  let auditItems = [...apiPayloads.audit.items];
  const publicLinkItems = [...apiPayloads.publicLinks.items];
  let attachmentItems = [...apiPayloads.attachments.items];
  let documentTemplateItems = [...apiPayloads.documentTemplates.items];
  let generatedDocumentItems = [...apiPayloads.generatedDocuments.items];
  const appendAuditEvent = (action: string, objectType: string, objectId: string) => {
    auditItems = [
      {
        ...apiPayloads.audit.items[0],
        id: `${action}-${auditItems.length}`,
        action,
        object_type: objectType,
        object_id: objectId,
        created_at: "2026-06-28T12:10:00Z",
      },
      ...auditItems,
    ];
  };
  const createdCardRead = () => {
    if (!createdCard) {
      return null;
    }
    return {
      ...createdCard,
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
                  value: newCardStatusValue,
                },
                approved: {
                  field_id: "99999999-9999-4999-8999-999999999998",
                  code: "approved",
                  field_type: "bool",
                  value: newCardApprovedValue,
                },
              },
            },
          ],
        },
        details: {
          block_id: "8d8d8d8d-8d8d-48d8-88d8-8d8d8d8d8d8d",
          code: "details",
          instances: repeatableInstances.map((instance) => ({
            block_instance_id: instance.block_instance_id,
            ordinal: instance.ordinal,
            fields: {
              comment: {
                field_id: "9d9d9d9d-9d9d-49d9-89d9-9d9d9d9d9d9d",
                code: "comment",
                field_type: "text",
                value: instance.value,
              },
            },
          })),
        },
      },
      fields: {
        status: {
          field_id: "99999999-9999-4999-8999-999999999999",
          code: "status",
          field_type: "text",
          value: newCardStatusValue,
        },
        approved: {
          field_id: "99999999-9999-4999-8999-999999999998",
          code: "approved",
          field_type: "bool",
          value: newCardApprovedValue,
        },
      },
    };
  };
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    consoleErrors.push(error.message);
  });
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const request = route.request();
    if (url.pathname === "/api/v1/organizations/22222222-2222-4222-8222-222222222222/org-units") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(apiPayloads.orgUnits),
      });
      return;
    }
    if (url.pathname === "/api/v1/registries/77777777-7777-4777-8777-777777777777/cards") {
      if (request.method() === "POST") {
        const body = request.postDataJSON() as {
          organization_id: string;
          org_unit_id?: string | null;
          display_name: string;
          public_view_enabled?: boolean;
          public_edit_enabled?: boolean;
        };
        createdCard = {
          id: "cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd",
          registry_id: "77777777-7777-4777-8777-777777777777",
          organization_id: body.organization_id,
          org_unit_id: body.org_unit_id ?? null,
          display_name: body.display_name,
          lifecycle_status: "draft",
          public_view_enabled: Boolean(body.public_view_enabled),
          public_edit_enabled: Boolean(body.public_edit_enabled),
        };
        cardItems = [...cardItems, createdCard];
        appendAuditEvent("create", "card", createdCard.id);
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify(createdCard),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: cardItems }),
      });
      return;
    }
    if (url.pathname === "/api/v1/cards/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/public-links") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: publicLinkItems }),
      });
      return;
    }
    if (url.pathname === "/api/v1/cards/cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd/public-links") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [] }),
      });
      return;
    }
    if (url.pathname === "/api/v1/cards/cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd") {
      if (request.method() === "PATCH" && createdCard) {
        const body = request.postDataJSON() as {
          display_name?: string | null;
          public_view_enabled?: boolean | null;
          public_edit_enabled?: boolean | null;
        };
        createdCard = {
          ...createdCard,
          display_name: body.display_name ?? createdCard.display_name,
          public_view_enabled: body.public_view_enabled ?? createdCard.public_view_enabled,
          public_edit_enabled: body.public_edit_enabled ?? createdCard.public_edit_enabled,
        };
        cardItems = cardItems.map((item) => (item.id === createdCard?.id ? createdCard : item));
        appendAuditEvent("update", "card", createdCard.id);
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(createdCard),
        });
        return;
      }
      if (request.method() === "DELETE" && createdCard) {
        const archivedCard = { ...createdCard, lifecycle_status: "archived" };
        cardItems = cardItems.filter((item) => item.id !== createdCard?.id);
        appendAuditEvent("archive", "card", createdCard.id);
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(archivedCard),
        });
        return;
      }
      const payload = createdCardRead();
      await route.fulfill({
        status: payload ? 200 : 404,
        contentType: "application/json",
        body: JSON.stringify(payload ?? { detail: "Not Found" }),
      });
      return;
    }
    if (
      url.pathname ===
      "/api/v1/cards/cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd/blocks/8d8d8d8d-8d8d-48d8-88d8-8d8d8d8d8d8d/instances"
    ) {
      const createdInstance = {
        id: "edededed-eded-4ede-8ede-edededededed",
        card_id: "cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd",
        block_id: "8d8d8d8d-8d8d-48d8-88d8-8d8d8d8d8d8d",
        ordinal: repeatableInstances.length,
      };
      repeatableInstances = [
        ...repeatableInstances,
        {
          block_instance_id: createdInstance.id,
          ordinal: createdInstance.ordinal,
          value: "",
        },
      ];
      appendAuditEvent("create", "card_block_instance", createdInstance.id);
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(createdInstance),
      });
      return;
    }
    if (url.pathname === "/api/v1/card-block-instances/edededed-eded-4ede-8ede-edededededed") {
      repeatableInstances = repeatableInstances.filter(
        (instance) => instance.block_instance_id !== "edededed-eded-4ede-8ede-edededededed",
      );
      appendAuditEvent("archive", "card_block_instance", "edededed-eded-4ede-8ede-edededededed");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "edededed-eded-4ede-8ede-edededededed",
          card_id: "cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd",
          block_id: "8d8d8d8d-8d8d-48d8-88d8-8d8d8d8d8d8d",
          ordinal: 0,
        }),
      });
      return;
    }
    if (url.pathname === "/api/v1/cards/cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd/values") {
      const body = request.postDataJSON() as {
        values: { field_id: string; value: unknown; block_instance_id?: string | null }[];
      };
      for (const item of body.values) {
        if (item.field_id === "99999999-9999-4999-8999-999999999999") {
          newCardStatusValue = String(item.value ?? "");
        }
        if (item.field_id === "99999999-9999-4999-8999-999999999998") {
          newCardApprovedValue = Boolean(item.value);
        }
        if (item.field_id === "9d9d9d9d-9d9d-49d9-89d9-9d9d9d9d9d9d") {
          newCardCommentValue = String(item.value ?? "");
          repeatableInstances = repeatableInstances.map((instance) =>
            instance.block_instance_id === item.block_instance_id
              ? { ...instance, value: newCardCommentValue }
              : instance,
          );
        }
      }
      appendAuditEvent("update", "field_values", "cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: body.values.map((item, index) => ({
            id: `field-value-${index}`,
            card_id: "cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd",
            block_instance_id: item.block_instance_id ?? null,
            field_id: item.field_id,
            value: item.value,
          })),
        }),
      });
      return;
    }
    if (
      url.pathname === "/api/v1/cards/cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd/attachments" ||
      url.pathname === "/api/v1/cards/cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd/generated-documents"
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [] }),
      });
      return;
    }
    if (url.pathname === "/api/v1/audit-events" && url.search === "?limit=20") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: auditItems }),
      });
      return;
    }
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
      if (request.method() === "POST") {
        const body = request.postDataJSON() as {
          code: string;
          name: string;
          description: string | null;
          template_body: string;
          output_filename_template: string;
        };
        const created = {
          id: "abababab-abab-4aba-8bab-abababababab",
          registry_id: "77777777-7777-4777-8777-777777777777",
          code: body.code,
          name: body.name,
          description: body.description,
          template_format: "docx_text_v1",
          output_filename_template: body.output_filename_template,
          output_content_type:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          is_active: true,
          created_at: "2026-06-28T12:05:00Z",
          archived_at: null,
        };
        documentTemplateItems = [...documentTemplateItems, created];
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
        body: JSON.stringify({ items: documentTemplateItems }),
      });
      return;
    }
    if (url.pathname === "/api/v1/document-templates/abababab-abab-4aba-8bab-abababababab") {
      const archived = {
        ...documentTemplateItems.find((item) => item.id === "abababab-abab-4aba-8bab-abababababab"),
        archived_at: "2026-06-28T12:06:00Z",
      };
      documentTemplateItems = documentTemplateItems.filter(
        (item) => item.id !== "abababab-abab-4aba-8bab-abababababab",
      );
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(archived),
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

  await page.getByRole("button", { name: "Пользователи", exact: true }).click();
  await expect(page.getByText("Технический код: users.manage")).toBeVisible();
  await expect(page.getByText("Технический код: system_admin")).toBeVisible();
  await expect(page.getByText("Системный администратор").first()).toBeVisible();
  await expect(page.getByText("Управление пользователями.")).toBeVisible();
  await expect(page.getByText("System admin", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Manage users.", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Реестры", exact: true }).click();
  await expect(page.getByRole("cell", { name: "Реестр активов", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Статус", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Справочники" })).toBeVisible();
  await expect(page.getByText("Статусы актива").first()).toBeVisible();

  await page.getByRole("button", { name: "Карточки", exact: true }).click();
  await expect(page.getByText("Карточка актива").first()).toBeVisible();
  const statusFieldForm = page.locator("form").filter({
    has: page.getByRole("button", { name: "Сохранить Статус" }),
  });
  await expect(statusFieldForm.getByLabel("Статус")).toHaveValue("drafted");
  await statusFieldForm.getByLabel("Статус").fill("published");
  await statusFieldForm.getByRole("button", { name: "Сохранить Статус" }).click();
  await expect(page.getByText("Сохранено: Статус")).toBeVisible();
  const approvedFieldForm = page.locator("form").filter({
    has: page.getByRole("button", { name: "Сохранить Подтверждено" }),
  });
  await approvedFieldForm.getByLabel("Подтверждено").check();
  await approvedFieldForm.getByRole("button", { name: "Сохранить Подтверждено" }).click();
  await expect(page.getByText("Сохранено: Подтверждено")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Вложения" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Документы" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Шаблоны документов" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Публичные ссылки" })).toBeVisible();
  await expect(page.getByText("Загрузки вложений: 1 из 3")).toBeVisible();
  await expect(page.getByText("Нет файлов")).toBeVisible();
  await expect(page.getByText("Нет документов")).toBeVisible();
  await page.getByLabel("Код шаблона").fill("acceptance_act");
  await page.getByLabel("Название шаблона").fill("Акт приема");
  await page.getByLabel("Описание шаблона").fill("Документ по карточке");
  await page.getByLabel("Шаблон имени файла").fill("{{ card.display_name }}-act.docx");
  await page.getByLabel("Текст шаблона").fill("Карточка: {{ card.display_name }}");
  await page.getByRole("button", { name: "Создать шаблон" }).click();
  await expect(page.getByText("Шаблон создан")).toBeVisible();
  await expect(page.getByLabel("Шаблоны документов").getByText("Акт приема")).toBeVisible();
  await page.getByRole("button", { name: "Архивировать шаблон Акт приема" }).click();
  await expect(page.getByText("Шаблон архивирован")).toBeVisible();
  await expect(page.getByLabel("Шаблоны документов").getByText("Акт приема")).toHaveCount(0);
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

  await page.getByRole("button", { name: "Создать карточку", exact: true }).click();
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  await expect(page.getByText("Заполните обязательные поля")).toBeVisible();
  await page.getByLabel("Название карточки").fill("Новая карточка");
  await page
    .getByLabel("Организация карточки")
    .selectOption("22222222-2222-4222-8222-222222222222");
  await page
    .getByLabel("Подразделение карточки")
    .selectOption("2f2f2f2f-2f2f-42f2-82f2-2f2f2f2f2f2f");
  await page.getByLabel("Публичный просмотр карточки").check();
  await page.getByLabel("Публичное редактирование карточки").check();
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  await expect(page.getByText("Карточка создана")).toBeVisible();
  await expect(page.getByText("Новая карточка").first()).toBeVisible();

  await page.getByRole("button", { name: "Редактировать карточку Новая карточка" }).click();
  await page.getByLabel("Название карточки").fill("Новая карточка обновлена");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.getByText("Карточка обновлена")).toBeVisible();
  await expect(page.getByText("Новая карточка обновлена").first()).toBeVisible();

  await page.getByRole("button", { name: "Добавить экземпляр блока Детали карточки" }).click();
  await expect(page.getByText("Экземпляр блока создан")).toBeVisible();
  const bulkForm = page.getByRole("form", { name: "Массовое сохранение полей" });
  await bulkForm.getByLabel("Статус").fill("published");
  await bulkForm.getByLabel("Подтверждено").check();
  await bulkForm.getByLabel("Комментарий").fill("Комментарий по карточке");
  await bulkForm.getByRole("button", { name: "Сохранить все поля" }).click();
  await expect(page.getByText("Поля карточки сохранены")).toBeVisible();
  await page
    .getByRole("button", {
      name: "Архивировать экземпляр блока Детали карточки экземпляр 1",
    })
    .click();
  await expect(page.getByText("Экземпляр блока архивирован")).toBeVisible();

  await page
    .getByRole("button", { name: "Архивировать карточку Новая карточка обновлена" })
    .click();
  const archiveCardDialog = page.getByRole("dialog", { name: "Архивировать карточку" });
  await expect(archiveCardDialog).toBeVisible();
  await archiveCardDialog.getByRole("button", { name: "Архивировать", exact: true }).click();
  await expect(page.getByText("Карточка архивирована")).toBeVisible();
  await expect(page.getByText("Карточка актива").first()).toBeVisible();

  await page.getByRole("button", { name: "Аудит", exact: true }).click();
  await expect(page.getByText("Создание").first()).toBeVisible();
  await expect(page.getByText("Архивация").first()).toBeVisible();
  await expect(page.getByText("Обновление").first()).toBeVisible();

  const adminSections = [
    { button: "Обзор", expectedLabel: "Сводка" },
    { button: "Организации", expectedText: "Главная организация" },
    { button: "Реестры", expectedText: "Реестр активов" },
    { button: "Карточки", expectedText: "Карточка актива" },
    { button: "Пользователи", expectedText: "Управление пользователями." },
    { button: "Доступ", expectedText: "С потомками" },
    { button: "Аудит", expectedText: "Создание" },
  ];

  for (const section of adminSections) {
    await page.getByRole("button", { name: section.button, exact: true }).click();
    if ("expectedLabel" in section) {
      await expect(page.getByLabel(section.expectedLabel, { exact: true })).toBeVisible();
    } else {
      await expect(page.getByText(section.expectedText).first()).toBeVisible();
    }
  }

  expect(consoleErrors).toEqual([]);
});

test("renders public-link edit page and saves a field", async ({ page }) => {
  let publicStatusValue = "drafted";
  let forbiddenDocumentEndpointCalls = 0;
  let publicAttachmentItems: Array<{
    id: string;
    card_id: string;
    title: string;
    description: string | null;
    position: number;
    original_filename: string;
    content_type: string;
    content_length_bytes: number;
    scanner_status: string;
    created_at: string;
    archived_at: string | null;
  }> = [];
  let editRequestBody: {
    raw_token?: string;
    field_id?: string;
    value?: unknown;
    block_instance_id?: string | null;
  } | null = null;

  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const request = route.request();
    if (
      url.pathname.includes("generated-documents") ||
      url.pathname.includes("document-templates")
    ) {
      forbiddenDocumentEndpointCalls += 1;
    }
    if (url.pathname === "/api/v1/public-links/attachments") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: publicAttachmentItems }),
      });
      return;
    }
    if (url.pathname === "/api/v1/public-links/attachments/upload") {
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
      publicAttachmentItems = [created];
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(created),
      });
      return;
    }
    if (
      url.pathname ===
      "/api/v1/public-links/attachments/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee/content"
    ) {
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/plain",
          "X-Attachment-Filename": "public.txt",
        },
        body: "public-bytes",
      });
      return;
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
      editRequestBody = request.postDataJSON() as typeof editRequestBody;
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
  await expect(page.getByRole("heading", { name: "Вложения" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Документы" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Шаблоны документов" })).toHaveCount(0);
  await expect(page.getByText("Нет файлов")).toBeVisible();

  await page.getByLabel("Публичный статус").fill("submitted");
  await page.getByRole("button", { name: "Сохранить Публичный статус" }).click();

  await expect(page.getByText("Сохранено: Публичный статус")).toBeVisible();
  expect(editRequestBody).toEqual({
    raw_token: "public-token",
    field_id: "99999999-9999-4999-8999-999999999997",
    value: "submitted",
    block_instance_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  });

  await page.getByLabel("Название файла").fill("Публичный акт");
  await page.getByLabel("Файл", { exact: true }).setInputFiles({
    name: "public.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("public bytes"),
  });
  await page.getByRole("button", { name: "Загрузить файл" }).click();
  await expect(page.getByText("Файл загружен")).toBeVisible();
  await expect(page.getByText("Публичный акт")).toBeVisible();
  await expect(page.getByRole("button", { name: /Архивировать файл/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Скачать файл Публичный акт" }).click();
  await expect(page.getByText("Файл скачан")).toBeVisible();

  expect(forbiddenDocumentEndpointCalls).toBe(0);
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
  if (pathname === "/api/v1/registries/77777777-7777-4777-8777-777777777777/reference-lists") {
    return apiPayloads.referenceLists;
  }
  if (pathname === "/api/v1/reference-lists/abababab-abab-4aba-8aba-abababababab/items") {
    return apiPayloads.referenceItems;
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
