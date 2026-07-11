import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { CardPublicAccessRead, FormBlockRead, FormFieldRead } from "@/api/types";

import { PublicLinkQuickControl } from "./PublicLinkQuickControl";

const block: FormBlockRead = {
  id: "block-a",
  registry_id: "registry",
  code: "main",
  title: "Основные сведения",
  description: null,
  position: 0,
  is_repeatable: false,
  is_active: true,
  public_visible: true,
  public_editable: true,
};
const field: FormFieldRead = {
  id: "field-a",
  block_id: block.id,
  code: "name",
  label: "Имя",
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
  public_editable: true,
};

let calls: Array<{ method: string; path: string; body: unknown }>;

beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ method, path, body });
      if (path === "/api/v1/cards/card-1/public-links" && init?.method === "POST") {
        return jsonResponse({ raw_token: "new-raw-token", public_link: { id: "link-1" } }, 201);
      }
      if (path === "/api/v1/cards/card-1/public-links") return jsonResponse({ items: [] });
      throw new Error(`Unexpected request: ${path}`);
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("PublicLinkQuickControl", () => {
  test("creates a default link from eligible fields and shows a copyable URL", async () => {
    const user = userEvent.setup();
    renderQuick();

    await user.click(screen.getByRole("button", { name: "Публичная ссылка" }));

    await waitFor(() =>
      expect(
        calls.find(
          (call) => call.path === "/api/v1/cards/card-1/public-links" && call.method === "POST",
        )?.body,
      ).toEqual({
        expires_in_days: 7,
        max_attachment_uploads: null,
        review_enabled: true,
      }),
    );
    expect(
      (await screen.findByLabelText("Адрес публичной ссылки")) as HTMLInputElement,
    ).toHaveValue("http://localhost:3000/public/edit/new-raw-token");
  });

  test("explains why no request is made when no field is eligible", () => {
    renderQuick({ publicAccess: { ...publicAccess, fields: [] } });

    expect(screen.getByRole("button", { name: "Публичная ссылка" })).toBeDisabled();
    expect(
      screen.getByText("Сначала настройте публичное отображение полей в карточке."),
    ).toBeInTheDocument();
    expect(calls.some((call) => call.method === "POST")).toBe(false);
  });
});

const publicAccess: CardPublicAccessRead = {
  card_id: "card-1",
  public_view_enabled: true,
  public_edit_enabled: false,
  fields: [
    {
      field_id: "field-a",
      public_visible: true,
      public_editable: false,
    },
  ],
};

function renderQuick(
  overrides: {
    blocks?: FormBlockRead[];
    fields?: FormFieldRead[];
    publicAccess?: CardPublicAccessRead;
  } = {},
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PublicLinkQuickControl
        blocks={overrides.blocks ?? [block]}
        cardId="card-1"
        fields={overrides.fields ?? [field]}
        layout={null}
        publicAccess={overrides.publicAccess ?? publicAccess}
        token="admin-token"
      />
    </QueryClientProvider>,
  );
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
