import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";

import type {
  CardPrintLayout,
  CardTemplateFormLayoutRead,
  CardTemplateLayoutRead,
  FormBlockRead,
  FormFieldRead,
} from "@/api/types";

import { CardPrintTemplateEditor } from "./CardPrintTemplateEditor";
import { RegistriesAndSchema } from "./RegistriesAndSchema";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("renders exactly three Russian stages and contextual canvas actions without permanent panels", async () => {
  vi.stubGlobal("fetch", createEditorFetchMock().fetchMock);

  renderEditor();

  const stageTabs = within(await screen.findByRole("tablist", { name: "Этапы макета карточки" }))
    .getAllByRole("tab")
    .map((tab) => tab.textContent);
  expect(stageTabs).toEqual(["Макет карточки", "Печатная форма A4", "Предпросмотр"]);
  expect(screen.getByRole("tab", { name: "Макет карточки" })).toHaveAttribute(
    "data-stage-id",
    "layout",
  );
  expect(screen.getByRole("tab", { name: "Печатная форма A4" })).toHaveAttribute(
    "data-stage-id",
    "a4",
  );
  expect(screen.getByRole("tab", { name: "Предпросмотр" })).toHaveAttribute(
    "data-stage-id",
    "preview",
  );
  expect(screen.queryByLabelText("Палитра элементов")).not.toBeInTheDocument();
  expect(screen.queryByRole("complementary", { name: /Свойства/ })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Создать блок в этой области" })).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Вставить существующий блок в эту область" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Создать поле в блоке Основной блок" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "DOCX" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "PDF" })).toBeInTheDocument();
});

test("creates a block inside the canvas and saves its placement with the current revision", async () => {
  const user = userEvent.setup();
  const api = createEditorFetchMock();
  vi.stubGlobal("fetch", api.fetchMock);
  renderEditor();

  await user.click(await screen.findByRole("button", { name: "Создать блок в этой области" }));
  const title = screen.getByLabelText("Название блока");
  expect(title).toHaveValue("Новый блок");
  await user.clear(title);
  await user.type(title, "Контакты");
  await user.click(screen.getByRole("button", { name: "Сохранить" }));

  await waitFor(() => expect(api.createdBlockPayloads).toHaveLength(1));
  expect(api.createdBlockPayloads[0]).toEqual(expect.objectContaining({ title: "Контакты" }));
  await waitFor(() => expect(api.formSavePayloads).toHaveLength(1));
  expect(api.formSavePayloads[0]).toEqual(
    expect.objectContaining({
      expected_revision: "revision-1",
      form_layout: expect.objectContaining({
        sections: expect.arrayContaining([
          expect.objectContaining({ block_id: "block-created", row_span: 1, column_span: 3 }),
        ]),
      }),
    }),
  );
});

test("creates a field inline with a real canonical type and persists the layout", async () => {
  const user = userEvent.setup();
  const api = createEditorFetchMock();
  vi.stubGlobal("fetch", api.fetchMock);
  renderEditor();

  await user.click(
    await screen.findByRole("button", { name: "Создать поле в блоке Основной блок" }),
  );
  const label = screen.getByLabelText("Название поля");
  await user.clear(label);
  await user.type(label, "Настройки JSON");
  await user.selectOptions(screen.getByLabelText("Тип поля"), "json");
  await user.click(screen.getByRole("button", { name: "Сохранить" }));

  await waitFor(() => expect(api.createdFieldPayloads).toHaveLength(1));
  expect(api.createdFieldPayloads[0]).toEqual(
    expect.objectContaining({ label: "Настройки JSON", field_type: "json" }),
  );
  expect(api.templateUpdatePayloads).toEqual([
    expect.objectContaining({
      field_schema_json: expect.objectContaining({
        field_ids: ["field-1", "field-created"],
      }),
    }),
  ]);
  await waitFor(() => expect(api.formSavePayloads).toHaveLength(1));
  expect(api.formSavePayloads[0].expected_revision).toBe("revision-1");
  expect(api.formSavePayloads[0].form_layout.sections[0].items).toEqual(
    expect.arrayContaining([expect.objectContaining({ field_id: "field-created" })]),
  );
});

test("inserts an existing block through a contextual chooser and saves once", async () => {
  const user = userEvent.setup();
  const api = createEditorFetchMock();
  vi.stubGlobal("fetch", api.fetchMock);
  renderEditor();

  await user.click(
    await screen.findByRole("button", { name: "Вставить существующий блок в эту область" }),
  );
  const chooser = screen.getByRole("dialog", { name: "Вставка существующего блока" });
  await user.selectOptions(within(chooser).getByLabelText("Блок"), "block-2");
  await user.click(within(chooser).getByRole("button", { name: "Вставить" }));

  await waitFor(() => expect(api.formSavePayloads).toHaveLength(1));
  expect(api.formSavePayloads[0].expected_revision).toBe("revision-1");
  expect(api.formSavePayloads[0].form_layout.sections).toEqual(
    expect.arrayContaining([expect.objectContaining({ block_id: "block-2" })]),
  );
});

test("saves geometry through the shared pointer session and preview uses the latest draft", async () => {
  const user = userEvent.setup();
  const api = createEditorFetchMock();
  vi.stubGlobal("fetch", api.fetchMock);
  renderEditor();

  const move = await screen.findByRole("button", { name: "Переместить блок Основной блок" });
  move.focus();
  await user.keyboard("{ArrowRight}");
  expect(screen.getByTestId("layout-block-block-block-1")).toHaveStyle({
    gridColumn: "2 / span 6",
  });
  expect(screen.getByRole("region", { name: "Предпросмотр веб-карточки" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Готово" }));

  await waitFor(() => expect(api.formSavePayloads).toHaveLength(1));
  expect(api.formSavePayloads[0].expected_revision).toBe("revision-1");
  expect(api.formSavePayloads[0].form_layout.sections[0].column).toBe(2);

  await user.click(screen.getByRole("tab", { name: "Предпросмотр" }));
  for (const block of screen.getAllByTestId("layout-block-block-block-1")) {
    expect(block).toHaveStyle({ gridColumn: "2 / span 6" });
  }
  expect(screen.queryByRole("button", { name: /Переместить блок/ })).not.toBeInTheDocument();
});

test("retains an optimistic draft on 409 and exposes reload cancel and explicit retry", async () => {
  const user = userEvent.setup();
  const api = createEditorFetchMock({ conflictOnFirstFormSave: true });
  vi.stubGlobal("fetch", api.fetchMock);
  renderEditor();

  const move = await screen.findByRole("button", { name: "Переместить блок Основной блок" });
  move.focus();
  await user.keyboard("{ArrowRight}");
  await user.click(screen.getByRole("button", { name: "Готово" }));

  expect(
    await screen.findByText(
      "Макет изменён другим пользователем. Обновите данные перед сохранением.",
    ),
  ).toBeInTheDocument();
  expect(screen.getByTestId("layout-block-block-block-1")).toHaveStyle({
    gridColumn: "2 / span 6",
  });
  expect(screen.getByRole("button", { name: "Обновить данные" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Отменить локальные изменения" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Повторить сохранение" }));

  await waitFor(() => expect(api.formSavePayloads).toHaveLength(2));
  expect(api.formSavePayloads.map((payload) => payload.expected_revision)).toEqual([
    "revision-1",
    "revision-2",
  ]);
  expect(api.formSavePayloads[1].form_layout.sections[0].column).toBe(2);
  expect((await screen.findAllByText("Макет карточки сохранён")).length).toBeGreaterThan(0);
});

test("A4 stage contains one linked card rectangle, routes internal editing back, and keeps overlays", async () => {
  const user = userEvent.setup();
  const api = createEditorFetchMock();
  vi.stubGlobal("fetch", api.fetchMock);
  renderEditor();

  await user.click(await screen.findByRole("tab", { name: "Печатная форма A4" }));
  expect(screen.getAllByTestId("a4-linked-card-item")).toHaveLength(1);
  expect(screen.queryByRole("button", { name: /Переместить поле/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Изменить размер поля/ })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Добавить заголовок" }));
  expect(screen.getAllByText("Заголовок").length).toBeGreaterThan(0);
  await user.click(screen.getByRole("button", { name: "Сохранить печатную форму" }));
  await waitFor(() => expect(api.printSavePayloads).toHaveLength(1));
  const savedItems = [
    ...api.printSavePayloads[0].layout_json.items,
    ...(api.printSavePayloads[0].layout_json.overlays ?? []),
  ];
  expect(savedItems.filter((item) => item.kind === "card_layout")).toHaveLength(1);
  expect(savedItems).toEqual(
    expect.arrayContaining([expect.objectContaining({ kind: "heading" })]),
  );

  await user.click(screen.getByRole("button", { name: "Редактировать внутренний макет" }));
  expect(screen.getByRole("tab", { name: "Макет карточки" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("preserves blank DOCX and PDF actions with the linked A4 draft", async () => {
  const user = userEvent.setup();
  const api = createEditorFetchMock();
  vi.stubGlobal("fetch", api.fetchMock);
  stubBrowserDownload();
  renderEditor();

  await user.click(await screen.findByRole("button", { name: "DOCX" }));
  await user.click(screen.getByRole("button", { name: "PDF" }));

  await waitFor(() => expect(api.blankDownloadPayloads).toHaveLength(2));
  for (const payload of api.blankDownloadPayloads) {
    expect(payload.layout_json.items.filter((item) => item.kind === "card_layout")).toHaveLength(1);
  }
});

test("converts a saved legacy print view through the real API and then shows the linked item", async () => {
  const user = userEvent.setup();
  const api = createEditorFetchMock({ legacyPrintView: true });
  vi.stubGlobal("fetch", api.fetchMock);
  renderEditor();

  await user.click(await screen.findByRole("tab", { name: "Печатная форма A4" }));
  expect(screen.queryByTestId("a4-linked-card-item")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Преобразовать в связанный макет" }));

  await waitFor(() => expect(api.conversionCalls).toBe(1));
  expect(await screen.findByTestId("a4-linked-card-item")).toBeInTheDocument();
  expect(screen.getAllByText("Создана новая версия связанного макета").length).toBeGreaterThan(0);
});

test("opens the contextual studio directly from the selected template", async () => {
  const user = userEvent.setup();
  vi.stubGlobal("fetch", createEditorFetchMock().fetchMock);
  const { container } = renderRegistrySchemaEditor();

  await user.click(await screen.findByRole("tab", { name: "Схема карточки" }));
  await user.click(await screen.findByRole("button", { name: "Шаблон карточки Базовый шаблон" }));

  expect(await screen.findByRole("tab", { name: "Макет карточки" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(screen.getByRole("region", { name: "Редактор макета карточки" })).toBeInTheDocument();
  expect(screen.queryByRole("tab", { name: "Экспорт" })).not.toBeInTheDocument();
  expect(container.querySelector(".schema-canvas.schema-block-layout-grid")).toBeNull();
});

type FormSavePayload = {
  expected_revision: string;
  form_layout: CardTemplateFormLayoutRead;
};

type PrintSavePayload = {
  layout_json: CardPrintLayout;
};

function createEditorFetchMock(
  options: {
    conflictOnFirstFormSave?: boolean;
    legacyPrintView?: boolean;
  } = {},
) {
  let layout = unifiedLayoutPayload(
    options.legacyPrintView ? legacyPrintLayout() : emptyPrintLayout(),
  );
  let formSaveAttempts = 0;
  const formSavePayloads: FormSavePayload[] = [];
  const printSavePayloads: PrintSavePayload[] = [];
  const createdBlockPayloads: Record<string, unknown>[] = [];
  const createdFieldPayloads: Record<string, unknown>[] = [];
  const templateUpdatePayloads: Record<string, unknown>[] = [];
  const blankDownloadPayloads: Array<{ layout_json: CardPrintLayout }> = [];
  let conversionCalls = 0;

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    if (
      url.endsWith("/api/v1/card-templates/template-1/layout") &&
      (!init?.method || init.method === "GET")
    ) {
      return jsonResponse(layout);
    }
    if (url.endsWith("/api/v1/card-templates/template-1/layout/form")) {
      const payload = body as FormSavePayload;
      formSavePayloads.push(payload);
      formSaveAttempts += 1;
      if (options.conflictOnFirstFormSave && formSaveAttempts === 1) {
        layout = { ...layout, revision: "revision-2" };
        return jsonResponse({ detail: "Card layout changed. Reload before saving." }, 409);
      }
      layout = {
        ...layout,
        revision: `revision-${formSaveAttempts + 1}`,
        form_layout: payload.form_layout,
      };
      return jsonResponse(layout);
    }
    if (url.endsWith("/api/v1/registries/registry-1/blocks")) {
      createdBlockPayloads.push(body);
      const created = blockFixture("block-created", String(body.title ?? "Новый блок"));
      layout = {
        ...layout,
        structure: { ...layout.structure, blocks: [...layout.structure.blocks, created] },
      };
      return jsonResponse(created, 201);
    }
    if (url.endsWith("/api/v1/blocks/block-1/fields")) {
      createdFieldPayloads.push(body);
      const created = fieldFixture(
        "field-created",
        "block-1",
        String(body.label ?? "Новое поле"),
        String(body.field_type ?? "text"),
      );
      layout = {
        ...layout,
        structure: { ...layout.structure, fields: [...layout.structure.fields, created] },
      };
      return jsonResponse(created, 201);
    }
    if (url.endsWith("/api/v1/card-templates/template-1") && init?.method === "PATCH") {
      templateUpdatePayloads.push(body);
      return jsonResponse(cardTemplateFixture());
    }
    if (url.endsWith("/api/v1/card-templates/template-1/layout/print-views")) {
      const payload = body as PrintSavePayload;
      printSavePayloads.push(payload);
      const printView = printViewFixture(payload.layout_json, true);
      layout = { ...layout, print_views: [printView] };
      return jsonResponse(printView, 201);
    }
    if (url.endsWith("/api/v1/card-templates/template-1/layout/print-views/print-template-1")) {
      const payload = body as PrintSavePayload;
      printSavePayloads.push(payload);
      const printView = printViewFixture(payload.layout_json, true);
      layout = { ...layout, print_views: [printView] };
      return jsonResponse(printView);
    }
    if (
      url.endsWith(
        "/api/v1/card-templates/template-1/layout/print-views/print-template-1/convert-linked-card",
      )
    ) {
      conversionCalls += 1;
      const converted = linkedPrintLayout();
      layout = { ...layout, print_views: [printViewFixture(converted, true)] };
      return jsonResponse({
        id: "print-version-2",
        template_id: "print-template-1",
        version_number: 2,
        template_format: "card_print_layout_v1",
        layout_json: converted,
        original_filename: null,
        content_type: null,
        content_length_bytes: null,
        created_at: "2026-07-10T00:00:00Z",
        archived_at: null,
      });
    }
    if (url.endsWith("/api/v1/registries/registry-1/reference-lists")) {
      return jsonResponse({ items: [] });
    }
    if (
      url.endsWith("/api/v1/registries/registry-1/card-print-templates/blank-docx") ||
      url.endsWith("/api/v1/registries/registry-1/card-print-templates/blank-pdf")
    ) {
      blankDownloadPayloads.push(body as { layout_json: CardPrintLayout });
      const pdf = url.endsWith("blank-pdf");
      return new Response(new Blob([pdf ? "%PDF blank" : "PK blank"]), {
        status: 200,
        headers: { "X-Document-Filename": pdf ? "blank.pdf" : "blank.docx" },
      });
    }
    return jsonResponse({ detail: "not found" }, 404);
  });

  return {
    fetchMock,
    formSavePayloads,
    printSavePayloads,
    createdBlockPayloads,
    createdFieldPayloads,
    templateUpdatePayloads,
    blankDownloadPayloads,
    get conversionCalls() {
      return conversionCalls;
    },
  };
}

function unifiedLayoutPayload(printLayout: CardPrintLayout): CardTemplateLayoutRead {
  const saved = printLayout.items.some((item) => item.kind === "field");
  return {
    version: "card_template_layout_v1",
    revision: "revision-1",
    card_template_id: "template-1",
    registry_id: "registry-1",
    structure: {
      blocks: [blockFixture("block-1", "Основной блок")],
      fields: [fieldFixture("field-1", "block-1", "Статус", "text")],
    },
    form_layout: {
      columns: 12,
      sections: [
        {
          id: "block-block-1",
          block_id: "block-1",
          row: 1,
          column: 1,
          row_span: 2,
          column_span: 6,
          items: [
            {
              id: "field-field-1",
              kind: "field",
              field_id: "field-1",
              row: 1,
              column: 1,
              row_span: 1,
              column_span: 6,
            },
          ],
        },
      ],
    },
    print_views: [
      saved ? printViewFixture(printLayout, true) : printViewFixture(printLayout, false),
    ],
    export_settings: {
      default_print_view_id: saved ? "print-template-1" : "default-a4",
      output_filename_template: "{{ card.display_name }}.docx",
      formats: ["docx", "pdf"],
    },
    sync_status: { has_errors: false, errors: [], warnings: [], mapping: {} },
  };
}

function printViewFixture(layout: CardPrintLayout, saved: boolean) {
  return {
    id: saved ? "print-template-1" : "default-a4",
    name: "Основная A4",
    is_default: true,
    document_template_id: saved ? "print-template-1" : null,
    current_version_id: saved ? "print-version-1" : null,
    source: "form_layout" as const,
    page: layout.page,
    items: layout.items.map((item) => ({
      id: item.id,
      source_item_id: item.source_item_id ?? null,
      kind: item.kind,
      card_template_id: item.card_template_id ?? null,
      block_id: item.block_id ?? null,
      field_id: item.field_id ?? null,
      page: item.page,
      x_mm: item.x_mm ?? 0,
      y_mm: item.y_mm ?? 0,
      width_mm: item.width_mm ?? 0,
      height_mm: item.height_mm ?? 0,
      override: item.override ?? false,
      sync_status: item.sync_status ?? "synced",
      text: item.text ?? null,
    })),
    layout_json: layout,
    output_filename_template: "{{ card.display_name }}.docx",
  };
}

function emptyPrintLayout(): CardPrintLayout {
  return {
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
}

function linkedPrintLayout(): CardPrintLayout {
  return {
    ...emptyPrintLayout(),
    items: [
      {
        id: "linked-card-layout",
        kind: "card_layout",
        card_template_id: "template-1",
        page: 1,
        row: 1,
        column: 1,
        row_span: 1,
        column_span: 12,
        x_mm: 12,
        y_mm: 12,
        width_mm: 186,
        height_mm: 273,
      },
    ],
  };
}

function legacyPrintLayout(): CardPrintLayout {
  return {
    ...emptyPrintLayout(),
    items: [
      {
        id: "legacy-field",
        kind: "field",
        field_id: "field-1",
        page: 1,
        row: 1,
        column: 1,
        row_span: 1,
        column_span: 6,
        x_mm: 12,
        y_mm: 12,
        width_mm: 93,
        height_mm: 12,
      },
    ],
  };
}

function blockFixture(id: string, title: string): FormBlockRead {
  return {
    id,
    registry_id: "registry-1",
    code: id,
    title,
    description: null,
    position: id === "block-1" ? 0 : 1,
    is_repeatable: false,
    is_active: true,
    public_visible: true,
    public_editable: false,
    layout_columns: 1,
    display_config_json: null,
  };
}

function fieldFixture(
  id: string,
  blockId: string,
  label: string,
  fieldType: string,
): FormFieldRead {
  return {
    id,
    block_id: blockId,
    code: id,
    label,
    description: null,
    field_type: fieldType,
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
  };
}

function cardTemplateFixture() {
  return {
    id: "template-1",
    registry_id: "registry-1",
    code: "municipal",
    name: "Муниципальная карточка",
    description: null,
    position: 0,
    field_schema_json: { field_ids: ["field-1"] },
    default_values_json: [],
    is_active: true,
  };
}

function renderEditor() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <CardPrintTemplateEditor
        token="token"
        registryId="registry-1"
        cardTemplate={cardTemplateFixture()}
        blocks={[
          blockFixture("block-1", "Основной блок"),
          blockFixture("block-2", "Дополнительный блок"),
        ]}
        fields={[fieldFixture("field-1", "block-1", "Статус", "text")]}
      />
    </QueryClientProvider>,
  );
}

function renderRegistrySchemaEditor() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RegistriesAndSchema
        token="token"
        selectedRegistryId="registry-1"
        onSelectRegistry={vi.fn()}
        organizations={[]}
        registries={[
          {
            id: "registry-1",
            code: "registry",
            name: "Реестр карточек",
            description: null,
            card_title_label: "Карточка",
            lifecycle_status: "active",
            schema_version: 1,
            owner_organization_id: null,
            is_default_for_owner_tree: false,
          },
        ]}
        schema={{
          registry: {
            id: "registry-1",
            code: "registry",
            name: "Реестр карточек",
            description: null,
            card_title_label: "Карточка",
            lifecycle_status: "active",
            schema_version: 1,
            owner_organization_id: null,
            is_default_for_owner_tree: false,
          },
          blocks: [blockFixture("block-1", "Основной блок")],
          fields: [fieldFixture("field-1", "block-1", "Статус", "text")],
          templates: [
            {
              ...cardTemplateFixture(),
              code: "base_template",
              name: "Базовый шаблон",
              field_schema_json: { field_ids: ["field-1"] },
            },
          ],
        }}
      />
    </QueryClientProvider>,
  );
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function stubBrowserDownload() {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:reg-engine-test"),
  });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
}
