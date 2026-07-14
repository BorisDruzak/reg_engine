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
import { A4LinkedCardCanvas } from "@/features/cardLayout/A4LinkedCardCanvas";

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
  expect(screen.getByRole("button", { name: "Создать блок" })).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Вставить существующий блок в эту область" }),
  ).not.toBeInTheDocument();
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

  await user.click(await screen.findByRole("button", { name: "Создать блок" }));
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
          expect.objectContaining({ block_id: "block-created", row_span: 1, column_span: 12 }),
        ]),
      }),
    }),
  );
});

test("normalizes a loaded crooked web layout before the next template save", async () => {
  const user = userEvent.setup();
  const api = createEditorFetchMock({ crookedFormLayout: true });
  vi.stubGlobal("fetch", api.fetchMock);
  renderEditor();

  await screen.findByRole("button", { name: "Создать блок" });
  expect(api.formSavePayloads).toHaveLength(0);

  await user.click(screen.getByRole("button", { name: "Создать блок" }));
  await user.click(screen.getByRole("button", { name: "Сохранить" }));

  await waitFor(() => expect(api.formSavePayloads).toHaveLength(1));
  expect(api.formSavePayloads[0].form_layout.sections).toEqual([
    expect.objectContaining({
      block_id: "block-1",
      row: 1,
      column: 1,
      row_span: 1,
      column_span: 12,
    }),
    expect.objectContaining({
      block_id: "block-created",
      row: 2,
      column: 1,
      row_span: 1,
      column_span: 12,
    }),
  ]);
});

test("merges a deferred block create into the newest geometry before the first layout PATCH", async () => {
  const user = userEvent.setup();
  const api = createEditorFetchMock({ deferredBlockCreate: true });
  vi.stubGlobal("fetch", api.fetchMock);
  renderEditor();

  await user.click(await screen.findByRole("button", { name: "Создать блок" }));
  await user.click(screen.getByRole("button", { name: "Сохранить" }));
  await waitFor(() => expect(api.createdBlockPayloads).toHaveLength(1));

  await moveMainBlockDown(user);
  expect(api.formSavePayloads).toHaveLength(0);

  api.resolveBlockCreate();

  await waitFor(() => expect(api.formSavePayloads).toHaveLength(1));
  expect(api.formSavePayloads[0]).toEqual(
    expect.objectContaining({
      expected_revision: "revision-1",
      form_layout: expect.objectContaining({
        sections: expect.arrayContaining([
          expect.objectContaining({
            block_id: "block-1",
            items: expect.arrayContaining([
              expect.objectContaining({ field_id: "field-1", row: 2 }),
            ]),
          }),
          expect.objectContaining({ block_id: "block-created" }),
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

test("defers field membership layout save until creation completes", async () => {
  const user = userEvent.setup();
  const api = createEditorFetchMock({ deferredFieldCreate: true });
  vi.stubGlobal("fetch", api.fetchMock);
  renderEditor();

  await user.click(
    await screen.findByRole("button", { name: "Создать поле в блоке Основной блок" }),
  );
  await user.click(screen.getByRole("button", { name: "Сохранить" }));
  await waitFor(() => expect(api.createdFieldPayloads).toHaveLength(1));

  expect(api.formSavePayloads).toHaveLength(0);

  api.resolveFieldCreate();

  await waitFor(() => expect(api.formSavePayloads).toHaveLength(1));
  expect(api.formSavePayloads[0]).toEqual(
    expect.objectContaining({
      expected_revision: "revision-1",
      form_layout: expect.objectContaining({
        sections: expect.arrayContaining([
          expect.objectContaining({
            block_id: "block-1",
            items: expect.arrayContaining([
              expect.objectContaining({ field_id: "field-1", column: 1 }),
              expect.objectContaining({ field_id: "field-created" }),
            ]),
          }),
        ]),
      }),
    }),
  );
});

test("waits for an in-flight layout PATCH before a block update and saves geometry queued during it", async () => {
  const user = userEvent.setup();
  const api = createEditorFetchMock({
    deferredFirstFormSave: "success",
    deferredBlockUpdate: true,
  });
  vi.stubGlobal("fetch", api.fetchMock);
  renderEditor();

  await moveMainBlockRight(user);
  await waitFor(() => expect(api.formSavePayloads).toHaveLength(1));
  await user.click(screen.getByRole("button", { name: "Изменить блок Основной блок" }));
  await user.click(screen.getByRole("button", { name: "Сохранить" }));

  expect(api.updatedBlockPayloads).toHaveLength(0);
  api.resolveFirstFormSave();
  await waitFor(() => expect(api.updatedBlockPayloads).toHaveLength(1));

  await moveMainBlockRight(user);
  expect(api.formSavePayloads).toHaveLength(1);
  api.resolveBlockUpdate();

  await waitFor(() => expect(api.formSavePayloads).toHaveLength(2));
  expect(api.formSavePayloads[1]).toEqual(
    expect.objectContaining({
      expected_revision: "revision-2",
      form_layout: expect.objectContaining({
        sections: expect.arrayContaining([
          expect.objectContaining({
            items: expect.arrayContaining([
              expect.objectContaining({ field_id: "field-1", column: 3 }),
            ]),
          }),
        ]),
      }),
    }),
  );
});

test("waits for an in-flight layout PATCH before creating a field", async () => {
  const user = userEvent.setup();
  const api = createEditorFetchMock({ deferredFirstFormSave: "success" });
  vi.stubGlobal("fetch", api.fetchMock);
  renderEditor();

  await moveMainBlockRight(user);
  await waitFor(() => expect(api.formSavePayloads).toHaveLength(1));
  await user.click(screen.getByRole("button", { name: "Создать поле в блоке Основной блок" }));
  await user.click(screen.getByRole("button", { name: "Сохранить" }));

  expect(api.createdFieldPayloads).toHaveLength(0);
  api.resolveFirstFormSave();

  await waitFor(() => expect(api.createdFieldPayloads).toHaveLength(1));
});

test("reorders adjacent blocks atomically and restores the previous layout with one undo", async () => {
  const user = userEvent.setup();
  const api = createEditorFetchMock();
  vi.stubGlobal("fetch", api.fetchMock);
  renderEditor();

  await user.click(await screen.findByRole("button", { name: "Создать блок" }));
  await user.click(screen.getByRole("button", { name: "Сохранить" }));
  await waitFor(() => expect(api.formSavePayloads).toHaveLength(1));

  const moveDown = screen.getByRole("button", { name: "Переместить блок Основной блок вниз" });
  expect(moveDown).toBeEnabled();
  await user.click(moveDown);

  await waitFor(() => expect(api.formSavePayloads).toHaveLength(2));
  expect(api.formSavePayloads[1].form_layout.sections.map((section) => section.block_id)).toEqual([
    "block-created",
    "block-1",
  ]);
  expect(api.formSavePayloads[1].form_layout.sections.map((section) => section.row)).toEqual([
    1, 2,
  ]);

  await user.click(screen.getByRole("button", { name: "Отменить изменение" }));

  await waitFor(() => expect(api.formSavePayloads).toHaveLength(3));
  expect(api.formSavePayloads[2].form_layout.sections.map((section) => section.block_id)).toEqual([
    "block-1",
    "block-created",
  ]);
  expect(screen.queryByRole("button", { name: "Повторить изменение" })).not.toBeInTheDocument();
});

test("saves field geometry and the preview uses the latest draft", async () => {
  const user = userEvent.setup();
  const api = createEditorFetchMock();
  vi.stubGlobal("fetch", api.fetchMock);
  renderEditor();

  await moveMainBlockRight(user);
  expect(screen.getByTestId("layout-field-field-field-1")).toHaveStyle({
    gridColumn: "2 / span 6",
  });

  await waitFor(() => expect(api.formSavePayloads).toHaveLength(1));
  expect(api.formSavePayloads[0].expected_revision).toBe("revision-1");
  expect(api.formSavePayloads[0].form_layout.sections[0].items[0].column).toBe(2);

  await user.click(screen.getByRole("tab", { name: "Предпросмотр" }));
  for (const block of screen.getAllByTestId("layout-block-block-block-1")) {
    expect(block).toHaveStyle({ gridColumn: "1 / span 12" });
  }
  expect(screen.queryByRole("button", { name: /Переместить блок/ })).not.toBeInTheDocument();
});

test("keeps a conflicting local draft visible and accepts the reviewed server version without PATCH", async () => {
  const user = userEvent.setup();
  const api = createEditorFetchMock({ conflictOnFirstFormSave: true, conflictServerColumn: 5 });
  vi.stubGlobal("fetch", api.fetchMock);
  renderEditor();

  await moveMainBlockRight(user);

  expect(
    await screen.findByText(
      "Макет изменён другим пользователем. Обновите данные перед сохранением.",
    ),
  ).toBeInTheDocument();
  expect(screen.getByTestId("layout-field-field-field-1")).toHaveStyle({
    gridColumn: "2 / span 6",
  });
  expect(screen.queryByRole("button", { name: "Повторить" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Сравнить с версией сервера" }));

  const comparison = await screen.findByRole("region", { name: "Сравнение версий макета" });
  expect(within(comparison).getByTestId("conflict-local-layout")).toHaveTextContent("колонка 1");
  expect(within(comparison).getByTestId("conflict-server-layout")).toHaveTextContent("колонка 1");
  expect(api.formSavePayloads).toHaveLength(1);

  await user.click(within(comparison).getByRole("button", { name: "Принять версию сервера" }));

  expect(api.formSavePayloads).toHaveLength(1);
  expect(screen.getByTestId("layout-block-block-block-1")).toHaveStyle({
    gridColumn: "1 / span 12",
  });
});

test("uses a conflicting local draft only after the explicit reviewed overwrite decision", async () => {
  const user = userEvent.setup();
  const api = createEditorFetchMock({ conflictOnFirstFormSave: true, conflictServerColumn: 5 });
  vi.stubGlobal("fetch", api.fetchMock);
  renderEditor();

  await moveMainBlockRight(user);
  expect(await screen.findByText(STALE_LAYOUT_MESSAGE)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Сравнить с версией сервера" }));
  const comparison = await screen.findByRole("region", { name: "Сравнение версий макета" });
  expect(api.formSavePayloads).toHaveLength(1);

  await user.click(within(comparison).getByRole("button", { name: "Сохранить локальную версию" }));

  await waitFor(() => expect(api.formSavePayloads).toHaveLength(2));
  expect(api.formSavePayloads[1]).toEqual(
    expect.objectContaining({
      expected_revision: "revision-2",
      form_layout: expect.objectContaining({
        sections: expect.arrayContaining([
          expect.objectContaining({
            items: expect.arrayContaining([
              expect.objectContaining({ field_id: "field-1", column: 2 }),
            ]),
          }),
        ]),
      }),
    }),
  );
});

test("serializes rapid form saves and carries the returned revision into the newest draft", async () => {
  const user = userEvent.setup();
  const api = createEditorFetchMock({ deferredFirstFormSave: "success" });
  vi.stubGlobal("fetch", api.fetchMock);
  renderEditor();

  await moveMainBlockRight(user);
  await waitFor(() => expect(api.formSavePayloads).toHaveLength(1));
  await moveMainBlockRight(user);
  expect(api.formSavePayloads).toHaveLength(1);

  api.resolveFirstFormSave();

  await waitFor(() => expect(api.formSavePayloads).toHaveLength(2));
  expect(api.formSavePayloads.map((payload) => payload.expected_revision)).toEqual([
    "revision-1",
    "revision-2",
  ]);
  expect(
    api.formSavePayloads.map((payload) => payload.form_layout.sections[0].items[0].column),
  ).toEqual([2, 3]);
  await waitFor(() =>
    expect(screen.getByTestId("layout-field-field-field-1")).toHaveStyle({
      gridColumn: "3 / span 6",
    }),
  );
});

test("a queued 409 preserves the newest local draft and waits for an explicit overwrite", async () => {
  const user = userEvent.setup();
  const api = createEditorFetchMock({
    deferredFirstFormSave: "conflict",
    conflictServerColumn: 5,
  });
  vi.stubGlobal("fetch", api.fetchMock);
  renderEditor();

  await moveMainBlockRight(user);
  await waitFor(() => expect(api.formSavePayloads).toHaveLength(1));
  await moveMainBlockRight(user);
  expect(api.formSavePayloads).toHaveLength(1);

  api.resolveFirstFormSave();

  expect(await screen.findByText(STALE_LAYOUT_MESSAGE)).toBeInTheDocument();
  expect(api.formSavePayloads).toHaveLength(1);
  expect(screen.getByTestId("layout-field-field-field-1")).toHaveStyle({
    gridColumn: "3 / span 6",
  });
  await user.click(screen.getByRole("button", { name: "Сравнить с версией сервера" }));
  const comparison = await screen.findByRole("region", { name: "Сравнение версий макета" });
  expect(api.formSavePayloads).toHaveLength(1);

  await user.click(within(comparison).getByRole("button", { name: "Сохранить локальную версию" }));

  await waitFor(() => expect(api.formSavePayloads).toHaveLength(2));
  expect(api.formSavePayloads[1].expected_revision).toBe("revision-2");
  expect(api.formSavePayloads[1].form_layout.sections[0].items[0].column).toBe(3);
});

test("retains a transiently failed layout draft and retries it explicitly", async () => {
  const user = userEvent.setup();
  const api = createEditorFetchMock({ formSaveErrorOnFirst: true });
  vi.stubGlobal("fetch", api.fetchMock);
  renderEditor();

  await moveMainBlockRight(user);

  expect(await screen.findByText(/Не сохранено\./)).toBeInTheDocument();
  expect(screen.getByTestId("layout-field-field-field-1")).toHaveStyle({
    gridColumn: "2 / span 6",
  });
  expect(api.formSavePayloads).toHaveLength(1);

  await user.click(screen.getByRole("button", { name: "Повторить" }));

  await waitFor(() => expect(api.formSavePayloads).toHaveLength(2));
  expect(api.formSavePayloads[1].expected_revision).toBe("revision-1");
  expect(api.formSavePayloads[1].form_layout.sections[0].items[0].column).toBe(2);
  expect(screen.getByTestId("layout-field-field-field-1")).toHaveStyle({
    gridColumn: "2 / span 6",
  });
});

test("owns snapshot undo history without exposing redo", async () => {
  const user = userEvent.setup();
  const api = createEditorFetchMock();
  vi.stubGlobal("fetch", api.fetchMock);
  renderEditor();

  const undo = await screen.findByRole("button", { name: "Отменить изменение" });
  expect(undo).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Повторить изменение" })).not.toBeInTheDocument();

  await moveMainBlockRight(user);
  await waitFor(() => expect(api.formSavePayloads).toHaveLength(1));
  await moveMainBlockRight(user);
  await waitFor(() => expect(api.formSavePayloads).toHaveLength(2));
  expect(screen.getByTestId("layout-field-field-field-1")).toHaveStyle({
    gridColumn: "3 / span 6",
  });

  await user.click(undo);
  expect(screen.getByTestId("layout-field-field-field-1")).toHaveStyle({
    gridColumn: "2 / span 6",
  });
  await waitFor(() => expect(api.formSavePayloads).toHaveLength(3));
  await user.click(undo);
  expect(screen.getByTestId("layout-field-field-field-1")).toHaveStyle({
    gridColumn: "1 / span 6",
  });
  await waitFor(() => expect(api.formSavePayloads).toHaveLength(4));
  expect(api.formSavePayloads[3].form_layout.sections[0].items[0].column).toBe(1);
});

test("A4 stage uses a print element list, keeps one linked card rectangle, and removes the inner layout button", async () => {
  const user = userEvent.setup();
  const api = createEditorFetchMock();
  vi.stubGlobal("fetch", api.fetchMock);
  renderEditor();

  await user.click(await screen.findByRole("tab", { name: "Печатная форма A4" }));
  expect(screen.getAllByTestId("a4-linked-card-item")).toHaveLength(1);
  expect(
    within(screen.getByTestId("a4-linked-card-item")).getByTestId("card-layout-canvas"),
  ).not.toHaveClass("card-layout-responsive-grid");
  expect(screen.queryByRole("button", { name: /Переместить поле/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Изменить размер поля/ })).not.toBeInTheDocument();

  expect(
    screen.queryByRole("button", { name: "Редактировать внутренний макет" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Добавить заголовок" })).not.toBeVisible();
  await user.click(screen.getByText("Добавить печатный элемент"));
  for (const actionLabel of [
    "Добавить заголовок",
    "Добавить печатный текст",
    "Добавить панель",
    "Добавить прямоугольник",
    "Добавить линию",
    "Добавить дату печати",
    "Добавить номер страницы",
    "Добавить название карточки",
  ]) {
    expect(screen.getByRole("button", { name: actionLabel })).toBeVisible();
  }
  await user.click(screen.getByRole("button", { name: "Добавить заголовок" }));
  expect(screen.getByRole("button", { name: "Добавить заголовок" })).not.toBeVisible();
  expect(screen.getAllByText("Заголовок").length).toBeGreaterThan(0);
  await user.click(screen.getByTestId("a4-linked-card-item"));
  const canvas = screen.getByLabelText("A4 канвас печатного шаблона");
  canvas.focus();
  await user.keyboard("{Delete}");
  await user.keyboard("{Control>}d{/Control}");
  await user.keyboard("{Control>}c{/Control}{Control>}v{/Control}");
  expect(screen.getAllByTestId("a4-linked-card-item")).toHaveLength(1);
  expect(screen.getAllByText("Заголовок").length).toBeGreaterThan(0);
  await user.click(screen.getByRole("button", { name: "Сохранить печатную форму" }));
  await waitFor(() => expect(api.printSavePayloads).toHaveLength(1));
  expect(api.printSavePayloads[0].layout_json.composition_mode).toBe("linked_card");
  const savedItems = [
    ...api.printSavePayloads[0].layout_json.items,
    ...(api.printSavePayloads[0].layout_json.overlays ?? []),
  ];
  expect(savedItems.filter((item) => item.kind === "card_layout")).toHaveLength(1);
  expect(savedItems).toEqual(
    expect.arrayContaining([expect.objectContaining({ kind: "heading" })]),
  );

  await user.click(screen.getByText("Добавить печатный элемент"));
  expect(screen.getByRole("button", { name: "Добавить печатный текст" })).toBeVisible();
});

test("print element list disables every action while the editor is busy", async () => {
  const user = userEvent.setup();
  const printLayout = linkedPrintLayout();
  const cardLayout = unifiedLayoutPayload(printLayout);
  render(
    <A4LinkedCardCanvas
      layout={printLayout}
      cardLayout={cardLayout}
      blocks={cardLayout.structure.blocks}
      fields={cardLayout.structure.fields}
      zoom={0.75}
      showGrid={false}
      selectedItemId={null}
      legacy={false}
      disabled
    />,
  );

  await user.click(screen.getByText("Добавить печатный элемент"));
  expect(screen.getAllByRole("button", { name: /^Добавить / })).toHaveLength(8);
  for (const action of screen.getAllByRole("button", { name: /^Добавить / })) {
    expect(action).toBeDisabled();
  }
});

test("hides the forced-off legacy grid toggle and resizes the linked A4 item from the keyboard", async () => {
  const user = userEvent.setup();
  const api = createEditorFetchMock();
  vi.stubGlobal("fetch", api.fetchMock);
  renderEditor();

  await user.click(await screen.findByRole("tab", { name: "Печатная форма A4" }));
  expect(screen.queryByRole("button", { name: /сетку/i })).not.toBeInTheDocument();
  await user.click(screen.getByTestId("a4-linked-card-item"));
  expect(
    screen.getByRole("button", {
      name: "Изменить размер связанного макета карточки: нижний правый угол",
    }),
  ).toBeInTheDocument();
  const canvas = screen.getByLabelText("A4 канвас печатного шаблона");
  canvas.focus();
  await user.keyboard("{Shift>}{ArrowLeft}{/Shift}");
  await user.click(screen.getByRole("button", { name: "Сохранить печатную форму" }));

  await waitFor(() => expect(api.printSavePayloads).toHaveLength(1));
  expect(
    api.printSavePayloads[0].layout_json.items.find((item) => item.kind === "card_layout")
      ?.width_mm,
  ).toBeLessThan(186);
});

test("preview is readonly for linked and legacy print layouts", async () => {
  const user = userEvent.setup();
  vi.stubGlobal("fetch", createEditorFetchMock().fetchMock);
  const linked = renderEditor();

  await user.click(await screen.findByRole("tab", { name: "Предпросмотр" }));
  const linkedCanvas = screen.getByLabelText("A4 канвас печатного шаблона");
  expect(within(linkedCanvas).queryAllByRole("button")).toHaveLength(0);
  expect(linkedCanvas.querySelectorAll("[tabindex]")).toHaveLength(0);
  expect(screen.getByTestId("a4-linked-card-item")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Редактировать внутренний макет" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Преобразовать/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("toolbar", { name: "Печатные элементы A4" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Изменить блок/ })).not.toBeInTheDocument();

  linked.unmount();
  vi.stubGlobal("fetch", createEditorFetchMock({ legacyPrintView: true }).fetchMock);
  renderEditor();
  await user.click(await screen.findByRole("tab", { name: "Предпросмотр" }));
  const legacyCanvas = screen.getByLabelText("A4 канвас печатного шаблона");
  expect(within(legacyCanvas).queryAllByRole("button")).toHaveLength(0);
  expect(legacyCanvas.querySelectorAll("[tabindex]")).toHaveLength(0);
  const overlay = within(legacyCanvas)
    .getByText("Печатная пометка")
    .closest(".a4-template-element");
  expect(overlay).not.toHaveAttribute("role");
  expect(overlay).not.toHaveAttribute("tabindex");

  expect(screen.queryByRole("button", { name: /Преобразовать/ })).not.toBeInTheDocument();
  expect(
    screen.queryByText("Сохранена прежняя поэлементная печатная форма"),
  ).not.toBeInTheDocument();
});

test("existing block edits keep public access out of the template payload", async () => {
  const user = userEvent.setup();
  const api = createEditorFetchMock();
  vi.stubGlobal("fetch", api.fetchMock);
  renderEditor();

  await user.click(await screen.findByRole("button", { name: "Изменить блок Основной блок" }));
  await user.click(screen.getByLabelText("Повторяемый блок"));
  expect(screen.queryByLabelText("Виден в публичной ссылке")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Доступен для публичного редактирования")).not.toBeInTheDocument();
  await user.click(screen.getByLabelText("Можно свернуть"));
  await user.click(screen.getByRole("button", { name: "Сохранить" }));

  await waitFor(() => expect(api.updatedBlockPayloads).toHaveLength(1));
  expect(api.updatedBlockPayloads[0]).toEqual({
    title: "Основной блок",
    description: null,
    position: 0,
    is_repeatable: true,
    layout_columns: 1,
    display_config_json: { collapsible: true },
  });
});

test("existing field edits send type reference list and static-text controls without public access", async () => {
  const user = userEvent.setup();
  const api = createEditorFetchMock();
  vi.stubGlobal("fetch", api.fetchMock);
  renderEditor();

  await user.click(await screen.findByTestId("layout-field-field-field-1"));
  expect(screen.queryByLabelText("Технический код")).not.toBeInTheDocument();
  await user.clear(screen.getByLabelText("Название поля"));
  await user.type(screen.getByLabelText("Название поля"), "Статус заявки");
  await user.type(screen.getByLabelText("Подсказка"), "Выберите статус");
  await user.selectOptions(screen.getByLabelText("Тип поля"), "select");
  await user.selectOptions(screen.getByLabelText("Справочник"), "reference-statuses");
  await user.selectOptions(screen.getByLabelText("Обязательность"), "required_on_publish");
  expect(screen.queryByText("Публичное редактирование")).not.toBeInTheDocument();
  await user.click(screen.getByText("Ещё"));
  await user.click(screen.getByLabelText("Показывать в списке карточек"));
  await user.click(screen.getByRole("button", { name: "Сохранить" }));

  await waitFor(() => expect(api.updatedFieldPayloads).toHaveLength(1));
  expect(api.updatedFieldPayloads[0]).toEqual(
    expect.objectContaining({
      code: "field-1",
      label: "Статус заявки",
      description: "Выберите статус",
      field_type: "select",
      required_mode: "required_on_publish",
      options_source_type: "reference_list",
      options_source_id: "reference-statuses",
      is_list_display: true,
    }),
  );

  await user.click(await screen.findByTestId("layout-field-field-field-1"));
  await user.selectOptions(screen.getByLabelText("Тип поля"), "static_text");
  await user.type(screen.getByLabelText("Текст"), "Только для чтения");
  await user.click(screen.getByRole("button", { name: "Сохранить" }));

  await waitFor(() => expect(api.updatedFieldPayloads).toHaveLength(2));
  expect(api.updatedFieldPayloads[1]).toEqual(
    expect.objectContaining({
      field_type: "static_text",
      options_source_type: null,
      options_source_id: null,
      options_config_json: { static_text: "Только для чтения" },
    }),
  );

  await user.click(await screen.findByTestId("layout-field-field-field-1"));
  await user.selectOptions(screen.getByLabelText("Тип поля"), "text");
  await user.click(screen.getByRole("button", { name: "Сохранить" }));

  await waitFor(() => expect(api.updatedFieldPayloads).toHaveLength(3));
  expect(api.updatedFieldPayloads[2]).toEqual(
    expect.objectContaining({
      code: "field-1",
      field_type: "text",
      options_source_type: null,
      options_source_id: null,
      options_config_json: null,
    }),
  );
});

test("archives a field only after the inline delete confirmation", async () => {
  const user = userEvent.setup();
  const api = createEditorFetchMock();
  vi.stubGlobal("fetch", api.fetchMock);
  renderEditor();

  await user.click(await screen.findByTestId("layout-field-field-field-1"));
  await user.click(screen.getByRole("button", { name: "Удалить поле" }));

  const confirmation = await screen.findByRole("dialog", { name: "Удалить поле" });
  expect(within(confirmation).getByText(/будет перенесено в архив/i)).toBeInTheDocument();
  expect(api.archivedFieldIds).toEqual([]);

  await user.click(within(confirmation).getByRole("button", { name: "Удалить поле" }));
  await waitFor(() => expect(api.archivedFieldIds).toEqual(["field-1"]));
  expect(screen.queryByTestId("layout-field-field-field-1")).not.toBeInTheDocument();
});

test("keeps the field editor open and preserves its hidden technical code when update fails", async () => {
  const user = userEvent.setup();
  const api = createEditorFetchMock({ fieldUpdateError: true });
  vi.stubGlobal("fetch", api.fetchMock);
  renderEditor();

  await user.click(await screen.findByTestId("layout-field-field-field-1"));
  const name = screen.getByLabelText("Название поля");
  await user.clear(name);
  await user.type(name, "Статус заявки");
  await user.click(screen.getByRole("button", { name: "Сохранить" }));

  expect(
    await screen.findByText("Технический код уже используется другим полем этого реестра."),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("Название поля")).toHaveValue("Статус заявки");
  expect(screen.queryByLabelText("Технический код")).not.toBeInTheDocument();
  expect(api.updatedFieldPayloads[0]).toEqual(expect.objectContaining({ code: "field-1" }));
});

test("clears select-only source and options when an existing field changes to text", async () => {
  const user = userEvent.setup();
  const api = createEditorFetchMock();
  vi.stubGlobal("fetch", api.fetchMock);
  renderEditor({
    ...fieldFixture("field-1", "block-1", "Статус", "select"),
    options_source_type: "reference_list",
    options_source_id: "reference-statuses",
    options_config_json: { allow_empty: false },
  });

  await user.click(await screen.findByTestId("layout-field-field-field-1"));
  await user.selectOptions(screen.getByLabelText("Тип поля"), "text");
  await user.click(screen.getByRole("button", { name: "Сохранить" }));

  await waitFor(() => expect(api.updatedFieldPayloads).toHaveLength(1));
  expect(api.updatedFieldPayloads[0]).toEqual(
    expect.objectContaining({
      field_type: "text",
      options_source_type: null,
      options_source_id: null,
      options_config_json: null,
    }),
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
    expect(payload.layout_json.composition_mode).toBe("linked_card");
    expect(payload.layout_json.items.filter((item) => item.kind === "card_layout")).toHaveLength(1);
  }
});

test("keeps generation pending after the print save and prevents duplicate requests", async () => {
  const user = userEvent.setup();
  const api = createEditorFetchMock({ deferredGeneration: true });
  vi.stubGlobal("fetch", api.fetchMock);
  renderEditor(undefined, "card-1");

  const docx = await screen.findByRole("button", { name: "DOCX" });
  const pdf = screen.getByRole("button", { name: "PDF" });
  await user.click(docx);
  await waitFor(() => expect(api.generationCalls).toBe(1));

  expect(docx).toBeDisabled();
  expect(pdf).toBeDisabled();
  await user.click(docx);
  expect(api.generationCalls).toBe(1);

  api.resolveGeneration();
  await waitFor(() => expect(docx).toBeEnabled());
  expect(pdf).toBeEnabled();
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
  expect(container.querySelector(".schema-template-editor-header")).not.toBeNull();
  expect(container.querySelectorAll(".card-layout-studio-header")).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Закрыть" })).toBeInTheDocument();
});

test("renames the opened card template with a name-only PATCH", async () => {
  const user = userEvent.setup();
  const api = createEditorFetchMock();
  vi.stubGlobal("fetch", api.fetchMock);
  renderRegistrySchemaEditor();

  await user.click(await screen.findByRole("tab", { name: "Схема карточки" }));
  await user.click(await screen.findByRole("button", { name: "Шаблон карточки Базовый шаблон" }));
  await user.click(screen.getByRole("button", { name: "Базовый шаблон" }));

  const form = screen.getByRole("form", { name: "Редактировать шаблон карточки" });
  const nameInput = within(form).getByLabelText("Название шаблона карточки");
  await user.clear(nameInput);
  await user.type(nameInput, "Переименованный шаблон");
  await user.click(within(form).getByRole("button", { name: "Сохранить" }));

  await waitFor(() =>
    expect(api.templateUpdatePayloads).toContainEqual({ name: "Переименованный шаблон" }),
  );
});

test("cancels card template renaming without a PATCH", async () => {
  const user = userEvent.setup();
  const api = createEditorFetchMock();
  vi.stubGlobal("fetch", api.fetchMock);
  renderRegistrySchemaEditor();

  await user.click(await screen.findByRole("tab", { name: "Схема карточки" }));
  await user.click(await screen.findByRole("button", { name: "Шаблон карточки Базовый шаблон" }));
  await user.click(screen.getByRole("button", { name: "Базовый шаблон" }));

  const form = screen.getByRole("form", { name: "Редактировать шаблон карточки" });
  await user.click(within(form).getByRole("button", { name: "Отменить" }));

  expect(api.templateUpdatePayloads).toEqual([]);
  expect(screen.getByRole("button", { name: "Базовый шаблон" })).toBeInTheDocument();
});

test("rejects a blank inline card template name without a PATCH", async () => {
  const user = userEvent.setup();
  const api = createEditorFetchMock();
  vi.stubGlobal("fetch", api.fetchMock);
  renderRegistrySchemaEditor();

  await user.click(await screen.findByRole("tab", { name: "Схема карточки" }));
  await user.click(await screen.findByRole("button", { name: "Шаблон карточки Базовый шаблон" }));
  await user.click(screen.getByRole("button", { name: "Базовый шаблон" }));

  const form = screen.getByRole("form", { name: "Редактировать шаблон карточки" });
  await user.clear(within(form).getByLabelText("Название шаблона карточки"));
  await user.click(within(form).getByRole("button", { name: "Сохранить" }));

  expect(await within(form).findByText("Заполните обязательные поля")).toBeInTheDocument();
  expect(api.templateUpdatePayloads).toEqual([]);
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
    conflictServerColumn?: number;
    deferredFirstFormSave?: "success" | "conflict";
    deferredBlockCreate?: boolean;
    deferredFieldCreate?: boolean;
    deferredBlockUpdate?: boolean;
    deferredGeneration?: boolean;
    formSaveErrorOnFirst?: boolean;
    fieldUpdateError?: boolean;
    legacyPrintView?: boolean;
    crookedFormLayout?: boolean;
  } = {},
) {
  let layout = unifiedLayoutPayload(
    options.legacyPrintView ? legacyPrintLayout() : emptyPrintLayout(),
  );
  if (options.crookedFormLayout) {
    layout = layoutWithBlockColumn({ ...layout, revision: "revision-crooked" }, 7);
    layout = {
      ...layout,
      form_layout: {
        ...layout.form_layout,
        sections: layout.form_layout.sections.map((section) => ({ ...section, row: 3, row_span: 2 })),
      },
    };
  }
  let formSaveAttempts = 0;
  const formSavePayloads: FormSavePayload[] = [];
  const printSavePayloads: PrintSavePayload[] = [];
  const createdBlockPayloads: Record<string, unknown>[] = [];
  const createdFieldPayloads: Record<string, unknown>[] = [];
  const updatedBlockPayloads: Record<string, unknown>[] = [];
  const updatedFieldPayloads: Record<string, unknown>[] = [];
  const archivedFieldIds: string[] = [];
  const templateUpdatePayloads: Record<string, unknown>[] = [];
  const blankDownloadPayloads: Array<{ layout_json: CardPrintLayout }> = [];
  let conversionCalls = 0;
  let generationCalls = 0;
  let resolveDeferredFirst: (() => void) | null = null;
  let resolveDeferredBlockCreate: (() => void) | null = null;
  let resolveDeferredFieldCreate: (() => void) | null = null;
  let resolveDeferredBlockUpdate: (() => void) | null = null;
  let resolveDeferredGeneration: (() => void) | null = null;

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
      if (options.deferredFirstFormSave && formSaveAttempts === 1) {
        return new Promise<Response>((resolve) => {
          resolveDeferredFirst = () => {
            if (options.deferredFirstFormSave === "conflict") {
              layout = layoutWithBlockColumn(
                { ...layout, revision: "revision-2" },
                options.conflictServerColumn ?? 5,
              );
              resolve(jsonResponse({ detail: "Card layout changed. Reload before saving." }, 409));
              return;
            }
            layout = { ...layout, revision: "revision-2", form_layout: payload.form_layout };
            resolve(jsonResponse(layout));
          };
        });
      }
      if (options.conflictOnFirstFormSave && formSaveAttempts === 1) {
        layout = layoutWithBlockColumn(
          { ...layout, revision: "revision-2" },
          options.conflictServerColumn ?? 5,
        );
        return jsonResponse({ detail: "Card layout changed. Reload before saving." }, 409);
      }
      if (options.formSaveErrorOnFirst && formSaveAttempts === 1) {
        return jsonResponse({ detail: "Temporary layout failure." }, 503);
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
      const complete = () => {
        layout = {
          ...layout,
          structure: { ...layout.structure, blocks: [...layout.structure.blocks, created] },
        };
        return jsonResponse(created, 201);
      };
      if (options.deferredBlockCreate) {
        return new Promise<Response>((resolve) => {
          resolveDeferredBlockCreate = () => resolve(complete());
        });
      }
      return complete();
    }
    if (url.endsWith("/api/v1/blocks/block-1/fields")) {
      createdFieldPayloads.push(body);
      const created = fieldFixture(
        "field-created",
        "block-1",
        String(body.label ?? "Новое поле"),
        String(body.field_type ?? "text"),
      );
      const complete = () => {
        layout = {
          ...layout,
          structure: { ...layout.structure, fields: [...layout.structure.fields, created] },
        };
        return jsonResponse(created, 201);
      };
      if (options.deferredFieldCreate) {
        return new Promise<Response>((resolve) => {
          resolveDeferredFieldCreate = () => resolve(complete());
        });
      }
      return complete();
    }
    if (url.endsWith("/api/v1/blocks/block-1") && init?.method === "PATCH") {
      updatedBlockPayloads.push(body);
      const current = layout.structure.blocks.find((block) => block.id === "block-1");
      const updated = { ...current, ...body } as FormBlockRead;
      const complete = () => {
        layout = {
          ...layout,
          structure: {
            ...layout.structure,
            blocks: layout.structure.blocks.map((block) =>
              block.id === updated.id ? updated : block,
            ),
          },
        };
        return jsonResponse(updated);
      };
      if (options.deferredBlockUpdate) {
        return new Promise<Response>((resolve) => {
          resolveDeferredBlockUpdate = () => resolve(complete());
        });
      }
      return complete();
    }
    if (url.endsWith("/api/v1/fields/field-1") && init?.method === "PATCH") {
      updatedFieldPayloads.push(body);
      if (options.fieldUpdateError) {
        return jsonResponse({ detail: "Field code already exists in this registry." }, 400);
      }
      const current = layout.structure.fields.find((field) => field.id === "field-1");
      const updated = { ...current, ...body } as FormFieldRead;
      layout = {
        ...layout,
        structure: {
          ...layout.structure,
          fields: layout.structure.fields.map((field) =>
            field.id === updated.id ? updated : field,
          ),
        },
      };
      return jsonResponse(updated);
    }
    if (url.endsWith("/api/v1/fields/field-1") && init?.method === "DELETE") {
      archivedFieldIds.push("field-1");
      const current = layout.structure.fields.find((field) => field.id === "field-1");
      return jsonResponse({ ...current, is_active: false });
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
      return jsonResponse({ items: [referenceListFixture()] });
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
    if (
      url.endsWith("/api/v1/cards/card-1/card-template-layout/template-1/generate-docx") ||
      url.endsWith("/api/v1/cards/card-1/card-template-layout/template-1/generate-pdf")
    ) {
      generationCalls += 1;
      const complete = () =>
        jsonResponse({
          document: generatedDocumentFixture(),
          print_view: printViewFixture(linkedPrintLayout(), true),
        });
      if (options.deferredGeneration) {
        return new Promise<Response>((resolve) => {
          resolveDeferredGeneration = () => resolve(complete());
        });
      }
      return complete();
    }
    return jsonResponse({ detail: "not found" }, 404);
  });

  return {
    fetchMock,
    formSavePayloads,
    printSavePayloads,
    createdBlockPayloads,
    createdFieldPayloads,
    updatedBlockPayloads,
    updatedFieldPayloads,
    archivedFieldIds,
    templateUpdatePayloads,
    blankDownloadPayloads,
    get conversionCalls() {
      return conversionCalls;
    },
    get generationCalls() {
      return generationCalls;
    },
    resolveFirstFormSave() {
      if (!resolveDeferredFirst) throw new Error("The first form save is not pending.");
      resolveDeferredFirst();
      resolveDeferredFirst = null;
    },
    resolveBlockCreate() {
      if (!resolveDeferredBlockCreate) throw new Error("The block create is not pending.");
      resolveDeferredBlockCreate();
      resolveDeferredBlockCreate = null;
    },
    resolveFieldCreate() {
      if (!resolveDeferredFieldCreate) throw new Error("The field create is not pending.");
      resolveDeferredFieldCreate();
      resolveDeferredFieldCreate = null;
    },
    resolveBlockUpdate() {
      if (!resolveDeferredBlockUpdate) throw new Error("The block update is not pending.");
      resolveDeferredBlockUpdate();
      resolveDeferredBlockUpdate = null;
    },
    resolveGeneration() {
      if (!resolveDeferredGeneration) throw new Error("Document generation is not pending.");
      resolveDeferredGeneration();
      resolveDeferredGeneration = null;
    },
  };
}

function generatedDocumentFixture() {
  return {
    id: "generated-1",
    card_id: "card-1",
    template_id: "print-template-1",
    template_version_id: "print-version-1",
    stored_file_id: "stored-1",
    title: "Основная A4",
    output_filename: "card.docx",
    content_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    render_status: "ready",
    created_at: "2026-07-10T00:00:00Z",
    archived_at: null,
  };
}

const STALE_LAYOUT_MESSAGE =
  "Макет изменён другим пользователем. Обновите данные перед сохранением.";

async function moveMainBlockRight(user: ReturnType<typeof userEvent.setup>) {
  const move = await screen.findByTestId("layout-field-field-field-1");
  move.focus();
  await user.keyboard("{ArrowRight}");
  await user.click(screen.getByRole("button", { name: "Готово" }));
}

async function moveMainBlockDown(user: ReturnType<typeof userEvent.setup>) {
  const move = await screen.findByTestId("layout-field-field-field-1");
  move.focus();
  await user.keyboard("{ArrowDown}");
  await user.click(screen.getByRole("button", { name: "Готово" }));
}

function layoutWithBlockColumn(layout: CardTemplateLayoutRead, column: number) {
  return {
    ...layout,
    form_layout: {
      ...layout.form_layout,
      sections: layout.form_layout.sections.map((section, index) =>
        index === 0 ? { ...section, column } : section,
      ),
    },
  };
}

function referenceListFixture() {
  return {
    id: "reference-statuses",
    registry_id: "registry-1",
    owner_organization_id: null,
    code: "statuses",
    name: "Статусы",
    description: null,
    scope_mode: "global",
    inherit_to_descendants: false,
    locked_for_descendants: false,
    managed_by_system_only: false,
    is_active: true,
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
    overlays: [
      {
        id: "legacy-overlay",
        kind: "static_text",
        page: 1,
        x_mm: 12,
        y_mm: 30,
        width_mm: 93,
        height_mm: 12,
        text: "Печатная пометка",
      },
    ],
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

function renderEditor(
  initialField = fieldFixture("field-1", "block-1", "Статус", "text"),
  selectedCardId?: string,
) {
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
        fields={[initialField]}
        selectedCardId={selectedCardId}
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
