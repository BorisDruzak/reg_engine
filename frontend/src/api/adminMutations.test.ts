import { afterEach, beforeEach, expect, test, vi } from "vitest";

import {
  archiveAccessGrant,
  archiveCard,
  archiveCardBlockInstance,
  archiveFormBlock,
  archiveFormField,
  archiveOrganization,
  archiveOrgUnit,
  archivePublicLink,
  archiveReferenceItem,
  archiveReferenceList,
  archiveRegistry,
  archiveReportRun,
  archiveReportTemplate,
  archiveUser,
  approvePublicLink,
  createAccessGrant,
  createCard,
  createCardBlockInstance,
  createCardDraftFromCreationLink,
  createFormBlock,
  createFormField,
  createOrganization,
  createOrgUnit,
  createPublicLink,
  createReferenceItem,
  createReferenceList,
  createRegistry,
  createReportTemplate,
  createUser,
  generateReportRun,
  getCardChangeNotificationSubscription,
  getPublicLinkReview,
  getPublicLinkStatus,
  firstSaveCardFromCreationLink,
  requestPublicLinkChanges,
  startPublicLinkReviewCycle,
  submitPublicLink,
  transferCard,
  updateCard,
  updateCardChangeNotificationSubscription,
  updateCardFieldValues,
  updateFormBlock,
  updateFormField,
  updateOrganization,
  updateOrgUnit,
  updateReferenceItem,
  updateReferenceList,
  updateRegistry,
  updateReportTemplate,
  updateUser,
  updatePublicLinkChangeNotificationSubscription,
  updatePublicLinkFieldValue,
  uploadPublicLinkAttachment,
} from "./client";
import type { PublicLinkRead, PublicLinkReviewRead, PublicLinkSafeStatusRead } from "./types";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const token = "test-token";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => jsonResponse({ id: "result" })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("notification subscription API client uses scoped routes, bearer auth, and exact payloads", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ enabled: false }));
  expect(await getCardChangeNotificationSubscription(token, "card-id")).toEqual({ enabled: false });
  let [input, init] = vi.mocked(fetch).mock.calls[0];
  expect(String(input)).toBe("/api/v1/cards/card-id/change-notification-subscription");
  expect(init?.method).toBe("GET");
  expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
  expect(init?.body).toBeUndefined();

  const updates = [
    {
      action: () => updateCardChangeNotificationSubscription(token, "card-id", true),
      path: "/api/v1/cards/card-id/change-notification-subscription",
      enabled: true,
    },
    {
      action: () => updateCardChangeNotificationSubscription(token, "card-id", false),
      path: "/api/v1/cards/card-id/change-notification-subscription",
      enabled: false,
    },
    {
      action: () => updatePublicLinkChangeNotificationSubscription(token, "public-link-id", true),
      path: "/api/v1/public-links/public-link-id/change-notification-subscription",
      enabled: true,
    },
  ];

  for (const update of updates) {
    vi.mocked(fetch).mockClear();
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ enabled: update.enabled }));
    expect(await update.action()).toEqual({ enabled: update.enabled });
    [input, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(input)).toBe(update.path);
    expect(init?.method).toBe("PUT");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
    expect(JSON.parse(String(init?.body))).toEqual({ enabled: update.enabled });
  }
});

test("admin mutation API client uses backend routes with bearer auth and JSON bodies", async () => {
  const cases: {
    name: string;
    action: () => Promise<unknown>;
    path: string;
    method: string;
    body?: Record<string, unknown>;
  }[] = [
    {
      name: "create organization",
      action: () =>
        createOrganization(token, {
          code: "root",
          name: "Главная организация",
          parent_id: null,
          organization_type: "organization",
        }),
      path: "/api/v1/organizations",
      method: "POST",
      body: {
        code: "root",
        name: "Главная организация",
        parent_id: null,
        organization_type: "organization",
      },
    },
    {
      name: "update organization",
      action: () =>
        updateOrganization(token, "organization-id", {
          name: "Обновленная организация",
          organization_type: "organization",
        }),
      path: "/api/v1/organizations/organization-id",
      method: "PATCH",
      body: {
        name: "Обновленная организация",
        organization_type: "organization",
      },
    },
    {
      name: "archive organization",
      action: () => archiveOrganization(token, "organization-id"),
      path: "/api/v1/organizations/organization-id",
      method: "DELETE",
    },
    {
      name: "create organization unit",
      action: () =>
        createOrgUnit(token, "organization-id", {
          code: "ops",
          name: "Управление",
          parent_id: null,
          unit_type: "management",
        }),
      path: "/api/v1/organizations/organization-id/org-units",
      method: "POST",
      body: {
        code: "ops",
        name: "Управление",
        parent_id: null,
        unit_type: "management",
      },
    },
    {
      name: "update organization unit",
      action: () => updateOrgUnit(token, "org-unit-id", { name: "Отдел" }),
      path: "/api/v1/org-units/org-unit-id",
      method: "PATCH",
      body: { name: "Отдел" },
    },
    {
      name: "archive organization unit",
      action: () => archiveOrgUnit(token, "org-unit-id"),
      path: "/api/v1/org-units/org-unit-id",
      method: "DELETE",
    },
    {
      name: "create registry",
      action: () =>
        createRegistry(token, {
          code: "assets",
          name: "Реестр активов",
          description: "Учет активов",
        }),
      path: "/api/v1/registries",
      method: "POST",
      body: {
        code: "assets",
        name: "Реестр активов",
        description: "Учет активов",
      },
    },
    {
      name: "update registry",
      action: () => updateRegistry(token, "registry-id", { name: "Новый реестр" }),
      path: "/api/v1/registries/registry-id",
      method: "PATCH",
      body: { name: "Новый реестр" },
    },
    {
      name: "archive registry",
      action: () => archiveRegistry(token, "registry-id"),
      path: "/api/v1/registries/registry-id",
      method: "DELETE",
    },
    {
      name: "create form block",
      action: () =>
        createFormBlock(token, "registry-id", {
          code: "main",
          title: "Основной блок",
          description: null,
          position: 0,
          is_repeatable: false,
          public_visible: true,
          public_editable: false,
        }),
      path: "/api/v1/registries/registry-id/blocks",
      method: "POST",
      body: {
        code: "main",
        title: "Основной блок",
        description: null,
        position: 0,
        is_repeatable: false,
        public_visible: true,
        public_editable: false,
      },
    },
    {
      name: "update form block",
      action: () => updateFormBlock(token, "block-id", { title: "Обновленный блок" }),
      path: "/api/v1/blocks/block-id",
      method: "PATCH",
      body: { title: "Обновленный блок" },
    },
    {
      name: "archive form block",
      action: () => archiveFormBlock(token, "block-id"),
      path: "/api/v1/blocks/block-id",
      method: "DELETE",
    },
    {
      name: "create form field",
      action: () =>
        createFormField(token, "block-id", {
          code: "status",
          label: "Статус",
          field_type: "text",
          description: null,
          position: 0,
          options_source_type: null,
          options_source_id: null,
          public_visible: true,
          public_editable: false,
        }),
      path: "/api/v1/blocks/block-id/fields",
      method: "POST",
      body: {
        code: "status",
        label: "Статус",
        field_type: "text",
        description: null,
        position: 0,
        options_source_type: null,
        options_source_id: null,
        public_visible: true,
        public_editable: false,
      },
    },
    {
      name: "update form field",
      action: () => updateFormField(token, "field-id", { label: "Состояние", is_active: true }),
      path: "/api/v1/fields/field-id",
      method: "PATCH",
      body: { label: "Состояние", is_active: true },
    },
    {
      name: "archive form field",
      action: () => archiveFormField(token, "field-id"),
      path: "/api/v1/fields/field-id",
      method: "DELETE",
    },
    {
      name: "create reference list",
      action: () =>
        createReferenceList(token, "registry-id", {
          code: "statuses",
          name: "Статусы",
          owner_organization_id: null,
          description: null,
          inherit_to_descendants: true,
          locked_for_descendants: true,
          managed_by_system_only: false,
        }),
      path: "/api/v1/registries/registry-id/reference-lists",
      method: "POST",
      body: {
        code: "statuses",
        name: "Статусы",
        owner_organization_id: null,
        description: null,
        inherit_to_descendants: true,
        locked_for_descendants: true,
        managed_by_system_only: false,
      },
    },
    {
      name: "update reference list",
      action: () => updateReferenceList(token, "reference-list-id", { name: "Новые статусы" }),
      path: "/api/v1/reference-lists/reference-list-id",
      method: "PATCH",
      body: { name: "Новые статусы" },
    },
    {
      name: "archive reference list",
      action: () => archiveReferenceList(token, "reference-list-id"),
      path: "/api/v1/reference-lists/reference-list-id",
      method: "DELETE",
    },
    {
      name: "create reference item",
      action: () =>
        createReferenceItem(token, "reference-list-id", {
          code: "draft",
          label: "Черновик",
          parent_id: null,
          description: null,
          position: 0,
        }),
      path: "/api/v1/reference-lists/reference-list-id/items",
      method: "POST",
      body: {
        code: "draft",
        label: "Черновик",
        parent_id: null,
        description: null,
        position: 0,
      },
    },
    {
      name: "update reference item",
      action: () => updateReferenceItem(token, "reference-item-id", { label: "Активно" }),
      path: "/api/v1/reference-items/reference-item-id",
      method: "PATCH",
      body: { label: "Активно" },
    },
    {
      name: "archive reference item",
      action: () => archiveReferenceItem(token, "reference-item-id"),
      path: "/api/v1/reference-items/reference-item-id",
      method: "DELETE",
    },
    {
      name: "create report template",
      action: () =>
        createReportTemplate(token, "registry-id", {
          code: "registry_cards",
          name: "Отчет по карточкам",
          description: "Сводка карточек",
          report_type: "registry_cards",
          default_parameters_json: { limit: 20 },
          output_format: "json",
        }),
      path: "/api/v1/registries/registry-id/report-templates",
      method: "POST",
      body: {
        code: "registry_cards",
        name: "Отчет по карточкам",
        description: "Сводка карточек",
        report_type: "registry_cards",
        default_parameters_json: { limit: 20 },
        output_format: "json",
      },
    },
    {
      name: "update report template",
      action: () =>
        updateReportTemplate(token, "report-template-id", {
          name: "Обновленный отчет по карточкам",
          description: null,
          default_parameters_json: { limit: 50 },
        }),
      path: "/api/v1/report-templates/report-template-id",
      method: "PATCH",
      body: {
        name: "Обновленный отчет по карточкам",
        description: null,
        default_parameters_json: { limit: 50 },
      },
    },
    {
      name: "archive report template",
      action: () => archiveReportTemplate(token, "report-template-id"),
      path: "/api/v1/report-templates/report-template-id",
      method: "DELETE",
    },
    {
      name: "generate report run",
      action: () => generateReportRun(token, "report-template-id", { parameters: { limit: 20 } }),
      path: "/api/v1/report-templates/report-template-id/runs",
      method: "POST",
      body: { parameters: { limit: 20 } },
    },
    {
      name: "archive report run",
      action: () => archiveReportRun(token, "report-run-id"),
      path: "/api/v1/report-runs/report-run-id",
      method: "DELETE",
    },
    {
      name: "create card",
      action: () =>
        createCard(token, "registry-id", {
          organization_id: "organization-id",
          org_unit_id: null,
          display_name: "Карточка",
          public_view_enabled: false,
          public_edit_enabled: true,
        }),
      path: "/api/v1/registries/registry-id/cards",
      method: "POST",
      body: {
        organization_id: "organization-id",
        org_unit_id: null,
        display_name: "Карточка",
        public_view_enabled: false,
        public_edit_enabled: true,
      },
    },
    {
      name: "update card",
      action: () => updateCard(token, "card-id", { display_name: "Новая карточка" }),
      path: "/api/v1/cards/card-id",
      method: "PATCH",
      body: { display_name: "Новая карточка" },
    },
    {
      name: "archive card",
      action: () => archiveCard(token, "card-id"),
      path: "/api/v1/cards/card-id",
      method: "DELETE",
    },
    {
      name: "create card block instance",
      action: () => createCardBlockInstance(token, "card-id", "block-id"),
      path: "/api/v1/cards/card-id/blocks/block-id/instances",
      method: "POST",
    },
    {
      name: "archive card block instance",
      action: () => archiveCardBlockInstance(token, "block-instance-id"),
      path: "/api/v1/card-block-instances/block-instance-id",
      method: "DELETE",
    },
    {
      name: "bulk update card field values",
      action: () =>
        updateCardFieldValues(token, "card-id", {
          values: [{ field_id: "field-id", value: "active", block_instance_id: null }],
        }),
      path: "/api/v1/cards/card-id/values",
      method: "PATCH",
      body: {
        values: [{ field_id: "field-id", value: "active", block_instance_id: null }],
      },
    },
    {
      name: "transfer card",
      action: () => transferCard(token, "card-id", { target_organization_id: "organization-id" }),
      path: "/api/v1/cards/card-id/transfer",
      method: "POST",
      body: { target_organization_id: "organization-id" },
    },
    {
      name: "create user",
      action: () =>
        createUser(token, {
          email: "user@example.test",
          display_name: "Пользователь",
          password: "secret-pass",
          status: "active",
          is_superuser: false,
        }),
      path: "/api/v1/users",
      method: "POST",
      body: {
        email: "user@example.test",
        display_name: "Пользователь",
        password: "secret-pass",
        status: "active",
        is_superuser: false,
      },
    },
    {
      name: "update user",
      action: () => updateUser(token, "user-id", { display_name: "Обновленный пользователь" }),
      path: "/api/v1/users/user-id",
      method: "PATCH",
      body: { display_name: "Обновленный пользователь" },
    },
    {
      name: "archive user",
      action: () => archiveUser(token, "user-id"),
      path: "/api/v1/users/user-id",
      method: "DELETE",
    },
    {
      name: "create access grant",
      action: () =>
        createAccessGrant(token, {
          user_id: "user-id",
          role_id: "role-id",
          organization_id: "organization-id",
          registry_id: null,
          include_descendants: true,
          valid_from: null,
          valid_to: null,
        }),
      path: "/api/v1/access-grants",
      method: "POST",
      body: {
        user_id: "user-id",
        role_id: "role-id",
        organization_id: "organization-id",
        registry_id: null,
        include_descendants: true,
        valid_from: null,
        valid_to: null,
      },
    },
    {
      name: "archive access grant",
      action: () => archiveAccessGrant(token, "grant-id"),
      path: "/api/v1/access-grants/grant-id",
      method: "DELETE",
    },
    {
      name: "create public link",
      action: () =>
        createPublicLink(token, "card-id", { expires_in_days: 7, max_attachment_uploads: 2 }),
      path: "/api/v1/cards/card-id/public-links",
      method: "POST",
      body: { expires_in_days: 7, max_attachment_uploads: 2 },
    },
    {
      name: "archive public link",
      action: () => archivePublicLink(token, "public-link-id"),
      path: "/api/v1/public-links/public-link-id",
      method: "DELETE",
    },
  ];

  for (const item of cases) {
    vi.mocked(fetch).mockClear();
    await item.action();

    const [input, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(input), item.name).toBe(item.path);
    expect(init?.method, item.name).toBe(item.method);
    expect((init?.headers as Record<string, string>).Authorization, item.name).toBe(
      "Bearer test-token",
    );
    if (item.body) {
      expect((init?.headers as Record<string, string>)["Content-Type"], item.name).toBe(
        "application/json",
      );
      expect(JSON.parse(String(init?.body)), item.name).toEqual(item.body);
    } else {
      expect(init?.body, item.name).toBeUndefined();
    }
  }
});

test("public link review clients keep public tokens in JSON and admin auth in headers", async () => {
  const rawToken = "raw-public-review-token";
  const actorName = "Иванов Иван Иванович";
  const safeStatus = {
    status: "submitted",
    can_edit: false,
    submitted_at: "2026-07-10T10:00:00Z",
    reviewed_at: null,
    review_comment: null,
    completed_public_fields: 2,
    total_public_fields: 3,
  } satisfies PublicLinkSafeStatusRead;
  const publicCases: {
    name: string;
    action: () => Promise<PublicLinkSafeStatusRead>;
    path: string;
  }[] = [
    {
      name: "submit public link",
      action: () => submitPublicLink(rawToken, actorName),
      path: "/api/v1/public-links/submit",
    },
    {
      name: "read public link status",
      action: () => getPublicLinkStatus(rawToken),
      path: "/api/v1/public-links/status",
    },
  ];

  for (const item of publicCases) {
    vi.mocked(fetch).mockClear();
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(safeStatus));
    expect(await item.action(), item.name).toEqual(safeStatus);
    const [input, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(input), item.name).toBe(item.path);
    expect(String(input), item.name).not.toContain(rawToken);
    expect(init?.method, item.name).toBe("POST");
    expect((init?.headers as Record<string, string>).Authorization, item.name).toBeUndefined();
    expect(JSON.parse(String(init?.body)), item.name).toEqual(
      item.name === "submit public link"
        ? { raw_token: rawToken, actor_name: actorName }
        : { raw_token: rawToken },
    );
  }

  const review = {
    public_link: {
      id: "public-link-id",
      card_id: "card-id",
      status: "submitted",
      can_view: true,
      can_edit: false,
      expires_at: "2026-07-17T10:00:00Z",
      max_uses: null,
      used_count: 0,
      max_attachment_uploads: null,
      attachment_upload_count: 0,
      disabled_at: null,
      submitted_at: "2026-07-10T10:00:00Z",
      reviewed_at: null,
      reviewed_by: null,
      review_comment: null,
      review_enabled: true,
      can_manage_change_notifications: false,
      change_notifications_enabled: false,
      completed_public_fields: 2,
      total_public_fields: 3,
    },
    changed_field_count: 1,
    changed_attachment_count: 0,
    fields: [
      {
        block_id: "block-id",
        field_id: "field-id",
        block_instance_id: null,
        label: "Значение",
        field_type: "text",
        before: null,
        after: "Заполнено",
        changed_at: "2026-07-10T10:00:00Z",
      },
    ],
    attachments: [],
  } satisfies PublicLinkReviewRead;
  vi.mocked(fetch).mockClear();
  vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(review));
  expect(await getPublicLinkReview(token, "public-link-id")).toEqual(review);
  let [input, init] = vi.mocked(fetch).mock.calls[0];
  expect(String(input)).toBe("/api/v1/public-links/public-link-id/review");
  expect(init?.method).toBe("GET");
  expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
  expect(init?.body).toBeUndefined();

  const publicLink = review.public_link satisfies PublicLinkRead;
  const adminCases: {
    name: string;
    action: () => Promise<PublicLinkRead>;
    path: string;
    body?: Record<string, unknown>;
  }[] = [
    {
      name: "request changes",
      action: () => requestPublicLinkChanges(token, "public-link-id", "Уточните значение"),
      path: "/api/v1/public-links/public-link-id/request-changes",
      body: { comment: "Уточните значение" },
    },
    {
      name: "approve public link",
      action: () => approvePublicLink(token, "public-link-id"),
      path: "/api/v1/public-links/public-link-id/approve",
    },
    {
      name: "start review cycle",
      action: () => startPublicLinkReviewCycle(token, "public-link-id"),
      path: "/api/v1/public-links/public-link-id/start-review-cycle",
    },
  ];

  for (const item of adminCases) {
    vi.mocked(fetch).mockClear();
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(publicLink));
    expect(await item.action(), item.name).toEqual(publicLink);
    [input, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(input), item.name).toBe(item.path);
    expect(init?.method, item.name).toBe("POST");
    expect((init?.headers as Record<string, string>).Authorization, item.name).toBe(
      "Bearer test-token",
    );
    if (item.body) {
      expect(JSON.parse(String(init?.body)), item.name).toEqual(item.body);
    } else {
      expect(init?.body, item.name).toBeUndefined();
    }
  }
});

test("public write clients serialize the public editor FIO", async () => {
  const rawToken = "raw-public-token";
  const actorName = "Иванов  Иван Иванович";
  const jsonCases = [
    {
      action: () => createCardDraftFromCreationLink(rawToken, actorName, "organization-id"),
      expected: {
        raw_token: rawToken,
        actor_name: actorName,
        organization_id: "organization-id",
      },
    },
    {
      action: () =>
        firstSaveCardFromCreationLink(rawToken, actorName, {
          organization_id: "organization-id",
          field_id: "field-id",
          value: "Значение",
          block_instance_id: null,
        }),
      expected: {
        raw_token: rawToken,
        actor_name: actorName,
        organization_id: "organization-id",
        field_id: "field-id",
        value: "Значение",
        block_instance_id: null,
      },
    },
    {
      action: () => updatePublicLinkFieldValue(rawToken, actorName, "field-id", "Значение", null),
      expected: {
        raw_token: rawToken,
        actor_name: actorName,
        field_id: "field-id",
        value: "Значение",
        block_instance_id: null,
      },
    },
    {
      action: () => submitPublicLink(rawToken, actorName),
      expected: { raw_token: rawToken, actor_name: actorName },
    },
  ];

  for (const item of jsonCases) {
    vi.mocked(fetch).mockClear();
    await item.action();
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(JSON.parse(String(init?.body))).toEqual(item.expected);
  }

  vi.mocked(fetch).mockClear();
  await uploadPublicLinkAttachment(rawToken, actorName, {
    file: new File(["contents"], "evidence.txt", { type: "text/plain" }),
    title: "Подтверждение",
  });
  const [, uploadInit] = vi.mocked(fetch).mock.calls[0];
  const formData = uploadInit?.body as FormData;
  expect(formData.get("raw_token")).toBe(rawToken);
  expect(formData.get("actor_name")).toBe(actorName);
  expect(formData.get("title")).toBe("Подтверждение");
});
