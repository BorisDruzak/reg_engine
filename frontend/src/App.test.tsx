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
  CardImportCommitRead,
  CardImportPreviewRead,
} from "@/api/types";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

type TestCardTemplateRead = {
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
        card_title_label: "Название карточки",
        lifecycle_status: "active",
        schema_version: 1,
        owner_organization_id: "22222222-2222-4222-8222-222222222222",
        is_default_for_owner_tree: true,
      },
    ],
  },
  schema: {
    registry: {
      id: "77777777-7777-4777-8777-777777777777",
      code: "assets",
      name: "Реестр активов",
      description: "Учет активов",
      card_title_label: "Название карточки",
      lifecycle_status: "active",
      schema_version: 1,
      owner_organization_id: "22222222-2222-4222-8222-222222222222",
      is_default_for_owner_tree: true,
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
        required_mode: "not_required",
        options_source_type: null,
        options_source_id: null,
        options_config_json: null,
        is_active: true,
        is_list_display: false,
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
        required_mode: "not_required",
        options_source_type: null,
        options_source_id: null,
        options_config_json: null,
        is_active: true,
        is_list_display: false,
        public_visible: true,
        public_editable: false,
      },
    ],
    templates: [
      {
        id: "71717171-7171-4171-8171-717171717171",
        registry_id: "77777777-7777-4777-8777-777777777777",
        code: "municipal_card",
        name: "Муниципальная карточка",
        description: null,
        position: 0,
        field_schema_json: {
          field_ids: [
            "99999999-9999-4999-8999-999999999999",
            "99999999-9999-4999-8999-999999999998",
          ],
        },
        default_values_json: [
          {
            field_id: "99999999-9999-4999-8999-999999999999",
            value: "Предзаполнено шаблоном",
          },
        ],
        is_active: true,
        created_at: "2026-06-28T12:00:00Z",
        archived_at: null,
      },
    ] as TestCardTemplateRead[],
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
    required_mode: "not_required",
    options_source_type: null,
    options_source_id: null,
    options_config_json: null,
    is_active: true,
    is_list_display: false,
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
    required_mode: "not_required",
    options_source_type: null,
    options_source_id: null,
    options_config_json: null,
    is_active: true,
    is_list_display: false,
    public_visible: false,
    public_editable: false,
  },
  cards: {
    items: [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        registry_id: "77777777-7777-4777-8777-777777777777",
        card_template_id: "71717171-7171-4171-8171-717171717171",
        card_template_name: "Муниципальная карточка",
        organization_id: "22222222-2222-4222-8222-222222222222",
        org_unit_id: null,
        display_name: "Карточка актива",
        lifecycle_status: "draft",
        public_view_enabled: false,
        public_edit_enabled: true,
        list_fields: [],
      },
    ],
  },
  cardRead: {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    registry_id: "77777777-7777-4777-8777-777777777777",
    card_template_id: "71717171-7171-4171-8171-717171717171",
    card_template_name: "Муниципальная карточка",
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
let cardTemplateItems: TestCardTemplateRead[];
let denyNextFieldArchive = false;
let referenceListItems: ReferenceListRead[];
let referenceItemItems: ReferenceItemRead[];
let denyNextReferenceListUpdate = false;
let userItems: UserRead[];
let denyNextUserUpdate = false;
let grantItems: AccessGrantRead[];
let denyNextGrantCreate = false;
let denyAdminReadQueries = false;
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
let publicAttachmentListMeta: {
  max_attachment_uploads: number | null;
  attachment_upload_count: number;
  can_upload_attachments: boolean;
};
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
  cardTemplateItems = [...apiPayloads.schema.templates];
  denyNextFieldArchive = false;
  referenceListItems = [...apiPayloads.referenceLists.items];
  referenceItemItems = [...apiPayloads.referenceItems.items];
  denyNextReferenceListUpdate = false;
  userItems = [...apiPayloads.users.items];
  denyNextUserUpdate = false;
  grantItems = [...apiPayloads.grants.items];
  denyNextGrantCreate = false;
  denyAdminReadQueries = false;
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
  publicAttachmentListMeta = {
    max_attachment_uploads: null,
    attachment_upload_count: 0,
    can_upload_attachments: true,
  };
  documentTemplateItems = [...apiPayloads.documentTemplates.items];
  generatedDocumentItems = [];
  reportTemplateItems = [...apiPayloads.reportTemplates.items];
  reportRunItems = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      const requestUrl = new URL(url, "http://localhost");
      const pathname = requestUrl.pathname;
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
        return jsonResponse({ items: attachmentItems, ...publicAttachmentListMeta });
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
        const nextUploadCount = publicAttachmentListMeta.attachment_upload_count + 1;
        publicAttachmentListMeta = {
          ...publicAttachmentListMeta,
          attachment_upload_count: nextUploadCount,
          can_upload_attachments:
            publicAttachmentListMeta.max_attachment_uploads === null ||
            nextUploadCount < publicAttachmentListMeta.max_attachment_uploads,
        };
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
      if (url.endsWith("/api/v1/organizations/tree")) {
        return jsonResponse({ items: organizationTreeItems() });
      }
      if (url.endsWith("/api/v1/organizations/22222222-2222-4222-8222-222222222222/org-units")) {
        return jsonResponse({ items: orgUnitItems });
      }
      const organizationCardMatch = pathname.match(/\/api\/v1\/organizations\/([^/]+)\/cards$/);
      if (organizationCardMatch) {
        if (init?.method === "POST") {
          const payload = JSON.parse(String(init.body ?? "{}")) as {
            display_name?: string;
            card_template_id?: string | null;
            public_view_enabled?: boolean;
            public_edit_enabled?: boolean;
          };
          const template =
            cardTemplateItems.find((item) => item.id === payload.card_template_id) ??
            cardTemplateItems[0];
          const created: CardSummaryRead = {
            id: "cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd",
            registry_id: "77777777-7777-4777-8777-777777777777",
            card_template_id: template.id,
            card_template_name: template.name,
            organization_id: organizationCardMatch[1],
            org_unit_id: null,
            display_name: payload.display_name ?? template?.name ?? "Новая карточка",
            lifecycle_status: "draft",
            public_view_enabled: payload.public_view_enabled ?? false,
            public_edit_enabled: payload.public_edit_enabled ?? false,
            list_fields: [],
          };
          cardItems = [...cardItems, created];
          cardValueStateById[created.id] = {
            status: String(template?.default_values_json[0]?.value ?? ""),
            approved: false,
            repeatableNotes: [],
            fileRef: null,
          };
          return jsonResponse(created, { status: 201 });
        }
        const filteredCards = cardItems.filter((item) => cardMatchesListFilters(item, requestUrl));
        return jsonResponse({ items: filteredCards.map(cardSummaryWithListFields) });
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
        if (init?.method === "GET" && denyAdminReadQueries) {
          return jsonResponse({ detail: "Forbidden" }, { status: 403 });
        }
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
        if (denyAdminReadQueries) {
          return jsonResponse({ detail: "Forbidden" }, { status: 403 });
        }
        return jsonResponse(apiPayloads.roles);
      }
      if (url.endsWith("/api/v1/permissions")) {
        if (denyAdminReadQueries) {
          return jsonResponse({ detail: "Forbidden" }, { status: 403 });
        }
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
        if (init?.method === "GET" && denyAdminReadQueries) {
          return jsonResponse({ detail: "Forbidden" }, { status: 403 });
        }
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
            owner_organization_id?: string | null;
            inherit_to_descendants?: boolean | null;
            locked_for_descendants?: boolean | null;
            managed_by_system_only?: boolean | null;
          };
          const updated: ReferenceListRead = {
            ...current,
            name: payload.name ?? current.name,
            description: payload.description ?? current.description,
            owner_organization_id:
              "owner_organization_id" in payload
                ? (payload.owner_organization_id ?? null)
                : current.owner_organization_id,
            inherit_to_descendants:
              payload.inherit_to_descendants ?? current.inherit_to_descendants,
            locked_for_descendants:
              payload.locked_for_descendants ?? current.locked_for_descendants,
            managed_by_system_only:
              payload.managed_by_system_only ?? current.managed_by_system_only,
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
            layout_columns?: number;
            display_config_json?: Record<string, unknown> | null;
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
            layout_columns: payload.layout_columns ?? 1,
            display_config_json: payload.display_config_json ?? null,
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
            required_mode?: string;
            options_source_type?: string | null;
            options_source_id?: string | null;
            options_config_json?: Record<string, unknown> | null;
            display_config_json?: Record<string, unknown> | null;
            is_list_display?: boolean;
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
            required_mode: payload.required_mode ?? "not_required",
            options_source_type: payload.options_source_type ?? null,
            options_source_id: payload.options_source_id ?? null,
            options_config_json: payload.options_config_json ?? null,
            display_config_json: payload.display_config_json ?? null,
            is_active: true,
            is_list_display: payload.is_list_display ?? false,
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
            layout_columns?: number | null;
            display_config_json?: Record<string, unknown> | null;
          };
          const updated: FormBlockRead = {
            ...current,
            title: payload.title ?? current.title,
            description: payload.description ?? current.description,
            position: payload.position ?? current.position,
            layout_columns: payload.layout_columns ?? current.layout_columns,
            display_config_json:
              "display_config_json" in payload
                ? (payload.display_config_json ?? null)
                : current.display_config_json,
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
            required_mode?: string | null;
            is_active?: boolean | null;
            is_list_display?: boolean | null;
            options_config_json?: Record<string, unknown> | null;
            display_config_json?: Record<string, unknown> | null;
          };
          const updated: FormFieldRead = {
            ...current,
            label: payload.label ?? current.label,
            description: payload.description ?? current.description,
            position: payload.position ?? current.position,
            required_mode: payload.required_mode ?? current.required_mode,
            is_active: payload.is_active ?? current.is_active,
            is_list_display: payload.is_list_display ?? current.is_list_display,
            options_config_json: Object.hasOwn(payload, "options_config_json")
              ? (payload.options_config_json ?? null)
              : current.options_config_json,
            display_config_json: Object.hasOwn(payload, "display_config_json")
              ? (payload.display_config_json ?? null)
              : current.display_config_json,
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
        url.includes("/api/v1/registries/77777777-7777-4777-8777-777777777777/report-templates")
      ) {
        if (init?.method === "POST") {
          const payload = JSON.parse(String(init.body ?? "{}")) as {
            code: string;
            name: string;
            description: string | null;
            report_type: string;
            parameters_schema_json: Record<string, unknown> | null;
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
            parameters_schema_json: payload.parameters_schema_json,
            default_parameters_json: payload.default_parameters_json,
            output_format: payload.output_format,
            is_active: true,
            created_at: "2026-06-28T12:10:00Z",
            archived_at: null,
          };
          reportTemplateItems = [...reportTemplateItems, created];
          return jsonResponse(created, { status: 201 });
        }
        const includeArchive = url.includes("include_archive=true");
        return jsonResponse({
          items: includeArchive
            ? reportTemplateItems
            : reportTemplateItems.filter((item) => !item.archived_at),
        });
      }
      if (url.endsWith("/api/v1/report-templates/52525252-5252-4252-8252-525252525252")) {
        if (init?.method === "PATCH") {
          const payload = JSON.parse(String(init.body ?? "{}")) as {
            name?: string;
            description?: string | null;
            report_type?: string;
            parameters_schema_json?: Record<string, unknown> | null;
            default_parameters_json?: Record<string, unknown> | null;
            output_format?: string;
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
            report_type: payload.report_type ?? current.report_type,
            parameters_schema_json: Object.hasOwn(payload, "parameters_schema_json")
              ? (payload.parameters_schema_json ?? null)
              : current.parameters_schema_json,
            default_parameters_json: Object.hasOwn(payload, "default_parameters_json")
              ? (payload.default_parameters_json ?? null)
              : current.default_parameters_json,
            output_format: payload.output_format ?? current.output_format,
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
        reportTemplateItems = reportTemplateItems.map((item) =>
          item.id === archived.id ? archived : item,
        );
        return jsonResponse(archived);
      }
      const reportRunTemplateMatch = url.match(/\/api\/v1\/report-templates\/([^/]+)\/runs$/);
      if (reportRunTemplateMatch) {
        const reportTemplateId = reportRunTemplateMatch[1]!;
        const payload = JSON.parse(String(init?.body ?? "{}")) as {
          parameters: Record<string, unknown> | null;
        };
        const template = reportTemplateItems.find((item) => item.id === reportTemplateId)!;
        const outputFormat = template.output_format;
        const outputFilename = `report.${outputFormat}`;
        const outputContentTypes: Record<string, string> = {
          csv: "text/csv; charset=utf-8",
          json: "application/json",
          pdf: "application/pdf",
          xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        };
        const created: ReportRunRead = {
          id: "53535353-5353-4353-8353-535353535353",
          report_template_id: reportTemplateId,
          registry_id: "77777777-7777-4777-8777-777777777777",
          card_id: null,
          report_type: template.report_type,
          run_status: "completed",
          parameters_json: payload.parameters,
          summary_json: { row_count: 1 },
          row_count: 1,
          output_filename: outputFilename,
          output_content_type: outputContentTypes[outputFormat] ?? "application/json",
          generated_by: "11111111-1111-4111-8111-111111111111",
          started_at: "2026-06-28T12:11:00Z",
          finished_at: "2026-06-28T12:11:01Z",
          created_at: "2026-06-28T12:11:01Z",
          archived_at: null,
        };
        reportRunItems = [created, ...reportRunItems];
        return jsonResponse(created, { status: 201 });
      }
      if (url.includes("/api/v1/registries/77777777-7777-4777-8777-777777777777/report-runs")) {
        const includeArchive = url.includes("include_archive=true");
        return jsonResponse({
          items: includeArchive
            ? reportRunItems
            : reportRunItems.filter((item) => !item.archived_at),
        });
      }
      if (url.includes("/api/v1/report-runs/53535353-5353-4353-8353-535353535353/content")) {
        const run = reportRunItems.find(
          (item) => item.id === "53535353-5353-4353-8353-535353535353",
        );
        const isCsvReport = run?.output_filename.endsWith(".csv") ?? false;
        const isPdfReport = run?.output_filename.endsWith(".pdf") ?? false;
        const isXlsxReport = run?.output_filename.endsWith(".xlsx") ?? false;
        return new Response(
          isPdfReport
            ? new Blob(["pdf"], { type: "application/pdf" })
            : isXlsxReport
              ? new Blob(["xlsx"], {
                  type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                })
              : isCsvReport
                ? "id,display_name,lifecycle_status\ncard-1,Отчетная карточка,draft\n"
                : '{"format_version":"report_run_v1","cards":[]}',
          {
            status: 200,
            headers: {
              "Content-Type": isPdfReport
                ? "application/pdf"
                : isXlsxReport
                  ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  : isCsvReport
                    ? "text/csv; charset=utf-8"
                    : "application/json",
              "X-Report-Filename": run?.output_filename ?? "report.json",
            },
          },
        );
      }
      if (url.endsWith("/api/v1/report-runs/53535353-5353-4353-8353-535353535353")) {
        const archived = {
          ...reportRunItems.find((item) => item.id === "53535353-5353-4353-8353-535353535353")!,
          archived_at: "2026-06-28T12:13:00Z",
        };
        reportRunItems = reportRunItems.map((item) => (item.id === archived.id ? archived : item));
        return jsonResponse(archived);
      }
      if (
        url.endsWith(
          "/api/v1/registries/77777777-7777-4777-8777-777777777777/exports/cards?format=json",
        )
      ) {
        return new Response('{"format_version":"cards_export_v1","cards":[]}', {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (
        url.endsWith(
          "/api/v1/registries/77777777-7777-4777-8777-777777777777/exports/cards?format=csv",
        )
      ) {
        return new Response(
          "card_id,display_name,block_code,field_code,value\naaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa,Карточка актива,main,status,drafted\n",
          {
            status: 200,
            headers: { "Content-Type": "text/csv; charset=utf-8" },
          },
        );
      }
      if (
        url.endsWith(
          "/api/v1/registries/77777777-7777-4777-8777-777777777777/exports/cards?format=xlsx",
        )
      ) {
        return new Response(new Blob(["xlsx-export"]), {
          status: 200,
          headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          },
        });
      }
      if (
        url.endsWith(
          "/api/v1/registries/77777777-7777-4777-8777-777777777777/imports/cards/preview",
        )
      ) {
        const isXlsx = init?.body instanceof FormData;
        const payload = isXlsx
          ? { csv_content: "xlsx-valid" }
          : (JSON.parse(String(init?.body ?? "{}")) as { csv_content: string });
        const hasInvalidRow = !isXlsx && payload.csv_content.includes("invalid-number");
        const preview: CardImportPreviewRead = {
          format_version: "card_import_preview_v1",
          registry_id: "77777777-7777-4777-8777-777777777777",
          summary: {
            total_rows: hasInvalidRow ? 2 : 1,
            valid_rows: hasInvalidRow ? 1 : 1,
            invalid_rows: hasInvalidRow ? 1 : 0,
            would_create_rows: 0,
            would_update_rows: hasInvalidRow ? 1 : 1,
          },
          rows: hasInvalidRow
            ? [
                {
                  row_number: 2,
                  status: "valid",
                  action: "update",
                  card_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                  organization_id: null,
                  display_name: "Карточка актива",
                  field_path: "main.status",
                  field_type: "text",
                  raw_value: "submitted",
                  parsed_value: "submitted",
                  errors: [],
                },
                {
                  row_number: 3,
                  status: "invalid",
                  action: "update",
                  card_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                  organization_id: null,
                  display_name: "Карточка актива",
                  field_path: "main.amount",
                  field_type: "number",
                  raw_value: "invalid-number",
                  parsed_value: null,
                  errors: ["Числовое поле должно содержать число."],
                },
              ]
            : [
                {
                  row_number: 2,
                  status: "valid",
                  action: "update",
                  card_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                  organization_id: null,
                  display_name: "Карточка актива",
                  field_path: "main.status",
                  field_type: "text",
                  raw_value: "submitted",
                  parsed_value: "submitted",
                  errors: [],
                },
              ],
        };
        return jsonResponse(preview);
      }
      if (
        url.endsWith("/api/v1/registries/77777777-7777-4777-8777-777777777777/imports/cards/commit")
      ) {
        const commit: CardImportCommitRead = {
          format_version: "card_import_commit_v1",
          registry_id: "77777777-7777-4777-8777-777777777777",
          summary: {
            total_rows: 1,
            committed_rows: 1,
            created_cards: 0,
            updated_cards: 1,
            field_values_written: 1,
          },
          cards: [
            {
              card_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              action: "update",
              import_key: null,
            },
          ],
        };
        return jsonResponse(commit);
      }
      if (
        url.includes("/api/v1/registries/") &&
        !url.endsWith("/schema") &&
        !url.includes("/cards") &&
        !url.includes("/card-templates") &&
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
            card_title_label?: string | null;
            lifecycle_status?: string | null;
          };
          const updated: RegistryRead = {
            ...current,
            name: payload.name ?? current.name,
            description: payload.description ?? current.description,
            card_title_label: payload.card_title_label ?? current.card_title_label,
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
            card_title_label?: string;
          };
          const created: RegistryRead = {
            id: "25252525-2525-4252-8252-252525252525",
            code: payload.code,
            name: payload.name,
            description: payload.description ?? null,
            card_title_label: payload.card_title_label ?? "Название карточки",
            lifecycle_status: "draft",
            schema_version: 1,
            owner_organization_id: null,
            is_default_for_owner_tree: false,
          };
          registryItems = [...registryItems, created];
          return jsonResponse(created, { status: 201 });
        }
        return jsonResponse({ items: registryItems });
      }
      if (url.endsWith("/api/v1/registries/77777777-7777-4777-8777-777777777777/schema")) {
        return jsonResponse(currentRegistrySchema());
      }
      if (url.endsWith("/api/v1/registries/77777777-7777-4777-8777-777777777777/card-templates")) {
        if (init?.method === "POST") {
          const payload = JSON.parse(String(init.body ?? "{}")) as {
            code: string;
            name: string;
            description?: string | null;
            position?: number;
            field_schema_json?: { field_ids?: string[] } | null;
            default_values_json?: { field_id: string; value: unknown }[];
          };
          const created: TestCardTemplateRead = {
            id: "72727272-7272-4272-8272-727272727272",
            registry_id: "77777777-7777-4777-8777-777777777777",
            code: payload.code,
            name: payload.name,
            description: payload.description ?? null,
            position: payload.position ?? cardTemplateItems.length,
            field_schema_json: payload.field_schema_json ?? null,
            default_values_json: payload.default_values_json ?? [],
            is_active: true,
            created_at: "2026-06-28T12:20:00Z",
            archived_at: null,
          };
          cardTemplateItems = [...cardTemplateItems, created];
          return jsonResponse(created, { status: 201 });
        }
        return jsonResponse({ items: cardTemplateItems });
      }
      const cardTemplateLayoutMatch = pathname.match(
        /^\/api\/v1\/card-templates\/([^/]+)\/layout$/,
      );
      if (cardTemplateLayoutMatch && init?.method === "GET") {
        const template = cardTemplateItems.find((item) => item.id === cardTemplateLayoutMatch[1]);
        if (!template) {
          return jsonResponse({ detail: "Not Found" }, { status: 404 });
        }
        const fieldIds = new Set(template.field_schema_json?.field_ids ?? []);
        const templateFields = schemaFieldItems.filter((field) => fieldIds.has(field.id));
        const blockIds = new Set(templateFields.map((field) => field.block_id));
        const templateBlocks = schemaBlockItems.filter((block) => blockIds.has(block.id));
        const printLayout = {
          version: "card_print_layout_v1",
          page: {
            format: "A4",
            width_mm: 210,
            height_mm: 297,
            margin_mm: { top: 12, right: 12, bottom: 12, left: 12 },
          },
          grid: { columns: 12, row_height_mm: 8, snap_mm: 2 },
          sections: [],
          overlays: [],
          items: [],
        };
        const formSections = templateBlocks.map((block, blockIndex) => ({
          id: `block-${block.id}`,
          block_id: block.id,
          row: blockIndex * 2 + 1,
          column: 1,
          row_span: 2,
          column_span: 12,
          items: templateFields
            .filter((field) => field.block_id === block.id)
            .map((field, fieldIndex) => ({
              id: `field-${field.id}`,
              kind: "field",
              field_id: field.id,
              row: fieldIndex + 1,
              column: 1,
              row_span: 1,
              column_span: 12,
              text: null,
            })),
        }));
        return jsonResponse({
          version: "card_template_layout_v1",
          revision: "app-test-revision-1",
          card_template_id: template.id,
          registry_id: template.registry_id,
          structure: { blocks: templateBlocks, fields: templateFields },
          form_layout: { columns: 12, sections: formSections },
          print_views: [
            {
              id: "default-a4",
              name: "Основная A4",
              is_default: true,
              document_template_id: null,
              current_version_id: null,
              source: "form_layout",
              page: printLayout.page,
              items: [],
              layout_json: printLayout,
              output_filename_template: "{{ card.display_name }}.docx",
            },
          ],
          export_settings: {
            default_print_view_id: "default-a4",
            output_filename_template: "{{ card.display_name }}.docx",
            formats: ["docx", "pdf"],
          },
          sync_status: { has_errors: false, errors: [], warnings: [], mapping: {} },
        });
      }
      if (url.includes("/api/v1/card-templates/")) {
        const templateId = url.split("/api/v1/card-templates/")[1];
        const current = cardTemplateItems.find((item) => item.id === templateId);
        if (!current) {
          return jsonResponse({ detail: "Not Found" }, { status: 404 });
        }
        if (init?.method === "PATCH") {
          const payload = JSON.parse(String(init.body ?? "{}")) as Partial<TestCardTemplateRead>;
          const updated: TestCardTemplateRead = {
            ...current,
            name: payload.name ?? current.name,
            description: Object.hasOwn(payload, "description")
              ? (payload.description ?? null)
              : current.description,
            position: payload.position ?? current.position,
            field_schema_json: Object.hasOwn(payload, "field_schema_json")
              ? (payload.field_schema_json ?? null)
              : current.field_schema_json,
            default_values_json: payload.default_values_json ?? current.default_values_json,
            is_active: payload.is_active ?? current.is_active,
          };
          cardTemplateItems = cardTemplateItems.map((item) =>
            item.id === updated.id ? updated : item,
          );
          return jsonResponse(updated);
        }
        if (init?.method === "DELETE") {
          const archived = { ...current, is_active: false, archived_at: "2026-06-28T12:21:00Z" };
          cardTemplateItems = cardTemplateItems.filter((item) => item.id !== templateId);
          return jsonResponse(archived);
        }
      }
      if (pathname.endsWith("/api/v1/registries/77777777-7777-4777-8777-777777777777/cards")) {
        if (init?.method === "POST") {
          const payload = JSON.parse(String(init.body ?? "{}")) as {
            organization_id: string;
            display_name?: string;
            card_template_id?: string | null;
            org_unit_id?: string | null;
            public_view_enabled?: boolean;
            public_edit_enabled?: boolean;
          };
          const template =
            cardTemplateItems.find((item) => item.id === payload.card_template_id) ??
            cardTemplateItems[0];
          const created: CardSummaryRead = {
            id: "cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd",
            registry_id: "77777777-7777-4777-8777-777777777777",
            card_template_id: template.id,
            card_template_name: template.name,
            organization_id: payload.organization_id,
            org_unit_id: payload.org_unit_id ?? null,
            display_name: payload.display_name ?? template?.name ?? "Новая карточка",
            lifecycle_status: "draft",
            public_view_enabled: payload.public_view_enabled ?? false,
            public_edit_enabled: payload.public_edit_enabled ?? false,
            list_fields: [],
          };
          cardItems = [...cardItems, created];
          cardValueStateById[created.id] = {
            status: String(template?.default_values_json[0]?.value ?? ""),
            approved: false,
            repeatableNotes: [],
            fileRef: null,
          };
          return jsonResponse(created, { status: 201 });
        }
        const filteredCards = cardItems.filter((item) => cardMatchesListFilters(item, requestUrl));
        return jsonResponse({ items: filteredCards.map(cardSummaryWithListFields) });
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
      const cardFieldReferenceItemsMatch = pathname.match(
        /\/api\/v1\/cards\/([^/]+)\/fields\/([^/]+)\/reference-items$/,
      );
      if (cardFieldReferenceItemsMatch) {
        const fieldId = cardFieldReferenceItemsMatch[2]!;
        const field = schemaFieldItems.find((item) => item.id === fieldId);
        const listId = field?.options_source_id;
        return jsonResponse({
          items: listId ? referenceItemItems.filter((item) => item.list_id === listId) : [],
        });
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
      if (url.endsWith("/api/v1/cards/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/values")) {
        const payload = JSON.parse(String(init?.body ?? "{}")) as {
          values: {
            field_id: string;
            value: unknown;
            block_instance_id?: string | null;
          }[];
        };
        for (const item of payload.values) {
          if (item.field_id === "99999999-9999-4999-8999-999999999999") {
            cardStatusValue = String(item.value ?? "");
            cardValueStateById["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"].status = cardStatusValue;
          }
          if (item.field_id === "99999999-9999-4999-8999-999999999998") {
            cardApprovedValue = Boolean(item.value);
            cardValueStateById["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"].approved = cardApprovedValue;
          }
        }
        return jsonResponse({
          items: payload.values.map((item, index) => ({
            id: `bulk-existing-${index}`,
            card_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
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
            org_unit_id?: string | null;
            lifecycle_status?: string | null;
            public_view_enabled?: boolean | null;
            public_edit_enabled?: boolean | null;
          };
          const updated: CardSummaryRead = {
            ...current,
            display_name: payload.display_name ?? current.display_name,
            org_unit_id: Object.prototype.hasOwnProperty.call(payload, "org_unit_id")
              ? (payload.org_unit_id ?? null)
              : current.org_unit_id,
            lifecycle_status: payload.lifecycle_status ?? current.lifecycle_status,
            public_view_enabled: payload.public_view_enabled ?? current.public_view_enabled,
            public_edit_enabled: payload.public_edit_enabled ?? current.public_edit_enabled,
            list_fields: current.list_fields ?? [],
          };
          cardItems = cardItems.map((item) => (item.id === updated.id ? updated : item));
          return jsonResponse(updated);
        }
        if (init?.method === "DELETE") {
          const archived: CardSummaryRead = {
            ...current,
            lifecycle_status: "archived",
            list_fields: current.list_fields ?? [],
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
        if (denyAdminReadQueries) {
          return jsonResponse({ detail: "Forbidden" }, { status: 403 });
        }
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
  const statusSchema = schemaFieldItems.find(
    (field) => field.id === "99999999-9999-4999-8999-999999999999",
  );
  const approvedSchema = schemaFieldItems.find(
    (field) => field.id === "99999999-9999-4999-8999-999999999998",
  );
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
              field_type: statusSchema?.field_type ?? "text",
              value: state.status,
            },
            approved: {
              field_id: "99999999-9999-4999-8999-999999999998",
              code: "approved",
              field_type: approvedSchema?.field_type ?? "bool",
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
      field_type: statusSchema?.field_type ?? "text",
      value: state.status,
    },
    approved: {
      field_id: "99999999-9999-4999-8999-999999999998",
      code: "approved",
      field_type: approvedSchema?.field_type ?? "bool",
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
  for (const staticField of schemaFieldItems.filter(
    (field) => field.field_type === "static_text",
  )) {
    if (staticField.block_id !== "88888888-8888-4888-8888-888888888888") {
      continue;
    }
    blocks.main.instances[0].fields[staticField.code] = {
      field_id: staticField.id,
      code: staticField.code,
      field_type: staticField.field_type,
      value: null,
    };
    fields[staticField.code] = {
      field_id: staticField.id,
      code: staticField.code,
      field_type: staticField.field_type,
      value: null,
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

function cardSummaryWithListFields(item: CardSummaryRead): CardSummaryRead {
  const state = cardValueStateById[item.id] ?? {
    status: "",
    approved: false,
    repeatableNotes: [],
    fileRef: null,
  };
  const listFields = schemaFieldItems
    .filter((field) => field.is_active && field.is_list_display)
    .sort((left, right) => left.position - right.position)
    .map((field) => ({
      field_id: field.id,
      code: field.code,
      label: field.label,
      field_type: field.field_type,
      value: listFieldValueForState(state, field),
    }));

  return {
    ...item,
    list_fields: listFields,
  };
}

function listFieldValueForState(
  state: (typeof cardValueStateById)[string],
  field: FormFieldRead,
): unknown {
  if (field.code === "status") {
    return state.status;
  }
  if (field.code === "approved") {
    return state.approved;
  }
  if (field.code === "supporting_file") {
    return state.fileRef;
  }
  return null;
}

function enableRepeatableDetailsSchema() {
  schemaBlockItems = [...schemaBlockItems, apiPayloads.repeatableBlock];
  schemaFieldItems = [...schemaFieldItems, apiPayloads.repeatableField];
  syncTemplateFieldIds();
}

function enableFileRefSchema() {
  schemaFieldItems = [...schemaFieldItems, apiPayloads.fileRefField];
  syncTemplateFieldIds();
}

function enableStaticTextSchema() {
  schemaBlockItems = schemaBlockItems.map((block) =>
    block.id === "88888888-8888-4888-8888-888888888888" ? { ...block, layout_columns: 3 } : block,
  );
  schemaFieldItems = [
    ...schemaFieldItems,
    {
      id: "98989898-9898-4989-8989-989898989897",
      block_id: "88888888-8888-4888-8888-888888888888",
      code: "hint",
      label: "Пояснение",
      description: null,
      field_type: "static_text",
      position: 2,
      required_mode: "not_required",
      options_source_type: null,
      options_source_id: null,
      options_config_json: { static_text: "Текст подсказки для карточки" },
      display_config_json: {
        column_span: 3,
        layout_row: 3,
        layout_column: 1,
        label_position: "top",
        separator_style: "line",
      },
      is_active: true,
      is_list_display: false,
      public_visible: true,
      public_editable: false,
    },
  ];
  syncTemplateFieldIds();
}

function syncTemplateFieldIds() {
  const activeFieldIds = schemaFieldItems
    .filter((field) => field.is_active)
    .sort((left, right) => left.position - right.position || left.label.localeCompare(right.label))
    .map((field) => field.id);
  cardTemplateItems = cardTemplateItems.map((template) => ({
    ...template,
    field_schema_json: { field_ids: activeFieldIds },
  }));
}

async function openExistingCardEditor(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Карточки" }));
  await user.dblClick(await screen.findByRole("button", { name: /Карточка актива/ }));
}

async function openCardBlockEditor(
  user: ReturnType<typeof userEvent.setup>,
  blockTitle = "Основной блок",
) {
  await user.click(await screen.findByRole("button", { name: `Изменить блок ${blockTitle}` }));
  return screen.findByRole("region", { name: `Блок ${blockTitle}` });
}

async function openDefaultSchemaTemplateEditor(user: ReturnType<typeof userEvent.setup>) {
  const templateSection = await screen.findByRole("region", { name: "Шаблоны карточек" });
  const templateCard = within(templateSection)
    .getByText("Муниципальная карточка")
    .closest("article");
  expect(templateCard).not.toBeNull();
  expect(
    within(templateSection).queryByRole("button", {
      name: "Открыть шаблон Муниципальная карточка",
    }),
  ).not.toBeInTheDocument();
  await user.click(templateCard as HTMLElement);
  return screen.findByRole("region", {
    name: "Редактор шаблона Муниципальная карточка",
  });
}

type TestOrganizationTreeNode = OrganizationRead & {
  children: TestOrganizationTreeNode[];
};

function organizationTreeItems(): TestOrganizationTreeNode[] {
  const byParent = new Map<string | null, OrganizationRead[]>();
  const visibleIds = new Set(organizationItems.map((organization) => organization.id));
  for (const organization of organizationItems) {
    const parentId =
      organization.parent_id && visibleIds.has(organization.parent_id)
        ? organization.parent_id
        : null;
    byParent.set(parentId, [...(byParent.get(parentId) ?? []), organization]);
  }

  function build(parentId: string | null): TestOrganizationTreeNode[] {
    return [...(byParent.get(parentId) ?? [])]
      .sort((left, right) => left.code.localeCompare(right.code) || left.id.localeCompare(right.id))
      .map((organization) => ({
        ...organization,
        children: build(organization.id),
      }));
  }

  return build(null);
}

function cardOrganizationFilterIds(requestUrl: URL) {
  const organizationIds = requestUrl.searchParams.getAll("organization_ids");
  const legacyOrganizationId = requestUrl.searchParams.get("organization_id");
  const selectedIds =
    organizationIds.length > 0
      ? organizationIds
      : legacyOrganizationId
        ? [legacyOrganizationId]
        : [];
  if (selectedIds.length === 0) {
    return null;
  }
  if (requestUrl.searchParams.get("include_descendant_organizations") === "false") {
    return new Set(selectedIds);
  }
  const expandedIds = new Set<string>();
  for (const organizationId of selectedIds) {
    addOrganizationAndDescendants(expandedIds, organizationId);
  }
  return expandedIds;
}

type TestCardFieldFilter = {
  field_id: string;
  field_type?: string;
  operator?: string;
  value: unknown;
};

function cardFieldFilters(requestUrl: URL) {
  const rawFilters = requestUrl.searchParams.get("filters");
  if (!rawFilters) {
    return [];
  }
  try {
    const parsed = JSON.parse(rawFilters) as TestCardFieldFilter[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function cardMatchesListFilters(item: CardSummaryRead, requestUrl: URL) {
  const organizationFilterIds = cardOrganizationFilterIds(requestUrl);
  const templateFilterIds = requestUrl.searchParams.getAll("card_template_ids");
  const query = requestUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";
  const includeArchive = requestUrl.searchParams.get("include_archive") === "true";
  const filters = cardFieldFilters(requestUrl);

  if (organizationFilterIds && !organizationFilterIds.has(item.organization_id)) {
    return false;
  }
  if (templateFilterIds.length > 0 && !templateFilterIds.includes(item.card_template_id)) {
    return false;
  }
  if (!includeArchive && ["archived", "superseded"].includes(item.lifecycle_status)) {
    return false;
  }
  if (query && !cardMatchesFreeText(item, query)) {
    return false;
  }
  return filters.every((filter) => cardMatchesFieldFilter(item, filter));
}

function cardMatchesFreeText(item: CardSummaryRead, query: string) {
  const state = cardValueStateById[item.id];
  return (
    item.display_name.toLowerCase().includes(query) ||
    state?.status.toLowerCase().includes(query) === true
  );
}

function cardMatchesFieldFilter(item: CardSummaryRead, filter: TestCardFieldFilter) {
  const state = cardValueStateById[item.id];
  if (!state) {
    return false;
  }
  if (filter.field_id === "99999999-9999-4999-8999-999999999999") {
    return state.status.toLowerCase().includes(String(filter.value ?? "").toLowerCase());
  }
  if (filter.field_id === "99999999-9999-4999-8999-999999999998") {
    return state.approved === Boolean(filter.value);
  }
  return true;
}

function addOrganizationAndDescendants(target: Set<string>, organizationId: string) {
  target.add(organizationId);
  for (const organization of organizationItems) {
    if (organization.parent_id === organizationId) {
      addOrganizationAndDescendants(target, organization.id);
    }
  }
}

function currentRegistrySchema() {
  return {
    ...apiPayloads.schema,
    blocks: schemaBlockItems,
    fields: schemaFieldItems,
    templates: cardTemplateItems,
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

test("allows test login without email format", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin");
  await user.type(screen.getByLabelText(/пароль/i), "1.Abcdef");
  await user.click(screen.getByRole("button", { name: "Войти" }));

  expect(await screen.findByText("Системный администратор")).toBeInTheDocument();
  expect(vi.mocked(fetch)).toHaveBeenCalledWith(
    "/api/v1/auth/login",
    expect.objectContaining({
      body: JSON.stringify({ email: "admin", password: "1.Abcdef" }),
    }),
  );
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
  await user.click(screen.getByRole("tab", { name: "Схема карточки" }));
  await openDefaultSchemaTemplateEditor(user);
  expect(screen.getAllByText("Основной блок").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Статус").length).toBeGreaterThan(0);
  await openExistingCardEditor(user);
  expect((await screen.findAllByText("Карточка актива")).length).toBeGreaterThan(0);
  const mainBlock = await openCardBlockEditor(user);
  expect(within(mainBlock).getByDisplayValue("drafted")).toBeInTheDocument();
  expect(screen.queryByRole("form", { name: "Массовое сохранение полей" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Сохранить Статус" })).not.toBeInTheDocument();
  const statusInput = within(mainBlock).getByLabelText("Статус");
  await user.clear(statusInput);
  await user.type(statusInput, "published");
  const approvedInput = within(mainBlock).getByLabelText("Подтверждено");
  await user.click(approvedInput);
  await user.click(within(mainBlock).getByRole("button", { name: "Сохранить блок Основной блок" }));
  expect((await screen.findAllByText("Поля карточки сохранены")).length).toBeGreaterThan(0);

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
    const bulkCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith("/api/v1/cards/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/values") &&
        init?.method === "PATCH",
    );
    expect(bulkCall).toBeTruthy();
    const body = JSON.parse(String(bulkCall?.[1]?.body ?? "{}")) as {
      values: { field_id: string; value: unknown; block_instance_id?: string | null }[];
    };
    expect(body.values).toEqual(
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
      ]),
    );
  });
});

test("collapses and restores the admin navigation while keeping sections accessible", async () => {
  const user = userEvent.setup();
  const { container } = render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));

  expect(await screen.findByRole("main")).not.toHaveClass("is-sidebar-collapsed");

  await user.click(screen.getByRole("button", { name: "Свернуть навигацию" }));

  expect(container.querySelector(".workspace-shell")).toHaveClass("is-sidebar-collapsed");
  expect(screen.getByRole("button", { name: "Реестры" })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Развернуть навигацию" }));

  expect(container.querySelector(".workspace-shell")).not.toHaveClass("is-sidebar-collapsed");
});

test("auto-collapses the navigation in registry work and expands from sidebar interaction", async () => {
  const user = userEvent.setup();
  const { container } = render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Реестры" }));

  await waitFor(() => {
    expect(container.querySelector(".workspace-shell")).toHaveClass("is-sidebar-collapsed");
  });

  const sidebar = screen.getByLabelText("Основная навигация");
  fireEvent.click(sidebar);

  expect(container.querySelector(".workspace-shell")).not.toHaveClass("is-sidebar-collapsed");
});

test("renders refactored card workspace with focused tabs and simple metadata", async () => {
  schemaFieldItems = schemaFieldItems.map((field) =>
    field.id === "99999999-9999-4999-8999-999999999999"
      ? { ...field, required_mode: "required" }
      : field,
  );
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Карточки" }));

  expect(await screen.findByRole("tablist", { name: "Вкладки карточек" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Список карточек" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(screen.queryByText("Подразделение карточки")).not.toBeInTheDocument();
  expect(screen.getAllByText("Карточка актива").length).toBeGreaterThan(0);
  expect(screen.queryByRole("tablist", { name: "Разделы карточки" })).not.toBeInTheDocument();

  await user.dblClick(screen.getByRole("button", { name: /Карточка актива/ }));
  expect(await screen.findByRole("tablist", { name: "Разделы карточки" })).toBeInTheDocument();
  expect(screen.queryByText("Название карточки")).not.toBeInTheDocument();
  expect(screen.getByText("Шаблон карточки")).toBeInTheDocument();
  expect(screen.getAllByText("Муниципальная карточка").length).toBeGreaterThan(0);
  expect(screen.getByRole("tab", { name: "Поля" })).toHaveAttribute("aria-selected", "true");
  expect(screen.queryByRole("form", { name: "Массовое сохранение полей" })).not.toBeInTheDocument();
  const actionPanel = screen.getByRole("group", { name: "Панель действий карточки" });
  expect(within(actionPanel).getByText("Обязательные поля: 1 из 1 заполнено")).toBeInTheDocument();
  expect(within(actionPanel).getByText("Публичные ссылки: 2 активны")).toBeInTheDocument();
  let mainBlock = await screen.findByTestId(
    "filled-block-block-88888888-8888-4888-8888-888888888888",
  );
  await user.click(within(mainBlock).getByRole("button", { name: "Изменить блок Основной блок" }));
  mainBlock = await screen.findByTestId("filled-block-block-88888888-8888-4888-8888-888888888888");
  expect(within(mainBlock).getByLabelText("Статус")).toHaveValue("drafted");
  expect(
    within(mainBlock).getByRole("button", { name: "Сохранить блок Основной блок" }),
  ).toBeInTheDocument();
  expect(screen.queryByText("Массовое сохранение полей")).not.toBeInTheDocument();
  await user.click(within(mainBlock).getByRole("button", { name: "Отмена блока Основной блок" }));
  expect(screen.getByRole("tab", { name: "Вложения" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Документы" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Публичные ссылки" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "История" })).toBeInTheDocument();
  await user.click(screen.getByRole("tab", { name: "Вложения" }));
  expect(screen.getByRole("tab", { name: "Вложения" })).toHaveAttribute("aria-selected", "true");
  expect(await screen.findByRole("heading", { name: "Вложения" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Документы" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("tab", { name: "Список карточек" }));
  await user.click(screen.getByRole("button", { name: "Создать карточку" }));
  expect(screen.getByLabelText("Организация карточки")).toBeInTheDocument();
  expect(screen.queryByText("Данные карточки")).not.toBeInTheDocument();
});

test("renders static text schema fields without sending them in block saves", async () => {
  enableStaticTextSchema();
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await openExistingCardEditor(user);

  const mainBlock = await openCardBlockEditor(user);
  expect(within(mainBlock).getByText("Пояснение")).toBeInTheDocument();
  expect(within(mainBlock).getByText("Текст подсказки для карточки")).toBeInTheDocument();
  expect(within(mainBlock).queryByLabelText("Пояснение")).not.toBeInTheDocument();

  const statusInput = within(mainBlock).getByLabelText("Статус");
  await user.clear(statusInput);
  await user.type(statusInput, "published");
  await user.click(within(mainBlock).getByRole("button", { name: "Сохранить блок Основной блок" }));

  await waitFor(() => {
    const bulkCall = vi
      .mocked(fetch)
      .mock.calls.find(
        ([input, init]) =>
          String(input).endsWith("/api/v1/cards/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/values") &&
          init?.method === "PATCH",
      );
    expect(bulkCall).toBeTruthy();
    const body = JSON.parse(String(bulkCall?.[1]?.body ?? "{}")) as {
      values: { field_id: string }[];
    };
    expect(body.values.map((value) => value.field_id)).not.toContain(
      "98989898-9898-4989-8989-989898989897",
    );
  });
});

test("marks a card tab dirty while an inline block draft is open", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Карточки" }));

  expect(await screen.findByRole("tablist", { name: "Вкладки карточек" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Список карточек" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(screen.queryByRole("form", { name: "Массовое сохранение полей" })).not.toBeInTheDocument();

  await user.dblClick(await screen.findByRole("button", { name: /Карточка актива/ }));
  expect(await screen.findByRole("tab", { name: "Карточка актива" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const mainBlock = await openCardBlockEditor(user);
  const statusInput = within(mainBlock).getByLabelText("Статус");
  await user.clear(statusInput);
  await user.type(statusInput, "несохраненный текст");

  expect(screen.getByRole("tab", { name: "Карточка актива *" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(screen.getByText("Есть несохраненные изменения")).toBeInTheDocument();

  await user.click(within(mainBlock).getByRole("button", { name: "Отмена блока Основной блок" }));
  expect(screen.getByRole("tab", { name: "Карточка актива" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(screen.queryByText("Есть несохраненные изменения")).not.toBeInTheDocument();
  expect(screen.queryByDisplayValue("несохраненный текст")).not.toBeInTheDocument();
});

test("warns before closing a dirty card tab", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Карточки" }));
  await user.dblClick(await screen.findByRole("button", { name: /Карточка актива/ }));

  const mainBlock = await openCardBlockEditor(user);
  const statusInput = within(mainBlock).getByLabelText("Статус");
  await user.clear(statusInput);
  await user.type(statusInput, "несохраненный текст");
  await user.click(screen.getByRole("button", { name: "Закрыть вкладку Карточка актива" }));

  let decision = await screen.findByRole("dialog", { name: "Несохранённые изменения" });
  await user.click(within(decision).getByRole("button", { name: "Продолжить редактирование" }));
  expect(screen.getByRole("tab", { name: "Карточка актива *" })).toBeInTheDocument();
  expect(screen.getByDisplayValue("несохраненный текст")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Закрыть вкладку Карточка актива" }));
  decision = await screen.findByRole("dialog", { name: "Несохранённые изменения" });
  await user.click(within(decision).getByRole("button", { name: "Не сохранять" }));
  await user.click(screen.getByRole("button", { name: "Закрыть вкладку Карточка актива" }));

  expect(screen.queryByRole("tab", { name: "Карточка актива *" })).not.toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Список карточек" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("shows card editor actions in the sticky card panel", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Карточки" }));
  await user.dblClick(await screen.findByRole("button", { name: /Карточка актива/ }));

  const actionPanel = await screen.findByRole("group", { name: "Панель действий карточки" });
  expect(
    within(actionPanel).queryByRole("button", { name: "Сохранить все поля" }),
  ).not.toBeInTheDocument();
  expect(within(actionPanel).getByText("Обязательные поля: 0 из 0 заполнено")).toBeInTheDocument();
  expect(within(actionPanel).getByText("Публичные ссылки: 2 активны")).toBeInTheDocument();
  expect(
    within(actionPanel).getByRole("button", { name: "Активировать карточку Карточка актива" }),
  ).toBeInTheDocument();
  expect(
    within(actionPanel).getByRole("button", { name: "Архивировать карточку Карточка актива" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Редактировать карточку Карточка актива" }),
  ).not.toBeInTheDocument();
  expect(
    await screen.findByRole("button", { name: "Изменить блок Основной блок" }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("form", { name: "Массовое сохранение полей" })).not.toBeInTheDocument();
});

test("shows required field errors before saving an inline block", async () => {
  schemaFieldItems = schemaFieldItems.map((field) =>
    field.id === "99999999-9999-4999-8999-999999999999"
      ? {
          ...field,
          required_mode: "required",
        }
      : field,
  );
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Карточки" }));
  await user.dblClick(await screen.findByRole("button", { name: /Карточка актива/ }));

  const patchCountBeforeSave = vi
    .mocked(fetch)
    .mock.calls.filter(
      ([input, init]) =>
        String(input).endsWith("/api/v1/cards/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/values") &&
        init?.method === "PATCH",
    ).length;
  const mainBlock = await openCardBlockEditor(user);
  const statusInput = within(mainBlock).getByLabelText("Статус");
  await user.clear(statusInput);
  await user.click(within(mainBlock).getByRole("button", { name: "Сохранить блок Основной блок" }));

  expect(await screen.findByText("Заполните обязательные поля")).toBeInTheDocument();
  expect(
    vi
      .mocked(fetch)
      .mock.calls.filter(
        ([input, init]) =>
          String(input).endsWith("/api/v1/cards/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/values") &&
          init?.method === "PATCH",
      ).length,
  ).toBe(patchCountBeforeSave);
});

// Obsolete selected-template visual-canvas flows were replaced by the unified CardLayoutStudio.
// The active studio coverage lives in features/registry/CardPrintTemplateEditor.test.tsx.
test.skip("creates form fields with required mode from Russian UI", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Реестры" }));
  await user.click(await screen.findByRole("tab", { name: "Схема карточки" }));
  await openDefaultSchemaTemplateEditor(user);
  await user.click(
    await screen.findByRole("button", { name: "Добавить поле в блок Основной блок" }),
  );
  expect(screen.queryByLabelText("Блок формы")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Код поля формы")).not.toBeInTheDocument();
  await user.type(screen.getByLabelText("Название поля формы"), "Обязательное поле");
  await user.click(screen.getByRole("button", { name: "Расширенные настройки" }));
  await user.click(screen.getByRole("checkbox", { name: "Обязательное поле" }));
  await user.click(screen.getByRole("button", { name: "Создать" }));

  await waitFor(() => {
    const createFieldCall = vi
      .mocked(fetch)
      .mock.calls.find(
        ([input, init]) =>
          String(input).endsWith("/api/v1/blocks/88888888-8888-4888-8888-888888888888/fields") &&
          init?.method === "POST",
      );
    expect(createFieldCall).toBeTruthy();
    const body = JSON.parse(String(createFieldCall?.[1]?.body ?? "{}")) as {
      required_mode?: string;
    };
    expect(body.required_mode).toBe("required");
  });
});

test("renders registry workspace as focused schema tabs", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Реестры" }));

  expect(
    await screen.findByRole("tablist", { name: "Разделы настройки реестра" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Реестры" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("tab", { name: "Схема карточки" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Справочники" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Импорт и экспорт" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Отчеты" })).toBeInTheDocument();
  expect(screen.getAllByRole("heading", { name: "Реестры" }).length).toBeGreaterThan(0);
  expect(screen.queryByRole("heading", { name: "Схема карточки" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("tab", { name: "Схема карточки" }));
  expect(screen.getByRole("tab", { name: "Схема карточки" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(await screen.findByRole("heading", { name: "Схема карточки" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Справочники" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("tab", { name: "Справочники" }));
  expect(screen.getByRole("tab", { name: "Справочники" })).toHaveAttribute("aria-selected", "true");
  expect(await screen.findByRole("heading", { name: "Справочники" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Импорт и экспорт" })).not.toBeInTheDocument();
});

test.skip("renders a visual card schema editor with fields inside blocks", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Реестры" }));
  await user.click(await screen.findByRole("tab", { name: "Схема карточки" }));

  const templateSection = await screen.findByRole("region", { name: "Шаблоны карточек" });
  expect(within(templateSection).getByText("Муниципальная карточка")).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Основной блок" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Добавить блок формы" })).not.toBeInTheDocument();

  const templateCard = within(templateSection)
    .getByText("Муниципальная карточка")
    .closest("article");
  expect(templateCard).not.toBeNull();
  expect(
    within(templateSection).queryByRole("button", {
      name: "Открыть шаблон Муниципальная карточка",
    }),
  ).not.toBeInTheDocument();
  await user.click(templateCard as HTMLElement);

  const visualEditor = await screen.findByRole("region", {
    name: "Редактор шаблона Муниципальная карточка",
  });
  expect(
    screen.queryByRole("form", { name: "Редактировать шаблон карточки" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Значение по умолчанию: Статус")).not.toBeInTheDocument();
  expect(within(visualEditor).queryByLabelText("Название карточки")).not.toBeInTheDocument();
  expect(within(visualEditor).getByRole("heading", { name: "Основной блок" })).toBeInTheDocument();
  expect(within(visualEditor).getAllByText("Статус").length).toBeGreaterThan(0);
  expect(within(visualEditor).getByText("Подтверждено")).toBeInTheDocument();
  expect(
    within(visualEditor).getByRole("button", { name: "Добавить поле в блок Основной блок" }),
  ).toBeInTheDocument();
  expect(
    within(visualEditor).getByRole("button", { name: "Добавить блок формы" }),
  ).toBeInTheDocument();
});

test.skip("creates fields from the visual block without description or manual position", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Реестры" }));
  await user.click(await screen.findByRole("tab", { name: "Схема карточки" }));
  await openDefaultSchemaTemplateEditor(user);

  await user.click(
    await screen.findByRole("button", { name: "Добавить поле в блок Основной блок" }),
  );

  expect(screen.queryByLabelText("Блок формы")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Описание поля формы")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Позиция поля формы")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Код поля формы")).not.toBeInTheDocument();

  await user.type(screen.getByLabelText("Название поля формы"), "Новый реквизит");
  await user.selectOptions(screen.getByLabelText("Тип поля формы"), ["number"]);
  await user.click(screen.getByRole("button", { name: "Создать" }));

  expect(await screen.findByText("Поле формы создано")).toBeInTheDocument();
  expect(screen.getByText("Новый реквизит")).toBeInTheDocument();

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
      code: "novyy_rekvizit",
      label: "Новый реквизит",
      field_type: "number",
      description: null,
      position: 2,
    });
  });
});

test("creates card templates from the template list without a separate field picker", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Реестры" }));
  await user.click(await screen.findByRole("tab", { name: "Схема карточки" }));

  const templateSection = await screen.findByRole("region", { name: "Шаблоны карточек" });
  expect(within(templateSection).getByText("Муниципальная карточка")).toBeInTheDocument();

  await user.click(
    within(templateSection).getByRole("button", { name: "Создать шаблон карточки" }),
  );
  const templateForm = await within(templateSection).findByRole("form", {
    name: "Создать шаблон карточки",
  });
  await user.type(
    within(templateForm).getByLabelText("Название шаблона карточки"),
    "Типовая карточка",
  );
  expect(within(templateForm).queryByLabelText("Поле шаблона Статус")).not.toBeInTheDocument();
  expect(
    within(templateForm).queryByLabelText("Значение по умолчанию: Статус"),
  ).not.toBeInTheDocument();
  await user.click(within(templateForm).getByRole("button", { name: "Создать" }));

  expect(await screen.findByText("Шаблон карточки создан")).toBeInTheDocument();
  await waitFor(() => {
    const createTemplateCall = vi
      .mocked(fetch)
      .mock.calls.find(
        ([input, init]) =>
          String(input).endsWith(
            "/api/v1/registries/77777777-7777-4777-8777-777777777777/card-templates",
          ) && init?.method === "POST",
      );
    expect(createTemplateCall).toBeTruthy();
    const body = JSON.parse(String(createTemplateCall?.[1]?.body ?? "{}")) as Record<
      string,
      unknown
    >;
    expect(body).toMatchObject({
      code: "tipovaya_kartochka",
      name: "Типовая карточка",
      field_schema_json: {
        field_ids: [],
      },
      default_values_json: [],
    });
  });
});

test.skip("keeps the field form compact inside the selected visual block", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Реестры" }));
  await user.click(await screen.findByRole("tab", { name: "Схема карточки" }));
  await openDefaultSchemaTemplateEditor(user);

  await user.click(
    await screen.findByRole("button", { name: "Добавить поле в блок Основной блок" }),
  );

  const blockCard = screen.getByRole("heading", { name: "Основной блок" }).closest("article");
  const fieldForm = screen.getByRole("heading", { name: "Создать поле формы" }).closest("form");
  expect(blockCard).not.toBeNull();
  expect(fieldForm).not.toBeNull();
  expect(blockCard).toContainElement(fieldForm);
  expect(fieldForm?.closest(".schema-field-form-panel")).toBeTruthy();
  await user.click(
    within(fieldForm as HTMLElement).getByRole("button", { name: "Расширенные настройки" }),
  );
  expect(screen.getByLabelText("Показывать поле в публичной ссылке").closest("label")).toHaveClass(
    "checkbox-inline",
  );
  expect(
    screen.getByLabelText("Редактировать поле в публичной ссылке").closest("label"),
  ).toHaveClass("checkbox-inline");
});

test.skip("creates static text fields with visual layout settings", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Реестры" }));
  await user.click(await screen.findByRole("tab", { name: "Схема карточки" }));
  await openDefaultSchemaTemplateEditor(user);

  await user.click(
    await screen.findByRole("button", { name: "Добавить поле в блок Основной блок" }),
  );
  await user.selectOptions(screen.getByLabelText("Тип поля формы"), ["static_text"]);
  await user.type(screen.getByLabelText("Название поля формы"), "Пояснение");
  await user.type(screen.getByLabelText("Текст"), "Показывается в шаблоне карточки");
  expect(screen.queryByLabelText("Ширина поля")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Строка поля")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Колонка поля")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Расположение подписи/ }));
  await user.click(
    within(screen.getByRole("group", { name: "Расположение подписи" })).getByRole("button", {
      name: "Слева",
    }),
  );
  await user.click(screen.getByRole("button", { name: /Разделитель/ }));
  await user.click(
    within(screen.getByRole("group", { name: "Разделитель" })).getByRole("button", {
      name: "Линия",
    }),
  );
  expect(screen.queryByLabelText("Отображать поле в списке карточек")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Редактировать поле в публичной ссылке")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Создать" }));
  expect(await screen.findByText("Поле формы создано")).toBeInTheDocument();

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
      code: "poyasnenie",
      label: "Пояснение",
      field_type: "static_text",
      required_mode: "not_required",
      options_config_json: { static_text: "Показывается в шаблоне карточки" },
      display_config_json: {
        column_span: 1,
        layout_row: 3,
        layout_column: 1,
        label_position: "left",
        separator_style: "line",
      },
      is_list_display: false,
      public_visible: true,
      public_editable: false,
    });
  });
});

test("does not expose a free card title editor in the visual schema editor", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Реестры" }));
  await user.click(await screen.findByRole("tab", { name: "Схема карточки" }));

  expect(screen.queryByRole("textbox", { name: "Название карточки" })).not.toBeInTheDocument();
  expect(await screen.findByRole("region", { name: "Шаблоны карточек" })).toBeInTheDocument();
});

test.skip("opens field edit and create forms inline at the acted row", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Реестры" }));
  await user.click(await screen.findByRole("tab", { name: "Схема карточки" }));
  await openDefaultSchemaTemplateEditor(user);

  const blockCard = (await screen.findByRole("heading", { name: "Основной блок" })).closest(
    "article",
  );
  expect(blockCard).not.toBeNull();
  expect(
    within(blockCard as HTMLElement).queryByRole("button", {
      name: "Редактировать поле формы Статус",
    }),
  ).not.toBeInTheDocument();
  const statusRow = within(blockCard as HTMLElement)
    .getByText("Статус")
    .closest(".schema-field-row");
  expect(statusRow).not.toBeNull();

  await user.click(statusRow as HTMLElement);

  const editForm = await within(statusRow as HTMLElement).findByRole("form", {
    name: "Редактировать поле формы",
  });
  expect(editForm.closest(".schema-field-row")).toBe(statusRow);
  expect((blockCard as HTMLElement).querySelector(":scope > .schema-field-form-panel")).toBeNull();

  await user.click(within(editForm).getByRole("button", { name: "Отмена" }));
  const addFieldButton = within(blockCard as HTMLElement).getByRole("button", {
    name: "Добавить поле в блок Основной блок",
  });
  const addFieldSlot = addFieldButton.closest(".schema-add-field-slot");
  expect(addFieldSlot).not.toBeNull();

  await user.click(addFieldButton);

  const createForm = await within(addFieldSlot as HTMLElement).findByRole("form", {
    name: "Создать поле формы",
  });
  expect(createForm.closest(".schema-add-field-slot")).toBe(addFieldSlot);
});

test.skip("closes field edit by clicking the expanded field summary and hides field technical codes", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Реестры" }));
  await user.click(await screen.findByRole("tab", { name: "Схема карточки" }));
  await openDefaultSchemaTemplateEditor(user);

  const blockCard = (await screen.findByRole("heading", { name: "Основной блок" })).closest(
    "article",
  );
  expect(blockCard).not.toBeNull();
  const statusRow = within(blockCard as HTMLElement)
    .getByText("Статус")
    .closest(".schema-field-row");
  expect(statusRow).not.toBeNull();
  expect(within(statusRow as HTMLElement).queryByText(/Технический код/)).not.toBeInTheDocument();

  await user.click(statusRow as HTMLElement);
  expect(
    await within(statusRow as HTMLElement).findByRole("form", {
      name: "Редактировать поле формы",
    }),
  ).toBeInTheDocument();

  await user.click(within(statusRow as HTMLElement).getByText("Статус"));

  await waitFor(() =>
    expect(
      within(statusRow as HTMLElement).queryByRole("form", {
        name: "Редактировать поле формы",
      }),
    ).not.toBeInTheDocument(),
  );
});

test.skip("toggles block edit by clicking the expanded block header", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Реестры" }));
  await user.click(await screen.findByRole("tab", { name: "Схема карточки" }));
  await openDefaultSchemaTemplateEditor(user);

  const blockCard = (await screen.findByRole("heading", { name: "Основной блок" })).closest(
    "article",
  );
  expect(blockCard).not.toBeNull();
  const blockHeader = (blockCard as HTMLElement).querySelector(".schema-block-header");
  expect(blockHeader).not.toBeNull();

  await user.click(blockHeader as HTMLElement);
  expect(
    await within(blockCard as HTMLElement).findByRole("form", {
      name: "Редактировать блок формы",
    }),
  ).toBeInTheDocument();

  await user.click(blockHeader as HTMLElement);
  await waitFor(() =>
    expect(
      within(blockCard as HTMLElement).queryByRole("form", {
        name: "Редактировать блок формы",
      }),
    ).not.toBeInTheDocument(),
  );
});

test.skip("saves block title placement from the visual block editor", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Реестры" }));
  await user.click(await screen.findByRole("tab", { name: "Схема карточки" }));
  await openDefaultSchemaTemplateEditor(user);

  const blockCard = (await screen.findByRole("heading", { name: "Основной блок" })).closest(
    "article",
  );
  expect(blockCard).not.toBeNull();

  await user.click(
    within(blockCard as HTMLElement).getByRole("heading", { name: "Основной блок" }),
  );
  const blockForm = await within(blockCard as HTMLElement).findByRole("form", {
    name: "Редактировать блок формы",
  });
  const titlePlacement = within(blockForm).getByRole("group", {
    name: "Расположение названия блока",
  });

  await user.click(within(titlePlacement).getByRole("button", { name: "Слева" }));
  await user.click(within(blockForm).getByRole("button", { name: "Сохранить" }));

  await waitFor(() => {
    const patchBodies = vi
      .mocked(fetch)
      .mock.calls.filter(
        ([input, init]) =>
          String(input).endsWith("/api/v1/blocks/88888888-8888-4888-8888-888888888888") &&
          init?.method === "PATCH",
      )
      .map(([, init]) => JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
    expect(patchBodies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          display_config_json: expect.objectContaining({
            title_position: "left",
          }),
        }),
      ]),
    );
  });
});

test.skip("opens the block create form at the bottom add-block slot", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Реестры" }));
  await user.click(await screen.findByRole("tab", { name: "Схема карточки" }));
  await openDefaultSchemaTemplateEditor(user);

  const addBlockButton = await screen.findByRole("button", { name: "Добавить блок формы" });
  const addBlockSlot = addBlockButton.closest(".schema-add-block-slot");
  expect(addBlockSlot).not.toBeNull();

  await user.click(addBlockButton);

  const blockForm = await within(addBlockSlot as HTMLElement).findByRole("form", {
    name: "Создать блок формы",
  });
  expect(blockForm.closest(".schema-add-block-slot")).toBe(addBlockSlot);
});

test.skip("moves schema fields to an explicit visual row and column", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Реестры" }));
  await user.click(await screen.findByRole("tab", { name: "Схема карточки" }));
  await openDefaultSchemaTemplateEditor(user);

  const blockCard = (await screen.findByRole("heading", { name: "Основной блок" })).closest(
    "article",
  );
  expect(blockCard).not.toBeNull();

  await user.click(
    within(blockCard as HTMLElement).getByRole("heading", { name: "Основной блок" }),
  );
  expect(screen.queryByLabelText("Колонки блока")).not.toBeInTheDocument();
  const blockForm = within(blockCard as HTMLElement)
    .getByRole("heading", { name: "Редактировать блок формы" })
    .closest("form");
  expect(blockForm).not.toBeNull();
  await user.click(within(blockForm as HTMLElement).getByRole("button", { name: "Отмена" }));

  const statusRow = within(blockCard as HTMLElement)
    .getByText("Статус")
    .closest(".schema-field-row");
  expect(statusRow).not.toBeNull();

  fireEvent.dragStart(
    within(statusRow as HTMLElement).getByRole("button", { name: "Перетащить поле Статус" }),
  );
  const targetSlot = await within(blockCard as HTMLElement).findByRole("button", {
    name: "Поместить поле в строку 2 колонку 3",
  });
  fireEvent.dragOver(targetSlot);
  fireEvent.drop(targetSlot);

  await waitFor(() => {
    const patchBodies = vi
      .mocked(fetch)
      .mock.calls.filter(
        ([input, init]) =>
          String(input).endsWith("/api/v1/fields/99999999-9999-4999-8999-999999999999") &&
          init?.method === "PATCH",
      )
      .map(([, init]) => JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
    expect(patchBodies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          position: expect.any(Number),
          display_config_json: expect.objectContaining({
            column_span: 1,
            layout_row: 2,
            layout_column: 3,
          }),
        }),
      ]),
    );
  });
});

test.skip("moves schema blocks to an explicit visual row and column", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Реестры" }));
  await user.click(await screen.findByRole("tab", { name: "Схема карточки" }));
  await openDefaultSchemaTemplateEditor(user);

  const blockCard = (await screen.findByRole("heading", { name: "Основной блок" })).closest(
    "article",
  );
  expect(blockCard).not.toBeNull();

  await user.click(
    within(blockCard as HTMLElement).getByRole("button", {
      name: "Переместить блок Основной блок",
    }),
  );

  const layoutGrid = await screen.findByRole("group", {
    name: "Сетка перемещения блока Основной блок",
  });
  expect(layoutGrid.querySelectorAll(".schema-layout-drop-slot")).toHaveLength(50);
  expect(
    within(layoutGrid).getByRole("button", {
      name: "Текущее положение блока Основной блок: строка 1 колонка 1",
    }),
  ).toBeDisabled();

  await user.click(
    within(layoutGrid).getByRole("button", {
      name: "Поместить блок в строку 2 колонку 1",
    }),
  );

  await waitFor(() => {
    const patchBodies = vi
      .mocked(fetch)
      .mock.calls.filter(
        ([input, init]) =>
          String(input).endsWith("/api/v1/blocks/88888888-8888-4888-8888-888888888888") &&
          init?.method === "PATCH",
      )
      .map(([, init]) => JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
    expect(patchBodies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          display_config_json: expect.objectContaining({
            title_position: "top",
            column_span: 5,
            layout_row: 2,
            layout_column: 1,
          }),
        }),
      ]),
    );
  });
});

test.skip("opens and closes the schema layout grid from the field drag handle", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Реестры" }));
  await user.click(await screen.findByRole("tab", { name: "Схема карточки" }));
  await openDefaultSchemaTemplateEditor(user);

  const blockCard = (await screen.findByRole("heading", { name: "Основной блок" })).closest(
    "article",
  );
  expect(blockCard).not.toBeNull();
  const approvedRow = within(blockCard as HTMLElement)
    .getByText("Подтверждено")
    .closest(".schema-field-row");
  expect(approvedRow).not.toBeNull();

  const dragHandle = within(approvedRow as HTMLElement).getByRole("button", {
    name: "Перетащить поле Подтверждено",
  });
  await user.click(dragHandle);

  const layoutGrid = await within(blockCard as HTMLElement).findByRole("group", {
    name: "Сетка перемещения поля Подтверждено",
  });
  expect((blockCard as HTMLElement).querySelector(".schema-field-row")).toBeNull();
  expect(layoutGrid.querySelectorAll(".schema-layout-drop-slot")).toHaveLength(50);
  expect(
    within(layoutGrid).getByRole("button", {
      name: "Текущее положение поля Подтверждено: строка 2 колонка 1",
    }),
  ).toBeDisabled();
  const occupiedStatusSlot = within(layoutGrid).getByRole("button", {
    name: "Занято полем Статус: строка 1 колонка 1",
  });
  expect(occupiedStatusSlot).toBeDisabled();
  expect(within(occupiedStatusSlot).getByText("Статус")).toBeInTheDocument();
  expect(
    within(layoutGrid).queryByRole("button", {
      name: "Поместить поле в строку 11 колонку 1",
    }),
  ).not.toBeInTheDocument();

  await user.click(within(layoutGrid).getByRole("button", { name: "Закрыть сетку" }));
  expect(
    within(blockCard as HTMLElement).queryByRole("group", {
      name: "Сетка перемещения поля Подтверждено",
    }),
  ).not.toBeInTheDocument();

  const reopenedApprovedRow = within(blockCard as HTMLElement)
    .getByText("Подтверждено")
    .closest(".schema-field-row");
  expect(reopenedApprovedRow).not.toBeNull();
  const reopenedDragHandle = within(reopenedApprovedRow as HTMLElement).getByRole("button", {
    name: "Перетащить поле Подтверждено",
  });

  await user.click(reopenedDragHandle);
  expect(
    await within(blockCard as HTMLElement).findByRole("group", {
      name: "Сетка перемещения поля Подтверждено",
    }),
  ).toBeInTheDocument();
  fireEvent.keyDown(document, { key: "Escape" });
  await waitFor(() => {
    expect(
      within(blockCard as HTMLElement).queryByRole("group", {
        name: "Сетка перемещения поля Подтверждено",
      }),
    ).not.toBeInTheDocument();
  });
});

test.skip("moves a schema field through the layout grid by native mouse drag", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Реестры" }));
  await user.click(await screen.findByRole("tab", { name: "Схема карточки" }));
  await openDefaultSchemaTemplateEditor(user);

  const blockCard = (await screen.findByRole("heading", { name: "Основной блок" })).closest(
    "article",
  );
  expect(blockCard).not.toBeNull();
  const approvedRow = within(blockCard as HTMLElement)
    .getByText("Подтверждено")
    .closest(".schema-field-row");
  expect(approvedRow).not.toBeNull();

  const dragHandle = within(approvedRow as HTMLElement).getByRole("button", {
    name: "Перетащить поле Подтверждено",
  });
  fireEvent.dragStart(dragHandle);
  await within(blockCard as HTMLElement).findByRole("group", {
    name: "Сетка перемещения поля Подтверждено",
  });
  expect((blockCard as HTMLElement).querySelectorAll(".schema-field-row").length).toBeGreaterThan(
    0,
  );
  const targetSlot = await within(blockCard as HTMLElement).findByRole("button", {
    name: "Поместить поле в строку 1 колонку 5",
  });
  fireEvent.dragOver(targetSlot);
  fireEvent.drop(targetSlot);

  await waitFor(() => {
    const patchBodies = vi
      .mocked(fetch)
      .mock.calls.filter(
        ([input, init]) =>
          String(input).endsWith("/api/v1/fields/99999999-9999-4999-8999-999999999998") &&
          init?.method === "PATCH",
      )
      .map(([, init]) => JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
    expect(patchBodies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          display_config_json: expect.objectContaining({
            layout_row: 1,
            layout_column: 5,
          }),
        }),
      ]),
    );
  });

  await waitFor(() => {
    expect(
      within(blockCard as HTMLElement).queryByRole("group", {
        name: "Сетка перемещения поля Подтверждено",
      }),
    ).not.toBeInTheDocument();
  });
});

test.skip("moves a schema field through the layout grid by pointer mouse drag", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Реестры" }));
  await user.click(await screen.findByRole("tab", { name: "Схема карточки" }));
  await openDefaultSchemaTemplateEditor(user);

  const blockCard = (await screen.findByRole("heading", { name: "Основной блок" })).closest(
    "article",
  );
  expect(blockCard).not.toBeNull();
  const approvedRow = within(blockCard as HTMLElement)
    .getByText("Подтверждено")
    .closest(".schema-field-row");
  expect(approvedRow).not.toBeNull();

  const dragHandle = within(approvedRow as HTMLElement).getByRole("button", {
    name: "Перетащить поле Подтверждено",
  });
  fireEvent.pointerDown(dragHandle, { button: 0, clientX: 10, clientY: 10 });
  fireEvent.pointerMove(window, { button: 0, clientX: 24, clientY: 20 });

  await within(blockCard as HTMLElement).findByRole("group", {
    name: "Сетка перемещения поля Подтверждено",
  });
  expect((blockCard as HTMLElement).querySelectorAll(".schema-field-row").length).toBeGreaterThan(
    0,
  );
  const targetSlot = await within(blockCard as HTMLElement).findByRole("button", {
    name: "Поместить поле в строку 1 колонку 5",
  });
  const previousElementFromPoint = document.elementFromPoint;
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: vi.fn(() => targetSlot),
  });
  fireEvent.pointerUp(window, { button: 0, clientX: 30, clientY: 22 });
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: previousElementFromPoint,
  });

  await waitFor(() => {
    const patchBodies = vi
      .mocked(fetch)
      .mock.calls.filter(
        ([input, init]) =>
          String(input).endsWith("/api/v1/fields/99999999-9999-4999-8999-999999999998") &&
          init?.method === "PATCH",
      )
      .map(([, init]) => JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
    expect(patchBodies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          display_config_json: expect.objectContaining({
            layout_row: 1,
            layout_column: 5,
          }),
        }),
      ]),
    );
  });
});

test.skip("shows occupied field cells while the layout grid is active", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Реестры" }));
  await user.click(await screen.findByRole("tab", { name: "Схема карточки" }));
  await openDefaultSchemaTemplateEditor(user);

  const blockCard = (await screen.findByRole("heading", { name: "Основной блок" })).closest(
    "article",
  );
  expect(blockCard).not.toBeNull();
  const approvedRow = within(blockCard as HTMLElement)
    .getByText("Подтверждено")
    .closest(".schema-field-row");
  expect(approvedRow).not.toBeNull();

  const dragHandle = within(approvedRow as HTMLElement).getByRole("button", {
    name: "Перетащить поле Подтверждено",
  });
  await user.click(dragHandle);

  const layoutGrid = await within(blockCard as HTMLElement).findByRole("group", {
    name: "Сетка перемещения поля Подтверждено",
  });
  expect((blockCard as HTMLElement).querySelectorAll(".schema-field-row")).toHaveLength(0);
  const currentSlot = within(layoutGrid).getByRole("button", {
    name: "Текущее положение поля Подтверждено: строка 2 колонка 1",
  });
  expect(currentSlot).toBeDisabled();
  expect(within(currentSlot).getByText("Подтверждено")).toBeInTheDocument();
  const occupiedSlot = within(layoutGrid).getByRole("button", {
    name: "Занято полем Статус: строка 1 колонка 1",
  });
  expect(occupiedSlot).toBeDisabled();
  expect(within(occupiedSlot).getByText("Статус")).toBeInTheDocument();

  await user.click(within(layoutGrid).getByRole("button", { name: "Закрыть сетку" }));

  await waitFor(() => {
    expect(
      within(blockCard as HTMLElement).queryByRole("group", {
        name: "Сетка перемещения поля Подтверждено",
      }),
    ).not.toBeInTheDocument();
  });
});

test.skip("resizes schema field width with the visual edge handle", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Реестры" }));
  await user.click(await screen.findByRole("tab", { name: "Схема карточки" }));
  await openDefaultSchemaTemplateEditor(user);

  const blockCard = (await screen.findByRole("heading", { name: "Основной блок" })).closest(
    "article",
  );
  expect(blockCard).not.toBeNull();
  const statusRow = within(blockCard as HTMLElement)
    .getByText("Статус")
    .closest(".schema-field-row");
  expect(statusRow).not.toBeNull();

  const resizeHandle = within(statusRow as HTMLElement).getByRole("separator", {
    name: "Изменить ширину поля Статус",
  });
  fireEvent.pointerDown(resizeHandle, { clientX: 100 });
  fireEvent.pointerMove(window, { clientX: 260 });
  fireEvent.pointerUp(window, { clientX: 260 });

  await waitFor(() => {
    const patchBodies = vi
      .mocked(fetch)
      .mock.calls.filter(
        ([input, init]) =>
          String(input).endsWith("/api/v1/fields/99999999-9999-4999-8999-999999999999") &&
          init?.method === "PATCH",
      )
      .map(([, init]) => JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
    expect(patchBodies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          display_config_json: expect.objectContaining({
            column_span: 2,
          }),
        }),
      ]),
    );
  });
});

test.skip("changes field order from the visual schema editor through the layout grid", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Реестры" }));
  await user.click(await screen.findByRole("tab", { name: "Схема карточки" }));
  await openDefaultSchemaTemplateEditor(user);

  const blockCard = (await screen.findByRole("heading", { name: "Основной блок" })).closest(
    "article",
  );
  expect(blockCard).not.toBeNull();

  const statusRow = within(blockCard as HTMLElement)
    .getByText("Статус")
    .closest(".schema-field-row");
  const approvedRow = within(blockCard as HTMLElement)
    .getByText("Подтверждено")
    .closest(".schema-field-row");
  expect(statusRow).not.toBeNull();
  expect(approvedRow).not.toBeNull();

  await user.click(
    within(statusRow as HTMLElement).getByRole("button", { name: "Перетащить поле Статус" }),
  );
  const layoutGrid = await within(blockCard as HTMLElement).findByRole("group", {
    name: "Сетка перемещения поля Статус",
  });
  expect(
    within(layoutGrid).getByRole("button", {
      name: "Занято полем Подтверждено: строка 2 колонка 1",
    }),
  ).toBeDisabled();
  await user.click(
    within(layoutGrid).getByRole("button", {
      name: "Поместить поле в строку 3 колонку 1",
    }),
  );

  await waitFor(() => {
    const fieldLabels = Array.from(
      (blockCard as HTMLElement).querySelectorAll(".schema-field-row strong"),
    ).map((element) => element.textContent);
    expect(fieldLabels).toEqual(["Подтверждено", "Статус"]);
  });

  await waitFor(() => {
    const patchBodies = vi
      .mocked(fetch)
      .mock.calls.filter(
        ([input, init]) => String(input).includes("/api/v1/fields/") && init?.method === "PATCH",
      )
      .map(([, init]) => JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
    expect(patchBodies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ position: 0 }),
        expect.objectContaining({ position: 1 }),
      ]),
    );
  });
});

test.skip("marks schema fields for display in the card list", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Реестры" }));
  await user.click(await screen.findByRole("tab", { name: "Схема карточки" }));
  await openDefaultSchemaTemplateEditor(user);

  const statusRow = (await screen.findByText("Статус")).closest(".schema-field-row");
  expect(statusRow).not.toBeNull();
  await user.click(statusRow as HTMLElement);
  const statusForm = await within(statusRow as HTMLElement).findByRole("form", {
    name: "Редактировать поле формы",
  });
  await user.click(within(statusForm).getByRole("button", { name: "Расширенные настройки" }));
  await user.click(await screen.findByLabelText("Отображать поле в списке карточек"));
  await user.click(screen.getByRole("button", { name: "Сохранить" }));

  expect(await screen.findByText("Поле формы обновлено")).toBeInTheDocument();
  await waitFor(() => {
    const updateFieldCall = vi
      .mocked(fetch)
      .mock.calls.find(
        ([input, init]) =>
          String(input).endsWith("/api/v1/fields/99999999-9999-4999-8999-999999999999") &&
          init?.method === "PATCH",
      );
    expect(updateFieldCall).toBeTruthy();
    const body = JSON.parse(String(updateFieldCall?.[1]?.body ?? "{}")) as Record<string, unknown>;
    expect(body).toMatchObject({ is_list_display: true });
  });

  await user.click(screen.getByRole("button", { name: "Карточки" }));

  expect(await screen.findByText((text) => text.includes("Статус: drafted"))).toBeInTheDocument();
});

test("renders reference lists as one expandable editor list", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Реестры" }));
  await user.click(await screen.findByRole("tab", { name: "Справочники" }));

  const referenceWorkspace = await screen.findByRole("region", {
    name: "Список справочников",
  });
  const referenceCard = within(referenceWorkspace)
    .getByRole("button", { name: "Статусы актива" })
    .closest(".reference-list-card");
  expect(referenceCard).not.toBeNull();
  expect(referenceCard).toHaveClass("is-expanded");
  expect(within(referenceCard as HTMLElement).getByText("Активен")).toBeInTheDocument();
  expect(
    within(referenceCard as HTMLElement).getByRole("button", {
      name: "Добавить элемент справочника",
    }),
  ).toBeInTheDocument();
  expect(
    within(referenceCard as HTMLElement).queryByRole("button", {
      name: "Редактировать справочник Статусы актива",
    }),
  ).not.toBeInTheDocument();
  expect(within(referenceCard as HTMLElement).getByLabelText("Организация-владелец")).toHaveValue(
    "22222222-2222-4222-8222-222222222222",
  );
  expect(
    within(referenceCard as HTMLElement).getByLabelText("Наследовать дочерним организациям"),
  ).toBeChecked();
  expect(within(referenceCard as HTMLElement).getByLabelText("Статус справочника")).toHaveValue(
    "active",
  );
});

test("edits reference metadata inline and creates items from the bottom add slot", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Реестры" }));
  await user.click(await screen.findByRole("tab", { name: "Справочники" }));

  const referenceWorkspace = await screen.findByRole("region", {
    name: "Список справочников",
  });
  const referenceCard = within(referenceWorkspace)
    .getByRole("button", { name: "Статусы актива" })
    .closest(".reference-list-card") as HTMLElement;

  await user.selectOptions(within(referenceCard).getByLabelText("Организация-владелец"), [""]);
  await user.click(within(referenceCard).getByLabelText("Наследовать дочерним организациям"));
  await user.click(within(referenceCard).getByLabelText("Заблокирован для дочерних организаций"));

  await waitFor(() => {
    expect(
      vi.mocked(fetch).mock.calls.some(([input, init]) => {
        if (
          !String(input).endsWith("/api/v1/reference-lists/abababab-abab-4aba-8aba-abababababab") ||
          init?.method !== "PATCH"
        ) {
          return false;
        }
        const body = JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>;
        return (
          body.owner_organization_id === null ||
          body.inherit_to_descendants === false ||
          body.locked_for_descendants === false
        );
      }),
    ).toBe(true);
  });

  expect(
    within(referenceCard).queryByRole("button", { name: "Создать элемент справочника" }),
  ).not.toBeInTheDocument();

  await user.click(
    within(referenceCard).getByRole("button", { name: "Добавить элемент справочника" }),
  );
  expect(
    await within(referenceCard).findByRole("form", { name: "Создать элемент справочника" }),
  ).toBeInTheDocument();
  expect(
    within(referenceCard).queryByLabelText("Описание элемента справочника"),
  ).not.toBeInTheDocument();
  expect(
    within(referenceCard).queryByLabelText("Позиция элемента справочника"),
  ).not.toBeInTheDocument();

  fireEvent.change(within(referenceCard).getByLabelText("Название элемента справочника"), {
    target: { value: "Новый элемент" },
  });
  await user.click(within(referenceCard).getByRole("button", { name: "Создать" }));

  await waitFor(() => {
    const createItemCall = vi
      .mocked(fetch)
      .mock.calls.find(
        ([input, init]) =>
          String(input).endsWith(
            "/api/v1/reference-lists/abababab-abab-4aba-8aba-abababababab/items",
          ) && init?.method === "POST",
      );
    expect(createItemCall).toBeTruthy();
    const body = JSON.parse(String(createItemCall?.[1]?.body ?? "{}")) as Record<string, unknown>;
    expect(body).toMatchObject({
      code: "novyy_element",
      label: "Новый элемент",
      description: null,
      parent_id: null,
      position: 1,
    });
  });
});

test("reorders reference items by mouse drag", async () => {
  referenceItemItems = [
    ...referenceItemItems,
    {
      id: "edededed-eded-4ede-8ede-edededededed",
      list_id: "abababab-abab-4aba-8aba-abababababab",
      parent_id: null,
      code: "inactive",
      label: "Неактивен",
      description: null,
      position: 1,
      is_active: true,
    },
  ];
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Реестры" }));
  await user.click(await screen.findByRole("tab", { name: "Справочники" }));

  const activeRow = await screen.findByRole("row", { name: /Активен/ });
  const inactiveRow = await screen.findByRole("row", { name: /Неактивен/ });

  fireEvent.dragStart(inactiveRow);
  fireEvent.dragOver(activeRow);
  fireEvent.drop(activeRow);

  await waitFor(() => {
    expect(
      vi.mocked(fetch).mock.calls.some(([input, init]) => {
        if (
          !String(input).endsWith("/api/v1/reference-items/edededed-eded-4ede-8ede-edededededed") ||
          init?.method !== "PATCH"
        ) {
          return false;
        }
        const body = JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>;
        return body.position === 0;
      }),
    ).toBe(true);
  });
});

test("uses compact visible row actions with full accessible labels", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Организации" }));

  const editOrganization = await screen.findByRole("button", {
    name: "Редактировать организацию Главная организация",
  });
  expect(editOrganization).toHaveTextContent("Изменить");
  const archiveOrganization = screen.getByRole("button", {
    name: "Архивировать организацию Главная организация",
  });
  expect(archiveOrganization).toHaveTextContent("В архив");

  await user.click(screen.getByRole("button", { name: "Реестры" }));
  const editRegistry = await screen.findByRole("button", {
    name: "Редактировать реестр Реестр активов",
  });
  expect(editRegistry).toHaveTextContent("Изменить");
  const archiveRegistry = screen.getByRole("button", {
    name: "Архивировать реестр Реестр активов",
  });
  expect(archiveRegistry).toHaveTextContent("В архив");
});

test("does not show global admin query errors while scoped user works with cards", async () => {
  denyAdminReadQueries = true;
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Карточки" }));

  expect((await screen.findAllByText("Карточка актива")).length).toBeGreaterThan(0);
  expect(screen.queryByText("Действие недоступно.")).not.toBeInTheDocument();
  await waitFor(() => {
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/api/v1/users"))).toBe(
      false,
    );
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).endsWith("/api/v1/audit-events?limit=20"),
      ),
    ).toBe(false);
  });

  await user.click(screen.getByRole("button", { name: "Пользователи" }));

  expect(await screen.findByText("Действие недоступно.")).toBeInTheDocument();
  expect(await screen.findByText("Нет доступа к разделу.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Создать пользователя" })).not.toBeInTheDocument();
  expect(screen.queryByText("Forbidden")).not.toBeInTheDocument();
});

test("filters cards by search organization and archive visibility", async () => {
  cardItems = [
    ...apiPayloads.cards.items,
    {
      id: "abababab-abab-4bab-8bab-abababababab",
      registry_id: "77777777-7777-4777-8777-777777777777",
      card_template_id: "71717171-7171-4171-8171-717171717171",
      card_template_name: "Муниципальная карточка",
      organization_id: "22222222-2222-4222-8222-222222222222",
      org_unit_id: null,
      display_name: "Архивная карточка",
      lifecycle_status: "archived",
      public_view_enabled: false,
      public_edit_enabled: false,
      list_fields: [],
    },
  ];
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Карточки" }));

  const searchBar = screen.getByRole("group", { name: "Поисковая строка карточек" });
  expect(within(searchBar).getByLabelText("Поиск карточек")).toBeInTheDocument();
  expect(
    within(searchBar).queryByRole("button", { name: "Организации: все доступные" }),
  ).not.toBeInTheDocument();
  await user.click(within(searchBar).getByLabelText("Поиск карточек"));
  const tagMenu = await screen.findByRole("listbox", { name: "Доступные теги поиска" });
  expect(within(tagMenu).getByRole("button", { name: /^Организации/ })).toBeInTheDocument();
  expect(
    within(tagMenu).getByRole("button", { name: "Показывать архивные и замененные карточки" }),
  ).toBeInTheDocument();
  expect(within(tagMenu).getByRole("button", { name: "Статус" })).toBeInTheDocument();
  await user.click(screen.getByRole("heading", { level: 2, name: "Карточки" }));
  await waitFor(() => {
    expect(
      screen.queryByRole("listbox", { name: "Доступные теги поиска" }),
    ).not.toBeInTheDocument();
  });
  expect(
    screen.queryByLabelText("Показывать архивные и замененные карточки"),
  ).not.toBeInTheDocument();
  expect(screen.queryByText("Архивная карточка")).not.toBeInTheDocument();

  await user.type(within(searchBar).getByLabelText("Поиск карточек"), "Архивная{enter}");
  expect(within(searchBar).getByText("Текст: Архивная")).toBeInTheDocument();
  expect(screen.queryByText("Архивная карточка")).not.toBeInTheDocument();

  await user.click(within(searchBar).getByLabelText("Поиск карточек"));
  await user.click(
    within(await screen.findByRole("listbox", { name: "Доступные теги поиска" })).getByRole(
      "button",
      { name: "Показывать архивные и замененные карточки" },
    ),
  );
  expect(within(searchBar).getByText("Архивные и замененные карточки")).toBeInTheDocument();
  expect(await screen.findByText("Архивная карточка")).toBeInTheDocument();
  await user.click(within(searchBar).getByLabelText("Поиск карточек"));
  await user.click(
    within(await screen.findByRole("listbox", { name: "Доступные теги поиска" })).getByRole(
      "button",
      { name: /^Организации/ },
    ),
  );
  expect(screen.getByRole("checkbox", { name: "Включать подведомственные" })).toBeChecked();
  await user.click(screen.getByRole("checkbox", { name: "Главная организация" }));
  expect(
    within(searchBar).getByText("Организации: Главная организация + подведомственные"),
  ).toBeInTheDocument();

  await waitFor(() => {
    const fetchMock = vi.mocked(fetch);
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const url = input instanceof Request ? input.url : String(input);
        return (
          url.includes("/api/v1/organizations/22222222-2222-4222-8222-222222222222/cards?") &&
          url.includes("q=%D0%90%D1%80%D1%85%D0%B8%D0%B2%D0%BD%D0%B0%D1%8F") &&
          url.includes("include_archive=true") &&
          url.includes("organization_ids=22222222-2222-4222-8222-222222222222") &&
          url.includes("include_descendant_organizations=true") &&
          init?.method === "GET"
        );
      }),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const url = input instanceof Request ? input.url : String(input);
        return (
          url.includes("/api/v1/registries/77777777-7777-4777-8777-777777777777/cards?") &&
          url.includes("q=%D0%90%D1%80%D1%85%D0%B8%D0%B2%D0%BD%D0%B0%D1%8F") &&
          init?.method === "GET"
        );
      }),
    ).toBe(false);
  });
});

test("adds dynamic field filters from the unified card search bar", async () => {
  cardItems = [
    ...apiPayloads.cards.items,
    {
      id: "acacacac-acac-4cac-8cac-acacacacacac",
      registry_id: "77777777-7777-4777-8777-777777777777",
      card_template_id: "71717171-7171-4171-8171-717171717171",
      card_template_name: "Муниципальная карточка",
      organization_id: "22222222-2222-4222-8222-222222222222",
      org_unit_id: null,
      display_name: "Карточка без статуса",
      lifecycle_status: "draft",
      public_view_enabled: false,
      public_edit_enabled: false,
      list_fields: [],
    },
  ];
  cardValueStateById["acacacac-acac-4cac-8cac-acacacacacac"] = {
    status: "blocked",
    approved: false,
    repeatableNotes: [],
    fileRef: null,
  };
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Карточки" }));

  const searchBar = screen.getByRole("group", { name: "Поисковая строка карточек" });
  expect(await screen.findByText("Карточка актива")).toBeInTheDocument();
  expect(screen.getByText("Карточка без статуса")).toBeInTheDocument();

  await user.click(within(searchBar).getByLabelText("Поиск карточек"));
  const tagMenu = await screen.findByRole("listbox", { name: "Доступные теги поиска" });
  const statusButton = within(tagMenu).getByRole("button", { name: "Статус" });
  const statusOption = statusButton.closest(".search-field-option");
  expect(statusOption).not.toBeNull();
  await user.click(statusButton);
  await user.type(
    await within(statusOption as HTMLElement).findByLabelText("Значение фильтра Статус"),
    "drafted",
  );
  await user.click(
    within(statusOption as HTMLElement).getByRole("button", {
      name: "Добавить фильтр Статус",
    }),
  );

  expect(within(searchBar).getByText("Статус: drafted")).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByText("Карточка актива")).toBeInTheDocument();
    expect(screen.queryByText("Карточка без статуса")).not.toBeInTheDocument();
  });
  await waitFor(() => {
    const fetchMock = vi.mocked(fetch);
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const url = input instanceof Request ? input.url : String(input);
        if (
          !url.includes("/api/v1/organizations/22222222-2222-4222-8222-222222222222/cards?") ||
          init?.method !== "GET"
        ) {
          return false;
        }
        const requestUrl = new URL(url, "http://localhost");
        const filters = cardFieldFilters(requestUrl);
        return filters.some(
          (filter) =>
            filter.field_id === "99999999-9999-4999-8999-999999999999" &&
            filter.field_type === "text" &&
            filter.operator === "contains" &&
            filter.value === "drafted",
        );
      }),
    ).toBe(true);
  });
});

test("adds reference field filters with readable chips from the card search bar", async () => {
  referenceItemItems = [
    ...referenceItemItems,
    {
      id: "dcdcdcdc-dcdc-4dcd-8dcd-dcdcdcdcdcdc",
      list_id: "abababab-abab-4aba-8aba-abababababab",
      parent_id: null,
      code: "paused",
      label: "Приостановлен",
      description: null,
      position: 1,
      is_active: true,
    },
  ];
  schemaFieldItems = schemaFieldItems.map((field) =>
    field.id === "99999999-9999-4999-8999-999999999999"
      ? {
          ...field,
          label: "tst",
          field_type: "multi_select",
          options_source_type: "reference_list",
          options_source_id: "abababab-abab-4aba-8aba-abababababab",
        }
      : field,
  );
  cardValueStateById["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"].status =
    "bcbcbcbc-bcbc-4bcb-8bcb-bcbcbcbcbcbc dcdcdcdc-dcdc-4dcd-8dcd-dcdcdcdcdcdc";
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Карточки" }));

  const searchBar = screen.getByRole("group", { name: "Поисковая строка карточек" });
  await user.click(within(searchBar).getByLabelText("Поиск карточек"));
  const tagMenu = await screen.findByRole("listbox", { name: "Доступные теги поиска" });
  const fieldButton = within(tagMenu).getByRole("button", { name: "tst" });
  const fieldOption = fieldButton.closest(".search-field-option");
  expect(fieldOption).not.toBeNull();
  await user.click(fieldButton);
  await user.click(
    await within(fieldOption as HTMLElement).findByRole("button", { name: "Активен" }),
  );
  await user.click(
    within(fieldOption as HTMLElement).getByRole("button", { name: "Приостановлен" }),
  );

  expect(within(searchBar).getByText("tst: Активен")).toBeInTheDocument();
  expect(within(searchBar).getByText("tst: Приостановлен")).toBeInTheDocument();
  expect(screen.queryByText(/bcbcbcbc-bcbc-4bcb-8bcb-bcbcbcbcbcbc/)).not.toBeInTheDocument();
  await waitFor(() => {
    const fetchMock = vi.mocked(fetch);
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const url = input instanceof Request ? input.url : String(input);
        if (
          !url.includes("/api/v1/organizations/22222222-2222-4222-8222-222222222222/cards?") ||
          init?.method !== "GET"
        ) {
          return false;
        }
        const requestUrl = new URL(url, "http://localhost");
        const filters = cardFieldFilters(requestUrl);
        return (
          filters.some(
            (filter) =>
              filter.field_id === "99999999-9999-4999-8999-999999999999" &&
              filter.field_type === "multi_select" &&
              filter.operator === "contains" &&
              filter.value === "bcbcbcbc-bcbc-4bcb-8bcb-bcbcbcbcbcbc",
          ) &&
          filters.some(
            (filter) =>
              filter.field_id === "99999999-9999-4999-8999-999999999999" &&
              filter.field_type === "multi_select" &&
              filter.operator === "contains" &&
              filter.value === "dcdcdcdc-dcdc-4dcd-8dcd-dcdcdcdcdcdc",
          )
        );
      }),
    ).toBe(true);
  });
});

test("adds template bool and date filters from inline search tag choices", async () => {
  schemaFieldItems = [
    ...schemaFieldItems,
    {
      id: "98989898-9898-4989-8989-989898989898",
      block_id: "88888888-8888-4888-8888-888888888888",
      code: "record_date",
      label: "Дата регистрации",
      description: null,
      field_type: "date",
      position: 2,
      required_mode: "not_required",
      options_source_type: null,
      options_source_id: null,
      options_config_json: null,
      is_active: true,
      is_list_display: false,
      public_visible: true,
      public_editable: false,
    },
  ];
  cardItems = cardItems.map(
    (item) =>
      ({
        ...item,
        card_template_id: "71717171-7171-4171-8171-717171717171",
      }) as CardSummaryRead,
  );
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Карточки" }));

  const searchBar = screen.getByRole("group", { name: "Поисковая строка карточек" });
  await user.click(within(searchBar).getByLabelText("Поиск карточек"));
  const tagMenu = await screen.findByRole("listbox", { name: "Доступные теги поиска" });

  const templateButton = within(tagMenu).getByRole("button", { name: "Шаблон карточки" });
  const templateOption = templateButton.closest(".search-filter-option");
  expect(templateOption).not.toBeNull();
  await user.click(templateButton);
  await user.click(
    await within(templateOption as HTMLElement).findByRole("button", {
      name: "Муниципальная карточка",
    }),
  );

  const boolButton = within(tagMenu).getByRole("button", { name: "Подтверждено" });
  const boolOption = boolButton.closest(".search-field-option");
  expect(boolOption).not.toBeNull();
  await user.click(boolButton);
  await user.click(await within(boolOption as HTMLElement).findByRole("button", { name: "Да" }));

  const dateButton = within(tagMenu).getByRole("button", { name: "Дата регистрации" });
  const dateOption = dateButton.closest(".search-field-option");
  expect(dateOption).not.toBeNull();
  await user.click(dateButton);
  await user.type(
    await within(dateOption as HTMLElement).findByLabelText("Значение фильтра Дата регистрации"),
    "2026-07-02",
  );
  await user.click(
    within(dateOption as HTMLElement).getByRole("button", {
      name: "Добавить фильтр Дата регистрации",
    }),
  );

  expect(
    within(searchBar).getByText("Шаблон карточки: Муниципальная карточка"),
  ).toBeInTheDocument();
  expect(within(searchBar).getByText("Подтверждено: Да")).toBeInTheDocument();
  expect(within(searchBar).getByText("Дата регистрации: 2026-07-02")).toBeInTheDocument();
  await waitFor(() => {
    const fetchMock = vi.mocked(fetch);
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const url = input instanceof Request ? input.url : String(input);
        if (
          !url.includes("/api/v1/organizations/22222222-2222-4222-8222-222222222222/cards?") ||
          init?.method !== "GET"
        ) {
          return false;
        }
        const requestUrl = new URL(url, "http://localhost");
        const filters = cardFieldFilters(requestUrl);
        return (
          requestUrl.searchParams
            .getAll("card_template_ids")
            .includes("71717171-7171-4171-8171-717171717171") &&
          filters.some(
            (filter) =>
              filter.field_id === "99999999-9999-4999-8999-999999999998" &&
              filter.field_type === "bool" &&
              filter.operator === "is" &&
              filter.value === true,
          ) &&
          filters.some(
            (filter) =>
              filter.field_id === "98989898-9898-4989-8989-989898989898" &&
              filter.field_type === "date" &&
              filter.operator === "is" &&
              filter.value === "2026-07-02",
          )
        );
      }),
    ).toBe(true);
  });
});

test("creates archives cards and manages repeatable blocks with inline saves", async () => {
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
          String(input).endsWith(
            "/api/v1/organizations/22222222-2222-4222-8222-222222222222/cards",
          ) && init?.method === "POST",
      ).length;

  await user.click(await screen.findByRole("button", { name: "Создать карточку" }));
  expect(screen.queryByText("Подразделение карточки")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Реестр карточки")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Название карточки")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Шаблон карточки")).toHaveValue(
    "71717171-7171-4171-8171-717171717171",
  );
  await user.selectOptions(screen.getByLabelText("Организация карточки"), [""]);
  const postCountBeforeValidation = cardPostCount();
  await user.click(screen.getByRole("button", { name: "Создать" }));

  expect(await screen.findByText("Заполните обязательные поля")).toBeInTheDocument();
  expect(cardPostCount()).toBe(postCountBeforeValidation);

  await user.selectOptions(screen.getByLabelText("Организация карточки"), [
    "22222222-2222-4222-8222-222222222222",
  ]);
  expect(screen.queryByLabelText("Подразделение карточки")).not.toBeInTheDocument();
  await user.click(screen.getByLabelText("Публичный просмотр карточки"));
  await user.click(screen.getByLabelText("Публичное редактирование карточки"));
  await user.click(screen.getByRole("button", { name: "Создать" }));

  expect(await screen.findByText("Карточка создана")).toBeInTheDocument();
  expect((await screen.findAllByText("Муниципальная карточка")).length).toBeGreaterThan(0);
  expect(
    screen.queryByRole("button", { name: "Редактировать карточку Муниципальная карточка" }),
  ).not.toBeInTheDocument();

  await user.click(
    screen.getByRole("button", { name: "Добавить экземпляр блока Детали карточки" }),
  );
  expect(await screen.findByText("Экземпляр блока создан")).toBeInTheDocument();

  const mainBlock = await openCardBlockEditor(user);
  const statusInput = within(mainBlock).getByLabelText("Статус");
  await user.clear(statusInput);
  await user.type(statusInput, "published");
  await user.click(within(mainBlock).getByLabelText("Подтверждено"));
  await user.click(within(mainBlock).getByRole("button", { name: "Сохранить блок Основной блок" }));

  const detailsBlock = await openCardBlockEditor(user, "Детали карточки");
  await user.type(within(detailsBlock).getByLabelText("Комментарий"), "Комментарий по карточке");
  await user.click(
    within(detailsBlock).getByRole("button", { name: "Сохранить блок Детали карточки" }),
  );

  expect((await screen.findAllByText("Поля карточки сохранены")).length).toBeGreaterThan(0);
  await user.click(
    screen.getByRole("button", {
      name: "Архивировать экземпляр блока Детали карточки экземпляр 1",
    }),
  );
  expect(await screen.findByText("Экземпляр блока архивирован")).toBeInTheDocument();

  await user.click(
    screen.getByRole("button", { name: "Архивировать карточку Муниципальная карточка" }),
  );
  expect(await screen.findByRole("dialog", { name: "Архивировать карточку" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Архивировать" }));

  expect(await screen.findByText("Карточка архивирована")).toBeInTheDocument();

  await waitFor(() => {
    const fetchMock = vi.mocked(fetch);
    const createCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith(
          "/api/v1/organizations/22222222-2222-4222-8222-222222222222/cards",
        ) && init?.method === "POST",
    );
    expect(createCall).toBeTruthy();
    const createBody = JSON.parse(String(createCall?.[1]?.body ?? "{}")) as Record<string, unknown>;
    expect(createBody).toEqual({
      card_template_id: "71717171-7171-4171-8171-717171717171",
      public_view_enabled: true,
      public_edit_enabled: true,
    });
    expect(createBody).not.toHaveProperty("organization_id");
    expect(createBody).not.toHaveProperty("org_unit_id");
    expect(createBody).not.toHaveProperty("display_name");
    expect(createBody).not.toHaveProperty("employees");
    expect(createBody).not.toHaveProperty("full_name");
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).endsWith("/api/v1/registries/77777777-7777-4777-8777-777777777777/cards") &&
          init?.method === "POST",
      ),
    ).toBe(false);

    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        return (
          String(input).endsWith("/api/v1/cards/cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd") &&
          init?.method === "PATCH" &&
          Object.prototype.hasOwnProperty.call(body, "display_name")
        );
      }),
    ).toBe(false);
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).endsWith(
            "/api/v1/cards/cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd/blocks/8d8d8d8d-8d8d-48d8-88d8-8d8d8d8d8d8d/instances",
          ) && init?.method === "POST",
      ),
    ).toBe(true);

    const savedValues = fetchMock.mock.calls
      .filter(
        ([input, init]) =>
          String(input).endsWith("/api/v1/cards/cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd/values") &&
          init?.method === "PATCH",
      )
      .flatMap(([, init]) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          values: { field_id: string; value: unknown; block_instance_id?: string | null }[];
        };
        return body.values;
      });
    expect(savedValues).toEqual(
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

test("loads card field reference options through card organization scope", async () => {
  schemaFieldItems = schemaFieldItems.map((field) =>
    field.id === "99999999-9999-4999-8999-999999999999"
      ? {
          ...field,
          field_type: "select",
          options_source_type: "reference_list",
          options_source_id: "abababab-abab-4aba-8aba-abababababab",
          options_config_json: {
            reference_resolution: "by_card_organization",
            allow_owner_override: true,
          },
        }
      : field,
  );
  cardValueStateById["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"].status =
    "bcbcbcbc-bcbc-4bcb-8bcb-bcbcbcbcbcbc";
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await openExistingCardEditor(user);

  const mainBlock = await openCardBlockEditor(user);
  expect(await within(mainBlock).findByRole("option", { name: "Активен" })).toBeInTheDocument();

  await waitFor(() => {
    const fetchMock = vi.mocked(fetch);
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).endsWith(
            "/api/v1/cards/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/fields/99999999-9999-4999-8999-999999999999/reference-items",
          ) && init?.method !== "POST",
      ),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).endsWith(
          "/api/v1/reference-lists/abababab-abab-4aba-8aba-abababababab/items",
        ),
      ),
    ).toBe(false);
  });
});

test("renders organization hierarchy and hides organization type choices", async () => {
  organizationItems = [
    ...apiPayloads.organizations.items,
    {
      id: "23232323-2323-4232-8232-232323232323",
      parent_id: "22222222-2222-4222-8222-222222222222",
      code: "tu-1",
      name: "Территориальное управление 1",
      type: "department",
      is_active: true,
    },
    {
      id: "24242424-2424-4242-8242-242424242424",
      parent_id: "23232323-2323-4232-8232-232323232323",
      code: "sub-1",
      name: "Подведомственная организация",
      type: "unit",
      is_active: true,
    },
  ];
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Организации" }));

  const tree = await screen.findByRole("tree", { name: "Дерево организаций" });
  expect(within(tree).getByRole("treeitem", { name: /Главная организация/ })).toHaveAttribute(
    "aria-level",
    "1",
  );
  expect(
    within(tree).getByRole("treeitem", { name: /Территориальное управление 1/ }),
  ).toHaveAttribute("aria-level", "2");
  expect(
    within(tree).getByRole("treeitem", { name: /Подведомственная организация/ }),
  ).toHaveAttribute("aria-level", "3");
  expect(screen.queryByText("Подразделение")).not.toBeInTheDocument();
  expect(screen.queryByText("Отдел")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Создать организацию" }));
  expect(screen.queryByLabelText("Тип организации")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Код организации")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("option", { name: "Без родительской организации" }),
  ).not.toBeInTheDocument();
  await user.type(screen.getByLabelText("Название организации"), "Дочерняя организация");
  expect(screen.getByLabelText("Родительская организация")).toHaveValue(
    "22222222-2222-4222-8222-222222222222",
  );
  await user.click(screen.getByRole("button", { name: "Создать" }));
  expect(
    vi
      .mocked(fetch)
      .mock.calls.filter(
        ([input, init]) =>
          String(input).endsWith("/api/v1/organizations") && init?.method === "POST",
      ).length,
  ).toBeGreaterThan(0);

  expect(await screen.findByText("Организация создана")).toBeInTheDocument();
  await waitFor(() => {
    const fetchMock = vi.mocked(fetch);
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).endsWith("/api/v1/organizations/tree")),
    ).toBe(true);
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
          body.code === "dochernyaya_organizatsiya" &&
          body.name === "Дочерняя организация" &&
          body.parent_id === "22222222-2222-4222-8222-222222222222" &&
          body.organization_type === "organization"
        );
      }),
    ).toBe(true);
  });
});

test("allows the first organization to be created as the main root", async () => {
  organizationItems = [];
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Организации" }));

  expect(await screen.findByText("Нет данных")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Создать организацию" }));
  expect(screen.getByRole("option", { name: "Без родительской организации" })).toBeInTheDocument();
  expect(screen.queryByLabelText("Код организации")).not.toBeInTheDocument();
  await user.type(screen.getByLabelText("Название организации"), "Главная организация");
  await user.click(screen.getByRole("button", { name: "Создать" }));

  expect(await screen.findByText("Организация создана")).toBeInTheDocument();
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
          body.code === "glavnaya_organizatsiya" &&
          body.name === "Главная организация" &&
          body.parent_id === null &&
          body.organization_type === "organization"
        );
      }),
    ).toBe(true);
  });
});

test("manages public links from authenticated card workspace", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await openExistingCardEditor(user);
  await user.click(await screen.findByRole("tab", { name: "Публичные ссылки" }));

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
  expect(screen.getByDisplayValue(/\/public\/edit\/created-public-token$/)).toBeInTheDocument();
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

  expect(screen.queryByLabelText("Код организации")).not.toBeInTheDocument();
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
          body.code === "dochernyaya_organizatsiya" &&
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

  expect(screen.queryByLabelText("Код реестра")).not.toBeInTheDocument();
  await user.type(screen.getByLabelText("Название реестра"), "Реестр договоров");
  await user.type(screen.getByLabelText("Описание реестра"), "Договорная работа");
  await user.click(screen.getByRole("button", { name: "Создать" }));

  expect(await screen.findByText("Реестр создан")).toBeInTheDocument();
  expect(screen.getAllByText("Реестр договоров").length).toBeGreaterThan(0);
  expect(screen.getByText(/reestr_dogovorov \/ v1 \/ Черновик/)).toBeInTheDocument();

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
  expect(screen.getByText(/reestr_dogovorov \/ v1 \/ Активно/)).toBeInTheDocument();

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
      code: "reestr_dogovorov",
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

test.skip("creates edits and archives schema blocks and fields in Russian UI", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Реестры" }));
  await user.click(await screen.findByRole("tab", { name: "Схема карточки" }));
  await openDefaultSchemaTemplateEditor(user);

  const blockPostCount = () =>
    vi
      .mocked(fetch)
      .mock.calls.filter(
        ([input, init]) =>
          String(input).endsWith(
            "/api/v1/registries/77777777-7777-4777-8777-777777777777/blocks",
          ) && init?.method === "POST",
      ).length;

  await user.click(screen.getByRole("button", { name: "Добавить блок формы" }));
  const blockPostCountBeforeValidation = blockPostCount();
  await user.click(screen.getByRole("button", { name: "Создать" }));

  expect(await screen.findByText("Заполните обязательные поля")).toBeInTheDocument();
  expect(blockPostCount()).toBe(blockPostCountBeforeValidation);

  expect(screen.queryByLabelText("Код блока формы")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Описание блока формы")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Позиция блока формы")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Название блока формы"), {
    target: { value: "Детали карточки" },
  });
  await user.click(screen.getByLabelText("Повторяемый блок"));
  await user.click(screen.getByLabelText("Редактировать блок в публичной ссылке"));
  await user.click(screen.getByRole("button", { name: "Создать" }));

  expect(await screen.findByText("Блок формы создан")).toBeInTheDocument();
  expect(screen.getByText("Детали карточки")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Добавить поле в блок Детали карточки" }),
  ).toBeInTheDocument();

  expect(
    screen.queryByRole("button", { name: "Редактировать блок формы Детали карточки" }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("heading", { name: "Детали карточки" }));
  const blockTitleInput = await screen.findByLabelText("Название блока формы");
  fireEvent.change(blockTitleInput, { target: { value: "Детали карточки обновлены" } });
  expect(screen.queryByLabelText("Описание блока формы")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Позиция блока формы")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Сохранить" }));

  expect(await screen.findByText("Блок формы обновлен")).toBeInTheDocument();
  expect(screen.getByText("Детали карточки обновлены")).toBeInTheDocument();

  await user.click(
    screen.getByRole("button", { name: "Добавить поле в блок Детали карточки обновлены" }),
  );
  expect(screen.queryByLabelText("Блок формы")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Код поля формы")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Описание поля формы")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Позиция поля формы")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Название поля формы"), { target: { value: "Сумма" } });
  await user.selectOptions(screen.getByLabelText("Тип поля формы"), ["number"]);
  await user.click(screen.getByRole("button", { name: "Расширенные настройки" }));
  await user.click(screen.getByLabelText("Редактировать поле в публичной ссылке"));
  expect(screen.getByRole("option", { name: "Ссылка на организацию" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Создать" }));

  expect(await screen.findByText("Поле формы создано")).toBeInTheDocument();
  expect(screen.getByText("Сумма")).toBeInTheDocument();
  expect(screen.getByText(/Число/)).toBeInTheDocument();

  expect(
    screen.queryByRole("button", { name: "Редактировать поле формы Сумма" }),
  ).not.toBeInTheDocument();
  const sumRow = screen.getByText("Сумма").closest(".schema-field-row");
  expect(sumRow).not.toBeNull();
  await user.click(sumRow as HTMLElement);
  const fieldLabelInput = await screen.findByLabelText("Название поля формы");
  fireEvent.change(fieldLabelInput, { target: { value: "Сумма обновленная" } });
  expect(screen.queryByLabelText("Описание поля формы")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Позиция поля формы")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Расширенные настройки" }));
  await user.click(screen.getByLabelText("Активное поле"));
  await user.click(screen.getByRole("button", { name: "Сохранить" }));

  expect(await screen.findByText("Поле формы обновлено")).toBeInTheDocument();
  expect(screen.getByText("Сумма обновленная")).toBeInTheDocument();
  expect(screen.getByText(/Неактивно/)).toBeInTheDocument();

  const updatedSumRow = screen.getByText("Сумма обновленная").closest(".schema-field-row");
  expect(updatedSumRow).not.toBeNull();
  await user.click(updatedSumRow as HTMLElement);
  await user.click(screen.getByRole("button", { name: "Перенести в архив" }));
  expect(
    await screen.findByRole("dialog", { name: "Архивировать поле формы" }),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Архивировать" }));

  expect(await screen.findByText("Поле формы архивировано")).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByText("Сумма обновленная")).not.toBeInTheDocument());

  await user.click(screen.getByRole("heading", { name: "Детали карточки обновлены" }));
  await user.click(screen.getByRole("button", { name: "Перенести в архив" }));
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
      code: "detali_kartochki",
      title: "Детали карточки",
      description: null,
      position: 1,
      is_repeatable: true,
      public_visible: true,
      public_editable: true,
      display_config_json: {
        column_span: 5,
        layout_row: 2,
        layout_column: 1,
        title_position: "top",
      },
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
      code: "summa",
      label: "Сумма",
      field_type: "number",
      description: null,
      position: 0,
      required_mode: "not_required",
      options_source_type: null,
      options_source_id: null,
      options_config_json: null,
      display_config_json: {
        column_span: 1,
        layout_row: 1,
        layout_column: 1,
        label_position: "top",
        separator_style: "none",
      },
      is_list_display: false,
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
        return body.title === "Детали карточки обновлены" && body.position === 1;
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
          body.label === "Сумма обновленная" && body.position === 0 && body.is_active === false
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
  await user.click(await screen.findByRole("tab", { name: "Справочники" }));

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
  const createListForm = screen.getByRole("form", { name: "Создать справочник" });
  const postCountBeforeValidation = referenceListPostCount();
  await user.click(within(createListForm).getByRole("button", { name: "Создать" }));

  expect(await screen.findByText("Заполните обязательные поля")).toBeInTheDocument();
  expect(referenceListPostCount()).toBe(postCountBeforeValidation);

  expect(screen.queryByLabelText("Код справочника")).not.toBeInTheDocument();
  fireEvent.change(within(createListForm).getByLabelText("Название справочника"), {
    target: { value: "Приоритеты" },
  });
  fireEvent.change(within(createListForm).getByLabelText("Описание справочника"), {
    target: { value: "Уровни приоритета карточки" },
  });
  await user.selectOptions(within(createListForm).getByLabelText("Организация-владелец"), [
    "22222222-2222-4222-8222-222222222222",
  ]);
  await user.click(within(createListForm).getByLabelText("Наследовать дочерним организациям"));
  await user.click(within(createListForm).getByLabelText("Заблокировать для дочерних организаций"));
  await user.click(within(createListForm).getByRole("button", { name: "Создать" }));

  expect(await screen.findByText("Справочник создан")).toBeInTheDocument();
  expect(screen.getAllByText("Приоритеты").length).toBeGreaterThan(0);

  const priorityCard = screen
    .getByRole("button", { name: "Приоритеты" })
    .closest(".reference-list-card") as HTMLElement;
  await user.selectOptions(within(priorityCard).getByLabelText("Организация-владелец"), [""]);
  await user.click(within(priorityCard).getByLabelText("Наследовать дочерним организациям"));

  expect(await screen.findByText("Справочник обновлен")).toBeInTheDocument();
  expect(screen.getAllByText("Приоритеты").length).toBeGreaterThan(0);

  const referenceItemPostCount = () =>
    vi
      .mocked(fetch)
      .mock.calls.filter(
        ([input, init]) =>
          String(input).endsWith(
            "/api/v1/reference-lists/dededede-dede-4ede-8ede-dededededede/items",
          ) && init?.method === "POST",
      ).length;

  await user.click(
    within(priorityCard).getByRole("button", { name: "Добавить элемент справочника" }),
  );
  const itemPostCountBeforeValidation = referenceItemPostCount();
  await user.click(screen.getByRole("button", { name: "Создать" }));

  expect(await screen.findByText("Заполните обязательные поля")).toBeInTheDocument();
  expect(referenceItemPostCount()).toBe(itemPostCountBeforeValidation);

  expect(screen.queryByLabelText("Код элемента справочника")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Описание элемента справочника")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Позиция элемента справочника")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Название элемента справочника"), {
    target: { value: "Высокий" },
  });
  await user.click(screen.getByRole("button", { name: "Создать" }));

  expect(await screen.findByText("Элемент справочника создан")).toBeInTheDocument();
  expect(screen.getAllByText("Высокий").length).toBeGreaterThan(0);

  await user.click(
    screen.getByRole("button", { name: "Редактировать элемент справочника Высокий" }),
  );
  const itemLabelInput = await screen.findByLabelText("Название элемента справочника");
  fireEvent.change(itemLabelInput, { target: { value: "Высокий приоритет" } });
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

  await user.selectOptions(within(priorityCard).getByLabelText("Статус справочника"), ["inactive"]);
  expect(
    await screen.findByRole("dialog", { name: "Архивировать справочник" }),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Архивировать" }));

  expect(await screen.findByText("Справочник архивирован")).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByText("Приоритеты")).not.toBeInTheDocument());

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
      code: "prioritety",
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
      code: "vysokiy",
      label: "Высокий",
      parent_id: null,
      description: null,
      position: 0,
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
        return body.owner_organization_id === null;
      }),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        if (
          !String(input).endsWith("/api/v1/reference-lists/dededede-dede-4ede-8ede-dededededede") ||
          init?.method !== "PATCH"
        ) {
          return false;
        }
        const body = JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>;
        return body.inherit_to_descendants === false;
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
          body.label === "Высокий приоритет" && body.description === null && body.position === 0
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

test.skip("wires select fields to reference lists without hardcoded options", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Реестры" }));
  await user.click(await screen.findByRole("tab", { name: "Схема карточки" }));
  await openDefaultSchemaTemplateEditor(user);

  await user.click(screen.getByRole("button", { name: "Добавить поле в блок Основной блок" }));
  expect(screen.queryByLabelText("Блок формы")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Код поля формы")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Описание поля формы")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Позиция поля формы")).not.toBeInTheDocument();
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
  expect(screen.getByText(/Выбор/)).toBeInTheDocument();

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
      code: "sostoyanie",
      label: "Состояние",
      field_type: "select",
      position: 2,
      options_source_type: "reference_list",
      options_source_id: "abababab-abab-4aba-8aba-abababababab",
    });
    expect(body).not.toHaveProperty("options");
    expect(body).not.toHaveProperty("employees");
  });
});

test.skip("keeps advanced field display previews collapsed and saves required checkbox", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Реестры" }));
  await user.click(await screen.findByRole("tab", { name: "Схема карточки" }));
  await openDefaultSchemaTemplateEditor(user);

  await user.click(screen.getByRole("button", { name: "Добавить поле в блок Основной блок" }));
  const fieldForm = await screen.findByRole("form", { name: "Создать поле формы" });
  expect(within(fieldForm).queryByLabelText("Обязательность поля")).not.toBeInTheDocument();
  expect(
    within(fieldForm).queryByRole("checkbox", { name: "Обязательное поле" }),
  ).not.toBeInTheDocument();
  expect(
    within(fieldForm).queryByRole("checkbox", { name: "Отображать поле в списке карточек" }),
  ).not.toBeInTheDocument();
  expect(
    within(fieldForm).queryByRole("checkbox", { name: "Показывать поле в публичной ссылке" }),
  ).not.toBeInTheDocument();
  expect(
    within(fieldForm).queryByRole("checkbox", { name: "Редактировать поле в публичной ссылке" }),
  ).not.toBeInTheDocument();
  expect(within(fieldForm).queryByRole("button", { name: "Сверху" })).not.toBeInTheDocument();
  expect(
    within(fieldForm).queryByRole("button", { name: "Без разделителя" }),
  ).not.toBeInTheDocument();

  await user.click(within(fieldForm).getByRole("button", { name: /Расположение подписи/ }));
  expect(within(fieldForm).getByRole("button", { name: "Сверху" })).toBeInTheDocument();
  await user.click(within(fieldForm).getByRole("button", { name: /Разделитель/ }));
  expect(within(fieldForm).getByRole("button", { name: "Без разделителя" })).toBeInTheDocument();

  fireEvent.change(within(fieldForm).getByLabelText("Название поля формы"), {
    target: { value: "Контрольное поле" },
  });
  await user.click(within(fieldForm).getByRole("button", { name: "Расширенные настройки" }));
  await user.click(within(fieldForm).getByRole("checkbox", { name: "Обязательное поле" }));
  await user.click(within(fieldForm).getByRole("button", { name: "Создать" }));

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
      label: "Контрольное поле",
      required_mode: "required",
    });
  });
});

test.skip("shows validation before creating an inline reference list without a name", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Реестры" }));
  await user.click(await screen.findByRole("tab", { name: "Схема карточки" }));
  await openDefaultSchemaTemplateEditor(user);

  await user.click(screen.getByRole("button", { name: "Добавить поле в блок Основной блок" }));
  const fieldForm = await screen.findByRole("form", { name: "Создать поле формы" });
  await user.selectOptions(within(fieldForm).getByLabelText("Тип поля формы"), ["multi_select"]);

  const inlineEditor = await within(fieldForm).findByRole("region", {
    name: "Редактор справочника для поля",
  });
  const referenceListPostCount = () =>
    vi
      .mocked(fetch)
      .mock.calls.filter(
        ([input, init]) =>
          String(input).endsWith(
            "/api/v1/registries/77777777-7777-4777-8777-777777777777/reference-lists",
          ) && init?.method === "POST",
      ).length;
  const postCountBeforeValidation = referenceListPostCount();

  await user.click(within(inlineEditor).getByRole("button", { name: "Создать справочник здесь" }));

  expect(await within(inlineEditor).findByText("Введите название справочника")).toBeInTheDocument();
  expect(referenceListPostCount()).toBe(postCountBeforeValidation);

  fireEvent.change(within(inlineEditor).getByLabelText("Название справочника"), {
    target: { value: "Локальный справочник" },
  });
  expect(within(inlineEditor).queryByText("Введите название справочника")).not.toBeInTheDocument();
  await user.click(within(inlineEditor).getByRole("button", { name: "Создать справочник здесь" }));

  await waitFor(() => {
    const createListCall = vi
      .mocked(fetch)
      .mock.calls.find(
        ([input, init]) =>
          String(input).endsWith(
            "/api/v1/registries/77777777-7777-4777-8777-777777777777/reference-lists",
          ) && init?.method === "POST",
      );
    expect(createListCall).toBeTruthy();
    const body = JSON.parse(String(createListCall?.[1]?.body ?? "{}")) as Record<string, unknown>;
    expect(body).toMatchObject({
      code: "lokalnyy_spravochnik",
      name: "Локальный справочник",
    });
  });
});

test.skip("edits reference list items inside the reference-backed field form", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Реестры" }));
  await user.click(await screen.findByRole("tab", { name: "Схема карточки" }));
  await openDefaultSchemaTemplateEditor(user);

  await user.click(screen.getByRole("button", { name: "Добавить поле в блок Основной блок" }));
  const fieldForm = await screen.findByRole("form", { name: "Создать поле формы" });
  await user.selectOptions(within(fieldForm).getByLabelText("Тип поля формы"), ["multi_select"]);
  await user.selectOptions(within(fieldForm).getByLabelText("Справочник для поля"), [
    "abababab-abab-4aba-8aba-abababababab",
  ]);

  const inlineEditor = await within(fieldForm).findByRole("region", {
    name: "Редактор справочника для поля",
  });
  expect(await within(inlineEditor).findByText("Активен")).toBeInTheDocument();

  await user.click(within(inlineEditor).getByRole("button", { name: "Добавить элемент" }));
  await user.type(within(inlineEditor).getByLabelText("Название элемента справочника"), "В работе");
  await user.click(within(inlineEditor).getByRole("button", { name: "Создать элемент" }));

  await waitFor(() => {
    const createItemCall = vi
      .mocked(fetch)
      .mock.calls.find(
        ([input, init]) =>
          String(input).endsWith(
            "/api/v1/reference-lists/abababab-abab-4aba-8aba-abababababab/items",
          ) && init?.method === "POST",
      );
    expect(createItemCall).toBeTruthy();
    const body = JSON.parse(String(createItemCall?.[1]?.body ?? "{}")) as Record<string, unknown>;
    expect(body).toMatchObject({
      label: "В работе",
      description: null,
    });
  });
});

test("shows localized locked reference list denial text", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Реестры" }));
  await user.click(await screen.findByRole("tab", { name: "Справочники" }));

  expect((await screen.findAllByText("Статусы актива")).length).toBeGreaterThan(0);
  expect(screen.getByText("Заблокирован для дочерних организаций")).toBeInTheDocument();

  const referenceCard = screen
    .getByRole("button", { name: "Статусы актива" })
    .closest(".reference-list-card") as HTMLElement;
  denyNextReferenceListUpdate = true;
  await user.click(within(referenceCard).getByLabelText("Наследовать дочерним организациям"));

  expect(await screen.findByText("Действие недоступно.")).toBeInTheDocument();
  expect(screen.queryByText("Forbidden")).not.toBeInTheDocument();
  expect(screen.getAllByText("Статусы актива").length).toBeGreaterThan(0);
});

test.skip("shows localized locked schema field denial text", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Реестры" }));
  await user.click(await screen.findByRole("tab", { name: "Схема карточки" }));
  await openDefaultSchemaTemplateEditor(user);

  denyNextFieldArchive = true;
  const statusRow = (await screen.findByText("Статус")).closest(".schema-field-row");
  expect(statusRow).not.toBeNull();
  await user.click(statusRow as HTMLElement);
  await user.click(await screen.findByRole("button", { name: "Перенести в архив" }));
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

  expect(await screen.findByText("Неверный логин или пароль.")).toBeInTheDocument();
  expect(screen.queryByText("Invalid email or password.")).not.toBeInTheDocument();
});

test("manages card attachments and generated documents in Russian UI", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await openExistingCardEditor(user);
  await user.click(await screen.findByRole("tab", { name: "Вложения" }));

  expect(await screen.findByRole("heading", { name: "Вложения" })).toBeInTheDocument();
  expect(screen.getByText("Нет файлов")).toBeInTheDocument();

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

  await user.click(screen.getByRole("tab", { name: "Документы" }));
  expect(await screen.findByRole("heading", { name: "Документы" })).toBeInTheDocument();
  expect(screen.getByText("Нет документов")).toBeInTheDocument();
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

  await user.click(screen.getByRole("button", { name: "Архивировать документ Сводка карточки" }));
  expect(await screen.findByText("Документ архивирован")).toBeInTheDocument();
  await user.click(screen.getByRole("tab", { name: "Вложения" }));
  await user.click(screen.getByRole("button", { name: "Архивировать файл Акт проверки" }));
  expect(await screen.findByText("Файл архивирован")).toBeInTheDocument();

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
  await openExistingCardEditor(user);

  await openCardBlockEditor(user);
  expect(screen.queryByRole("form", { name: "Массовое сохранение полей" })).not.toBeInTheDocument();

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

  const refreshedSaveButton = await screen.findByRole("button", {
    name: "Сохранить Файл карточки",
  });
  const refreshedFieldForm = refreshedSaveButton.closest("form");
  expect(refreshedFieldForm).toBeTruthy();
  await user.click(
    within(refreshedFieldForm as HTMLElement).getByRole("button", { name: "Очистить файл" }),
  );
  await user.click(refreshedSaveButton);

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
  await openExistingCardEditor(user);
  await openCardBlockEditor(user);

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
  await openExistingCardEditor(user);
  await user.click(await screen.findByRole("tab", { name: "Документы" }));

  expect(await screen.findByRole("heading", { name: "Шаблоны документов" })).toBeInTheDocument();

  expect(screen.queryByLabelText("Код шаблона")).not.toBeInTheDocument();
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
          body.code === "akt_priema" &&
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

test("exports and imports cards through Russian registry UI", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Реестры" }));
  await user.click(await screen.findByRole("tab", { name: "Импорт и экспорт" }));

  expect(await screen.findByRole("heading", { name: "Импорт и экспорт" })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Скачать JSON" }));
  expect(await screen.findByText("Экспорт скачан")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Скачать CSV" }));
  expect(await screen.findByText("Экспорт скачан")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Скачать XLSX" }));
  expect(await screen.findByText("Экспорт скачан")).toBeInTheDocument();

  const invalidCsv =
    "card_id,organization_id,display_name,block_code,field_code,value\n" +
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa,,Карточка актива,main,status,submitted\n" +
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa,,Карточка актива,main,amount,invalid-number\n";
  fireEvent.change(screen.getByLabelText("CSV для импорта"), {
    target: { value: invalidCsv },
  });
  await user.click(screen.getByRole("button", { name: "Проверить импорт" }));

  expect(await screen.findByText("Предпросмотр импорта готов")).toBeInTheDocument();
  expect(screen.getByText("Всего строк: 2 / корректных: 1 / ошибок: 1")).toBeInTheDocument();
  expect(screen.getByText("Строка 3 / main.amount / Ошибка")).toBeInTheDocument();
  expect(screen.getByText("Числовое поле должно содержать число.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Применить импорт" })).toBeDisabled();

  const validCsv =
    "card_id,organization_id,display_name,block_code,field_code,value\n" +
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa,,Карточка актива,main,status,submitted\n";
  fireEvent.change(screen.getByLabelText("CSV для импорта"), {
    target: { value: validCsv },
  });
  await user.click(screen.getByRole("button", { name: "Проверить импорт" }));

  expect(await screen.findByText("Можно применить импорт")).toBeInTheDocument();
  expect(screen.getByText("Всего строк: 1 / корректных: 1 / ошибок: 0")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Применить импорт" }));

  expect(await screen.findByText("Импорт применен")).toBeInTheDocument();
  expect(
    screen.getByText("Строк применено: 1 / создано карточек: 0 / обновлено карточек: 1"),
  ).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Проверить XLSX" }));
  expect(await screen.findByText("Выберите XLSX файл")).toBeInTheDocument();
  const xlsxFile = new File(["xlsx-content"], "cards.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  await user.upload(screen.getByLabelText("XLSX для импорта"), xlsxFile);
  await user.click(screen.getByRole("button", { name: "Проверить XLSX" }));

  expect(await screen.findByText("Можно применить импорт")).toBeInTheDocument();
  expect(screen.getByText("Всего строк: 1 / корректных: 1 / ошибок: 0")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Применить XLSX" }));
  expect(await screen.findByText("Импорт применен")).toBeInTheDocument();

  await waitFor(() => {
    const fetchMock = vi.mocked(fetch);
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const url = input instanceof Request ? input.url : String(input);
        const headers = init?.headers as Record<string, string> | undefined;
        return (
          url.endsWith(
            "/api/v1/registries/77777777-7777-4777-8777-777777777777/exports/cards?format=json",
          ) &&
          init?.method === "GET" &&
          headers?.Authorization === "Bearer test-token"
        );
      }),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const url = input instanceof Request ? input.url : String(input);
        const headers = init?.headers as Record<string, string> | undefined;
        return (
          url.endsWith(
            "/api/v1/registries/77777777-7777-4777-8777-777777777777/exports/cards?format=xlsx",
          ) &&
          init?.method === "GET" &&
          headers?.Authorization === "Bearer test-token"
        );
      }),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const url = input instanceof Request ? input.url : String(input);
        const headers = init?.headers as Record<string, string> | undefined;
        return (
          url.endsWith(
            "/api/v1/registries/77777777-7777-4777-8777-777777777777/exports/cards?format=csv",
          ) &&
          init?.method === "GET" &&
          headers?.Authorization === "Bearer test-token"
        );
      }),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const url = input instanceof Request ? input.url : String(input);
        if (
          !url.endsWith(
            "/api/v1/registries/77777777-7777-4777-8777-777777777777/imports/cards/preview",
          ) ||
          init?.method !== "POST"
        ) {
          return false;
        }
        const body = JSON.parse(String(init.body ?? "{}")) as { csv_content?: string };
        return body.csv_content === invalidCsv;
      }),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const url = input instanceof Request ? input.url : String(input);
        if (
          !url.endsWith(
            "/api/v1/registries/77777777-7777-4777-8777-777777777777/imports/cards/commit",
          ) ||
          init?.method !== "POST"
        ) {
          return false;
        }
        const body = JSON.parse(String(init.body ?? "{}")) as { csv_content?: string };
        return body.csv_content === validCsv;
      }),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const url = input instanceof Request ? input.url : String(input);
        if (
          !url.endsWith(
            "/api/v1/registries/77777777-7777-4777-8777-777777777777/imports/cards/preview",
          ) ||
          init?.method !== "POST" ||
          !(init.body instanceof FormData)
        ) {
          return false;
        }
        const file = init.body.get("file");
        return file instanceof File && file.name === "cards.xlsx";
      }),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const url = input instanceof Request ? input.url : String(input);
        if (
          !url.endsWith(
            "/api/v1/registries/77777777-7777-4777-8777-777777777777/imports/cards/commit",
          ) ||
          init?.method !== "POST" ||
          !(init.body instanceof FormData)
        ) {
          return false;
        }
        const file = init.body.get("file");
        return file instanceof File && file.name === "cards.xlsx";
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
  await user.click(await screen.findByRole("tab", { name: "Отчеты" }));

  expect(await screen.findByRole("heading", { name: "Отчеты" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Сформированные отчеты" })).toBeInTheDocument();
  expect(screen.getAllByText("Сводный отчет").length).toBeGreaterThan(0);
  expect(screen.getByText("Нет сформированных отчетов")).toBeInTheDocument();

  expect(screen.queryByLabelText("Код шаблона отчета")).not.toBeInTheDocument();
  await user.type(screen.getByLabelText("Название шаблона отчета"), "Отчет по карточкам");
  await user.type(screen.getByLabelText("Описание шаблона отчета"), "Список видимых карточек");
  await user.selectOptions(screen.getByLabelText("Тип отчета"), "registry_cards");
  const reportFormatSelect = screen.getByLabelText("Формат отчета") as HTMLSelectElement;
  expect([...reportFormatSelect.options].map((option) => option.value)).toEqual([
    "json",
    "csv",
    "xlsx",
    "pdf",
  ]);
  await user.selectOptions(reportFormatSelect, "pdf");
  fireEvent.change(screen.getByLabelText("Схема параметров JSON"), {
    target: { value: '{"type":"object","properties":{"limit":{"type":"number","title":"Лимит"}}}' },
  });
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
  await user.selectOptions(screen.getByLabelText("Новый тип отчета"), "period_summary");
  await user.selectOptions(screen.getByLabelText("Новый формат отчета"), "csv");
  fireEvent.change(screen.getByLabelText("Новая схема параметров JSON"), {
    target: {
      value:
        '{"type":"object","properties":{"limit":{"type":"integer","title":"Лимит"},"section":{"type":"string","title":"Раздел","oneOf":[{"const":"cards","title":"Карточки"},{"const":"summary","title":"Сводка"}]}}}',
    },
  });
  fireEvent.change(screen.getByLabelText("Новые параметры шаблона JSON"), {
    target: { value: '{"limit":30,"section":"cards"}' },
  });
  await user.click(screen.getByRole("button", { name: "Сохранить шаблон отчета" }));

  expect(await screen.findByText("Шаблон отчета обновлен")).toBeInTheDocument();
  expect(screen.getAllByText("Обновленный отчет").length).toBeGreaterThan(0);

  await user.selectOptions(
    screen.getByLabelText("Шаблон отчета"),
    "52525252-5252-4252-8252-525252525252",
  );
  const limitParameterInput = await screen.findByLabelText("Лимит");
  expect(limitParameterInput).toHaveValue(30);
  await user.clear(limitParameterInput);
  await user.type(limitParameterInput, "20");
  const sectionParameterSelect = (await screen.findByLabelText("Раздел")) as HTMLSelectElement;
  expect([...sectionParameterSelect.options].map((option) => option.value)).toEqual([
    "cards",
    "summary",
  ]);
  expect([...sectionParameterSelect.options].map((option) => option.textContent)).toEqual([
    "Карточки",
    "Сводка",
  ]);
  expect(sectionParameterSelect).toHaveValue("cards");
  await user.selectOptions(sectionParameterSelect, "summary");
  await user.click(screen.getByRole("button", { name: "Сформировать отчет" }));

  expect(await screen.findByText("Отчет сформирован")).toBeInTheDocument();
  expect(
    await screen.findByText((_, element) =>
      Boolean(
        element?.tagName === "SPAN" &&
        element.textContent?.includes("Период / Сформирован / CSV / report.csv / 1"),
      ),
    ),
  ).toBeInTheDocument();
  expect(
    screen.getByText((_, element) =>
      Boolean(
        element?.textContent?.startsWith("Параметры запуска: ") &&
        element.textContent.includes('"limit":20') &&
        element.textContent.includes('"section":"summary"'),
      ),
    ),
  ).toBeInTheDocument();
  expect(screen.getByText('Сводка отчета: {"row_count":1}')).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Скачать отчет Обновленный отчет" }));
  expect(await screen.findByText("Отчет скачан")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Архивировать отчет Обновленный отчет" }));
  expect(await screen.findByText("Отчет архивирован")).toBeInTheDocument();
  await user.click(
    screen.getByRole("button", { name: "Архивировать шаблон отчета Обновленный отчет" }),
  );
  expect(await screen.findByText("Шаблон отчета архивирован")).toBeInTheDocument();

  await user.click(screen.getByLabelText("Показывать архивные отчеты"));
  expect(
    await screen.findByText((_, element) =>
      Boolean(
        element?.tagName === "SPAN" &&
        element.textContent?.includes("Период / Сформирован / CSV / report.csv / 1") &&
        element.textContent?.includes("Архивировано"),
      ),
    ),
  ).toBeInTheDocument();
  expect(
    screen.getByText((_, element) =>
      Boolean(
        element?.textContent?.startsWith("Параметры запуска: ") &&
        element.textContent.includes('"limit":20') &&
        element.textContent.includes('"section":"summary"'),
      ),
    ),
  ).toBeInTheDocument();
  expect(screen.getByText('Сводка отчета: {"row_count":1}')).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Скачать отчет report.csv" }));
  expect(await screen.findByText("Отчет скачан")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Архивировать отчет report.csv" })).toBeDisabled();

  await user.click(screen.getByLabelText("Показывать архивные шаблоны отчетов"));
  expect(
    await screen.findByText((_, element) =>
      Boolean(
        element?.tagName === "SPAN" &&
        element.textContent?.includes("otchet_po_kartochkam") &&
        element.textContent?.includes("Архивировано"),
      ),
    ),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Редактировать шаблон отчета Обновленный отчет" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Архивировать шаблон отчета Обновленный отчет" }),
  ).toBeDisabled();

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
          parameters_schema_json?: unknown;
          default_parameters_json?: unknown;
          output_format?: string;
        };
        return (
          body.code === "otchet_po_kartochkam" &&
          body.name === "Отчет по карточкам" &&
          body.description === "Список видимых карточек" &&
          body.report_type === "registry_cards" &&
          JSON.stringify(body.parameters_schema_json) ===
            JSON.stringify({
              type: "object",
              properties: { limit: { type: "number", title: "Лимит" } },
            }) &&
          JSON.stringify(body.default_parameters_json) === JSON.stringify({ limit: 20 }) &&
          body.output_format === "pdf"
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
          report_type?: string;
          parameters_schema_json?: unknown;
          default_parameters_json?: unknown;
          output_format?: string;
        };
        return (
          body.name === "Обновленный отчет" &&
          body.description === "Обновленная сводка карточек" &&
          body.report_type === "period_summary" &&
          body.output_format === "csv" &&
          JSON.stringify(body.parameters_schema_json) ===
            JSON.stringify({
              type: "object",
              properties: {
                limit: { type: "integer", title: "Лимит" },
                section: {
                  type: "string",
                  title: "Раздел",
                  oneOf: [
                    { const: "cards", title: "Карточки" },
                    { const: "summary", title: "Сводка" },
                  ],
                },
              },
            }) &&
          JSON.stringify(body.default_parameters_json) ===
            JSON.stringify({ limit: 30, section: "cards" })
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
        const body = JSON.parse(String(init.body ?? "{}")) as {
          parameters?: { limit?: unknown; section?: unknown };
        };
        return body.parameters?.limit === 20 && body.parameters.section === "summary";
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
    expect(
      fetchMock.mock.calls.some(([input]) => {
        const url = input instanceof Request ? input.url : String(input);
        return url.endsWith(
          "/api/v1/registries/77777777-7777-4777-8777-777777777777/report-templates?include_archive=true",
        );
      }),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([input]) => {
        const url = input instanceof Request ? input.url : String(input);
        return url.endsWith(
          "/api/v1/registries/77777777-7777-4777-8777-777777777777/report-runs?include_archive=true",
        );
      }),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const url = input instanceof Request ? input.url : String(input);
        const headers = init?.headers as Record<string, string> | undefined;
        return (
          url.endsWith(
            "/api/v1/report-runs/53535353-5353-4353-8353-535353535353/content?include_archive=true",
          ) &&
          init?.method === "GET" &&
          headers?.Authorization === "Bearer test-token"
        );
      }),
    ).toBe(true);
  });
}, 15000);

test("uses report template default parameters when run JSON is empty", async () => {
  reportTemplateItems = [
    {
      ...apiPayloads.reportTemplates.items[0],
      parameters_schema_json: {
        type: "object",
        properties: {
          limit: { type: "integer", title: "Лимит" },
          section: {
            type: "string",
            title: "Раздел",
            oneOf: [
              { const: "cards", title: "Карточки" },
              { const: "summary", title: "Сводка" },
            ],
          },
        },
      },
      default_parameters_json: { limit: 30, section: "cards" },
      output_format: "csv",
    },
  ];
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Реестры" }));
  await user.click(await screen.findByRole("tab", { name: "Отчеты" }));

  expect(await screen.findByLabelText("Лимит")).toHaveValue(30);
  expect(screen.getByLabelText("Раздел")).toHaveValue("cards");
  expect(screen.getByLabelText("Параметры запуска JSON")).toHaveValue("");

  await user.click(screen.getByRole("button", { name: "Сформировать отчет" }));

  expect(await screen.findByText("Отчет сформирован")).toBeInTheDocument();
  await waitFor(() => {
    const fetchMock = vi.mocked(fetch);
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const url = input instanceof Request ? input.url : String(input);
        if (
          !url.endsWith("/api/v1/report-templates/51515151-5151-4151-8151-515151515151/runs") ||
          init?.method !== "POST"
        ) {
          return false;
        }
        const body = JSON.parse(String(init.body ?? "{}")) as {
          parameters?: { limit?: unknown; section?: unknown } | null;
        };
        return body.parameters?.limit === 30 && body.parameters.section === "cards";
      }),
    ).toBe(true);
  });
}, 15000);

test("uses report parameter schema defaults when template defaults are empty", async () => {
  reportTemplateItems = [
    {
      ...apiPayloads.reportTemplates.items[0],
      parameters_schema_json: {
        type: "object",
        properties: {
          limit: { type: "integer", title: "Лимит", default: 15 },
          include_archive: {
            type: "boolean",
            title: "Архив",
            default: true,
          },
          section: {
            type: "string",
            title: "Раздел",
            enum: ["cards", "summary"],
            default: "summary",
          },
        },
      },
      default_parameters_json: null,
      output_format: "csv",
    },
  ];
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Реестры" }));
  await user.click(await screen.findByRole("tab", { name: "Отчеты" }));

  expect(await screen.findByLabelText("Лимит")).toHaveValue(15);
  expect(screen.getByLabelText("Архив")).toBeChecked();
  expect(screen.getByLabelText("Раздел")).toHaveValue("summary");
  expect(screen.getByLabelText("Параметры запуска JSON")).toHaveValue("");

  await user.click(screen.getByRole("button", { name: "Сформировать отчет" }));

  expect(await screen.findByText("Отчет сформирован")).toBeInTheDocument();
  await waitFor(() => {
    const fetchMock = vi.mocked(fetch);
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const url = input instanceof Request ? input.url : String(input);
        if (
          !url.endsWith("/api/v1/report-templates/51515151-5151-4151-8151-515151515151/runs") ||
          init?.method !== "POST"
        ) {
          return false;
        }
        const body = JSON.parse(String(init.body ?? "{}")) as {
          parameters?: {
            include_archive?: unknown;
            limit?: unknown;
            section?: unknown;
          } | null;
        };
        return (
          body.parameters?.limit === 15 &&
          body.parameters.include_archive === true &&
          body.parameters.section === "summary"
        );
      }),
    ).toBe(true);
  });
}, 15000);

test("blocks report generation when required schema parameters are empty", async () => {
  reportTemplateItems = [
    {
      ...apiPayloads.reportTemplates.items[0],
      parameters_schema_json: {
        type: "object",
        required: ["section"],
        properties: {
          section: {
            type: "string",
            title: "Раздел",
          },
        },
      },
      default_parameters_json: null,
      output_format: "csv",
    },
  ];
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Реестры" }));
  await user.click(await screen.findByRole("tab", { name: "Отчеты" }));

  expect(await screen.findByLabelText("Раздел")).toHaveValue("");
  await user.click(screen.getByRole("button", { name: "Сформировать отчет" }));

  expect(
    await screen.findByText("Заполните обязательные параметры отчета: Раздел"),
  ).toBeInTheDocument();
  const fetchMock = vi.mocked(fetch);
  expect(
    fetchMock.mock.calls.some(([input, init]) => {
      const url = input instanceof Request ? input.url : String(input);
      return (
        url.endsWith("/api/v1/report-templates/51515151-5151-4151-8151-515151515151/runs") &&
        init?.method === "POST"
      );
    }),
  ).toBe(false);
}, 15000);

test("blocks report generation when scalar schema constraints fail", async () => {
  reportTemplateItems = [
    {
      ...apiPayloads.reportTemplates.items[0],
      parameters_schema_json: {
        type: "object",
        properties: {
          limit: {
            type: "integer",
            title: "Лимит",
            minimum: 1,
            maximum: 100,
          },
          section: {
            type: "string",
            title: "Раздел",
            minLength: 3,
          },
        },
      },
      default_parameters_json: null,
      output_format: "csv",
    },
  ];
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Реестры" }));
  await user.click(await screen.findByRole("tab", { name: "Отчеты" }));

  await user.type(await screen.findByLabelText("Лимит"), "0");
  await user.type(screen.getByLabelText("Раздел"), "ab");
  await user.click(screen.getByRole("button", { name: "Сформировать отчет" }));

  expect(
    await screen.findByText(
      "Проверьте параметры отчета: Лимит должен быть не меньше 1; Раздел должен быть не короче 3 символов",
    ),
  ).toBeInTheDocument();
  const fetchMock = vi.mocked(fetch);
  expect(
    fetchMock.mock.calls.some(([input, init]) => {
      const url = input instanceof Request ? input.url : String(input);
      return (
        url.endsWith("/api/v1/report-templates/51515151-5151-4151-8151-515151515151/runs") &&
        init?.method === "POST"
      );
    }),
  ).toBe(false);
}, 15000);

test("blocks report generation when pattern or multipleOf constraints fail", async () => {
  reportTemplateItems = [
    {
      ...apiPayloads.reportTemplates.items[0],
      parameters_schema_json: {
        type: "object",
        properties: {
          report_code: {
            type: "string",
            title: "Код отчета",
            pattern: "^REG-[0-9]+$",
          },
          step: {
            type: "integer",
            title: "Шаг",
            multipleOf: 5,
          },
        },
      },
      default_parameters_json: null,
      output_format: "csv",
    },
  ];
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Реестры" }));
  await user.click(await screen.findByRole("tab", { name: "Отчеты" }));

  await user.type(await screen.findByLabelText("Код отчета"), "ABC");
  await user.type(screen.getByLabelText("Шаг"), "3");
  await user.click(screen.getByRole("button", { name: "Сформировать отчет" }));

  expect(
    await screen.findByText(
      "Проверьте параметры отчета: Код отчета должен соответствовать шаблону; Шаг должен быть кратен 5",
    ),
  ).toBeInTheDocument();
  const fetchMock = vi.mocked(fetch);
  expect(
    fetchMock.mock.calls.some(([input, init]) => {
      const url = input instanceof Request ? input.url : String(input);
      return (
        url.endsWith("/api/v1/report-templates/51515151-5151-4151-8151-515151515151/runs") &&
        init?.method === "POST"
      );
    }),
  ).toBe(false);
}, 15000);

test("blocks report generation when exclusive numeric bounds fail", async () => {
  reportTemplateItems = [
    {
      ...apiPayloads.reportTemplates.items[0],
      parameters_schema_json: {
        type: "object",
        properties: {
          min_score: {
            type: "number",
            title: "Минимальный балл",
            exclusiveMinimum: 10,
          },
          max_ratio: {
            type: "number",
            title: "Коэффициент",
            exclusiveMaximum: 1,
          },
        },
      },
      default_parameters_json: null,
      output_format: "csv",
    },
  ];
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Реестры" }));
  await user.click(await screen.findByRole("tab", { name: "Отчеты" }));

  await user.type(await screen.findByLabelText("Минимальный балл"), "10");
  await user.type(screen.getByLabelText("Коэффициент"), "1");
  await user.click(screen.getByRole("button", { name: "Сформировать отчет" }));

  expect(
    await screen.findByText(
      "Проверьте параметры отчета: Минимальный балл должен быть больше 10; Коэффициент должен быть меньше 1",
    ),
  ).toBeInTheDocument();
  const fetchMock = vi.mocked(fetch);
  expect(
    fetchMock.mock.calls.some(([input, init]) => {
      const url = input instanceof Request ? input.url : String(input);
      return (
        url.endsWith("/api/v1/report-templates/51515151-5151-4151-8151-515151515151/runs") &&
        init?.method === "POST"
      );
    }),
  ).toBe(false);
}, 15000);

test("renders date report parameters as date inputs", async () => {
  reportTemplateItems = [
    {
      ...apiPayloads.reportTemplates.items[0],
      parameters_schema_json: {
        type: "object",
        properties: {
          period_start: {
            type: "string",
            format: "date",
            title: "Дата начала",
          },
        },
      },
      default_parameters_json: { period_start: "2026-06-01" },
      output_format: "csv",
    },
  ];
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Реестры" }));
  await user.click(await screen.findByRole("tab", { name: "Отчеты" }));

  const dateInput = await screen.findByLabelText("Дата начала");
  expect(dateInput).toHaveAttribute("type", "date");
  expect(dateInput).toHaveValue("2026-06-01");

  fireEvent.change(dateInput, { target: { value: "2026-06-15" } });
  await user.click(screen.getByRole("button", { name: "Сформировать отчет" }));

  expect(await screen.findByText("Отчет сформирован")).toBeInTheDocument();
  await waitFor(() => {
    const fetchMock = vi.mocked(fetch);
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const url = input instanceof Request ? input.url : String(input);
        if (
          !url.endsWith("/api/v1/report-templates/51515151-5151-4151-8151-515151515151/runs") ||
          init?.method !== "POST"
        ) {
          return false;
        }
        const body = JSON.parse(String(init.body ?? "{}")) as {
          parameters?: { period_start?: unknown } | null;
        };
        return body.parameters?.period_start === "2026-06-15";
      }),
    ).toBe(true);
  });
}, 15000);

test("renders report parameter descriptions from schema", async () => {
  reportTemplateItems = [
    {
      ...apiPayloads.reportTemplates.items[0],
      parameters_schema_json: {
        type: "object",
        properties: {
          section: {
            type: "string",
            title: "Раздел",
            description: "Выберите часть реестра для включения в отчет",
          },
        },
      },
      default_parameters_json: { section: "cards" },
      output_format: "csv",
    },
  ];
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/электронная почта/i), "admin@example.test");
  await user.type(screen.getByLabelText(/пароль/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  await user.click(await screen.findByRole("button", { name: "Реестры" }));
  await user.click(await screen.findByRole("tab", { name: "Отчеты" }));

  expect(await screen.findByLabelText("Раздел")).toHaveValue("cards");
  expect(screen.getByText("Выберите часть реестра для включения в отчет")).toBeInTheDocument();
}, 15000);

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

test("shows public-link attachment upload limit exhausted without blocking downloads", async () => {
  publicAttachmentListMeta = {
    max_attachment_uploads: 0,
    attachment_upload_count: 0,
    can_upload_attachments: false,
  };
  attachmentItems = [
    {
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      card_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      stored_file_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      title: "Публичный акт",
      description: null,
      position: 0,
      original_filename: "public.txt",
      content_type: "text/plain",
      content_length_bytes: 12,
      checksum_sha256: "a".repeat(64),
      scanner_status: "deferred",
      created_at: "2026-06-28T12:05:00Z",
      archived_at: null,
    },
  ];
  const user = userEvent.setup();
  window.history.pushState({}, "", "/public/edit/public-token");
  render(<App />);

  expect(await screen.findByRole("heading", { name: "Вложения" })).toBeInTheDocument();
  expect(await screen.findByText("Лимит загрузок исчерпан")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Загрузить файл" })).toBeDisabled();
  expect(screen.getByLabelText("Файл")).toBeDisabled();
  expect(screen.getByText("Публичный акт")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Скачать файл Публичный акт" }));

  expect(await screen.findByText("Файл скачан")).toBeInTheDocument();
  await waitFor(() => {
    const fetchMock = vi.mocked(fetch);
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const url = input instanceof Request ? input.url : String(input);
        return url.endsWith("/api/v1/public-links/attachments/upload") && init?.method === "POST";
      }),
    ).toBe(false);
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const url = input instanceof Request ? input.url : String(input);
        return (
          url.endsWith(
            "/api/v1/public-links/attachments/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee/content",
          ) && init?.method === "POST"
        );
      }),
    ).toBe(true);
  });
});
