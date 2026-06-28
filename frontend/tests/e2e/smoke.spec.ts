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
};

test("renders login shell and authenticated admin workspace", async ({ page }) => {
  await page.route("http://127.0.0.1:8000/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const payload = responsePayload(url.pathname, url.search);
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

  await page.getByRole("button", { name: "Audit" }).click();
  await expect(page.getByText("create")).toBeVisible();
});

function responsePayload(pathname: string, search: string) {
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
  if (pathname === "/api/v1/audit-events" && search === "?limit=20") {
    return apiPayloads.audit;
  }
  return null;
}
