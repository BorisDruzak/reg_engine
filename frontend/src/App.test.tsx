import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { App } from "@/App";
import type {
  AccessGrantRead,
  AttachmentRead,
  CardRead,
  CardSummaryRead,
  DocumentTemplateRead,
  FormBlockRead,
  FormFieldRead,
  GeneratedDocumentRead,
  OrganizationRead,
  OrgUnitRead,
  PublicLinkRead,
  ReferenceItemRead,
  ReferenceListRead,
  RegistryRead,
  ReportRunRead,
  ReportTemplateRead,
  UserRead,
} from "@/api/types";

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
  orgUnits: {
    items: [
      {
        id: "2f2f2f2f-2f2f-42f2-82f2-2f2f2f2f2f2f",
        organization_id: "22222222-2222-4222-8222-222222222222",
        parent_id: null,
        code: "accounting",
        name: "Отдел учета",
        type: "department",
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
  repeatableBlock: {
    id: "8d8d8d8d-8d8d-48d8-88d8-8d8d8d8d8d8d",
    registry_id: "77777777-7777-4777-8777-777777777777",
    code: "details",
    title: "Детали карточки",
    description: "Повторяемые сведения карточки",
    position: 10,
    is_repeatable: true,
    is_active: true,
    public_visible: false,
    public_editable: false,
  },
  repeatableField: {
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
    public_visible: false,
    public_editable: false,
  },
  fileRefField: {
    id: "9f9f9f9f-9f9f-49f9-89f9-9f9f9f9f9f9f",
    block_id: "88888888-8888-4888-8888-888888888888",
    code: "supporting_file",
    label: "Файл карточки",
    description: null,
    field_type: "file_ref",
    position: 2,
    options_source_type: null,
    options_source_id: null,
    is_active: true,
    public_visible: false,
    public_editable: false,
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
      {
        id: "42424242-4242-4242-8242-424242424242",
        card_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        status: "disabled",
        can_view: true,
        can_edit: true,
        expires_at: "2099-07-05T12:00:00Z",
        max_uses: null,
        used_count: 0,
        max_attachment_uploads: null,
        attachment_upload_count: 0,
        disabled_at: "2026-06-28T12:00:00Z",
      },
      {
        id: "43434343-4343-4343-8343-434343434343",
        card_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        status: "expired",
        can_view: true,
        can_edit: true,
        expires_at: "2026-06-28T12:00:00Z",
        max_uses: 2,
        used_count: 0,
        max_attachment_uploads: 2,
        attachment_upload_count: 0,
        disabled_at: null,
      },
      {
        id: "44444444-4444-4444-8444-444444444445",
        card_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        status: "active",
        can_view: true,
        can_edit: true,
        expires_at: "2099-07-05T12:00:00Z",
        max_uses: 10,
        used_count: 2,
        max_attachment_uploads: 2,
        attachment_upload_count: 2,
        disabled_at: null,
      },
    ] as PublicLinkRead[],
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
  reportTemplates: {
    items: [
      {
        id: "51515151-5151-4151-8151-515151515151",
        registry_id: "77777777-7777-4777-8777-777777777777",
        code: "registry_cards",
        name: "Сводный отчет",
        description: "Список карточек",
        report_type: "registry_cards",
        parameters_schema_json: null,
        default_parameters_json: null,
        output_format: "json",
        is_active: true,
        created_at: "2026-06-28T12:00:00Z",
        archived_at: null,
      },
    ] as ReportTemplateRead[],
  },
  reportRuns: {
    items: [] as ReportRunRead[],
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

let cardStatusValue = "drafted";
let cardApprovedValue = false;
let publicStatusValue = "drafted";
let organizationItems: OrganizationRead[];
let orgUnitItems: OrgUnitRead[];
let registryItems: RegistryRead[];
let denyNextRegistryUpdate = false;
let schemaBlockItems: FormBlockRead[];
let schemaFieldItems: FormFieldRead[];
let denyNextFieldArchive = false;
let referenceListItems: ReferenceListRead[];
let referenceItemItems: ReferenceItemRead[];
let denyNextReferenceListUpdate = false;
let userItems: UserRead[];
let denyNextUserUpdate = false;
let grantItems: AccessGrantRead[];
let denyNextGrantCreate = false;
let cardItems: CardSummaryRead[];
type TestFileRefValue = {
  attachment_id: string;
  title: string;
  original_filename: string;
  content_type: string;
  content_length_bytes: number;
  scanner_status: string;
  archived_at: string | null;
};

let cardValueStateById: Record<
  string,
  {
    status: string;
    approved: boolean;
    repeatableNotes: { block_instance_id: string; ordinal: number; value: string }[];
    fileRef: TestFileRefValue | null;
  }
>;
let denyNextCardUpdate = false;
let publicLinkItems: PublicLinkRead[];
let attachmentItems: typeof apiPayloads.attachments.items;
let documentTemplateItems: DocumentTemplateRead[];
let generatedDocumentItems: typeof apiPayloads.generatedDocuments.items;
let reportTemplateItems: ReportTemplateRead[];
let reportRunItems: ReportRunRead[];

beforeEach(() => {
  localStorage.clear();
  window.history.pushState({}, "", "/");
  cardStatusValue = "drafted";
  cardApprovedValue = false;
  publicStatusValue = "drafted";
  organizationItems = [...apiPayloads.organizations.items];
  orgUnitItems = [...apiPayloads.orgUnits.items];
  registryItems = [...apiPayloads.registries.items];
  denyNextRegistryUpdate = false;
  schemaBlockItems = [...apiPayloads.schema.blocks];
  schemaFieldItems = [...apiPayloads.schema.fields];
  denyNextFieldArchive = false;
  referenceListItems = [...apiPayloads.referenceLists.items];
  referenceItemItems = [...apiPayloads.referenceItems.items];
  denyNextReferenceListUpdate = false;
  userItems = [...apiPayloads.users.items];
  denyNextUserUpdate = false;
  grantItems = [...apiPayloads.grants.items];
  denyNextGrantCreate = false;
  cardItems = [...apiPayloads.cards.items];
  cardValueStateById = {
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa": {
      status: "drafted",
      approved: false,
      repeatableNotes: [],
      fileRef: null,
    },
  };
  denyNextCardUpdate = false;
  publicLinkItems = [...apiPayloads.publicLinks.items];
  attachmentItems = [];
  documentTemplateItems = [...apiPayloads.documentTemplates.items];
  generatedDocumentItems = [];
  reportTemplateItems = [...apiPayloads.reportTemplates.items];
  reportRunItems = [];
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
      if (url.endsWith("/api/v1/organizations/22222222-2222-4222-8222-222222222222/org-units")) {
        return jsonResponse({ items: orgUnitItems });
      }
      if (url.includes("/api/v1/organizations/") && !url.includes("/org-units")) {
        const organizationId = url.split("/api/v1/organizations/")[1];
        const current = organizationItems.find((item) => item.id === organizationId);
        if (!current) {
          return jsonResponse({ detail: "Not Found" }, { status: 404 });
        }
        if (init?.method === "PATCH") {
          const payload = JSON.parse(String(init.body ?? "{}")) as {
            name?: string;
            organization_type?: string;
          };
          const updated = {
            ...current,
            name: payload.name ?? current.name,
            type: payload.organization_type ?? current.type,
          };
          organizationItems = organizationItems.map((item) =>
            item.id === organizationId ? updated : item,
          );
          return jsonResponse(updated);
        }
        if (init?.method === "DELETE") {
          const archived = { ...current, is_active: false };
          organizationItems = organizationItems.filter((item) => item.id !== organizationId);
          return jsonResponse(archived);
        }
      }
      if (url.endsWith("/api/v1/organizations")) {
        if (init?.method === "POST") {
          const payload = JSON.parse(String(init.body ?? "{}")) as {
            code: string;
            name: string;
            parent_id: string | null;
            organization_type: string;
          };
          const created = {
            id: "23232323-2323-4232-8232-232323232323",
            parent_id: payload.parent_id,
            code: payload.code,
            name: payload.name,
            type: payload.organization_type,
            is_active: true,
          };
          organizationItems = [...organizationItems, created];
          return jsonResponse(created, { status: 201 });
        }
        return jsonResponse({ items: organizationItems });
      }
      if (url.includes("/api/v1/users/")) {
        const userId = url.split("/api/v1/users/")[1];
        const current = userItems.find((item) => item.id === userId);
        if (!current) {
          return jsonResponse({ detail: "Not Found" }, { status: 404 });
        }
        if (init?.method === "PATCH") {
          if (denyNextUserUpdate) {
            denyNextUserUpdate = false;
            return jsonResponse({ detail: "Forbidden" }, { status: 403 });
          }
          const payload = JSON.parse(String(init.body ?? "{}")) as {
            email?: string | null;
            display_name?: string | null;
            password?: string | null;
            status?: string | null;
            is_superuser?: boolean | null;
          };
          const updated = {
            ...current,
            email: payload.email ?? current.email,
            display_name: payload.display_name ?? current.display_name,
            status: payload.status ?? current.status,
            is_superuser: payload.is_superuser ?? current.is_superuser,
          };
          userItems = userItems.map((item) => (item.id === userId ? updated : item));
          return jsonResponse(updated);
        }
        if (init?.method === "DELETE") {
          const archived = { ...current, archived_at: "2026-06-28T12:06:00Z" };
          userItems = userItems.filter((item) => item.id !== userId);
          return jsonResponse(archived);
        }
      }
      if (url.endsWith("/api/v1/users")) {
        if (init?.method === "POST") {
          const payload = JSON.parse(String(init.body ?? "{}")) as {
            email: string;
            display_name: string;
            password: string;
            status?: string;
            is_superuser?: boolean;
          };
          const created: UserRead = {
            id: "24242424-2424-4242-8242-242424242424",
            email: payload.email,
            display_name: payload.display_name,
            status: payload.status ?? "active",
            is_superuser: payload.is_superuser ?? false,
            archived_at: null,
          };
          userItems = [...userItems, created];
          return jsonResponse(created, { status: 201 });
        }
        return jsonResponse({ items: userItems });
      }
      if (url.endsWith("/api/v1/roles")) {
        return jsonResponse(apiPayloads.roles);
      }
      if (url.endsWith("/api/v1/permissions")) {
        return jsonResponse(apiPayloads.permissions);
      }
      if (url.includes("/api/v1/access-grants/")) {
        const grantId = url.split("/api/v1/access-grants/")[1];
        const current = grantItems.find((item) => item.id === grantId);
        if (!current) {
          return jsonResponse({ detail: "Not Found" }, { status: 404 });
        }
        if (init?.method === "DELETE") {
          const archived = { ...current, archived_at: "2026-06-28T12:07:00Z" };
          grantItems = grantItems.filter((item) => item.id !== grantId);
          return jsonResponse(archived);
        }
      }
      if (url.endsWith("/api/v1/access-grants")) {
        if (init?.method === "POST") {
          if (denyNextGrantCreate) {
            denyNextGrantCreate = false;
            return jsonResponse({ detail: "Forbidden" }, { status: 403 });
          }
          const payload = JSON.parse(String(init.body ?? "{}")) as {
            user_id: string;
            role_id: string;
            registry_id?: string | null;
            organization_id?: string | null;
            include_descendants?: boolean;
            valid_from?: string | null;
            valid_to?: string | null;
          };
          const created: AccessGrantRead = {
            id: `grant-${grantItems.length + 1}`,
            user_id: payload.user_id,
            role_id: payload.role_id,
            registry_id: payload.registry_id ?? null,
            organization_id: payload.organization_id ?? null,
            include_descendants: payload.include_descendants ?? false,
            valid_from: payload.valid_from ?? null,
            valid_to: payload.valid_to ?? null,
            created_by: "11111111-1111-4111-8111-111111111111",
            archived_at: null,
          };
          grantItems = [...grantItems, created];
          return jsonResponse(created, { status: 201 });
        }
        return jsonResponse({ items: grantItems });
      }
      if (url.includes("/api/v1/reference-items/")) {
        const itemId = url.split("/api/v1/reference-items/")[1];
        const current = referenceItemItems.find((item) => item.id === itemId);
        if (!current) {
          return jsonResponse({ detail: "Not Found" }, { status: 404 });
        }
        if (init?.method === "PATCH") {
          const payload = JSON.parse(String(init.body ?? "{}")) as {
            label?: string | null;
            description?: string | null;
            position?: number | null;
          };
          const updated: ReferenceItemRead = {
            ...current,
            label: payload.label ?? current.label,
            description: payload.description ?? current.description,
            position: payload.position ?? current.position,
          };
          referenceItemItems = referenceItemItems.map((item) =>
            item.id === itemId ? updated : item,
          );
          return jsonResponse(updated);
        }
        if (init?.method === "DELETE") {
          const archived = { ...current, is_active: false };
          referenceItemItems = referenceItemItems.filter((item) => item.id !== itemId);
          return jsonResponse(archived);
        }
      }
      if (url.includes("/api/v1/reference-lists/") && url.endsWith("/items")) {
        const listId = url.split("/api/v1/reference-lists/")[1].split("/items")[0];
        if (init?.method === "POST") {
          const payload = JSON.parse(String(init.body ?? "{}")) as {
            code: string;
            label: string;
            parent_id?: string | null;
            description?: string | null;
            position?: number;
          };
          const created: ReferenceItemRead = {
            id: "cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd",
            list_id: listId,
            parent_id: payload.parent_id ?? null,
            code: payload.code,
            label: payload.label,
            description: payload.description ?? null,
            position: payload.position ?? 0,
            is_active: true,
          };
          referenceItemItems = [...referenceItemItems, created];
          return jsonResponse(created, { status: 201 });
        }
        return jsonResponse({
          items: referenceItemItems.filter((item) => item.list_id === listId),
        });
      }
      if (url.includes("/api/v1/reference-lists/")) {
        const listId = url.split("/api/v1/reference-lists/")[1].split("?")[0];
        const current = referenceListItems.find((item) => item.id === listId);
        if (!current) {
          return jsonResponse({ detail: "Not Found" }, { status: 404 });
        }
        if (init?.method === "PATCH") {
          if (denyNextReferenceListUpdate) {
            denyNextReferenceListUpdate = false;
            return jsonResponse({ detail: "Forbidden" }, { status: 403 });
          }
          const payload = JSON.parse(String(init.body ?? "{}")) as {
            name?: string | null;
            description?: string | null;
          };
          const updated: ReferenceListRead = {
            ...current,
            name: payload.name ?? current.name,
            description: payload.description ?? current.description,
          };
          referenceListItems = referenceListItems.map((item) =>
            item.id === listId ? updated : item,
          );
          return jsonResponse(updated);
        }
        if (init?.method === "DELETE") {
          if (denyNextReferenceListUpdate) {
            denyNextReferenceListUpdate = false;
            return jsonResponse({ detail: "Forbidden" }, { status: 403 });
          }
          const archived = { ...current, is_active: false };
          referenceListItems = referenceListItems.filter((item) => item.id !== listId);
          referenceItemItems = referenceItemItems.filter((item) => item.list_id !== listId);
          return jsonResponse(archived);
        }
        return jsonResponse(current);
      }
      if (
        url
          .split("?")[0]
          .endsWith("/api/v1/registries/77777777-7777-4777-8777-777777777777/reference-lists")
      ) {
        if (init?.method === "POST") {
          const payload = JSON.parse(String(init.body ?? "{}")) as {
            code: string;
            name: string;
            owner_organization_id?: string | null;
            description?: string | null;
            inherit_to_descendants?: boolean;
            locked_for_descendants?: boolean;
            managed_by_system_only?: boolean;
          };
          const created: ReferenceListRead = {
            id: "dededede-dede-4ede-8ede-dededededede",
            registry_id: "77777777-7777-4777-8777-777777777777",
            owner_organization_id: payload.owner_organization_id ?? null,
            code: payload.code,
            name: payload.name,
            description: payload.description ?? null,
            inherit_to_descendants: payload.inherit_to_descendants ?? false,
            locked_for_descendants: payload.locked_for_descendants ?? false,
            managed_by_system_only: payload.managed_by_system_only ?? false,
            is_active: true,
          };
          referenceListItems = [...referenceListItems, created];
          return jsonResponse(created, { status: 201 });
        }
        return jsonResponse({ items: referenceListItems });
      }
      if (url.endsWith("/api/v1/registries/77777777-7777-4777-8777-777777777777/blocks")) {
        if (init?.method === "POST") {
          const payload = JSON.parse(String(init.body ?? "{}")) as {
            code: string;
            title: string;
            description?: string | null;
            position?: number;
            is_repeatable?: boolean;
            public_visible?: boolean;
            public_editable?: boolean;
          };
          const created: FormBlockRead = {
            id: "26262626-2626-4262-8262-262626262626",
            registry_id: "77777777-7777-4777-8777-777777777777",
            code: payload.code,
            title: payload.title,
            description: payload.description ?? null,
            position: payload.position ?? 0,
            is_repeatable: payload.is_repeatable ?? false,
            is_active: true,
            public_visible: payload.public_visible ?? true,
            public_editable: payload.public_editable ?? false,
          };
          schemaBlockItems = [...schemaBlockItems, created];
          return jsonResponse(created, { status: 201 });
        }
      }
      if (url.includes("/api/v1/blocks/") && url.endsWith("/fields")) {
        const blockId = url.split("/api/v1/blocks/")[1].split("/fields")[0];
        const block = schemaBlockItems.find((item) => item.id === blockId);
        if (!block) {
          return jsonResponse({ detail: "Not Found" }, { status: 404 });
        }
        if (init?.method === "POST") {
          const payload = JSON.parse(String(init.body ?? "{}")) as {
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
          const created: FormFieldRead = {
            id: "27272727-2727-4272-8272-272727272727",
            block_id: blockId,
            code: payload.code,
            label: payload.label,
            description: payload.description ?? null,
            field_type: payload.field_type,
            position: payload.position ?? 0,
            options_source_type: payload.options_source_type ?? null,
            options_source_id: payload.options_source_id ?? null,
            is_active: true,
            public_visible: payload.public_visible ?? true,
            public_editable: payload.public_editable ?? false,
          };
          schemaFieldItems = [...schemaFieldItems, created];
          return jsonResponse(created, { status: 201 });
        }
      }
      if (url.includes("/api/v1/blocks/")) {
        const blockId = url.split("/api/v1/blocks/")[1];
        const current = schemaBlockItems.find((item) => item.id === blockId);
        if (!current) {
          return jsonResponse({ detail: "Not Found" }, { status: 404 });
        }
        if (init?.method === "PATCH") {
          const payload = JSON.parse(String(init.body ?? "{}")) as {
            title?: string | null;
            description?: string | null;
            position?: number | null;
          };
          const updated: FormBlockRead = {
            ...current,
            title: payload.title ?? current.title,
            description: payload.description ?? current.description,
            position: payload.position ?? current.position,
          };
          schemaBlockItems = schemaBlockItems.map((item) => (item.id === blockId ? updated : item));
          return jsonResponse(updated);
        }
        if (init?.method === "DELETE") {
          const archived = { ...current, is_active: false };
          schemaBlockItems = schemaBlockItems.filter((item) => item.id !== blockId);
          schemaFieldItems = schemaFieldItems.filter((item) => item.block_id !== blockId);
          return jsonResponse(archived);
        }
      }
      if (url.includes("/api/v1/fields/")) {
        const fieldId = url.split("/api/v1/fields/")[1];
        const current = schemaFieldItems.find((item) => item.id === fieldId);
        if (!current) {
          return jsonResponse({ detail: "Not Found" }, { status: 404 });
        }
        if (init?.method === "PATCH") {
          const payload = JSON.parse(String(init.body ?? "{}")) as {
            label?: string | null;
            description?: string | null;
            position?: number | null;
            is_active?: boolean | null;
          };
          const updated: FormFieldRead = {
            ...current,
            label: payload.label ?? current.label,
            description: payload.description ?? current.description,
            position: payload.position ?? current.position,
            is_active: payload.is_active ?? current.is_active,
          };
          schemaFieldItems = schemaFieldItems.map((item) => (item.id === fieldId ? updated : item));
          return jsonResponse(updated);
        }
        if (init?.method === "DELETE") {
          if (denyNextFieldArchive) {
            denyNextFieldArchive = false;
            return jsonResponse({ detail: "Forbidden" }, { status: 403 });
          }
          const archived = { ...current, is_active: false };
          schemaFieldItems = schemaFieldItems.filter((item) => item.id !== fieldId);
          return jsonResponse(archived);
        }
      }
      if (
        url.endsWith("/api/v1/registries/77777777-7777-4777-8777-777777777777/report-templates")
      ) {
        if (init?.method === "POST") {
          const payload = JSON.parse(String(init.body ?? "{}")) as {
            code: string;
            name: string;
            description: string | null;
            report_type: string;
            default_parameters_json: Record<string, unknown> | null;
            output_format: string;
          };
          const created: ReportTemplateRead = {
            id: "52525252-5252-4252-8252-525252525252",
            registry_id: "77777777-7777-4777-8777-777777777777",
            code: payload.code,
            name: payload.name,
            description: payload.description,
            report_type: payload.report_type,
            parameters_schema_json: null,
            default_parameters_json: payload.default_parameters_json,
            output_format: payload.output_format,
            is_active: true,
            created_at: "2026-06-28T12:10:00Z",
            archived_at: null,
          };
          reportTemplateItems = [...reportTemplateItems, created];
          return jsonResponse(created, { status: 201 });
        }
        return jsonResponse({ items: reportTemplateItems });
      }
      if (url.endsWith("/api/v1/report-templates/52525252-5252-4252-8252-525252525252")) {
        if (init?.method === "PATCH") {
          const payload = JSON.parse(String(init.body ?? "{}")) as {
            name?: string;
            description?: string | null;
            default_parameters_json?: Record<string, unknown> | null;
          };
          const current = reportTemplateItems.find(
            (item) => item.id === "52525252-5252-4252-8252-525252525252",
          )!;
          const updated: ReportTemplateRead = {
            ...current,
            name: payload.name ?? current.name,
            description: Object.hasOwn(payload, "description")
              ? (payload.description ?? null)
              : current.description,
            default_parameters_json: Object.hasOwn(payload, "default_parameters_json")
              ? (payload.default_parameters_json ?? null)
              : current.default_parameters_json,
          };
          reportTemplateItems = reportTemplateItems.map((item) =>
            item.id === updated.id ? updated : item,
          );
          return jsonResponse(updated);
        }
        const archived = {
          ...reportTemplateItems.find(
            (item) => item.id === "52525252-5252-4252-8252-525252525252",
          )!,
          archived_at: "2026-06-28T12:14:00Z",
        };
        reportTemplateItems = reportTemplateItems.filter((item) => item.id !== archived.id);
        return jsonResponse(archived);
      }
      if (url.endsWith("/api/v1/report-templates/52525252-5252-4252-8252-525252525252/runs")) {
        const payload = JSON.parse(String(init?.body ?? "{}")) as {
          parameters: Record<string, unknown> | null;
        };
        const created: ReportRunRead = {
          id: "53535353-5353-4353-8353-535353535353",
          report_template_id: "52525252-5252-4252-8252-525252525252",
          registry_id: "77777777-7777-4777-8777-777777777777",
          card_id: null,
          report_type: "registry_cards",
          run_status: "completed",
          parameters_json: payload.parameters,
          summary_json: { row_count: 1 },
          row_count: 1,
          output_filename: "report.json",
          output_content_type: "application/json",
          generated_by: "11111111-1111-4111-8111-111111111111",
          started_at: "2026-06-28T12:11:00Z",
          finished_at: "2026-06-28T12:11:01Z",
          created_at: "2026-06-28T12:11:01Z",
          archived_at: null,
        };
        reportRunItems = [created, ...reportRunItems];
        return jsonResponse(created, { status: 201 });
      }
      if (url.endsWith("/api/v1/registries/77777777-7777-4777-8777-777777777777/report-runs")) {
        return jsonResponse({ items: reportRunItems });
      }
      if (url.endsWith("/api/v1/report-runs/53535353-5353-4353-8353-535353535353/content")) {
        return new Response('{"format_version":"report_run_v1","cards":[]}', {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "X-Report-Filename": "report.json",
          },
        });
      }
      if (url.endsWith("/api/v1/report-runs/53535353-5353-4353-8353-535353535353")) {
        const archived = {
          ...reportRunItems.find((item) => item.id === "53535353-5353-4353-8353-535353535353")!,
          archived_at: "2026-06-28T12:13:00Z",
        };
        reportRunItems = reportRunItems.filter((item) => item.id !== archived.id);
        return jsonResponse(archived);
      }
      if (
        url.includes("/api/v1/registries/") &&
        !url.endsWith("/schema") &&
        !url.includes("/cards") &&
        !url.includes("/document-templates") &&
        !url.includes("/report-templates") &&
        !url.includes("/report-runs")
      ) {
        const registryId = url.split("/api/v1/registries/")[1].split("?")[0];
        const current = registryItems.find((item) => item.id === registryId);
        if (!current) {
          return jsonResponse({ detail: "Not Found" }, { status: 404 });
        }
        if (init?.method === "PATCH") {
          if (denyNextRegistryUpdate) {
            denyNextRegistryUpdate = false;
            return jsonResponse({ detail: "Forbidden" }, { status: 403 });
          }
          const payload = JSON.parse(String(init.body ?? "{}")) as {
            name?: string | null;
            description?: string | null;
            lifecycle_status?: string | null;
          };
          const updated: RegistryRead = {
            ...current,
            name: payload.name ?? current.name,
            description: payload.description ?? current.description,
            lifecycle_status: payload.lifecycle_status ?? current.lifecycle_status,
          };
          registryItems = registryItems.map((item) => (item.id === registryId ? updated : item));
          return jsonResponse(updated);
        }
        if (init?.method === "DELETE") {
          const archived: RegistryRead = {
            ...current,
            lifecycle_status: "archived",
          };
          registryItems = registryItems.filter((item) => item.id !== registryId);
          return jsonResponse(archived);
        }
      }
      if (url.endsWith("/api/v1/registries")) {
        if (init?.method === "POST") {
          const payload = JSON.parse(String(init.body ?? "{}")) as {
            code: string;
            name: string;
            description?: string | null;
          };
          const created: RegistryRead = {
            id: "25252525-2525-4252-8252-252525252525",
            code: payload.code,
            name: payload.name,
            description: payload.description ?? null,
            lifecycle_status: "draft",
            schema_version: 1,
          };
          registryItems = [...registryItems, created];
          return jsonResponse(created, { status: 201 });
        }
        return jsonResponse({ items: registryItems });
      }
      if (url.endsWith("/api/v1/registries/77777777-7777-4777-8777-777777777777/schema")) {
        return jsonResponse(currentRegistrySchema());
      }
      if (url.endsWith("/api/v1/registries/77777777-7777-4777-8777-777777777777/cards")) {
        if (init?.method === "POST") {
          const payload = JSON.parse(String(init.body ?? "{}")) as {
            organization_id: string;
            display_name: string;
            org_unit_id?: string | null;
            public_view_enabled?: boolean;
            public_edit_enabled?: boolean;
          };
          const created: CardSummaryRead = {
            id: "cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd",
            registry_id: "77777777-7777-4777-8777-777777777777",
            organization_id: payload.organization_id,
            org_unit_id: payload.org_unit_id ?? null,
            display_name: payload.display_name,
            lifecycle_status: "draft",
            public_view_enabled: payload.public_view_enabled ?? false,
            public_edit_enabled: payload.public_edit_enabled ?? false,
          };
          cardItems = [...cardItems, created];
          cardValueStateById[created.id] = {
            status: "",
            approved: false,
            repeatableNotes: [],
            fileRef: null,
          };
          return jsonResponse(created, { status: 201 });
        }
        return jsonResponse({ items: cardItems });
      }
      if (url.endsWith("/api/v1/cards/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/public-links")) {
        if (init?.method === "POST") {
          const payload = JSON.parse(String(init.body ?? "{}")) as {
            expires_in_days?: number;
            max_attachment_uploads?: number | null;
          };
          const created: PublicLinkRead = {
            id: "45454545-4545-4545-8545-454545454545",
            card_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            status: "active",
            can_view: true,
            can_edit: true,
            expires_at: "2099-07-04T12:00:00Z",
            max_uses: null,
            used_count: 0,
            max_attachment_uploads: payload.max_attachment_uploads ?? null,
            attachment_upload_count: 0,
            disabled_at: null,
          };
          publicLinkItems = [...publicLinkItems, created];
          return jsonResponse(
            {
              id: created.id,
              card_id: created.card_id,
              raw_token: "created-public-token",
              status: created.status,
              can_edit: created.can_edit,
              expires_at: created.expires_at,
            },
            { status: 201 },
          );
        }
        return jsonResponse({ items: publicLinkItems });
      }
      if (url.endsWith("/api/v1/cards/cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd/public-links")) {
        return jsonResponse({ items: [] });
      }
      if (url.includes("/api/v1/public-links/") && init?.method === "DELETE") {
        const publicLinkId = url.split("/api/v1/public-links/")[1];
        const current = publicLinkItems.find((item) => item.id === publicLinkId);
        if (!current) {
          return jsonResponse({ detail: "Not Found" }, { status: 404 });
        }
        const disabled: PublicLinkRead = {
          ...current,
          status: "disabled",
          disabled_at: "2026-06-28T13:00:00Z",
        };
        publicLinkItems = publicLinkItems.map((item) =>
          item.id === publicLinkId ? disabled : item,
        );
        return jsonResponse(disabled);
      }
      if (
        url.endsWith(
          "/api/v1/cards/cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd/blocks/8d8d8d8d-8d8d-48d8-88d8-8d8d8d8d8d8d/instances",
        )
      ) {
        const state = cardValueStateById["cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd"];
        const created = {
          id: "edededed-eded-4ede-8ede-edededededed",
          card_id: "cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd",
          block_id: "8d8d8d8d-8d8d-48d8-88d8-8d8d8d8d8d8d",
          ordinal: state.repeatableNotes.length,
        };
        state.repeatableNotes = [
          ...state.repeatableNotes,
          { block_instance_id: created.id, ordinal: created.ordinal, value: "" },
        ];
        return jsonResponse(created, { status: 201 });
      }
      if (url.endsWith("/api/v1/card-block-instances/edededed-eded-4ede-8ede-edededededed")) {
        const state = cardValueStateById["cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd"];
        state.repeatableNotes = state.repeatableNotes.filter(
          (item) => item.block_instance_id !== "edededed-eded-4ede-8ede-edededededed",
        );
        return jsonResponse({
          id: "edededed-eded-4ede-8ede-edededededed",
          card_id: "cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd",
          block_id: "8d8d8d8d-8d8d-48d8-88d8-8d8d8d8d8d8d",
          ordinal: 0,
        });
      }
      if (url.endsWith("/api/v1/cards/cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd/values")) {
        const payload = JSON.parse(String(init?.body ?? "{}")) as {
          values: {
            field_id: string;
            value: unknown;
            block_instance_id?: string | null;
          }[];
        };
        const state = cardValueStateById["cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd"];
        for (const item of payload.values) {
          if (item.field_id === "99999999-9999-4999-8999-999999999999") {
            state.status = String(item.value ?? "");
          }
          if (item.field_id === "99999999-9999-4999-8999-999999999998") {
            state.approved = Boolean(item.value);
          }
          if (item.field_id === "9d9d9d9d-9d9d-49d9-89d9-9d9d9d9d9d9d") {
            state.repeatableNotes = state.repeatableNotes.map((note) =>
              note.block_instance_id === item.block_instance_id
                ? { ...note, value: String(item.value ?? "") }
                : note,
            );
          }
        }
        return jsonResponse({
          items: payload.values.map((item, index) => ({
            id: `bulk-${index}`,
            card_id: "cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd",
            block_instance_id: item.block_instance_id ?? null,
            field_id: item.field_id,
            value: item.value,
          })),
        });
      }
      if (url.endsWith("/api/v1/cards/cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd/attachments")) {
        return jsonResponse({ items: [] });
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
        url.endsWith("/api/v1/cards/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/generated-documents/pdf")
      ) {
        if (init?.method === "POST") {
          const payload = JSON.parse(String(init.body ?? "{}")) as {
            template_id: string;
            title: string | null;
          };
          const created = {
            id: "56565656-5656-4656-8656-565656565656",
            card_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            template_id: payload.template_id,
            stored_file_id: "78787878-7878-4787-8787-787878787878",
            title: payload.title ?? "Сводка карточки PDF",
            output_filename: "Карточка актива.pdf",
            content_type: "application/pdf",
            render_status: "generated",
            created_at: "2026-06-28T12:04:00Z",
            archived_at: null,
          };
          generatedDocumentItems = [created, ...generatedDocumentItems];
          return jsonResponse(created, { status: 201 });
        }
      }
      if (url.endsWith("/api/v1/cards/cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd/generated-documents")) {
        return jsonResponse({ items: [] });
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
      if (url.endsWith("/api/v1/cards/cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd")) {
        const current = cardItems.find(
          (item) => item.id === "cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd",
        );
        if (!current) {
          return jsonResponse({ detail: "Not Found" }, { status: 404 });
        }
        if (init?.method === "PATCH") {
          if (denyNextCardUpdate) {
            denyNextCardUpdate = false;
            return jsonResponse({ detail: "Forbidden" }, { status: 403 });
          }
          const payload = JSON.parse(String(init.body ?? "{}")) as {
            display_name?: string | null;
            public_view_enabled?: boolean | null;
            public_edit_enabled?: boolean | null;
          };
          const updated: CardSummaryRead = {
            ...current,
            display_name: payload.display_name ?? current.display_name,
            public_view_enabled: payload.public_view_enabled ?? current.public_view_enabled,
            public_edit_enabled: payload.public_edit_enabled ?? current.public_edit_enabled,
          };
          cardItems = cardItems.map((item) => (item.id === updated.id ? updated : item));
          return jsonResponse(updated);
        }
        if (init?.method === "DELETE") {
          const archived: CardSummaryRead = {
            ...current,
            lifecycle_status: "archived",
          };
          cardItems = cardItems.filter((item) => item.id !== current.id);
          return jsonResponse(archived);
        }
        return jsonResponse(currentCardRead("cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd"));
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
        cardValueStateById["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"].status = payload.value;
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
        cardValueStateById["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"].approved = payload.value;
        return jsonResponse({
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc",
          card_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          block_instance_id: payload.block_instance_id,
          field_id: "99999999-9999-4999-8999-999999999998",
          value: cardApprovedValue,
        });
      }
      if (
        url.endsWith(
          "/api/v1/cards/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/fields/9f9f9f9f-9f9f-49f9-89f9-9f9f9f9f9f9f",
        )
      ) {
        const payload = JSON.parse(String(init?.body)) as {
          value: string | null;
          block_instance_id: string | null;
        };
        const attachment = attachmentItems.find((item) => item.id === payload.value);
        const fileRef =
          payload.value && attachment
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
        cardValueStateById["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"].fileRef = fileRef;
        return jsonResponse({
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbe",
          card_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          block_instance_id: payload.block_instance_id,
          field_id: "9f9f9f9f-9f9f-49f9-89f9-9f9f9f9f9f9f",
          value: fileRef,
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

function currentCardRead(cardId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"): CardRead {
  const cardSummary =
    cardItems.find((item) => item.id === cardId) ??
    cardItems.find((item) => item.id === "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa") ??
    apiPayloads.cards.items[0];
  const state = cardValueStateById[cardSummary.id] ?? {
    status: "",
    approved: false,
    repeatableNotes: [],
    fileRef: null,
  };
  const blocks: CardRead["blocks"] = {
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
              value: state.status,
            },
            approved: {
              field_id: "99999999-9999-4999-8999-999999999998",
              code: "approved",
              field_type: "bool",
              value: state.approved,
            },
          },
        },
      ],
    },
  };
  const hasRepeatableDetails = schemaBlockItems.some(
    (block) => block.id === apiPayloads.repeatableBlock.id,
  );
  if (hasRepeatableDetails) {
    blocks.details = {
      block_id: apiPayloads.repeatableBlock.id,
      code: apiPayloads.repeatableBlock.code,
      instances: state.repeatableNotes.map((instance) => ({
        block_instance_id: instance.block_instance_id,
        ordinal: instance.ordinal,
        fields: {
          comment: {
            field_id: apiPayloads.repeatableField.id,
            code: apiPayloads.repeatableField.code,
            field_type: apiPayloads.repeatableField.field_type,
            value: instance.value,
          },
        },
      })),
    };
  }
  const hasFileRefField = schemaFieldItems.some(
    (field) => field.id === apiPayloads.fileRefField.id,
  );
  if (hasFileRefField) {
    blocks.main.instances[0].fields.supporting_file = {
      field_id: apiPayloads.fileRefField.id,
      code: apiPayloads.fileRefField.code,
      field_type: apiPayloads.fileRefField.field_type,
      value: state.fileRef,
    };
  }
  const fields: CardRead["fields"] = {
    status: {
      field_id: "99999999-9999-4999-8999-999999999999",
      code: "status",
      field_type: "text",
      value: state.status,
    },
    approved: {
      field_id: "99999999-9999-4999-8999-999999999998",
      code: "approved",
      field_type: "bool",
      value: state.approved,
    },
  };
  if (hasFileRefField) {
    fields.supporting_file = {
      field_id: apiPayloads.fileRefField.id,
      code: apiPayloads.fileRefField.code,
      field_type: apiPayloads.fileRefField.field_type,
      value: state.fileRef,
    };
  }

  return {
    ...apiPayloads.cardRead,
    id: cardSummary.id,
    registry_id: cardSummary.registry_id,
    organization_id: cardSummary.organization_id,
    display_name: cardSummary.display_name,
    blocks: {
      ...blocks,
    },
    fields,
  };
}

function enableRepeatableDetailsSchema() {
  schemaBlockItems = [...schemaBlockItems, apiPayloads.repeatableBlock];
  schemaFieldItems = [...schemaFieldItems, apiPayloads.repeatableField];
}

function enableFileRefSchema() {
  schemaFieldItems = [...schemaFieldItems, apiPayloads.fileRefField];
}

function currentRegistrySchema() {
  return {
    ...apiPayloads.schema,
    blocks: schemaBlockItems,
    fields: schemaFieldItems,
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
  expect((await screen.findAllByText("Реестр активов")).length).toBeGreaterThan(0);
  expect(screen.getAllByText("Основной блок").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Статус").length).toBeGreaterThan(0);
  await user.click(screen.getByRole("button", { name: "Карточки" }));
  expect((await screen.findAllByText("Карточка актива")).length).toBeGreaterThan(0);
  expect(screen.getAllByDisplayValue("drafted").length).toBeGreaterThan(0);
  const statusSaveButton = screen.getByRole("button", { name: "Сохранить Статус" });
  const statusForm = statusSaveButton.closest("form");
  expect(statusForm).toBeTruthy();
  const statusInput = within(statusForm as HTMLElement).getByLabelText("Статус");
  await user.clear(statusInput);
  await user.type(statusInput, "published");
  await user.click(statusSaveButton);
  expect(await screen.findByText("Сохранено: Статус")).toBeInTheDocument();

  const approvedSaveButton = screen.getByRole("button", { name: "Сохранить Подтверждено" });
  const approvedForm = approvedSaveButton.closest("form");
  expect(approvedForm).toBeTruthy();
  const approvedInput = within(approvedForm as HTMLElement).getByLabelText("Подтверждено");
  await user.click(approvedInput);
  await user.click(approvedSaveButton);
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

test("creates updates archives cards and manages repeatable blocks with bulk save", async () => {
  enableRepeatableDetailsSchema();
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Карточки" }));

  const cardPostCount = () =>
    vi
      .mocked(fetch)
      .mock.calls.filter(
        ([input, init]) =>
          String(input).endsWith("/api/v1/registries/77777777-7777-4777-8777-777777777777/cards") &&
          init?.method === "POST",
      ).length;

  await user.click(await screen.findByRole("button", { name: "Создать карточку" }));
  const postCountBeforeValidation = cardPostCount();
  await user.click(screen.getByRole("button", { name: "Создать" }));

  expect(await screen.findByText("Заполните обязательные поля")).toBeInTheDocument();
  expect(cardPostCount()).toBe(postCountBeforeValidation);

  await user.type(screen.getByLabelText("Название карточки"), "Новая карточка");
  await user.selectOptions(screen.getByLabelText("Организация карточки"), [
    "22222222-2222-4222-8222-222222222222",
  ]);
  await user.selectOptions(await screen.findByLabelText("Подразделение карточки"), [
    "2f2f2f2f-2f2f-42f2-82f2-2f2f2f2f2f2f",
  ]);
  await user.click(screen.getByLabelText("Публичный просмотр карточки"));
  await user.click(screen.getByLabelText("Публичное редактирование карточки"));
  await user.click(screen.getByRole("button", { name: "Создать" }));

  expect(await screen.findByText("Карточка создана")).toBeInTheDocument();
  expect((await screen.findAllByText("Новая карточка")).length).toBeGreaterThan(0);

  await user.click(screen.getByRole("button", { name: "Редактировать карточку Новая карточка" }));
  const displayNameInput = await screen.findByLabelText("Название карточки");
  await user.clear(displayNameInput);
  await user.type(displayNameInput, "Новая карточка обновлена");
  await user.click(screen.getByRole("button", { name: "Сохранить" }));

  expect(await screen.findByText("Карточка обновлена")).toBeInTheDocument();
  expect((await screen.findAllByText("Новая карточка обновлена")).length).toBeGreaterThan(0);

  await user.click(
    screen.getByRole("button", { name: "Добавить экземпляр блока Детали карточки" }),
  );
  expect(await screen.findByText("Экземпляр блока создан")).toBeInTheDocument();

  const bulkForm = await screen.findByRole("form", { name: "Массовое сохранение полей" });
  const statusInput = within(bulkForm).getByLabelText("Статус");
  await user.clear(statusInput);
  await user.type(statusInput, "published");
  await user.click(within(bulkForm).getByLabelText("Подтверждено"));
  await user.type(within(bulkForm).getByLabelText("Комментарий"), "Комментарий по карточке");
  await user.click(within(bulkForm).getByRole("button", { name: "Сохранить все поля" }));

  expect(await screen.findByText("Поля карточки сохранены")).toBeInTheDocument();
  await user.click(
    screen.getByRole("button", {
      name: "Архивировать экземпляр блока Детали карточки экземпляр 1",
    }),
  );
  expect(await screen.findByText("Экземпляр блока архивирован")).toBeInTheDocument();

  await user.click(
    screen.getByRole("button", { name: "Архивировать карточку Новая карточка обновлена" }),
  );
  expect(await screen.findByRole("dialog", { name: "Архивировать карточку" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Архивировать" }));

  expect(await screen.findByText("Карточка архивирована")).toBeInTheDocument();

  await waitFor(() => {
    const fetchMock = vi.mocked(fetch);
    const createCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith("/api/v1/registries/77777777-7777-4777-8777-777777777777/cards") &&
        init?.method === "POST",
    );
    expect(createCall).toBeTruthy();
    const createBody = JSON.parse(String(createCall?.[1]?.body ?? "{}")) as Record<string, unknown>;
    expect(createBody).toEqual({
      organization_id: "22222222-2222-4222-8222-222222222222",
      org_unit_id: "2f2f2f2f-2f2f-42f2-82f2-2f2f2f2f2f2f",
      display_name: "Новая карточка",
      public_view_enabled: true,
      public_edit_enabled: true,
    });
    expect(createBody).not.toHaveProperty("employees");
    expect(createBody).not.toHaveProperty("full_name");

    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        return (
          String(input).endsWith("/api/v1/cards/cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd") &&
          init?.method === "PATCH" &&
          body.display_name === "Новая карточка обновлена" &&
          body.public_view_enabled === true &&
          body.public_edit_enabled === true
        );
      }),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).endsWith(
            "/api/v1/cards/cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd/blocks/8d8d8d8d-8d8d-48d8-88d8-8d8d8d8d8d8d/instances",
          ) && init?.method === "POST",
      ),
    ).toBe(true);

    const bulkCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith("/api/v1/cards/cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd/values") &&
        init?.method === "PATCH",
    );
    expect(bulkCall).toBeTruthy();
    const bulkBody = JSON.parse(String(bulkCall?.[1]?.body ?? "{}")) as {
      values: { field_id: string; value: unknown; block_instance_id?: string | null }[];
    };
    expect(bulkBody.values).toEqual(
      expect.arrayContaining([
        {
          field_id: "99999999-9999-4999-8999-999999999999",
          value: "published",
          block_instance_id: null,
        },
        {
          field_id: "99999999-9999-4999-8999-999999999998",
          value: true,
          block_instance_id: null,
        },
        {
          field_id: "9d9d9d9d-9d9d-49d9-89d9-9d9d9d9d9d9d",
          value: "Комментарий по карточке",
          block_instance_id: "edededed-eded-4ede-8ede-edededededed",
        },
      ]),
    );
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).endsWith(
            "/api/v1/card-block-instances/edededed-eded-4ede-8ede-edededededed",
          ) && init?.method === "DELETE",
      ),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).endsWith("/api/v1/cards/cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd") &&
          init?.method === "DELETE",
      ),
    ).toBe(true);
  });
});

test("manages public links from authenticated card workspace", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Карточки" }));

  expect(await screen.findByRole("heading", { name: "Публичные ссылки" })).toBeInTheDocument();
  expect(screen.getAllByText("Статус ссылки: Активна").length).toBeGreaterThan(0);
  expect(screen.getByText("Статус ссылки: Отключена")).toBeInTheDocument();
  expect(screen.getByText("Статус ссылки: Истекла")).toBeInTheDocument();
  expect(screen.getByText("Редактирование полей: 1 из 5")).toBeInTheDocument();
  expect(screen.getByText("Загрузки вложений: 1 из 3")).toBeInTheDocument();
  expect(screen.getByText("Загрузки вложений: 2 из 2")).toBeInTheDocument();
  expect(screen.getByText("Лимит загрузок исчерпан")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Создать публичную ссылку" }));
  const expiresInput = await screen.findByLabelText("Срок действия ссылки, дней");
  await user.clear(expiresInput);
  await user.type(expiresInput, "5");
  await user.type(screen.getByLabelText("Лимит загрузок вложений"), "2");
  await user.click(screen.getByRole("button", { name: "Создать" }));

  expect(await screen.findByText("Публичная ссылка создана")).toBeInTheDocument();
  expect(screen.getByText("created-public-token")).toBeInTheDocument();
  expect(screen.getAllByText("Загрузки вложений: 0 из 2").length).toBeGreaterThan(0);

  await user.click(
    screen.getByRole("button", {
      name: "Отключить публичную ссылку 41414141",
    }),
  );
  expect(
    await screen.findByRole("dialog", { name: "Отключить публичную ссылку" }),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Отключить" }));

  expect(await screen.findByText("Публичная ссылка отключена")).toBeInTheDocument();

  await waitFor(() => {
    const fetchMock = vi.mocked(fetch);
    const createCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith("/api/v1/cards/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/public-links") &&
        init?.method === "POST",
    );
    expect(createCall).toBeTruthy();
    const createBody = JSON.parse(String(createCall?.[1]?.body ?? "{}")) as Record<string, unknown>;
    expect(createBody).toEqual({
      expires_in_days: 5,
      max_attachment_uploads: 2,
    });
    expect(createBody).not.toHaveProperty("max_uses");
    expect(createBody).not.toHaveProperty("used_count");

    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).endsWith("/api/v1/public-links/41414141-4141-4141-8141-414141414141") &&
          init?.method === "DELETE",
      ),
    ).toBe(true);
  });
});

test("creates edits and archives organizations in Russian UI", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Организации" }));

  const organizationPostCount = () =>
    vi
      .mocked(fetch)
      .mock.calls.filter(
        ([input, init]) =>
          String(input).endsWith("/api/v1/organizations") && init?.method === "POST",
      ).length;

  await user.click(screen.getByRole("button", { name: "Создать организацию" }));
  const postCountBeforeValidation = organizationPostCount();
  await user.click(screen.getByRole("button", { name: "Создать" }));

  expect(await screen.findByText("Заполните обязательные поля")).toBeInTheDocument();
  expect(organizationPostCount()).toBe(postCountBeforeValidation);

  await user.type(screen.getByLabelText("Код организации"), "branch");
  await user.type(screen.getByLabelText("Название организации"), "Дочерняя организация");
  await user.selectOptions(screen.getByLabelText("Родительская организация"), [
    "22222222-2222-4222-8222-222222222222",
  ]);
  await user.click(screen.getByRole("button", { name: "Создать" }));

  expect(await screen.findByText("Организация создана")).toBeInTheDocument();
  expect(screen.getByText("Дочерняя организация")).toBeInTheDocument();

  await user.click(
    screen.getByRole("button", { name: "Редактировать организацию Дочерняя организация" }),
  );
  const editNameInput = await screen.findByLabelText("Название организации");
  await user.clear(editNameInput);
  await user.type(editNameInput, "Обновленная организация");
  await user.click(screen.getByRole("button", { name: "Сохранить" }));

  expect(await screen.findByText("Организация обновлена")).toBeInTheDocument();
  expect(screen.getByText("Обновленная организация")).toBeInTheDocument();

  await user.click(
    screen.getByRole("button", { name: "Архивировать организацию Обновленная организация" }),
  );
  expect(
    await screen.findByRole("dialog", { name: "Архивировать организацию" }),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Архивировать" }));

  expect(await screen.findByText("Организация архивирована")).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.queryByText("Обновленная организация")).not.toBeInTheDocument(),
  );

  await waitFor(() => {
    const fetchMock = vi.mocked(fetch);
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          code?: string;
          name?: string;
          parent_id?: string | null;
          organization_type?: string;
        };
        return (
          String(input).endsWith("/api/v1/organizations") &&
          init?.method === "POST" &&
          body.code === "branch" &&
          body.name === "Дочерняя организация" &&
          body.parent_id === "22222222-2222-4222-8222-222222222222" &&
          body.organization_type === "organization"
        );
      }),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as { name?: string };
        return (
          String(input).endsWith("/api/v1/organizations/23232323-2323-4232-8232-232323232323") &&
          init?.method === "PATCH" &&
          body.name === "Обновленная организация"
        );
      }),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).endsWith("/api/v1/organizations/23232323-2323-4232-8232-232323232323") &&
          init?.method === "DELETE",
      ),
    ).toBe(true);
  });
});

test("creates edits resets password and archives users in Russian UI", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Пользователи" }));

  const userPostCount = () =>
    vi
      .mocked(fetch)
      .mock.calls.filter(
        ([input, init]) => String(input).endsWith("/api/v1/users") && init?.method === "POST",
      ).length;

  await user.click(screen.getByRole("button", { name: "Создать пользователя" }));
  const postCountBeforeValidation = userPostCount();
  await user.click(screen.getByRole("button", { name: "Создать" }));

  expect(await screen.findByText("Заполните обязательные поля")).toBeInTheDocument();
  expect(userPostCount()).toBe(postCountBeforeValidation);

  await user.type(screen.getByLabelText("Электронная почта пользователя"), "operator@example.test");
  await user.type(screen.getByLabelText("Имя пользователя"), "Оператор реестра");
  await user.type(screen.getByLabelText("Пароль пользователя"), "secret-created");
  await user.selectOptions(screen.getByLabelText("Статус пользователя"), ["active"]);
  await user.click(screen.getByLabelText("Суперпользователь"));
  await user.click(screen.getByRole("button", { name: "Создать" }));

  expect(await screen.findByText("Пользователь создан")).toBeInTheDocument();
  expect(screen.getByText("Оператор реестра")).toBeInTheDocument();
  expect(screen.queryByDisplayValue("secret-created")).not.toBeInTheDocument();
  expect(screen.queryByText("secret-created")).not.toBeInTheDocument();

  await user.click(
    screen.getByRole("button", { name: "Редактировать пользователя Оператор реестра" }),
  );
  const editNameInput = await screen.findByLabelText("Имя пользователя");
  await user.clear(editNameInput);
  await user.type(editNameInput, "Оператор архива");
  await user.selectOptions(screen.getByLabelText("Статус пользователя"), ["inactive"]);
  await user.click(screen.getByRole("button", { name: "Сохранить" }));

  expect(await screen.findByText("Пользователь обновлен")).toBeInTheDocument();
  expect(screen.getByText("Оператор архива")).toBeInTheDocument();

  await user.click(
    screen.getByRole("button", { name: "Сбросить пароль пользователя Оператор архива" }),
  );
  await user.click(screen.getByRole("button", { name: "Сохранить" }));
  expect(await screen.findByText("Заполните обязательные поля")).toBeInTheDocument();
  await user.type(screen.getByLabelText("Новый пароль"), "secret-reset");
  await user.click(screen.getByRole("button", { name: "Сохранить" }));

  expect(await screen.findByText("Пароль обновлен")).toBeInTheDocument();
  expect(screen.queryByDisplayValue("secret-reset")).not.toBeInTheDocument();
  expect(screen.queryByText("secret-reset")).not.toBeInTheDocument();

  await user.click(
    screen.getByRole("button", { name: "Архивировать пользователя Оператор архива" }),
  );
  expect(
    await screen.findByRole("dialog", { name: "Архивировать пользователя" }),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Архивировать" }));

  expect(await screen.findByText("Пользователь архивирован")).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByText("Оператор архива")).not.toBeInTheDocument());

  await waitFor(() => {
    const fetchMock = vi.mocked(fetch);
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        if (!String(input).endsWith("/api/v1/users") || init?.method !== "POST") {
          return false;
        }
        const body = JSON.parse(String(init.body ?? "{}")) as {
          email?: string;
          display_name?: string;
          password?: string;
          status?: string;
          is_superuser?: boolean;
        };
        return (
          body.email === "operator@example.test" &&
          body.display_name === "Оператор реестра" &&
          body.password === "secret-created" &&
          body.status === "active" &&
          body.is_superuser === true
        );
      }),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        if (
          !String(input).endsWith("/api/v1/users/24242424-2424-4242-8242-242424242424") ||
          init?.method !== "PATCH"
        ) {
          return false;
        }
        const body = JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>;
        return body.display_name === "Оператор архива" && body.password === undefined;
      }),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        if (
          !String(input).endsWith("/api/v1/users/24242424-2424-4242-8242-242424242424") ||
          init?.method !== "PATCH"
        ) {
          return false;
        }
        const body = JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>;
        return Object.keys(body).length === 1 && body.password === "secret-reset";
      }),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).endsWith("/api/v1/users/24242424-2424-4242-8242-242424242424") &&
          init?.method === "DELETE",
      ),
    ).toBe(true);
  });
});

test("shows localized user mutation denial text", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Пользователи" }));

  await user.click(screen.getAllByRole("button", { name: /Редактировать пользователя/ })[0]);
  const editNameInput = await screen.findByLabelText("Имя пользователя");
  await user.clear(editNameInput);
  await user.type(editNameInput, "Запрещенное изменение");
  denyNextUserUpdate = true;
  await user.click(screen.getByRole("button", { name: "Сохранить" }));

  expect(await screen.findByText("Действие недоступно.")).toBeInTheDocument();
  expect(screen.queryByText("Forbidden")).not.toBeInTheDocument();
});

test("issues and revokes access grants in Russian UI", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Доступ" }));

  const grantPostCount = () =>
    vi
      .mocked(fetch)
      .mock.calls.filter(
        ([input, init]) =>
          String(input).endsWith("/api/v1/access-grants") && init?.method === "POST",
      ).length;

  await user.click(screen.getByRole("button", { name: "Выдать право доступа" }));
  const postCountBeforeValidation = grantPostCount();
  await user.click(screen.getByRole("button", { name: "Создать" }));

  expect(await screen.findByText("Заполните обязательные поля")).toBeInTheDocument();
  expect(grantPostCount()).toBe(postCountBeforeValidation);

  await user.selectOptions(screen.getByLabelText("Пользователь для доступа"), [
    "11111111-1111-4111-8111-111111111111",
  ]);
  await user.selectOptions(screen.getByLabelText("Роль для доступа"), [
    "33333333-3333-4333-8333-333333333333",
  ]);
  expect(screen.getByText("Область доступа: Глобально")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Создать" }));

  expect(await screen.findByText("Право доступа выдано")).toBeInTheDocument();
  expect(screen.getAllByText("Глобально").length).toBeGreaterThan(0);

  await user.click(screen.getByRole("button", { name: "Выдать право доступа" }));
  await user.selectOptions(screen.getByLabelText("Пользователь для доступа"), [
    "11111111-1111-4111-8111-111111111111",
  ]);
  await user.selectOptions(screen.getByLabelText("Роль для доступа"), [
    "33333333-3333-4333-8333-333333333333",
  ]);
  await user.selectOptions(screen.getByLabelText("Организация доступа"), [
    "22222222-2222-4222-8222-222222222222",
  ]);
  await user.click(screen.getByLabelText("Включить дочерние организации"));
  fireEvent.change(screen.getByLabelText("Действует с"), { target: { value: "2026-07-01" } });
  fireEvent.change(screen.getByLabelText("Действует до"), { target: { value: "2026-07-31" } });
  expect(
    screen.getByText("Область доступа: Главная организация, с дочерними организациями"),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Создать" }));

  expect(await screen.findByText("Право доступа выдано")).toBeInTheDocument();
  expect(screen.getAllByText("С потомками").length).toBeGreaterThan(0);

  await user.click(screen.getByRole("button", { name: "Выдать право доступа" }));
  await user.selectOptions(screen.getByLabelText("Пользователь для доступа"), [
    "11111111-1111-4111-8111-111111111111",
  ]);
  await user.selectOptions(screen.getByLabelText("Роль для доступа"), [
    "33333333-3333-4333-8333-333333333333",
  ]);
  await user.selectOptions(screen.getByLabelText("Реестр доступа"), [
    "77777777-7777-4777-8777-777777777777",
  ]);
  expect(
    screen.getByText("Область доступа: Глобально; реестр: Реестр активов"),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Создать" }));

  expect(await screen.findByText("Право доступа выдано")).toBeInTheDocument();
  expect(screen.getAllByText("Реестр активов").length).toBeGreaterThan(0);

  const revokeButtons = screen.getAllByRole("button", { name: /Отозвать право доступа/ });
  await user.click(revokeButtons[revokeButtons.length - 1]);
  expect(await screen.findByRole("dialog", { name: "Отозвать право доступа" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Отозвать" }));

  expect(await screen.findByText("Право доступа отозвано")).toBeInTheDocument();

  await waitFor(() => {
    const fetchMock = vi.mocked(fetch);
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        if (!String(input).endsWith("/api/v1/access-grants") || init?.method !== "POST") {
          return false;
        }
        const body = JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>;
        return (
          body.user_id === "11111111-1111-4111-8111-111111111111" &&
          body.role_id === "33333333-3333-4333-8333-333333333333" &&
          body.registry_id === null &&
          body.organization_id === null &&
          body.include_descendants === false
        );
      }),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        if (!String(input).endsWith("/api/v1/access-grants") || init?.method !== "POST") {
          return false;
        }
        const body = JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>;
        return (
          body.organization_id === "22222222-2222-4222-8222-222222222222" &&
          body.include_descendants === true &&
          body.valid_from === "2026-07-01" &&
          body.valid_to === "2026-07-31"
        );
      }),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        if (!String(input).endsWith("/api/v1/access-grants") || init?.method !== "POST") {
          return false;
        }
        const body = JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>;
        return (
          body.registry_id === "77777777-7777-4777-8777-777777777777" &&
          body.organization_id === null
        );
      }),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).endsWith("/api/v1/access-grants/grant-4") && init?.method === "DELETE",
      ),
    ).toBe(true);
  });
});

test("shows localized access grant denial text", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Доступ" }));

  await user.click(screen.getByRole("button", { name: "Выдать право доступа" }));
  await user.selectOptions(screen.getByLabelText("Пользователь для доступа"), [
    "11111111-1111-4111-8111-111111111111",
  ]);
  await user.selectOptions(screen.getByLabelText("Роль для доступа"), [
    "33333333-3333-4333-8333-333333333333",
  ]);
  denyNextGrantCreate = true;
  await user.click(screen.getByRole("button", { name: "Создать" }));

  expect(await screen.findByText("Действие недоступно.")).toBeInTheDocument();
  expect(screen.queryByText("Forbidden")).not.toBeInTheDocument();
});

test("creates edits and archives registries in Russian UI", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Реестры" }));

  const registryPostCount = () =>
    vi
      .mocked(fetch)
      .mock.calls.filter(
        ([input, init]) => String(input).endsWith("/api/v1/registries") && init?.method === "POST",
      ).length;

  await user.click(screen.getByRole("button", { name: "Создать реестр" }));
  const postCountBeforeValidation = registryPostCount();
  await user.click(screen.getByRole("button", { name: "Создать" }));

  expect(await screen.findByText("Заполните обязательные поля")).toBeInTheDocument();
  expect(registryPostCount()).toBe(postCountBeforeValidation);

  await user.type(screen.getByLabelText("Код реестра"), "contracts");
  await user.type(screen.getByLabelText("Название реестра"), "Реестр договоров");
  await user.type(screen.getByLabelText("Описание реестра"), "Договорная работа");
  await user.click(screen.getByRole("button", { name: "Создать" }));

  expect(await screen.findByText("Реестр создан")).toBeInTheDocument();
  expect(screen.getAllByText("Реестр договоров").length).toBeGreaterThan(0);
  expect(screen.getByText(/contracts \/ v1 \/ Черновик/)).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Редактировать реестр Реестр договоров" }));
  const editNameInput = await screen.findByLabelText("Название реестра");
  await user.clear(editNameInput);
  await user.type(editNameInput, "Реестр договоров обновленный");
  const editDescriptionInput = screen.getByLabelText("Описание реестра");
  await user.clear(editDescriptionInput);
  await user.type(editDescriptionInput, "Обновленная договорная работа");
  await user.selectOptions(screen.getByLabelText("Статус реестра"), ["active"]);
  await user.click(screen.getByRole("button", { name: "Сохранить" }));

  expect(await screen.findByText("Реестр обновлен")).toBeInTheDocument();
  expect(screen.getAllByText("Реестр договоров обновленный").length).toBeGreaterThan(0);
  expect(screen.getByText(/contracts \/ v1 \/ Активно/)).toBeInTheDocument();

  await user.click(
    screen.getByRole("button", {
      name: "Архивировать реестр Реестр договоров обновленный",
    }),
  );
  expect(await screen.findByRole("dialog", { name: "Архивировать реестр" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Архивировать" }));

  expect(await screen.findByText("Реестр архивирован")).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.queryByText("Реестр договоров обновленный")).not.toBeInTheDocument(),
  );

  await waitFor(() => {
    const fetchMock = vi.mocked(fetch);
    const createCall = fetchMock.mock.calls.find(
      ([input, init]) => String(input).endsWith("/api/v1/registries") && init?.method === "POST",
    );
    expect(createCall).toBeTruthy();
    const createBody = JSON.parse(String(createCall?.[1]?.body ?? "{}")) as Record<string, unknown>;
    expect(createBody).toEqual({
      code: "contracts",
      name: "Реестр договоров",
      description: "Договорная работа",
    });
    for (const forbiddenField of [
      "employees",
      "employee",
      "full_name",
      "birth_date",
      "education",
      "qualification",
      "experience",
    ]) {
      expect(createBody).not.toHaveProperty(forbiddenField);
    }
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          name?: string;
          description?: string | null;
          lifecycle_status?: string | null;
        };
        return (
          String(input).endsWith("/api/v1/registries/25252525-2525-4252-8252-252525252525") &&
          init?.method === "PATCH" &&
          body.name === "Реестр договоров обновленный" &&
          body.description === "Обновленная договорная работа" &&
          body.lifecycle_status === "active"
        );
      }),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).endsWith("/api/v1/registries/25252525-2525-4252-8252-252525252525") &&
          init?.method === "DELETE",
      ),
    ).toBe(true);
  });
});

test("shows localized registry mutation denial text", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Реестры" }));

  await user.click(screen.getByRole("button", { name: "Редактировать реестр Реестр активов" }));
  const editNameInput = await screen.findByLabelText("Название реестра");
  await user.clear(editNameInput);
  await user.type(editNameInput, "Недоступный реестр");
  denyNextRegistryUpdate = true;
  await user.click(screen.getByRole("button", { name: "Сохранить" }));

  expect(await screen.findByText("Действие недоступно.")).toBeInTheDocument();
  expect(screen.queryByText("Forbidden")).not.toBeInTheDocument();
});

test("creates edits and archives schema blocks and fields in Russian UI", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Реестры" }));

  const blockPostCount = () =>
    vi
      .mocked(fetch)
      .mock.calls.filter(
        ([input, init]) =>
          String(input).endsWith(
            "/api/v1/registries/77777777-7777-4777-8777-777777777777/blocks",
          ) && init?.method === "POST",
      ).length;

  await user.click(screen.getByRole("button", { name: "Создать блок формы" }));
  const blockPostCountBeforeValidation = blockPostCount();
  await user.click(screen.getByRole("button", { name: "Создать" }));

  expect(await screen.findByText("Заполните обязательные поля")).toBeInTheDocument();
  expect(blockPostCount()).toBe(blockPostCountBeforeValidation);

  fireEvent.change(screen.getByLabelText("Код блока формы"), { target: { value: "details" } });
  fireEvent.change(screen.getByLabelText("Название блока формы"), {
    target: { value: "Детали карточки" },
  });
  fireEvent.change(screen.getByLabelText("Описание блока формы"), {
    target: { value: "Дополнительные данные" },
  });
  fireEvent.change(screen.getByLabelText("Позиция блока формы"), { target: { value: "10" } });
  await user.click(screen.getByLabelText("Повторяемый блок"));
  await user.click(screen.getByLabelText("Редактировать блок в публичной ссылке"));
  await user.click(screen.getByRole("button", { name: "Создать" }));

  expect(await screen.findByText("Блок формы создан")).toBeInTheDocument();
  expect(screen.getByText("Детали карточки")).toBeInTheDocument();
  expect(screen.getAllByText("Да").length).toBeGreaterThan(0);

  await user.click(
    screen.getByRole("button", { name: "Редактировать блок формы Детали карточки" }),
  );
  const blockTitleInput = await screen.findByLabelText("Название блока формы");
  fireEvent.change(blockTitleInput, { target: { value: "Детали карточки обновлены" } });
  const blockDescriptionInput = screen.getByLabelText("Описание блока формы");
  fireEvent.change(blockDescriptionInput, { target: { value: "Обновленное описание" } });
  fireEvent.change(screen.getByLabelText("Позиция блока формы"), { target: { value: "11" } });
  await user.click(screen.getByRole("button", { name: "Сохранить" }));

  expect(await screen.findByText("Блок формы обновлен")).toBeInTheDocument();
  expect(screen.getByText("Детали карточки обновлены")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Создать поле формы" }));
  await user.selectOptions(screen.getByLabelText("Блок формы"), [
    "26262626-2626-4262-8262-262626262626",
  ]);
  fireEvent.change(screen.getByLabelText("Код поля формы"), { target: { value: "amount" } });
  fireEvent.change(screen.getByLabelText("Название поля формы"), { target: { value: "Сумма" } });
  fireEvent.change(screen.getByLabelText("Описание поля формы"), {
    target: { value: "Числовое значение" },
  });
  await user.selectOptions(screen.getByLabelText("Тип поля формы"), ["number"]);
  fireEvent.change(screen.getByLabelText("Позиция поля формы"), { target: { value: "20" } });
  await user.click(screen.getByLabelText("Редактировать поле в публичной ссылке"));
  expect(screen.getByRole("option", { name: "Ссылка на организацию" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Создать" }));

  expect(await screen.findByText("Поле формы создано")).toBeInTheDocument();
  expect(screen.getByText("Сумма")).toBeInTheDocument();
  expect(screen.getByText("Число")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Редактировать поле формы Сумма" }));
  const fieldLabelInput = await screen.findByLabelText("Название поля формы");
  fireEvent.change(fieldLabelInput, { target: { value: "Сумма обновленная" } });
  const fieldDescriptionInput = screen.getByLabelText("Описание поля формы");
  fireEvent.change(fieldDescriptionInput, {
    target: { value: "Обновленное числовое значение" },
  });
  fireEvent.change(screen.getByLabelText("Позиция поля формы"), { target: { value: "21" } });
  await user.click(screen.getByLabelText("Активное поле"));
  await user.click(screen.getByRole("button", { name: "Сохранить" }));

  expect(await screen.findByText("Поле формы обновлено")).toBeInTheDocument();
  expect(screen.getByText("Сумма обновленная")).toBeInTheDocument();
  expect(screen.getAllByText("Неактивно").length).toBeGreaterThan(0);

  await user.click(
    screen.getByRole("button", { name: "Архивировать поле формы Сумма обновленная" }),
  );
  expect(
    await screen.findByRole("dialog", { name: "Архивировать поле формы" }),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Архивировать" }));

  expect(await screen.findByText("Поле формы архивировано")).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByText("Сумма обновленная")).not.toBeInTheDocument());

  await user.click(
    screen.getByRole("button", {
      name: "Архивировать блок формы Детали карточки обновлены",
    }),
  );
  expect(
    await screen.findByRole("dialog", { name: "Архивировать блок формы" }),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Архивировать" }));

  expect(await screen.findByText("Блок формы архивирован")).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.queryByText("Детали карточки обновлены")).not.toBeInTheDocument(),
  );

  await waitFor(() => {
    const fetchMock = vi.mocked(fetch);
    const createBlockCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith("/api/v1/registries/77777777-7777-4777-8777-777777777777/blocks") &&
        init?.method === "POST",
    );
    expect(createBlockCall).toBeTruthy();
    const createBlockBody = JSON.parse(String(createBlockCall?.[1]?.body ?? "{}")) as Record<
      string,
      unknown
    >;
    expect(createBlockBody).toEqual({
      code: "details",
      title: "Детали карточки",
      description: "Дополнительные данные",
      position: 10,
      is_repeatable: true,
      public_visible: true,
      public_editable: true,
    });

    const createFieldCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith("/api/v1/blocks/26262626-2626-4262-8262-262626262626/fields") &&
        init?.method === "POST",
    );
    expect(createFieldCall).toBeTruthy();
    const createFieldBody = JSON.parse(String(createFieldCall?.[1]?.body ?? "{}")) as Record<
      string,
      unknown
    >;
    expect(createFieldBody).toEqual({
      code: "amount",
      label: "Сумма",
      field_type: "number",
      description: "Числовое значение",
      position: 20,
      options_source_type: null,
      options_source_id: null,
      public_visible: true,
      public_editable: true,
    });

    for (const body of [createBlockBody, createFieldBody]) {
      for (const forbiddenField of [
        "employees",
        "employee",
        "full_name",
        "birth_date",
        "education",
        "qualification",
        "experience",
      ]) {
        expect(body).not.toHaveProperty(forbiddenField);
      }
    }

    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        if (
          !String(input).endsWith("/api/v1/blocks/26262626-2626-4262-8262-262626262626") ||
          init?.method !== "PATCH"
        ) {
          return false;
        }
        const body = JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>;
        return body.title === "Детали карточки обновлены" && body.position === 11;
      }),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        if (
          !String(input).endsWith("/api/v1/fields/27272727-2727-4272-8272-272727272727") ||
          init?.method !== "PATCH"
        ) {
          return false;
        }
        const body = JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>;
        return (
          body.label === "Сумма обновленная" && body.position === 21 && body.is_active === false
        );
      }),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).endsWith("/api/v1/fields/27272727-2727-4272-8272-272727272727") &&
          init?.method === "DELETE",
      ),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).endsWith("/api/v1/blocks/26262626-2626-4262-8262-262626262626") &&
          init?.method === "DELETE",
      ),
    ).toBe(true);
  });
});

test("creates edits and archives reference lists and items in Russian UI", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Реестры" }));

  expect(await screen.findByRole("heading", { name: "Справочники" })).toBeInTheDocument();
  expect((await screen.findAllByText("Статусы актива")).length).toBeGreaterThan(0);
  expect(screen.getAllByText("Активен").length).toBeGreaterThan(0);

  const referenceListPostCount = () =>
    vi
      .mocked(fetch)
      .mock.calls.filter(
        ([input, init]) =>
          String(input).endsWith(
            "/api/v1/registries/77777777-7777-4777-8777-777777777777/reference-lists",
          ) && init?.method === "POST",
      ).length;

  await user.click(screen.getByRole("button", { name: "Создать справочник" }));
  const postCountBeforeValidation = referenceListPostCount();
  await user.click(screen.getByRole("button", { name: "Создать" }));

  expect(await screen.findByText("Заполните обязательные поля")).toBeInTheDocument();
  expect(referenceListPostCount()).toBe(postCountBeforeValidation);

  fireEvent.change(screen.getByLabelText("Код справочника"), {
    target: { value: "priority_levels" },
  });
  fireEvent.change(screen.getByLabelText("Название справочника"), {
    target: { value: "Приоритеты" },
  });
  fireEvent.change(screen.getByLabelText("Описание справочника"), {
    target: { value: "Уровни приоритета карточки" },
  });
  await user.selectOptions(screen.getByLabelText("Организация-владелец"), [
    "22222222-2222-4222-8222-222222222222",
  ]);
  await user.click(screen.getByLabelText("Наследовать дочерним организациям"));
  await user.click(screen.getByLabelText("Заблокировать для дочерних организаций"));
  await user.click(screen.getByRole("button", { name: "Создать" }));

  expect(await screen.findByText("Справочник создан")).toBeInTheDocument();
  expect(screen.getAllByText("Приоритеты").length).toBeGreaterThan(0);

  await user.click(screen.getByRole("button", { name: "Редактировать справочник Приоритеты" }));
  const listNameInput = await screen.findByLabelText("Название справочника");
  fireEvent.change(listNameInput, { target: { value: "Приоритеты карточки" } });
  fireEvent.change(screen.getByLabelText("Описание справочника"), {
    target: { value: "Обновленные уровни приоритета" },
  });
  await user.click(screen.getByRole("button", { name: "Сохранить" }));

  expect(await screen.findByText("Справочник обновлен")).toBeInTheDocument();
  expect(screen.getAllByText("Приоритеты карточки").length).toBeGreaterThan(0);

  const referenceItemPostCount = () =>
    vi
      .mocked(fetch)
      .mock.calls.filter(
        ([input, init]) =>
          String(input).endsWith(
            "/api/v1/reference-lists/dededede-dede-4ede-8ede-dededededede/items",
          ) && init?.method === "POST",
      ).length;

  await user.click(screen.getByRole("button", { name: "Создать элемент справочника" }));
  const itemPostCountBeforeValidation = referenceItemPostCount();
  await user.click(screen.getByRole("button", { name: "Создать" }));

  expect(await screen.findByText("Заполните обязательные поля")).toBeInTheDocument();
  expect(referenceItemPostCount()).toBe(itemPostCountBeforeValidation);

  fireEvent.change(screen.getByLabelText("Код элемента справочника"), {
    target: { value: "high" },
  });
  fireEvent.change(screen.getByLabelText("Название элемента справочника"), {
    target: { value: "Высокий" },
  });
  fireEvent.change(screen.getByLabelText("Описание элемента справочника"), {
    target: { value: "Высокий приоритет" },
  });
  fireEvent.change(screen.getByLabelText("Позиция элемента справочника"), {
    target: { value: "5" },
  });
  await user.click(screen.getByRole("button", { name: "Создать" }));

  expect(await screen.findByText("Элемент справочника создан")).toBeInTheDocument();
  expect(screen.getAllByText("Высокий").length).toBeGreaterThan(0);

  await user.click(
    screen.getByRole("button", { name: "Редактировать элемент справочника Высокий" }),
  );
  const itemLabelInput = await screen.findByLabelText("Название элемента справочника");
  fireEvent.change(itemLabelInput, { target: { value: "Высокий приоритет" } });
  fireEvent.change(screen.getByLabelText("Описание элемента справочника"), {
    target: { value: "Обновленное значение" },
  });
  fireEvent.change(screen.getByLabelText("Позиция элемента справочника"), {
    target: { value: "6" },
  });
  await user.click(screen.getByRole("button", { name: "Сохранить" }));

  expect(await screen.findByText("Элемент справочника обновлен")).toBeInTheDocument();
  expect(screen.getAllByText("Высокий приоритет").length).toBeGreaterThan(0);

  await user.click(
    screen.getByRole("button", {
      name: "Архивировать элемент справочника Высокий приоритет",
    }),
  );
  expect(
    await screen.findByRole("dialog", { name: "Архивировать элемент справочника" }),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Архивировать" }));

  expect(await screen.findByText("Элемент справочника архивирован")).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByText("Высокий приоритет")).not.toBeInTheDocument());

  await user.click(
    screen.getByRole("button", { name: "Архивировать справочник Приоритеты карточки" }),
  );
  expect(
    await screen.findByRole("dialog", { name: "Архивировать справочник" }),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Архивировать" }));

  expect(await screen.findByText("Справочник архивирован")).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByText("Приоритеты карточки")).not.toBeInTheDocument());

  await waitFor(() => {
    const fetchMock = vi.mocked(fetch);
    const createListCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith(
          "/api/v1/registries/77777777-7777-4777-8777-777777777777/reference-lists",
        ) && init?.method === "POST",
    );
    expect(createListCall).toBeTruthy();
    const createListBody = JSON.parse(String(createListCall?.[1]?.body ?? "{}")) as Record<
      string,
      unknown
    >;
    expect(createListBody).toEqual({
      code: "priority_levels",
      name: "Приоритеты",
      owner_organization_id: "22222222-2222-4222-8222-222222222222",
      description: "Уровни приоритета карточки",
      inherit_to_descendants: true,
      locked_for_descendants: true,
      managed_by_system_only: false,
    });

    const createItemCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith(
          "/api/v1/reference-lists/dededede-dede-4ede-8ede-dededededede/items",
        ) && init?.method === "POST",
    );
    expect(createItemCall).toBeTruthy();
    const createItemBody = JSON.parse(String(createItemCall?.[1]?.body ?? "{}")) as Record<
      string,
      unknown
    >;
    expect(createItemBody).toEqual({
      code: "high",
      label: "Высокий",
      parent_id: null,
      description: "Высокий приоритет",
      position: 5,
    });

    for (const body of [createListBody, createItemBody]) {
      for (const forbiddenField of [
        "employees",
        "employee",
        "full_name",
        "birth_date",
        "education",
        "qualification",
        "experience",
      ]) {
        expect(body).not.toHaveProperty(forbiddenField);
      }
    }

    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        if (
          !String(input).endsWith("/api/v1/reference-lists/dededede-dede-4ede-8ede-dededededede") ||
          init?.method !== "PATCH"
        ) {
          return false;
        }
        const body = JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>;
        return (
          body.name === "Приоритеты карточки" &&
          body.description === "Обновленные уровни приоритета"
        );
      }),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        if (
          !String(input).endsWith("/api/v1/reference-items/cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd") ||
          init?.method !== "PATCH"
        ) {
          return false;
        }
        const body = JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>;
        return (
          body.label === "Высокий приоритет" &&
          body.description === "Обновленное значение" &&
          body.position === 6
        );
      }),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).endsWith("/api/v1/reference-items/cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd") &&
          init?.method === "DELETE",
      ),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).endsWith("/api/v1/reference-lists/dededede-dede-4ede-8ede-dededededede") &&
          init?.method === "DELETE",
      ),
    ).toBe(true);
  });
});

test("wires select fields to reference lists without hardcoded options", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Реестры" }));

  await user.click(screen.getByRole("button", { name: "Создать поле формы" }));
  fireEvent.change(screen.getByLabelText("Код поля формы"), { target: { value: "state" } });
  fireEvent.change(screen.getByLabelText("Название поля формы"), {
    target: { value: "Состояние" },
  });
  await user.selectOptions(screen.getByLabelText("Тип поля формы"), ["select"]);
  await user.selectOptions(screen.getByLabelText("Справочник для поля"), [
    "abababab-abab-4aba-8aba-abababababab",
  ]);
  expect(screen.queryByLabelText("ID справочника")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Создать" }));

  expect(await screen.findByText("Поле формы создано")).toBeInTheDocument();
  expect(screen.getByText("Состояние")).toBeInTheDocument();
  expect(screen.getAllByText("Справочник").length).toBeGreaterThan(0);

  await waitFor(() => {
    const createFieldCall = vi
      .mocked(fetch)
      .mock.calls.find(
        ([input, init]) =>
          String(input).endsWith("/api/v1/blocks/88888888-8888-4888-8888-888888888888/fields") &&
          init?.method === "POST",
      );
    expect(createFieldCall).toBeTruthy();
    const body = JSON.parse(String(createFieldCall?.[1]?.body ?? "{}")) as Record<string, unknown>;
    expect(body).toMatchObject({
      code: "state",
      label: "Состояние",
      field_type: "select",
      options_source_type: "reference_list",
      options_source_id: "abababab-abab-4aba-8aba-abababababab",
    });
    expect(body).not.toHaveProperty("options");
    expect(body).not.toHaveProperty("employees");
  });
});

test("shows localized locked reference list denial text", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Реестры" }));

  expect((await screen.findAllByText("Статусы актива")).length).toBeGreaterThan(0);
  expect(screen.getByText("Заблокирован для дочерних организаций")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Редактировать справочник Статусы актива" }));
  const listNameInput = await screen.findByLabelText("Название справочника");
  fireEvent.change(listNameInput, { target: { value: "Недоступный справочник" } });
  denyNextReferenceListUpdate = true;
  await user.click(screen.getByRole("button", { name: "Сохранить" }));

  expect(await screen.findByText("Действие недоступно.")).toBeInTheDocument();
  expect(screen.queryByText("Forbidden")).not.toBeInTheDocument();
  expect(screen.getAllByText("Статусы актива").length).toBeGreaterThan(0);
});

test("shows localized locked schema field denial text", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Реестры" }));

  denyNextFieldArchive = true;
  await user.click(screen.getByRole("button", { name: "Архивировать поле формы Статус" }));
  expect(
    await screen.findByRole("dialog", { name: "Архивировать поле формы" }),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Архивировать" }));

  expect(await screen.findByText("Действие недоступно.")).toBeInTheDocument();
  expect(screen.queryByText("Forbidden")).not.toBeInTheDocument();
  expect(screen.getAllByText("Статус").length).toBeGreaterThan(0);
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
  await user.click(screen.getByRole("button", { name: "Сформировать PDF" }));
  expect(await screen.findByText("PDF сформирован")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Скачать документ Сводка карточки PDF" }),
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
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const url = input instanceof Request ? input.url : String(input);
        if (
          !url.endsWith(
            "/api/v1/cards/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/generated-documents/pdf",
          ) ||
          init?.method !== "POST"
        ) {
          return false;
        }
        const body = JSON.parse(String(init.body ?? "{}")) as {
          template_id?: string;
          title?: string;
        };
        return (
          body.template_id === "dddddddd-dddd-4ddd-8ddd-dddddddddddd" &&
          body.title === "Сводка карточки PDF"
        );
      }),
    ).toBe(true);
  });
});

test("selects and clears file_ref fields from existing card attachments", async () => {
  enableFileRefSchema();
  attachmentItems = [
    {
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
    },
  ];
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Карточки" }));

  const bulkForm = await screen.findByRole("form", { name: "Массовое сохранение полей" });
  expect(within(bulkForm).queryByLabelText("Файл карточки")).not.toBeInTheDocument();

  const saveButton = await screen.findByRole("button", { name: "Сохранить Файл карточки" });
  const fieldForm = saveButton.closest("form");
  expect(fieldForm).toBeTruthy();
  const fileSelect = within(fieldForm as HTMLElement).getByLabelText("Файл карточки");
  expect(fileSelect.tagName).toBe("SELECT");
  expect(within(fieldForm as HTMLElement).getByText("Акт проверки (akt.txt)")).toBeInTheDocument();

  await user.selectOptions(fileSelect, "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee");
  await user.click(saveButton);

  expect(await screen.findByText("Сохранено: Файл карточки")).toBeInTheDocument();
  await waitFor(() => {
    const fileRefCalls = vi.mocked(fetch).mock.calls.filter(([input, init]) => {
      const url = input instanceof Request ? input.url : String(input);
      return (
        url.endsWith(
          "/api/v1/cards/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/fields/9f9f9f9f-9f9f-49f9-89f9-9f9f9f9f9f9f",
        ) && init?.method === "PATCH"
      );
    });
    expect(
      fileRefCalls.some(([, init]) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as { value?: unknown };
        return body.value === "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
      }),
    ).toBe(true);
  });

  await user.click(within(fieldForm as HTMLElement).getByRole("button", { name: "Очистить файл" }));
  await user.click(saveButton);

  await waitFor(() => {
    const fileRefCalls = vi.mocked(fetch).mock.calls.filter(([input, init]) => {
      const url = input instanceof Request ? input.url : String(input);
      return (
        url.endsWith(
          "/api/v1/cards/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/fields/9f9f9f9f-9f9f-49f9-89f9-9f9f9f9f9f9f",
        ) && init?.method === "PATCH"
      );
    });
    expect(
      fileRefCalls.some(([, init]) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as { value?: unknown };
        return body.value === null;
      }),
    ).toBe(true);
  });
});

test("shows file_ref empty and archived states in Russian UI", async () => {
  enableFileRefSchema();
  cardValueStateById["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"].fileRef = {
    attachment_id: "f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1",
    title: "Архивный акт",
    original_filename: "archive.txt",
    content_type: "text/plain",
    content_length_bytes: 12,
    scanner_status: "deferred",
    archived_at: "2026-06-28T12:02:00Z",
  };
  attachmentItems = [];
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Карточки" }));

  const saveButton = await screen.findByRole("button", { name: "Сохранить Файл карточки" });
  const fieldForm = saveButton.closest("form");
  expect(fieldForm).toBeTruthy();
  expect(within(fieldForm as HTMLElement).getByText("Файл архивирован")).toBeInTheDocument();
  expect(within(fieldForm as HTMLElement).getByText("Нет вложений")).toBeInTheDocument();
  expect(
    within(fieldForm as HTMLElement).getByText("Сначала загрузите файл во Вложения"),
  ).toBeInTheDocument();
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

test("manages report templates and report runs in Russian registry UI", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Реестры" }));

  expect(await screen.findByRole("heading", { name: "Отчеты" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Сформированные отчеты" })).toBeInTheDocument();
  expect(screen.getAllByText("Сводный отчет").length).toBeGreaterThan(0);
  expect(screen.getByText("Нет сформированных отчетов")).toBeInTheDocument();

  await user.type(screen.getByLabelText("Код шаблона отчета"), "cards_summary");
  await user.type(screen.getByLabelText("Название шаблона отчета"), "Отчет по карточкам");
  await user.type(screen.getByLabelText("Описание шаблона отчета"), "Список видимых карточек");
  await user.selectOptions(screen.getByLabelText("Тип отчета"), "registry_cards");
  fireEvent.change(screen.getByLabelText("Параметры шаблона JSON"), {
    target: { value: '{"limit":20}' },
  });
  await user.click(screen.getByRole("button", { name: "Создать шаблон отчета" }));

  expect(await screen.findByText("Шаблон отчета создан")).toBeInTheDocument();
  expect(screen.getAllByText("Отчет по карточкам").length).toBeGreaterThan(0);

  await user.click(
    screen.getByRole("button", { name: "Редактировать шаблон отчета Отчет по карточкам" }),
  );
  await user.clear(screen.getByLabelText("Новое название шаблона отчета"));
  await user.type(screen.getByLabelText("Новое название шаблона отчета"), "Обновленный отчет");
  await user.clear(screen.getByLabelText("Новое описание шаблона отчета"));
  await user.type(
    screen.getByLabelText("Новое описание шаблона отчета"),
    "Обновленная сводка карточек",
  );
  fireEvent.change(screen.getByLabelText("Новые параметры шаблона JSON"), {
    target: { value: '{"limit":30}' },
  });
  await user.click(screen.getByRole("button", { name: "Сохранить шаблон отчета" }));

  expect(await screen.findByText("Шаблон отчета обновлен")).toBeInTheDocument();
  expect(screen.getAllByText("Обновленный отчет").length).toBeGreaterThan(0);

  await user.selectOptions(
    screen.getByLabelText("Шаблон отчета"),
    "52525252-5252-4252-8252-525252525252",
  );
  fireEvent.change(screen.getByLabelText("Параметры запуска JSON"), {
    target: { value: '{"limit":20}' },
  });
  await user.click(screen.getByRole("button", { name: "Сформировать отчет" }));

  expect(await screen.findByText("Отчет сформирован")).toBeInTheDocument();
  expect(
    await screen.findByText((_, element) =>
      Boolean(
        element?.tagName === "SPAN" &&
        element.textContent?.includes("Карточки реестра / Сформирован / 1"),
      ),
    ),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Скачать отчет Обновленный отчет" }));
  expect(await screen.findByText("Отчет скачан")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Архивировать отчет Обновленный отчет" }));
  expect(await screen.findByText("Отчет архивирован")).toBeInTheDocument();
  await user.click(
    screen.getByRole("button", { name: "Архивировать шаблон отчета Обновленный отчет" }),
  );
  expect(await screen.findByText("Шаблон отчета архивирован")).toBeInTheDocument();

  await waitFor(() => {
    const fetchMock = vi.mocked(fetch);
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const url = input instanceof Request ? input.url : String(input);
        if (
          !url.endsWith(
            "/api/v1/registries/77777777-7777-4777-8777-777777777777/report-templates",
          ) ||
          init?.method !== "POST"
        ) {
          return false;
        }
        const body = JSON.parse(String(init.body ?? "{}")) as {
          code?: string;
          name?: string;
          description?: string | null;
          report_type?: string;
          default_parameters_json?: unknown;
          output_format?: string;
        };
        return (
          body.code === "cards_summary" &&
          body.name === "Отчет по карточкам" &&
          body.description === "Список видимых карточек" &&
          body.report_type === "registry_cards" &&
          JSON.stringify(body.default_parameters_json) === JSON.stringify({ limit: 20 }) &&
          body.output_format === "json"
        );
      }),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const url = input instanceof Request ? input.url : String(input);
        if (
          !url.endsWith("/api/v1/report-templates/52525252-5252-4252-8252-525252525252") ||
          init?.method !== "PATCH"
        ) {
          return false;
        }
        const body = JSON.parse(String(init.body ?? "{}")) as {
          name?: string;
          description?: string | null;
          default_parameters_json?: unknown;
        };
        return (
          body.name === "Обновленный отчет" &&
          body.description === "Обновленная сводка карточек" &&
          JSON.stringify(body.default_parameters_json) === JSON.stringify({ limit: 30 })
        );
      }),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const url = input instanceof Request ? input.url : String(input);
        if (
          !url.endsWith("/api/v1/report-templates/52525252-5252-4252-8252-525252525252/runs") ||
          init?.method !== "POST"
        ) {
          return false;
        }
        const body = JSON.parse(String(init.body ?? "{}")) as { parameters?: unknown };
        return JSON.stringify(body.parameters) === JSON.stringify({ limit: 20 });
      }),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const url = input instanceof Request ? input.url : String(input);
        const headers = init?.headers as Record<string, string> | undefined;
        return (
          url.endsWith("/api/v1/report-runs/53535353-5353-4353-8353-535353535353/content") &&
          init?.method === "GET" &&
          headers?.Authorization === "Bearer test-token"
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

  await user.click(screen.getByRole("button", { name: "Загрузить файл" }));
  expect(await screen.findByText("Выберите файл")).toBeInTheDocument();

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
