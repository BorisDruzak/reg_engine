import { expect, test } from "@playwright/test";

test.use({ reducedMotion: "reduce" });

const apiPayloads = {
  login: {
    access_token: "test-token",
    token_type: "bearer",
    expires_at: "2099-06-28T12:00:00Z",
    user: {
      id: "11111111-1111-4111-8111-111111111111",
      email: "admin@example.test",
      display_name: "Системный администратор",
      status: "active",
      is_superuser: true,
      role_code: "administrator",
      organization_ids: [],
      can_manage_access: true,
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
        role_code: "administrator",
        organization_ids: [],
        can_manage_access: true,
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
        id: "99999999-9999-4999-8999-999999999990",
        block_id: "88888888-8888-4888-8888-888888888888",
        code: "fio",
        label: "ФИО",
        description: null,
        field_type: "text",
        position: 2,
        options_source_type: null,
        options_source_id: null,
        is_active: true,
        public_visible: true,
        public_editable: false,
      },
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
    templates: [
      {
        id: "71717171-7171-4171-8171-717171717171",
        registry_id: "77777777-7777-4777-8777-777777777777",
        code: "default_card",
        name: "Типовая карточка",
        description: null,
        position: 0,
        field_schema_json: {
          field_ids: [
            "99999999-9999-4999-8999-999999999990",
            "99999999-9999-4999-8999-999999999999",
            "99999999-9999-4999-8999-999999999998",
            "9d9d9d9d-9d9d-49d9-89d9-9d9d9d9d9d9d",
          ],
        },
        default_values_json: [
          {
            field_id: "99999999-9999-4999-8999-999999999999",
            value: "drafted",
          },
        ],
        is_active: true,
        created_at: "2026-06-28T12:00:00Z",
        archived_at: null,
      },
    ],
  },
  cards: {
    items: [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        registry_id: "77777777-7777-4777-8777-777777777777",
        card_template_id: "71717171-7171-4171-8171-717171717171",
        card_template_name: "Типовая карточка",
        organization_id: "22222222-2222-4222-8222-222222222222",
        org_unit_id: null,
        display_value: "Иванов Иван Иванович",
        lifecycle_status: "active",
        public_view_enabled: false,
        public_edit_enabled: true,
      },
    ],
  },
  cardRead: {
    can_manage: true,
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    registry_id: "77777777-7777-4777-8777-777777777777",
    card_template_id: "71717171-7171-4171-8171-717171717171",
    card_template_name: "Типовая карточка",
    organization_id: "22222222-2222-4222-8222-222222222222",
    display_value: "Иванов Иван Иванович",
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
      fio: {
        field_id: "99999999-9999-4999-8999-999999999990",
        code: "fio",
        field_type: "text",
        value: "Иванов Иван Иванович",
      },
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
        output_filename_template: "{{ card.display_value }}.docx",
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
    display_value: "Петров Петр Петрович",
    lifecycle_status: "active",
    expires_at: "2099-06-29T12:00:00Z",
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
                public_editable: true,
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
    card_template_id: string;
    card_template_name?: string | null;
    display_value: string;
    lifecycle_status: string;
    public_view_enabled: boolean;
    public_edit_enabled: boolean;
  } | null = null;
  let repeatableInstances: { block_instance_id: string; ordinal: number; value: string }[] = [];
  const repeatableWrites: Array<{ method: string; body: unknown }> = [];
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
      can_manage: true,
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
    const auxiliary = cardAuxiliaryPayload(url.pathname, apiPayloads.schema);
    if (auxiliary) {
      await route.fulfill({ json: auxiliary });
      return;
    }
    if (url.pathname === "/api/v1/organizations/22222222-2222-4222-8222-222222222222/org-units") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(apiPayloads.orgUnits),
      });
      return;
    }
    const organizationCardsMatch = url.pathname.match(
      /^\/api\/v1\/organizations\/([^/]+)\/cards(?:\/draft)?$/,
    );
    if (organizationCardsMatch) {
      if (request.method() === "POST") {
        const body = request.postDataJSON() as {
          public_access: { public_view_enabled: boolean; public_edit_enabled: boolean };
        };
        expect(Object.keys(body)).toEqual(["public_access"]);
        const template = apiPayloads.schema.templates[0];
        createdCard = {
          id: "cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd",
          registry_id: "77777777-7777-4777-8777-777777777777",
          organization_id: organizationCardsMatch[1],
          org_unit_id: null,
          card_template_id: template.id,
          card_template_name: template.name,
          display_value: "Не заполнено",
          lifecycle_status: "draft",
          public_view_enabled: body.public_access.public_view_enabled,
          public_edit_enabled: body.public_access.public_edit_enabled,
        };
        newCardStatusValue = String(template?.default_values_json[0]?.value ?? "");
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
    if (url.pathname === "/api/v1/registries/77777777-7777-4777-8777-777777777777/cards") {
      if (request.method() === "POST") {
        const body = request.postDataJSON() as {
          organization_id: string;
          org_unit_id?: string | null;
          card_template_id?: string | null;
          public_view_enabled?: boolean;
          public_edit_enabled?: boolean;
        };
        const template =
          apiPayloads.schema.templates.find((item) => item.id === body.card_template_id) ??
          apiPayloads.schema.templates[0];
        createdCard = {
          id: "cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd",
          registry_id: "77777777-7777-4777-8777-777777777777",
          organization_id: body.organization_id,
          org_unit_id: body.org_unit_id ?? null,
          card_template_id: template.id,
          card_template_name: template.name,
          display_value: "Не заполнено",
          lifecycle_status: "draft",
          public_view_enabled: Boolean(body.public_view_enabled),
          public_edit_enabled: Boolean(body.public_edit_enabled),
        };
        newCardStatusValue = String(template?.default_values_json[0]?.value ?? "");
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
          public_view_enabled?: boolean | null;
          public_edit_enabled?: boolean | null;
        };
        createdCard = {
          ...createdCard,
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
      "/api/v1/cards/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/blocks/8d8d8d8d-8d8d-48d8-88d8-8d8d8d8d8d8d/instances"
    ) {
      repeatableWrites.push({ method: request.method(), body: request.postDataJSON() });
      const createdInstance = {
        id: "edededed-eded-4ede-8ede-edededededed",
        card_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
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
      repeatableWrites.push({ method: request.method(), body: request.postDataJSON() });
      repeatableInstances = repeatableInstances.filter(
        (instance) => instance.block_instance_id !== "edededed-eded-4ede-8ede-edededededed",
      );
      appendAuditEvent("archive", "card_block_instance", "edededed-eded-4ede-8ede-edededededed");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "edededed-eded-4ede-8ede-edededededed",
          card_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
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
    if (url.pathname === "/api/v1/audit-events") {
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
    if (
      url.pathname === "/api/v1/registries/77777777-7777-4777-8777-777777777777/report-templates" ||
      url.pathname === "/api/v1/registries/77777777-7777-4777-8777-777777777777/report-runs"
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [] }),
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
      repeatableInstances,
    });
    if (url.pathname === "/api/v1/cards/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/values") {
      const body = request.postDataJSON() as {
        basis_text?: string;
        values: { field_id: string; value: unknown; block_instance_id?: string | null }[];
      };
      const changesRepeatableInstance = body.values.some((item) => Boolean(item.block_instance_id));
      expect(body.basis_text).toBe(
        changesRepeatableInstance ? "Приказ об уточнении сведений 44" : "Приказ об изменении 42",
      );
      if (changesRepeatableInstance) repeatableWrites.push({ method: request.method(), body });
      for (const item of body.values) {
        if (item.field_id === "99999999-9999-4999-8999-999999999999") {
          cardStatusValue = String(item.value ?? "");
        }
        if (item.field_id === "99999999-9999-4999-8999-999999999998") {
          cardApprovedValue = Boolean(item.value);
        }
        if (item.field_id === "9d9d9d9d-9d9d-49d9-89d9-9d9d9d9d9d9d") {
          repeatableInstances = repeatableInstances.map((instance) =>
            instance.block_instance_id === item.block_instance_id
              ? { ...instance, value: String(item.value ?? "") }
              : instance,
          );
        }
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: body.values.map((item, index) => ({
            id: `bulk-existing-${index}`,
            card_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            block_instance_id: item.block_instance_id ?? null,
            field_id: item.field_id,
            value: item.value,
          })),
        }),
      });
      return;
    }
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
  await expect(page.getByRole("cell", { name: "Администратор", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Все организации", exact: true })).toBeVisible();
  await expect(page.getByText("Системный администратор").first()).toBeVisible();
  await expect(page.getByText("System admin", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Реестры", exact: true }).click();
  await page.getByRole("tab", { name: "Расширенное" }).click();
  await page.getByRole("tab", { name: "Реестры" }).click();
  await expect(page.getByRole("cell", { name: "Реестр активов", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Схема карточки" }).click();
  const schemaEditor = page.getByRole("region", {
    name: "Визуальный редактор схемы карточки",
  });
  await expect(schemaEditor.getByText("Статус").first()).toBeVisible();
  await page.getByRole("tab", { name: "Расширенное" }).click();
  await page.getByRole("tab", { name: "Справочники" }).click();
  await expect(page.getByRole("heading", { name: "Справочники" })).toBeVisible();
  await expect(page.getByText("Статусы актива").first()).toBeVisible();

  await page.getByRole("button", { name: "Карточки", exact: true }).click();
  await expect(page.getByText("Иванов Иван Иванович").first()).toBeVisible();
  await page.getByRole("button", { name: /Иванов Иван Иванович/ }).dblclick();
  await page.getByTestId("filled-field-item-99999999-9999-4999-8999-999999999999").click();
  await expect(page.getByLabel("Статус", { exact: true })).toHaveValue("drafted");
  await page.getByLabel("Статус", { exact: true }).fill("published");
  await page.getByLabel("Подтверждено", { exact: true }).check();
  await expect(page.getByRole("button", { name: "Сохранить блок" })).toBeDisabled();
  await page.getByLabel("Основание изменения").fill("Приказ об изменении 42");
  await page.getByRole("button", { name: "Сохранить блок" }).click();
  await expect(page.getByLabel("Основание изменения")).toHaveCount(0);

  await page.locator("#card-base-block").getByText("Публичный доступ", { exact: true }).click();
  await page.getByRole("button", { name: "Добавить экземпляр блока Детали карточки" }).click();
  const createInstanceDialog = page.getByRole("dialog", {
    name: "Добавить экземпляр блока",
    exact: true,
  });
  await expect(
    createInstanceDialog.getByRole("button", { name: "Сохранить", exact: true }),
  ).toBeDisabled();
  expect(repeatableWrites).toEqual([]);
  await createInstanceDialog
    .getByLabel("Основание изменения")
    .fill("Приказ о добавлении сведений 43");
  await createInstanceDialog.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(createInstanceDialog).toHaveCount(0);
  await page
    .locator(
      '[data-filled-card-instance="edededed-eded-4ede-8ede-edededededed"] [data-card-field-id="9d9d9d9d-9d9d-49d9-89d9-9d9d9d9d9d9d"]',
    )
    .click();
  await page.getByLabel("Комментарий", { exact: true }).fill("Сведения по приказу");
  await expect(page.getByRole("button", { name: "Сохранить блок", exact: true })).toBeDisabled();
  await page.getByLabel("Основание изменения").fill("Приказ об уточнении сведений 44");
  await page.getByRole("button", { name: "Сохранить блок", exact: true }).click();
  await expect(page.getByLabel("Основание изменения")).toHaveCount(0);
  await expect(page.getByText("Сведения по приказу", { exact: true })).toBeVisible();
  const archiveInstanceButton = page.getByRole("button", {
    name: "Архивировать экземпляр блока Детали карточки экземпляр 1",
  });
  await archiveInstanceButton.click();
  const archiveInstanceDialog = page.getByRole("dialog", {
    name: "Архивировать экземпляр блока",
    exact: true,
  });
  await expect(
    archiveInstanceDialog.getByRole("button", { name: "Сохранить", exact: true }),
  ).toBeDisabled();
  await archiveInstanceDialog
    .getByLabel("Основание изменения")
    .fill("Приказ об исключении сведений 45");
  await archiveInstanceDialog.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(archiveInstanceDialog).toHaveCount(0);
  await expect(archiveInstanceButton).toHaveCount(0);
  await expect(
    page.locator('[data-filled-card-instance="edededed-eded-4ede-8ede-edededededed"]'),
  ).toHaveCount(0);
  expect(repeatableWrites).toEqual([
    { method: "POST", body: { basis_text: "Приказ о добавлении сведений 43" } },
    {
      method: "PATCH",
      body: {
        basis_text: "Приказ об уточнении сведений 44",
        values: [
          {
            field_id: "9d9d9d9d-9d9d-49d9-89d9-9d9d9d9d9d9d",
            block_instance_id: "edededed-eded-4ede-8ede-edededededed",
            value: "Сведения по приказу",
          },
        ],
      },
    },
    { method: "DELETE", body: { basis_text: "Приказ об исключении сведений 45" } },
  ]);

  await page.getByRole("tab", { name: "Список карточек" }).click();
  await page.getByRole("tab", { name: "Создать карточку", exact: true }).click();
  await expect(page.getByLabel("Организация карточки")).toHaveValue("");
  await expect(page.getByRole("button", { name: "Сохранить черновик" })).toBeDisabled();
  await expect(page.getByLabel("Шаблон карточки")).toHaveCount(0);
  await page
    .getByLabel("Организация карточки")
    .selectOption("22222222-2222-4222-8222-222222222222");
  await page.getByRole("button", { name: "Сохранить черновик" }).focus();
  await page.getByRole("button", { name: "Сохранить черновик" }).press("Enter");
  await expect(page.getByRole("tab", { name: "Не заполнено", exact: true })).toBeVisible();
  await expect(page.getByLabel("Статус карточки")).toHaveText("Черновик");
  await expect(page.getByRole("status").filter({ hasText: "Типовая карточка" })).toBeVisible();
  await page.getByRole("button", { name: "Архивировать карточку Не заполнено" }).click();
  const archiveCardDialog = page.getByRole("dialog", { name: /Архивировать карточку/ });
  await expect(archiveCardDialog).toBeVisible();
  await expect(archiveCardDialog.getByLabel("Основание изменения")).toHaveCount(0);
  await archiveCardDialog.getByRole("button", { name: "Архивировать", exact: true }).click();
  await expect(archiveCardDialog).toHaveCount(0);
  await expect(page.getByText("Иванов Иван Иванович").first()).toBeVisible();

  await page.getByRole("button", { name: "Аудит", exact: true }).click();
  await page.getByRole("tab", { name: "Технический аудит" }).click();
  await expect(page.getByText("Создание").first()).toBeVisible();
  await expect(page.getByText("Архивация").first()).toBeVisible();

  for (const section of ["Обзор", "Организации", "Реестры", "Карточки", "Пользователи", "Аудит"]) {
    await page.getByRole("button", { name: section, exact: true }).click();
    await expect(page.getByRole("heading", { name: section, exact: true, level: 2 })).toBeVisible();
  }

  expect(consoleErrors).toEqual([]);
});

test("validates complete admin setup path through Russian UI", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    consoleErrors.push(error.message);
  });
  const unhandledApiRequests: string[] = [];

  const ids = {
    organization: "81818181-8181-4818-8818-818181818181",
    user: "91919191-9191-4919-8919-919191919191",
    registry: "71717171-7171-4717-8717-717171717171",
    accessGrant: "73737373-7373-4737-8737-737373737373",
    block: "41414141-4141-4414-8414-414141414141",
    referenceList: "61616161-6161-4616-8616-616161616161",
    referenceItem: "51515151-5151-4515-8515-515151515151",
    field: "31313131-3131-4313-8313-313131313131",
    fileRefField: "32323232-3232-4323-8323-323232323232",
    card: "21212121-2121-4212-8212-212121212121",
    attachment: "11111111-aaaa-4111-8111-111111111111",
    template: "12121212-aaaa-4212-8212-121212121212",
    document: "13131313-aaaa-4313-8313-131313131313",
    publicLink: "14141414-aaaa-4414-8414-141414141414",
  };
  const rootOrganizationId = "22222222-2222-4222-8222-222222222222";

  type SetupOrganization = {
    id: string;
    parent_id: string | null;
    code: string;
    name: string;
    type: string;
    is_active: boolean;
  };
  type SetupOrganizationTreeNode = SetupOrganization & {
    children: SetupOrganizationTreeNode[];
  };
  type SetupUser = {
    id: string;
    email: string;
    display_name: string;
    status: string;
    is_superuser: boolean;
    archived_at: string | null;
  };
  type SetupRegistry = {
    id: string;
    code: string;
    name: string;
    description: string | null;
    lifecycle_status: string;
    schema_version: number;
    owner_organization_id: string | null;
    is_default_for_owner_tree: boolean;
  };
  type SetupAccessGrant = {
    id: string;
    user_id: string;
    role_id: string;
    registry_id: string | null;
    organization_id: string | null;
    include_descendants: boolean;
    valid_from: string | null;
    valid_to: string | null;
    created_by: string | null;
    archived_at: string | null;
  };
  type SetupBlock = {
    id: string;
    registry_id: string;
    code: string;
    title: string;
    description: string | null;
    position: number;
    is_repeatable: boolean;
    is_active: boolean;
    public_visible: boolean;
    public_editable: boolean;
  };
  type SetupField = {
    id: string;
    block_id: string;
    code: string;
    label: string;
    description: string | null;
    field_type: string;
    position: number;
    options_source_type: string | null;
    options_source_id: string | null;
    is_active: boolean;
    public_visible: boolean;
    public_editable: boolean;
  };
  type SetupCardTemplate = {
    id: string;
    registry_id: string;
    code: string;
    name: string;
    description: string | null;
    position: number;
    field_schema_json: { field_ids?: string[] } | null;
    default_values_json: { field_id: string; value: unknown }[];
    is_active: boolean;
    created_at: string;
    archived_at: string | null;
  };
  type SetupReferenceList = {
    id: string;
    registry_id: string | null;
    owner_organization_id: string | null;
    code: string;
    name: string;
    description: string | null;
    inherit_to_descendants: boolean;
    locked_for_descendants: boolean;
    managed_by_system_only: boolean;
    is_active: boolean;
  };
  type SetupReferenceItem = {
    id: string;
    list_id: string;
    parent_id: string | null;
    code: string;
    label: string;
    description: string | null;
    position: number;
    is_active: boolean;
  };
  type SetupCard = {
    id: string;
    registry_id: string;
    card_template_id: string;
    card_template_name?: string | null;
    organization_id: string;
    org_unit_id: string | null;
    display_value: string;
    lifecycle_status: string;
    public_view_enabled: boolean;
    public_edit_enabled: boolean;
  };

  let organizations: SetupOrganization[] = [
    {
      id: rootOrganizationId,
      parent_id: null,
      code: "root",
      name: "Главная организация",
      type: "organization",
      is_active: true,
    },
  ];
  let users: SetupUser[] = [
    {
      ...apiPayloads.login.user,
      archived_at: null,
    },
  ];
  let registries: SetupRegistry[] = [];
  let grants: SetupAccessGrant[] = [];
  let blocks: SetupBlock[] = [];
  let fields: SetupField[] = [];
  let cardTemplates: SetupCardTemplate[] = [];
  let referenceLists: SetupReferenceList[] = [];
  let referenceItems: SetupReferenceItem[] = [];
  let cards: SetupCard[] = [];
  let cardFieldValues: Record<string, unknown> = {};
  let attachments: Array<{
    id: string;
    card_id: string;
    stored_file_id: string;
    title: string | null;
    description: string | null;
    position: number;
    original_filename: string;
    content_type: string;
    content_length_bytes: number;
    checksum_sha256: string;
    scanner_status: string;
    created_at: string;
    archived_at: string | null;
  }> = [];
  let documentTemplates: Array<{
    id: string;
    registry_id: string;
    code: string;
    name: string;
    description: string | null;
    template_format: string;
    output_filename_template: string;
    output_content_type: string;
    is_active: boolean;
    created_at: string;
    archived_at: string | null;
  }> = [];
  let generatedDocuments: Array<{
    id: string;
    card_id: string;
    template_id: string;
    stored_file_id: string | null;
    title: string;
    output_filename: string;
    content_type: string;
    render_status: string;
    created_at: string;
    archived_at: string | null;
  }> = [];
  let publicLinks: Array<{
    id: string;
    card_id: string;
    status: string;
    can_view: boolean;
    can_edit: boolean;
    expires_at: string;
    max_uses: number | null;
    used_count: number;
    max_attachment_uploads: number | null;
    attachment_upload_count: number;
    disabled_at: string | null;
  }> = [];
  let auditItems: Array<{
    id: string;
    actor_type: string;
    actor_user_id: string | null;
    actor_public_link_id: string | null;
    action: string;
    object_type: string;
    object_id: string | null;
    source: string;
    ip_address: string | null;
    user_agent: string | null;
    request_id: string | null;
    created_at: string;
  }> = [];

  const appendAuditEvent = (action: string, objectType: string, objectId: string) => {
    const eventNumber = String(auditItems.length + 1).padStart(2, "0");
    auditItems = [
      {
        id: `setup-audit-${eventNumber}`,
        actor_type: "user",
        actor_user_id: apiPayloads.login.user.id,
        actor_public_link_id: null,
        action,
        object_type: objectType,
        object_id: objectId,
        source: "api",
        ip_address: null,
        user_agent: null,
        request_id: `setup-${eventNumber}`,
        created_at: `2026-06-28T12:${eventNumber}:00Z`,
      },
      ...auditItems,
    ];
  };
  const organizationTreePayload = (): { items: SetupOrganizationTreeNode[] } => {
    const build = (parentId: string | null): SetupOrganizationTreeNode[] =>
      organizations
        .filter((organization) => organization.parent_id === parentId)
        .map((organization) => ({
          ...organization,
          children: build(organization.id),
        }));

    return { items: build(null) };
  };

  const cardReadPayload = (cardId: string) => {
    const card = cards.find((item) => item.id === cardId);
    const registryBlocks = blocks.filter((block) => block.registry_id === card?.registry_id);
    if (!card) {
      return null;
    }
    const blocksPayload = Object.fromEntries(
      registryBlocks.map((block) => {
        const blockFields = fields.filter((field) => field.block_id === block.id);
        return [
          block.code,
          {
            block_id: block.id,
            code: block.code,
            instances: [
              {
                block_instance_id: null,
                ordinal: 0,
                fields: Object.fromEntries(
                  blockFields.map((field) => [
                    field.code,
                    {
                      field_id: field.id,
                      code: field.code,
                      field_type: field.field_type,
                      value: cardFieldValues[field.id] ?? "",
                    },
                  ]),
                ),
              },
            ],
          },
        ];
      }),
    );
    const flatFields = Object.fromEntries(
      fields
        .filter((field) => registryBlocks.some((block) => block.id === field.block_id))
        .map((field) => [
          field.code,
          {
            field_id: field.id,
            code: field.code,
            field_type: field.field_type,
            value: cardFieldValues[field.id] ?? "",
          },
        ]),
    );
    return {
      ...card,
      blocks: blocksPayload,
      fields: flatFields,
    };
  };

  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const request = route.request();

    const auxiliary = cardAuxiliaryPayload(url.pathname, {
      registry: registries[0] ?? apiPayloads.schema.registry,
      blocks,
      fields,
      templates: cardTemplates,
    });
    if (auxiliary) {
      await route.fulfill({ json: auxiliary });
      return;
    }

    if (url.pathname === "/api/v1/auth/login") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(apiPayloads.login),
      });
      return;
    }

    if (url.pathname === "/api/v1/auth/me") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(apiPayloads.login.user),
      });
      return;
    }
    if (url.pathname === "/api/v1/organizations/tree") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(organizationTreePayload()),
      });
      return;
    }
    if (url.pathname === "/api/v1/organizations") {
      if (request.method() === "POST") {
        const body = request.postDataJSON() as {
          code: string;
          name: string;
          parent_id?: string | null;
          organization_type?: string | null;
        };
        const created = {
          id: ids.organization,
          parent_id: body.parent_id ?? null,
          code: body.code,
          name: body.name,
          type: body.organization_type ?? "organization",
          is_active: true,
        };
        organizations = [...organizations, created];
        appendAuditEvent("create", "organization", created.id);
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
        body: JSON.stringify({ items: organizations }),
      });
      return;
    }
    if (url.pathname === "/api/v1/users") {
      if (request.method() === "POST") {
        const body = request.postDataJSON() as {
          email: string;
          display_name: string;
          status?: string;
          is_superuser?: boolean;
        };
        const created = {
          id: ids.user,
          email: body.email,
          display_name: body.display_name,
          status: body.status ?? "active",
          is_superuser: Boolean(body.is_superuser),
          role_code: "administrator",
          organization_ids: [],
          can_manage_access: false,
          archived_at: null,
        };
        users = [...users, created];
        appendAuditEvent("create", "user", created.id);
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
        body: JSON.stringify({ items: users }),
      });
      return;
    }
    if (url.pathname === "/api/v1/roles") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(apiPayloads.roles),
      });
      return;
    }
    if (url.pathname === "/api/v1/permissions") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(apiPayloads.permissions),
      });
      return;
    }
    if (url.pathname === "/api/v1/access-grants") {
      if (request.method() === "POST") {
        const body = request.postDataJSON() as Omit<
          SetupAccessGrant,
          "id" | "created_by" | "archived_at"
        >;
        const created = {
          id: ids.accessGrant,
          user_id: body.user_id,
          role_id: body.role_id,
          registry_id: body.registry_id ?? null,
          organization_id: body.organization_id ?? null,
          include_descendants: Boolean(body.include_descendants),
          valid_from: body.valid_from ?? null,
          valid_to: body.valid_to ?? null,
          created_by: apiPayloads.login.user.id,
          archived_at: null,
        };
        grants = [...grants, created];
        appendAuditEvent("create", "access_grant", created.id);
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
        body: JSON.stringify({ items: grants }),
      });
      return;
    }
    if (url.pathname === "/api/v1/registries") {
      if (request.method() === "POST") {
        const body = request.postDataJSON() as {
          code: string;
          name: string;
          description?: string | null;
        };
        const created = {
          id: ids.registry,
          code: body.code,
          name: body.name,
          description: body.description ?? null,
          lifecycle_status: "draft",
          schema_version: 1,
          owner_organization_id: rootOrganizationId,
          is_default_for_owner_tree: true,
        };
        registries = [...registries, created];
        appendAuditEvent("create", "registry", created.id);
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
        body: JSON.stringify({ items: registries }),
      });
      return;
    }
    if (url.pathname === `/api/v1/registries/${ids.registry}/schema`) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          registry: registries.find((registry) => registry.id === ids.registry),
          blocks,
          fields,
          templates: cardTemplates,
        }),
      });
      return;
    }
    if (url.pathname === `/api/v1/registries/${ids.registry}/card-templates`) {
      if (request.method() === "POST") {
        const body = request.postDataJSON() as {
          code: string;
          name: string;
          description?: string | null;
          position?: number;
          field_schema_json?: { field_ids?: string[] } | null;
          default_values_json?: { field_id: string; value: unknown }[];
        };
        const created = {
          id: "16161616-aaaa-4616-8616-161616161616",
          registry_id: ids.registry,
          code: body.code,
          name: body.name,
          description: body.description ?? null,
          position: body.position ?? cardTemplates.length,
          field_schema_json: body.field_schema_json ?? null,
          default_values_json: body.default_values_json ?? [],
          is_active: true,
          created_at: "2026-06-28T12:20:00Z",
          archived_at: null,
        };
        cardTemplates = [...cardTemplates, created];
        appendAuditEvent("create", "card_template", created.id);
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
        body: JSON.stringify({ items: cardTemplates }),
      });
      return;
    }
    const setupCardTemplateMatch = url.pathname.match(/^\/api\/v1\/card-templates\/([^/]+)$/);
    if (setupCardTemplateMatch) {
      const templateId = setupCardTemplateMatch[1];
      const current = cardTemplates.find((template) => template.id === templateId);
      if (!current) {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Not Found" }),
        });
        return;
      }
      if (request.method() === "PATCH") {
        const body = request.postDataJSON() as Partial<SetupCardTemplate>;
        const updated = {
          ...current,
          name: body.name ?? current.name,
          description: Object.hasOwn(body, "description")
            ? (body.description ?? null)
            : current.description,
          position: body.position ?? current.position,
          field_schema_json: Object.hasOwn(body, "field_schema_json")
            ? (body.field_schema_json ?? null)
            : current.field_schema_json,
          default_values_json: body.default_values_json ?? current.default_values_json,
          is_active: body.is_active ?? current.is_active,
        };
        cardTemplates = cardTemplates.map((template) =>
          template.id === templateId ? updated : template,
        );
        appendAuditEvent("update", "card_template", templateId);
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(updated),
        });
        return;
      }
      if (request.method() === "DELETE") {
        const archived = {
          ...current,
          is_active: false,
          archived_at: "2026-06-28T12:30:00Z",
        };
        cardTemplates = cardTemplates.map((template) =>
          template.id === templateId ? archived : template,
        );
        appendAuditEvent("archive", "card_template", templateId);
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(archived),
        });
        return;
      }
      await route.fulfill({
        status: 405,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Method Not Allowed" }),
      });
      return;
    }
    if (url.pathname === `/api/v1/registries/${ids.registry}/blocks`) {
      const body = request.postDataJSON() as {
        code: string;
        title: string;
        description?: string | null;
        position?: number;
        is_repeatable?: boolean;
        public_visible?: boolean;
        public_editable?: boolean;
      };
      const created = {
        id: ids.block,
        registry_id: ids.registry,
        code: body.code,
        title: body.title,
        description: body.description ?? null,
        position: body.position ?? 0,
        is_repeatable: Boolean(body.is_repeatable),
        is_active: true,
        public_visible: body.public_visible ?? true,
        public_editable: body.public_editable ?? false,
      };
      blocks = [...blocks, created];
      appendAuditEvent("create", "form_block", created.id);
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(created),
      });
      return;
    }
    if (url.pathname === `/api/v1/blocks/${ids.block}/fields`) {
      const body = request.postDataJSON() as {
        code: string;
        label: string;
        field_type: string;
        description?: string | null;
        position?: number;
        options_source_type?: string | null;
        options_source_id?: string | null;
        public_visible?: boolean;
        public_editable?: boolean;
      };
      const created = {
        id: body.field_type === "file_ref" ? ids.fileRefField : ids.field,
        block_id: ids.block,
        code: body.code,
        label: body.label,
        description: body.description ?? null,
        field_type: body.field_type,
        position: body.position ?? 0,
        options_source_type: body.options_source_type ?? null,
        options_source_id: body.options_source_id ?? null,
        is_active: true,
        public_visible: body.public_visible ?? true,
        public_editable: body.public_editable ?? false,
      };
      fields = [...fields, created];
      appendAuditEvent("create", "form_field", created.id);
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(created),
      });
      return;
    }
    if (url.pathname === `/api/v1/registries/${ids.registry}/reference-lists`) {
      if (request.method() === "POST") {
        const body = request.postDataJSON() as {
          code: string;
          name: string;
          owner_organization_id?: string | null;
          description?: string | null;
          inherit_to_descendants?: boolean;
          locked_for_descendants?: boolean;
          managed_by_system_only?: boolean;
        };
        const created = {
          id: ids.referenceList,
          registry_id: ids.registry,
          owner_organization_id: body.owner_organization_id ?? null,
          code: body.code,
          name: body.name,
          description: body.description ?? null,
          inherit_to_descendants: Boolean(body.inherit_to_descendants),
          locked_for_descendants: Boolean(body.locked_for_descendants),
          managed_by_system_only: Boolean(body.managed_by_system_only),
          is_active: true,
        };
        referenceLists = [...referenceLists, created];
        appendAuditEvent("create", "reference_list", created.id);
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
        body: JSON.stringify({ items: referenceLists }),
      });
      return;
    }
    if (url.pathname === `/api/v1/reference-lists/${ids.referenceList}/items`) {
      if (request.method() === "POST") {
        const body = request.postDataJSON() as {
          code: string;
          label: string;
          parent_id?: string | null;
          description?: string | null;
          position?: number;
        };
        const created = {
          id: ids.referenceItem,
          list_id: ids.referenceList,
          parent_id: body.parent_id ?? null,
          code: body.code,
          label: body.label,
          description: body.description ?? null,
          position: body.position ?? 0,
          is_active: true,
        };
        referenceItems = [...referenceItems, created];
        appendAuditEvent("create", "reference_item", created.id);
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
        body: JSON.stringify({ items: referenceItems }),
      });
      return;
    }
    if (/^\/api\/v1\/organizations\/[^/]+\/org-units$/.test(url.pathname)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [] }),
      });
      return;
    }
    const setupOrganizationCardsMatch = url.pathname.match(
      /^\/api\/v1\/organizations\/([^/]+)\/cards(?:\/draft)?$/,
    );
    if (setupOrganizationCardsMatch) {
      if (request.method() === "POST") {
        const body = request.postDataJSON() as {
          card_template_id?: string | null;
          public_view_enabled?: boolean;
          public_edit_enabled?: boolean;
        };
        const template =
          cardTemplates.find((item) => item.id === body.card_template_id) ?? cardTemplates[0];
        const created = {
          id: ids.card,
          registry_id: ids.registry,
          card_template_id: template.id,
          card_template_name: template.name,
          organization_id: setupOrganizationCardsMatch[1],
          org_unit_id: null,
          display_value: "Не заполнено",
          lifecycle_status: "draft",
          public_view_enabled: Boolean(body.public_view_enabled),
          public_edit_enabled: Boolean(body.public_edit_enabled),
        };
        cards = [...cards, created];
        appendAuditEvent("create", "card", created.id);
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
        body: JSON.stringify({ items: cards }),
      });
      return;
    }
    if (url.pathname === `/api/v1/registries/${ids.registry}/cards`) {
      if (request.method() === "POST") {
        const body = request.postDataJSON() as {
          organization_id: string;
          org_unit_id?: string | null;
          card_template_id?: string | null;
          public_view_enabled?: boolean;
          public_edit_enabled?: boolean;
        };
        const template =
          cardTemplates.find((item) => item.id === body.card_template_id) ?? cardTemplates[0];
        const created = {
          id: ids.card,
          registry_id: ids.registry,
          card_template_id: template.id,
          card_template_name: template.name,
          organization_id: body.organization_id,
          org_unit_id: body.org_unit_id ?? null,
          display_value: "Не заполнено",
          lifecycle_status: "draft",
          public_view_enabled: Boolean(body.public_view_enabled),
          public_edit_enabled: Boolean(body.public_edit_enabled),
        };
        cards = [...cards, created];
        appendAuditEvent("create", "card", created.id);
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
        body: JSON.stringify({ items: cards }),
      });
      return;
    }
    if (url.pathname === `/api/v1/cards/${ids.card}`) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(cardReadPayload(ids.card)),
      });
      return;
    }
    if (url.pathname === `/api/v1/cards/${ids.card}/values`) {
      const body = request.postDataJSON() as {
        values: { field_id: string; value: unknown; block_instance_id?: string | null }[];
      };
      for (const item of body.values) {
        cardFieldValues = { ...cardFieldValues, [item.field_id]: item.value };
      }
      appendAuditEvent("update", "field_values", ids.card);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: body.values.map((item, index) => ({
            id: `setup-field-value-${index}`,
            card_id: ids.card,
            block_instance_id: item.block_instance_id ?? null,
            field_id: item.field_id,
            value: item.value,
          })),
        }),
      });
      return;
    }
    if (url.pathname === `/api/v1/cards/${ids.card}/fields/${ids.field}/reference-items`) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: referenceItems }),
      });
      return;
    }
    if (url.pathname === `/api/v1/cards/${ids.card}/fields/${ids.fileRefField}`) {
      const body = request.postDataJSON() as {
        value: string | null;
        block_instance_id?: string | null;
      };
      const attachment = attachments.find((item) => item.id === body.value);
      const value =
        body.value && attachment
          ? {
              attachment_id: attachment.id,
              title: attachment.title ?? attachment.original_filename,
              original_filename: attachment.original_filename,
              content_type: attachment.content_type,
              content_length_bytes: attachment.content_length_bytes,
              scanner_status: attachment.scanner_status,
              archived_at: attachment.archived_at,
            }
          : null;
      cardFieldValues = { ...cardFieldValues, [ids.fileRefField]: value };
      appendAuditEvent("update", "field_value", ids.card);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "setup-file-ref-value",
          card_id: ids.card,
          block_instance_id: body.block_instance_id ?? null,
          field_id: ids.fileRefField,
          value,
        }),
      });
      return;
    }
    if (url.pathname === `/api/v1/cards/${ids.card}/attachments`) {
      if (request.method() === "POST") {
        const created = {
          id: ids.attachment,
          card_id: ids.card,
          stored_file_id: "11111111-bbbb-4111-8111-111111111111",
          title: "Файл проверки",
          description: null,
          position: 0,
          original_filename: "qa.txt",
          content_type: "text/plain",
          content_length_bytes: 7,
          checksum_sha256: "b".repeat(64),
          scanner_status: "deferred",
          created_at: "2026-06-28T12:20:00Z",
          archived_at: null,
        };
        attachments = [created];
        appendAuditEvent("create", "card_attachment", created.id);
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
        body: JSON.stringify({ items: attachments }),
      });
      return;
    }
    if (url.pathname === `/api/v1/registries/${ids.registry}/document-templates`) {
      if (request.method() === "POST") {
        const body = request.postDataJSON() as {
          code: string;
          name: string;
          description?: string | null;
          output_filename_template: string;
        };
        const created = {
          id: ids.template,
          registry_id: ids.registry,
          code: body.code,
          name: body.name,
          description: body.description ?? null,
          template_format: "docx_text_v1",
          output_filename_template: body.output_filename_template,
          output_content_type:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          is_active: true,
          created_at: "2026-06-28T12:21:00Z",
          archived_at: null,
        };
        documentTemplates = [created];
        appendAuditEvent("create", "document_template", created.id);
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
        body: JSON.stringify({ items: documentTemplates }),
      });
      return;
    }
    if (
      url.pathname === `/api/v1/registries/${ids.registry}/report-templates` ||
      url.pathname === `/api/v1/registries/${ids.registry}/report-runs`
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [] }),
      });
      return;
    }
    if (url.pathname === `/api/v1/cards/${ids.card}/generated-documents`) {
      if (request.method() === "POST") {
        const created = {
          id: ids.document,
          card_id: ids.card,
          template_id: ids.template,
          stored_file_id: "13131313-bbbb-4313-8313-131313131313",
          title: "Документ проверки",
          output_filename: "Карточка проверки.docx",
          content_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          render_status: "generated",
          created_at: "2026-06-28T12:22:00Z",
          archived_at: null,
        };
        generatedDocuments = [created];
        appendAuditEvent("create", "generated_document", created.id);
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
        body: JSON.stringify({ items: generatedDocuments }),
      });
      return;
    }
    if (url.pathname === `/api/v1/cards/${ids.card}/public-links`) {
      if (request.method() === "POST") {
        const body = request.postDataJSON() as { max_attachment_uploads?: number | null };
        const created = {
          id: ids.publicLink,
          card_id: ids.card,
          raw_token: "setup-token",
          status: "active",
          can_edit: true,
          expires_at: "2099-06-28T12:00:00Z",
        };
        publicLinks = [
          {
            id: created.id,
            card_id: created.card_id,
            status: created.status,
            can_view: true,
            can_edit: created.can_edit,
            expires_at: created.expires_at,
            max_uses: null,
            used_count: 0,
            max_attachment_uploads: body.max_attachment_uploads ?? null,
            attachment_upload_count: 0,
            disabled_at: null,
          },
        ];
        appendAuditEvent("create", "public_link", created.id);
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
        body: JSON.stringify({ items: publicLinks }),
      });
      return;
    }
    if (url.pathname === "/api/v1/audit-events") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: auditItems }),
      });
      return;
    }

    unhandledApiRequests.push(`${request.method()} ${url.pathname}${url.search}`);
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Not Found" }),
    });
  });

  await page.goto("/");
  await expect(page).toHaveTitle("Реестровая система");
  await expect(page.getByRole("heading", { name: "Реестровая система" })).toBeVisible();
  await page.getByLabel("Электронная почта").fill("admin@example.test");
  await page.getByLabel("Пароль").fill("secret-pass");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByText("Панель администратора")).toBeVisible();

  await page.getByRole("button", { name: "Организации", exact: true }).click();
  await page.getByRole("button", { name: "Создать организацию" }).click();
  await expect(page.getByLabel("Код организации")).toHaveCount(0);
  await page
    .getByRole("form", { name: "Создать организацию" })
    .getByLabel("Название", { exact: true })
    .fill("Отдел контроля");
  await page
    .getByLabel("Родительская организация")
    .selectOption("22222222-2222-4222-8222-222222222222");
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  await expect(page.getByText("Организация создана")).toBeVisible();
  await expect(page.getByRole("treeitem", { name: "Отдел контроля" })).toBeVisible();

  await page.getByRole("button", { name: "Пользователи", exact: true }).click();
  await page.getByRole("button", { name: "Создать пользователя" }).click();
  await page.getByLabel("Логин пользователя").fill("operator@example.test");
  await page.getByLabel("Имя пользователя").fill("Оператор реестра");
  await page.getByLabel("Пароль пользователя").fill("operator-pass");
  await page
    .getByRole("combobox", { name: "Роль пользователя", exact: true })
    .selectOption("administrator");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.getByText("Пользователь создан")).toBeVisible();
  await expect(page.getByText("operator@example.test").first()).toBeVisible();

  await page.getByRole("button", { name: "Реестры", exact: true }).click();
  await page.getByRole("tab", { name: "Расширенное" }).click();
  await page.getByRole("tab", { name: "Реестры" }).click();
  await page.getByRole("button", { name: "Создать реестр" }).click();
  await expect(page.getByLabel("Код реестра")).toHaveCount(0);
  await page.getByLabel("Название реестра").fill("Реестр проверок");
  await page.getByLabel("Описание реестра").fill("Контрольные карточки");
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  await expect(page.getByText("Реестр создан")).toBeVisible();
  await expect(page.getByText("Реестр проверок").first()).toBeVisible();

  await page.getByRole("button", { name: "Реестры", exact: true }).click();
  await page.getByRole("tab", { name: "Схема карточки" }).click();
  await page.getByRole("button", { name: "Создать шаблон карточки" }).click();
  await page.getByLabel("Название шаблона карточки").fill("Карточка проверки");
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  await expect(page.getByText("Шаблон карточки создан")).toBeVisible();
  await page
    .getByRole("button", { name: "Шаблон карточки Карточка проверки", exact: true })
    .dblclick();
  await expect(
    page.getByRole("region", { name: "Редактор шаблона Карточка проверки" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Создать блок", exact: true }).click();
  await page.getByLabel("Название блока", { exact: true }).fill("Основные сведения");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Создать поле в блоке Основные сведения" }),
  ).toBeVisible();

  await page.getByRole("tab", { name: "Расширенное" }).click();
  await page.getByRole("tab", { name: "Справочники" }).click();
  await page.getByRole("button", { name: "Создать справочник" }).click();
  await expect(page.getByLabel("Код справочника")).toHaveCount(0);
  await page.getByLabel("Название справочника").fill("Статусы проверки");
  await page.getByLabel("Описание справочника").fill("Результаты проверки");
  await page
    .getByRole("form", { name: "Создать справочник" })
    .getByLabel("Организация-владелец")
    .selectOption("81818181-8181-4818-8818-818181818181");
  await page.getByLabel("Наследовать дочерним организациям").check();
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  await expect(page.getByText("Справочник создан")).toBeVisible();

  await page.getByRole("button", { name: "Добавить элемент справочника" }).click();
  await expect(page.getByLabel("Код элемента справочника")).toHaveCount(0);
  await page.getByLabel("Название элемента справочника").fill("Принято");
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  await expect(page.getByText("Элемент справочника создан")).toBeVisible();
  await expect(page.getByText("Принято").first()).toBeVisible();

  await page.getByRole("tab", { name: "Схема карточки" }).click();
  await page
    .getByRole("button", { name: "Шаблон карточки Карточка проверки", exact: true })
    .click();
  await page.getByRole("button", { name: "Создать поле в блоке Основные сведения" }).click();
  await page.getByLabel("Название поля", { exact: true }).fill("Статус проверки");
  await page.getByRole("combobox", { name: /^Тип поля/ }).selectOption("select");
  await page
    .getByRole("combobox", { name: /^Справочник/ })
    .selectOption("61616161-6161-4616-8616-616161616161");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.getByLabel("Название поля", { exact: true })).toHaveCount(0);
  expect(fields).toEqual([
    expect.objectContaining({
      label: "Статус проверки",
      field_type: "select",
      options_source_type: "reference_list",
      options_source_id: "61616161-6161-4616-8616-616161616161",
    }),
  ]);

  await page.getByRole("button", { name: "Аудит", exact: true }).click();
  await page.getByRole("tab", { name: "Технический аудит" }).click();
  await expect(page.getByText("Создание").first()).toBeVisible();
  await expect(page.getByText("Поле формы", { exact: true }).first()).toBeVisible();

  expect(unhandledApiRequests).toEqual([]);
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
    if (url.pathname === "/api/v1/public-links/status") {
      await route.fulfill({ json: { status: "active", can_edit: true } });
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
  await expect(page.getByRole("heading", { name: "Петров Петр Петрович" })).toBeVisible();
  await expect(
    page.getByTestId("public-block-public-section").getByText("Публичный блок"),
  ).toBeVisible();
  await expect(page.getByText("Публичное редактирование карточки").first()).toBeVisible();
  await expect(page.getByLabel("Публичный статус")).toHaveValue("drafted");
  await expect(page.getByRole("heading", { name: "Документы" })).toHaveCount(0);

  await page.getByRole("textbox", { name: "ФИО", exact: true }).fill("Петров Петр Петрович");
  await page.getByLabel("Публичный статус").fill("submitted");
  await page.getByLabel("Основание изменения").fill("Приказ 42");
  await page.getByRole("button", { name: "Сохранить изменение" }).click();

  await expect(page.getByText("Все изменения сохранены").first()).toBeVisible();
  expect(editRequestBody).toEqual({
    raw_token: "public-token",
    field_id: "99999999-9999-4999-8999-999999999997",
    value: "submitted",
    block_instance_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    basis_text: "Приказ 42",
    actor_name: "Петров Петр Петрович",
  });

  expect(forbiddenDocumentEndpointCalls).toBe(0);
});

function responsePayload(
  pathname: string,
  _search: string,
  cardValues: {
    approvedValue: boolean;
    statusValue: string;
    repeatableInstances: Array<{ block_instance_id: string; ordinal: number; value: string }>;
  },
) {
  if (pathname === "/api/v1/auth/login") {
    return apiPayloads.login;
  }
  if (pathname === "/api/v1/auth/me") {
    return apiPayloads.login.user;
  }
  if (pathname === "/api/v1/organizations/tree") {
    return {
      items: apiPayloads.organizations.items.map((organization) => ({
        ...organization,
        children: [],
      })),
    };
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
        details: {
          block_id: "8d8d8d8d-8d8d-48d8-88d8-8d8d8d8d8d8d",
          code: "details",
          instances: cardValues.repeatableInstances.map((instance) => ({
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
        main: {
          ...apiPayloads.cardRead.blocks.main,
          instances: [
            {
              block_instance_id: null,
              ordinal: 0,
              fields: {
                fio: apiPayloads.cardRead.fields.fio,
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
        fio: apiPayloads.cardRead.fields.fio,
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
  if (pathname === "/api/v1/audit-events") {
    return apiPayloads.audit;
  }
  return null;
}

function currentPublicPreview(statusValue: string) {
  return {
    ...apiPayloads.publicPreview,
    form_layout: {
      columns: 12,
      sections: [
        {
          id: "public-section",
          block_id: apiPayloads.publicPreview.blocks[0].block_id,
          row: 1,
          column: 1,
          row_span: 1,
          column_span: 12,
          items: [
            {
              id: "public-status-item",
              kind: "field",
              field_id: "99999999-9999-4999-8999-999999999997",
              row: 1,
              column: 1,
              row_span: 1,
              column_span: 12,
            },
          ],
        },
      ],
    },
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

function cardAuxiliaryPayload(
  pathname: string,
  schema: {
    registry: { id: string; name: string };
    blocks: Array<{ id: string; title: string; code: string }>;
    fields: Array<{
      id: string;
      block_id: string;
      label: string;
      code: string;
      field_type: string;
    }>;
    templates: Array<{ id: string; name: string }>;
  },
): unknown {
  if (
    pathname === "/api/v1/card-change-notifications" ||
    pathname.endsWith("/reference-edit-links")
  )
    return { items: [] };
  if (pathname.endsWith("/change-notification-subscription")) return { enabled: false };
  if (pathname.endsWith("/card-creation-links") || pathname.endsWith("/creation-links"))
    return { items: [] };
  if (pathname.endsWith("/public-access"))
    return { public_view_enabled: true, public_edit_enabled: true, fields: [] };
  if (pathname.endsWith("/creation-preview"))
    return {
      card_template_id: schema.templates[0]?.id,
      blocks: schema.blocks.map((block) => ({
        block_id: block.id,
        code: block.code,
        title: block.title,
        fields: schema.fields
          .filter((field) => field.block_id === block.id)
          .map((field) => ({
            ...field,
            field_id: field.id,
            required_mode: "not_required",
            options: [],
          })),
      })),
    };
  if (pathname.endsWith("/layout") || pathname.endsWith("/layout/form")) {
    const payload = cardAuxiliaryPayload("/api/v1/cards/smoke/presentation", schema);
    return payload && "layout" in payload ? payload.layout : null;
  }
  if (!pathname.endsWith("/presentation")) return null;
  return {
    card_id: pathname.split("/")[4],
    registry_id: schema.registry.id,
    registry_name: schema.registry.name,
    card_template_id: schema.templates[0]?.id,
    card_template_name: schema.templates[0]?.name,
    layout: {
      version: "card_template_layout_v1",
      revision: "smoke",
      registry_id: schema.registry.id,
      card_template_id: schema.templates[0]?.id,
      structure: { blocks: schema.blocks, fields: schema.fields },
      form_layout: {
        columns: 12,
        sections: schema.blocks.map((block, index) => ({
          id: `section-${block.id}`,
          block_id: block.id,
          row: index + 1,
          column: 1,
          row_span: 1,
          column_span: 12,
          items: schema.fields
            .filter((field) => field.block_id === block.id)
            .map((field, fieldIndex) => ({
              id: `item-${field.id}`,
              kind: "field",
              field_id: field.id,
              row: fieldIndex + 1,
              column: 1,
              row_span: 1,
              column_span: 12,
              text: null,
            })),
        })),
      },
      print_views: [],
      export_settings: { formats: [] },
      sync_status: { has_errors: false, errors: [], warnings: [], mapping: {} },
    },
  };
}
