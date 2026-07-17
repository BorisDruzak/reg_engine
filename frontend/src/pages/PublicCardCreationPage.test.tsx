import "@testing-library/jest-dom/vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { PublicCardCreationPage } from "./PublicCardCreationPage";

const rawToken = "creation-token";
const fetchCalls: Array<{ path: string; body: unknown }> = [];

beforeEach(() => {
  fetchCalls.length = 0;
  vi.stubGlobal("fetch", vi.fn(handleFetch));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PublicCardCreationPage", () => {
  test("creates a draft and continues with a child link immediately after organization selection", async () => {
    renderCreationPage();

    fireEvent.change(await screen.findByRole("textbox", { name: "ФИО" }), {
      target: { value: "Иванов Иван Иванович" },
    });
    const organizationSelect = await screen.findByRole("combobox");
    expect(fetchCalls.map((call) => call.path)).toEqual([
      "/api/v1/public/card-creation-links/preview",
    ]);

    fireEvent.change(organizationSelect, { target: { value: "organization-1" } });

    await waitFor(() =>
      expect(fetchCalls.map((call) => call.path)).toContain(
        "/api/v1/public/card-creation-links/create-draft",
      ),
    );
    expect(await screen.findByText("Открыта дочерняя ссылка")).toBeInTheDocument();
    expect(fetchCalls.at(-1)?.body).toMatchObject({
      raw_token: rawToken,
      actor_name: "Иванов Иван Иванович",
      organization_id: "organization-1",
    });
    expect(fetchCalls.map((call) => call.path)).not.toContain(
      "/api/v1/public/card-creation-links/first-save",
    );
  });

  test("blocks public card creation until FIO is provided", async () => {
    renderCreationPage();

    fireEvent.change(await screen.findByRole("combobox"), {
      target: { value: "organization-1" },
    });

    expect(await screen.findByRole("status")).toHaveTextContent("Сначала укажите ФИО");
    expect(screen.getByRole("combobox")).toHaveValue("");
    expect(fetchCalls.map((call) => call.path)).not.toContain(
      "/api/v1/public/card-creation-links/create-draft",
    );
  });

  test("keeps the public editor FIO only in page state after remount", async () => {
    const page = renderCreationPage();
    const actorName = await screen.findByRole("textbox", { name: "ФИО" });
    fireEvent.change(actorName, { target: { value: "Иванов Иван Иванович" } });
    expect(actorName).toHaveValue("Иванов Иван Иванович");

    page.unmount();
    renderCreationPage();

    expect(await screen.findByRole("textbox", { name: "ФИО" })).toHaveValue("");
  });
});

function renderCreationPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/public/create/${rawToken}`]}>
        <Routes>
          <Route path="/public/create/:rawToken" element={<PublicCardCreationPage />} />
          <Route path="/public/edit/:rawToken" element={<p>Открыта дочерняя ссылка</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function handleFetch(input: RequestInfo | URL, init?: RequestInit) {
  const path = new URL(String(input), "http://localhost").pathname;
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  fetchCalls.push({ path, body });
  if (path === "/api/v1/public/card-creation-links/preview") {
    return jsonResponse({
      card_template_id: "template-1",
      card_template_name: "Шаблон для создания",
      selected_organization_id: null,
      organizations: [{ id: "organization-1", name: "Организация" }],
      form_layout: {
        columns: 12,
        sections: [
          {
            id: "section-main",
            block_id: "block-main",
            row: 1,
            column: 1,
            row_span: 1,
            column_span: 12,
            items: [
              {
                id: "item-name",
                kind: "field",
                field_id: "field-name",
                row: 1,
                column: 1,
                row_span: 1,
                column_span: 12,
                text: null,
              },
            ],
          },
        ],
      },
      blocks: [
        {
          block_id: "block-main",
          code: "main",
          title: "Основные сведения",
          is_repeatable: false,
          layout_columns: 1,
          display_config_json: null,
          instances: [
            {
              block_instance_id: null,
              ordinal: 0,
              fields: [
                {
                  field_id: "field-name",
                  code: "name",
                  label: "Имя",
                  description: "Введите имя",
                  field_type: "text",
                  required_mode: "required",
                  value: null,
                  options_source_type: null,
                  options_source_id: null,
                  options_config_json: null,
                  display_config_json: null,
                  options: [],
                },
              ],
            },
          ],
        },
      ],
    });
  }
  if (path === "/api/v1/public/card-creation-links/create-draft") {
    return jsonResponse(
      {
        card_id: "card-1",
        display_name: "Шаблон для создания",
        child_raw_token: "child-token",
      },
      201,
    );
  }
  throw new Error(`Unexpected request: ${path}`);
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
