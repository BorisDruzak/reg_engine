import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";

import { CardPrintTemplateEditor } from "./CardPrintTemplateEditor";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("saves an A4 card print layout through the card print template API", async () => {
  const user = userEvent.setup();
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (
      url.endsWith("/api/v1/registries/registry-1/card-print-templates?card_template_id=template-1")
    ) {
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
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
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
  expect(
    screen.queryByRole("button", { name: /Статус.*Иванов Иван Иванович/ }),
  ).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Статус" }));
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

test("adds an existing field by mouse drag from the palette to the A4 canvas", async () => {
  vi.stubGlobal("fetch", createEditorFetchMock());

  renderEditor();

  const paletteField = await screen.findByRole("button", { name: "Статус" });
  const canvas = screen.getByLabelText("A4 канвас печатного шаблона");
  expect(
    screen.queryByRole("button", { name: /Статус.*Иванов Иван Иванович/ }),
  ).not.toBeInTheDocument();

  const dataTransfer = createDataTransfer();
  fireEvent.dragStart(paletteField, { dataTransfer });
  fireEvent.dragOver(canvas, { clientX: 140, clientY: 150, dataTransfer });
  fireEvent.drop(canvas, { clientX: 140, clientY: 150, dataTransfer });

  expect(
    await screen.findByRole("button", { name: /Статус.*Иванов Иван Иванович/ }),
  ).toBeInTheDocument();
});

test("downloads blank DOCX and PDF files from the current unsaved A4 layout", async () => {
  const user = userEvent.setup();
  const fetchMock = createEditorFetchMock();
  vi.stubGlobal("fetch", fetchMock);
  stubBrowserDownload();

  renderEditor();

  await user.click(await screen.findByRole("button", { name: "Статус" }));
  await user.click(screen.getByRole("button", { name: "DOCX" }));

  await waitFor(() => {
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).endsWith("/api/v1/registries/registry-1/card-print-templates/blank-docx") &&
          init?.method === "POST",
      ),
    ).toBe(true);
  });

  await user.click(screen.getByRole("button", { name: "PDF" }));

  await waitFor(() => {
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).endsWith("/api/v1/registries/registry-1/card-print-templates/blank-pdf") &&
          init?.method === "POST",
      ),
    ).toBe(true);
  });

  expect(
    fetchMock.mock.calls.some(
      ([input, init]) =>
        String(input).endsWith("/api/v1/registries/registry-1/card-print-templates") &&
        init?.method === "POST",
    ),
  ).toBe(false);
});

test("adds an existing data block to the A4 canvas by click and mouse drag", async () => {
  const user = userEvent.setup();
  vi.stubGlobal("fetch", createEditorFetchMock());

  renderEditor();

  const paletteBlock = await screen.findByRole("button", { name: "Основной блок" });
  const canvas = screen.getByLabelText("A4 канвас печатного шаблона");

  await user.click(paletteBlock);
  expect(screen.getAllByRole("button", { name: /Основной блок/ })).toHaveLength(2);

  const dataTransfer = createDataTransfer();
  fireEvent.dragStart(paletteBlock, { dataTransfer });
  fireEvent.dragOver(canvas, { clientX: 190, clientY: 210, dataTransfer });
  fireEvent.drop(canvas, { clientX: 190, clientY: 210, dataTransfer });

  expect(screen.getAllByRole("button", { name: /Основной блок/ })).toHaveLength(3);
});

test("renders the A4 editor as a visual workspace with technical settings hidden", async () => {
  const user = userEvent.setup();
  vi.stubGlobal("fetch", createEditorFetchMock());

  renderEditor();

  expect(await screen.findByRole("region", { name: /A4/ })).toBeInTheDocument();
  expect(screen.queryByLabelText("Технический код")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Имя файла")).not.toBeInTheDocument();
  expect(screen.queryByText("{status}")).not.toBeInTheDocument();
  expect(screen.queryByText("Иванов Иван Иванович")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Статус" }));

  expect(screen.getByText("Иванов Иван Иванович")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Настройки шаблона" }));

  expect(screen.getByLabelText("Технический код")).toBeInTheDocument();
  expect(screen.getByLabelText("Имя файла")).toBeInTheDocument();
});

test("moves elements with mouse and keyboard while saving millimeter geometry only", async () => {
  const user = userEvent.setup();
  let savedLayout: { items: Record<string, unknown>[] } | null = null;
  const fetchMock = createEditorFetchMock((payload) => {
    savedLayout = payload.layout_json as { items: Record<string, unknown>[] };
  });
  vi.stubGlobal("fetch", fetchMock);

  renderEditor();

  await user.click(await screen.findByRole("button", { name: "Статус" }));
  const statusElement = await screen.findByRole("button", { name: /Статус.*Иванов Иван Иванович/ });
  await user.click(statusElement);
  fireEvent.pointerDown(statusElement, { clientX: 120, clientY: 120, pointerId: 1 });
  fireEvent.pointerMove(document, { clientX: 150, clientY: 136, pointerId: 1 });
  fireEvent.pointerUp(document, { clientX: 150, clientY: 136, pointerId: 1 });
  fireEvent.keyDown(screen.getByLabelText("A4 канвас печатного шаблона"), {
    key: "ArrowRight",
  });
  await user.click(screen.getByRole("button", { name: "Сохранить" }));

  await waitFor(() => expect(savedLayout).not.toBeNull());
  const layout = savedLayout as unknown as { items: Record<string, unknown>[] };
  const movedItem = layout.items.find((item) => item.field_id === "field-1");
  expect(movedItem).toEqual(
    expect.objectContaining({
      x_mm: expect.any(Number),
      y_mm: expect.any(Number),
      width_mm: expect.any(Number),
      height_mm: expect.any(Number),
    }),
  );
  expect(JSON.stringify(movedItem)).not.toContain("_px");
});

function jsonResponse(payload: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function createEditorFetchMock(onSave?: (payload: Record<string, unknown>) => void) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (
      url.endsWith("/api/v1/registries/registry-1/card-print-templates?card_template_id=template-1")
    ) {
      return jsonResponse({ items: [] });
    }
    if (url.endsWith("/api/v1/registries/registry-1/card-print-templates")) {
      const payload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      onSave?.(payload);
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
    if (url.endsWith("/api/v1/card-print-templates/print-template-1/versions")) {
      const payload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      onSave?.(payload);
      return jsonResponse({
        id: "print-version-2",
        template_id: "print-template-1",
        version_number: 2,
        template_format: "card_print_layout_v1",
        template_body: null,
        layout_json: payload.layout_json,
        original_filename: null,
        content_type: null,
        content_length_bytes: null,
        created_at: "2026-07-04T00:00:00Z",
        archived_at: null,
      });
    }
    if (url.endsWith("/api/v1/card-print-templates/print-template-1/blank-docx")) {
      return Promise.resolve(
        new Response(new Blob(["PK blank docx"]), {
          status: 200,
          headers: { "X-Document-Filename": "blank.docx" },
        }),
      );
    }
    if (url.endsWith("/api/v1/card-print-templates/print-template-1/blank-pdf")) {
      return Promise.resolve(
        new Response(new Blob(["%PDF blank"]), {
          status: 200,
          headers: { "X-Document-Filename": "blank.pdf" },
        }),
      );
    }
    if (url.endsWith("/api/v1/registries/registry-1/card-print-templates/blank-docx")) {
      const payload = JSON.parse(String(init?.body ?? "{}")) as {
        card_template_id: string;
        layout_json: { items: { kind: string; field_id?: string }[] };
      };
      expect(init?.method).toBe("POST");
      expect(payload.card_template_id).toBe("template-1");
      expect(payload.layout_json.items).toEqual(
        expect.arrayContaining([expect.objectContaining({ kind: "field", field_id: "field-1" })]),
      );
      return Promise.resolve(
        new Response(new Blob(["PK blank current layout"]), {
          status: 200,
          headers: { "X-Document-Filename": "blank.docx" },
        }),
      );
    }
    if (url.endsWith("/api/v1/registries/registry-1/card-print-templates/blank-pdf")) {
      const payload = JSON.parse(String(init?.body ?? "{}")) as {
        card_template_id: string;
        layout_json: { items: { kind: string; field_id?: string }[] };
      };
      expect(init?.method).toBe("POST");
      expect(payload.card_template_id).toBe("template-1");
      expect(payload.layout_json.items).toEqual(
        expect.arrayContaining([expect.objectContaining({ kind: "field", field_id: "field-1" })]),
      );
      return Promise.resolve(
        new Response(new Blob(["%PDF blank current layout"]), {
          status: 200,
          headers: { "X-Document-Filename": "blank.pdf" },
        }),
      );
    }
    return jsonResponse({ detail: "not found" }, 404);
  });
}

function createDataTransfer(): DataTransfer {
  const data = new Map<string, string>();
  return {
    effectAllowed: "",
    dropEffect: "",
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    types: [] as unknown as readonly string[],
    clearData: vi.fn(() => data.clear()),
    getData: vi.fn((type: string) => data.get(type) ?? ""),
    setData: vi.fn((type: string, value: string) => {
      data.set(type, value);
      return undefined;
    }),
    setDragImage: vi.fn(),
  } as unknown as DataTransfer;
}

function stubBrowserDownload() {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:reg-engine-test"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
}

function renderEditor() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
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
}
