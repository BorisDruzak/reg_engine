import { expect, test } from "@playwright/test";

const apiPayloads = {
  login: {
    access_token: "test-token",
    token_type: "bearer",
    expires_at: "2026-06-28T12:00:00Z",
    user: {
      id: "11111111-1111-4111-8111-111111111111",
      email: "admin@example.test",
      display_name: "System Admin",
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
        name: "Root Org",
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
        display_name: "System Admin",
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
        name: "Asset Registry",
        description: "Tracked assets",
        lifecycle_status: "active",
        schema_version: 1,
      },
    ],
  },
  schema: {
    registry: {
      id: "77777777-7777-4777-8777-777777777777",
      code: "assets",
      name: "Asset Registry",
      description: "Tracked assets",
      lifecycle_status: "active",
      schema_version: 1,
    },
    blocks: [
      {
        id: "88888888-8888-4888-8888-888888888888",
        registry_id: "77777777-7777-4777-8777-777777777777",
        code: "main",
        title: "Main Block",
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
        label: "Status Field",
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
        label: "Approved Field",
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
        display_name: "Asset Card",
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
    display_name: "Asset Card",
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
    display_name: "Public Link Card",
    expires_at: "2026-06-29T12:00:00Z",
    can_edit: true,
    blocks: [
      {
        block_id: "88888888-8888-4888-8888-888888888888",
        code: "public",
        title: "Public Block",
        instances: [
          {
            block_instance_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            ordinal: 0,
            fields: [
              {
                field_id: "99999999-9999-4999-8999-999999999997",
                code: "public_status",
                label: "Public Status",
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
  await page.route("http://127.0.0.1:8000/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const request = route.request();
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
  await expect(page.getByRole("heading", { name: "Registry Engine" })).toBeVisible();
  await page.getByLabel("Email").fill("admin@example.test");
  await page.getByLabel("Password").fill("secret-pass");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText("System Admin").first()).toBeVisible();
  await expect(page.getByText("Root Org")).toBeVisible();

  await page.getByRole("button", { name: "Users" }).click();
  await expect(page.getByText("users.manage")).toBeVisible();
  await expect(page.getByText("system_admin")).toBeVisible();

  await page.getByRole("button", { name: "Registries" }).click();
  await expect(page.getByText("Asset Registry")).toBeVisible();
  await expect(page.getByText("Status Field")).toBeVisible();

  await page.getByRole("button", { name: "Cards" }).click();
  await expect(page.getByText("Asset Card")).toBeVisible();
  await expect(page.getByLabel("Status Field")).toHaveValue("drafted");
  await page.getByLabel("Status Field").fill("published");
  await page.getByRole("button", { name: "Save Status Field" }).click();
  await expect(page.getByText("Saved Status Field")).toBeVisible();
  await page.getByLabel("Approved Field").check();
  await page.getByRole("button", { name: "Save Approved Field" }).click();
  await expect(page.getByText("Saved Approved Field")).toBeVisible();

  await page.getByRole("button", { name: "Audit" }).click();
  await expect(page.getByText("create")).toBeVisible();
});

test("renders public-link edit page and saves a field", async ({ page }) => {
  let publicStatusValue = "drafted";
  let editRequestBody: {
    raw_token?: string;
    field_id?: string;
    value?: unknown;
    block_instance_id?: string | null;
  } | null = null;

  await page.route("http://127.0.0.1:8000/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
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
  await expect(page.getByRole("heading", { name: "Public Link Card" })).toBeVisible();
  await expect(page.getByText("Public Block")).toBeVisible();
  await expect(page.getByLabel("Public Status")).toHaveValue("drafted");

  await page.getByLabel("Public Status").fill("submitted");
  await page.getByRole("button", { name: "Save Public Status" }).click();

  await expect(page.getByText("Saved Public Status")).toBeVisible();
  expect(editRequestBody).toEqual({
    raw_token: "public-token",
    field_id: "99999999-9999-4999-8999-999999999997",
    value: "submitted",
    block_instance_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  });
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
