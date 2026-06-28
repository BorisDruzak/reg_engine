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

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input);
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

test("renders login screen before authentication", () => {
  render(<App />);

  expect(screen.getByRole("heading", { name: "Registry Engine" })).toBeInTheDocument();
  expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
});

test("logs in and renders authenticated admin workspace", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/email/i), "admin@example.test");
  await user.type(screen.getByLabelText(/password/i), "secret-pass");
  await user.click(screen.getByRole("button", { name: /sign in/i }));

  expect(await screen.findByText("System Admin")).toBeInTheDocument();
  expect(await screen.findByText("Root Org")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Users" }));
  expect(screen.getByText("users.manage")).toBeInTheDocument();
  expect(screen.getByText("system_admin")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Audit" }));
  expect(screen.getByText("create")).toBeInTheDocument();

  await waitFor(() => {
    const fetchMock = vi.mocked(fetch);
    expect(
      fetchMock.mock.calls.some(([, init]) => {
        const headers = init?.headers as Record<string, string> | undefined;
        return headers?.Authorization === "Bearer test-token";
      }),
    ).toBe(true);
  });
});
