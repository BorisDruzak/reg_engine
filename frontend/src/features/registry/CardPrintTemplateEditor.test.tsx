import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";

import { CardPrintTemplateEditor } from "./CardPrintTemplateEditor";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("saves an A4 card print layout through the card print template API", async () => {
  const user = userEvent.setup();
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/v1/registries/registry-1/card-print-templates?card_template_id=template-1")) {
      return jsonResponse({ items: [] });
    }
    if (url.endsWith("/api/v1/registries/registry-1/card-print-templates")) {
      const payload = JSON.parse(String(init?.body ?? "{}")) as {
        card_template_id: string;
        layout_json: { version: string; items: { kind: string; field_id?: string }[] };
      };
      expect(init?.method).toBe("POST");
      expect(payload.card_template_id).toBe("template-1");
      expect(payload.layout_json.version).toBe("card_print_layout_v1");
      expect(payload.layout_json.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "field",
            field_id: "field-1",
          }),
        ]),
      );
      return jsonResponse({
        id: "print-template-1",
        registry_id: "registry-1",
        card_template_id: "template-1",
        code: "municipal_print",
        name: "Муниципальная карточка: печать",
        description: null,
        template_format: "card_print_layout_v1",
        output_filename_template: "{{ card.display_name }}.docx",
        output_content_type:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        is_active: true,
        current_version_id: "print-version-1",
        current_version_number: 1,
        current_layout_json: payload.layout_json,
        created_at: "2026-07-04T00:00:00Z",
        archived_at: null,
      });
    }
    return jsonResponse({ detail: "not found" }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);

  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <CardPrintTemplateEditor
        token="token"
        registryId="registry-1"
        cardTemplate={{
          id: "template-1",
          registry_id: "registry-1",
          code: "municipal",
          name: "Муниципальная карточка",
          description: null,
          position: 0,
          field_schema_json: { field_ids: ["field-1"] },
          default_values_json: [],
          is_active: true,
        }}
        blocks={[
          {
            id: "block-1",
            registry_id: "registry-1",
            code: "main",
            title: "Основной блок",
            description: null,
            position: 0,
            is_repeatable: false,
            is_active: true,
            public_visible: true,
            public_editable: false,
          },
        ]}
        fields={[
          {
            id: "field-1",
            block_id: "block-1",
            code: "status",
            label: "Статус",
            description: null,
            field_type: "text",
            position: 0,
            required_mode: "not_required",
            options_source_type: null,
            options_source_id: null,
            options_config_json: null,
            display_config_json: null,
            is_active: true,
            is_list_display: false,
            public_visible: true,
            public_editable: false,
          },
        ]}
      />
    </QueryClientProvider>,
  );

  expect(await screen.findByRole("region", { name: /A4/ })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Сохранить" }));

  expect(await screen.findByText("Печатный шаблон сохранен")).toBeInTheDocument();
  await waitFor(() => {
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).endsWith("/api/v1/registries/registry-1/card-print-templates") &&
          init?.method === "POST",
      ),
    ).toBe(true);
  });
});

function jsonResponse(payload: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}
