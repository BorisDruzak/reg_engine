import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";

import { uiText } from "@/app/uiText";

import { ImportExportPanel } from "./ImportExportPanel";

const api = vi.hoisted(() => ({
  ApiError: class ApiError extends Error {
    constructor(
      message: string,
      public status?: number,
    ) {
      super(message);
    }
  },
  commitTabularXlsxImport: vi.fn(),
  downloadTabularXlsxCards: vi.fn(),
  downloadTabularXlsxImportTemplate: vi.fn(),
  getTabularXlsxCardExchangeOptions: vi.fn(),
  previewTabularXlsxImport: vi.fn(),
  listCardExportTemplates: vi.fn(),
  createCardExportTemplate: vi.fn(),
  updateCardExportTemplate: vi.fn(),
  archiveCardExportTemplate: vi.fn(),
  downloadCardExportTemplate: vi.fn(),
}));

vi.mock("@/api/client", () => api);

const options = {
  registry_id: "registry-1",
  organizations: [
    { id: "organization-1", name: "Администрация", label: "Администрация (admin)" },
    { id: "organization-2", name: "Управление", label: "Управление (office)" },
  ],
  templates: [
    {
      id: "template-1",
      name: "Сведения",
      fields: [
        {
          id: "field-1",
          label: "Фамилия",
          block_title: "Основные сведения",
          field_type: "text",
          supported: true,
          unsupported_reason: null,
        },
        {
          id: "field-2",
          label: "Вложение",
          block_title: "Основные сведения",
          field_type: "file_ref",
          supported: false,
          unsupported_reason:
            "Для этого поля нельзя безопасно создать одну табличную колонку XLSX.",
        },
        {
          id: "field-3",
          label: "Навыки",
          block_title: "Основные сведения",
          field_type: "multi_select",
          supported: false,
          unsupported_reason:
            "Для этого поля нельзя безопасно создать одну табличную колонку XLSX.",
        },
      ],
    },
  ],
};

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ImportExportPanel selectedRegistryId="registry-1" token="token" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  api.listCardExportTemplates.mockResolvedValue({ items: [] });
  api.getTabularXlsxCardExchangeOptions.mockResolvedValue(options);
  api.previewTabularXlsxImport.mockResolvedValue({
    format_version: "tabular_card_xlsx_v2",
    registry_id: "registry-1",
    summary: { total_rows: 1, valid_rows: 1, invalid_rows: 0, would_create_cards: 1 },
    rows: [
      {
        row_number: 2,
        status: "valid",
        organization_label: "Администрация (admin)",
        errors: [],
      },
    ],
  });
  api.commitTabularXlsxImport.mockResolvedValue({
    format_version: "tabular_card_xlsx_v2",
    registry_id: "registry-1",
    summary: { created_cards: 1, field_values_written: 1 },
  });
});

const exportOptions = {
  ...options,
  templates: [
    {
      id: "template-1",
      name: "Сведения",
      fio_field_id: "fio",
      fields: [
        {
          id: "fio",
          label: "Полное имя",
          block_title: "Сведения",
          field_type: "text",
          supported: true,
          unsupported_reason: null,
        },
        ...["Должность", "Подразделение", "Дата назначения", "Основание назначения"].map(
          (label, index) => ({
            id: `mapped-${index}`,
            label,
            block_title: "Сведения",
            field_type: index === 2 ? "date" : "text",
            supported: true,
            unsupported_reason: null,
          }),
        ),
      ],
    },
  ],
};
const savedExport = {
  id: "export-1",
  registry_id: "registry-1",
  code: "spisok",
  name: "Список отдела",
  export_kind: "card_list",
  card_template_id: "template-1",
  configuration_json: { field_ids: ["fio", "mapped-1", "mapped-0"] },
  created_at: "2026-09-09T00:00:00Z",
  updated_at: "2026-09-09T00:00:00Z",
  archived_at: null,
};

async function openExports() {
  api.getTabularXlsxCardExchangeOptions.mockResolvedValue(exportOptions);
  renderPanel();
  const user = userEvent.setup();
  await user.click(await screen.findByRole("tab", { name: "Шаблоны выгрузки" }));
  await screen.findByLabelText("Сохранённый шаблон выгрузки");
  return user;
}

test("saves ordered card-list fields with non-removable FIO and no title", async () => {
  api.createCardExportTemplate.mockResolvedValue(savedExport);
  const user = await openExports();
  await user.type(screen.getByLabelText("Название шаблона выгрузки"), "Список отдела");
  await user.selectOptions(screen.getByLabelText("Шаблон карточки для выгрузки"), "template-1");
  expect(screen.getByLabelText("ФИО (обязательное поле отображения)")).toBeDisabled();
  expect(screen.queryByLabelText("Название карточки")).not.toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText("Добавить колонку"), "mapped-0");
  await user.selectOptions(screen.getByLabelText("Добавить колонку"), "mapped-1");
  await user.click(screen.getByRole("button", { name: "Поднять Подразделение" }));
  await user.click(screen.getByRole("button", { name: "Сохранить шаблон выгрузки" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Шаблон выгрузки сохранён");
  expect(api.createCardExportTemplate).toHaveBeenCalledWith(
    "token",
    "registry-1",
    expect.objectContaining({
      name: "Список отдела",
      export_kind: "card_list",
      card_template_id: "template-1",
      configuration_json: { field_ids: ["fio", "mapped-1", "mapped-0"] },
    }),
  );
});

test("reserves codes of archived templates when creating the same name again", async () => {
  api.listCardExportTemplates.mockResolvedValue({
    items: [{ ...savedExport, code: "spisok_otdela", archived_at: "2026-09-09T00:00:00Z" }],
  });
  api.createCardExportTemplate.mockResolvedValue({ ...savedExport, code: "spisok_otdela_2" });
  const user = await openExports();
  expect(screen.queryByRole("option", { name: "Список отдела" })).not.toBeInTheDocument();
  await user.type(screen.getByLabelText("Название шаблона выгрузки"), "Список отдела");
  await user.selectOptions(screen.getByLabelText("Шаблон карточки для выгрузки"), "template-1");
  await user.click(screen.getByRole("button", { name: "Сохранить шаблон выгрузки" }));
  await waitFor(() =>
    expect(api.createCardExportTemplate).toHaveBeenCalledWith(
      "token",
      "registry-1",
      expect.objectContaining({ code: "spisok_otdela_2" }),
    ),
  );
  expect(api.listCardExportTemplates).toHaveBeenCalledWith("token", "registry-1", true);
});

test("uses bounded unique export codes for long transliterated names", async () => {
  const occupied = "shch".repeat(25);
  api.listCardExportTemplates.mockResolvedValue({ items: [{ ...savedExport, code: occupied }] });
  api.createCardExportTemplate.mockResolvedValue(savedExport);
  const user = await openExports();
  await user.type(screen.getByLabelText("Название шаблона выгрузки"), "щ".repeat(40));
  await user.selectOptions(screen.getByLabelText("Шаблон карточки для выгрузки"), "template-1");
  await user.click(screen.getByRole("button", { name: "Сохранить шаблон выгрузки" }));
  await waitFor(() =>
    expect(api.createCardExportTemplate).toHaveBeenCalledWith(
      "token",
      "registry-1",
      expect.objectContaining({ code: `${occupied.slice(0, 98)}_2` }),
    ),
  );
});

test("keeps a code reserved after archiving in the current session", async () => {
  api.listCardExportTemplates.mockResolvedValue({
    items: [{ ...savedExport, code: "spisok_otdela" }],
  });
  api.archiveCardExportTemplate.mockResolvedValue({
    ...savedExport,
    code: "spisok_otdela",
    archived_at: "2026-09-09T00:00:00Z",
  });
  api.createCardExportTemplate.mockResolvedValue(savedExport);
  const user = await openExports();
  await user.selectOptions(screen.getByLabelText("Сохранённый шаблон выгрузки"), "export-1");
  await user.click(screen.getByRole("button", { name: "Архивировать шаблон" }));
  await user.click(screen.getByRole("button", { name: "Подтвердить архивирование" }));
  await screen.findByText("Шаблон выгрузки архивирован");
  await user.type(screen.getByLabelText("Название шаблона выгрузки"), "Список отдела");
  await user.selectOptions(screen.getByLabelText("Шаблон карточки для выгрузки"), "template-1");
  await user.click(screen.getByRole("button", { name: "Сохранить шаблон выгрузки" }));
  await waitFor(() =>
    expect(api.createCardExportTemplate).toHaveBeenCalledWith(
      "token",
      "registry-1",
      expect.objectContaining({ code: "spisok_otdela_2" }),
    ),
  );
});

test("refreshes occupied codes after a create conflict and retries only after explicit save", async () => {
  api.listCardExportTemplates
    .mockResolvedValueOnce({ items: [] })
    .mockResolvedValue({ items: [{ ...savedExport, code: "spisok_otdela" }] });
  api.createCardExportTemplate
    .mockRejectedValueOnce(new api.ApiError("Integrity constraint violation.", 409))
    .mockResolvedValueOnce({ ...savedExport, code: "spisok_otdela_2" });
  const user = await openExports();
  await user.type(screen.getByLabelText("Название шаблона выгрузки"), "Список отдела");
  await user.selectOptions(screen.getByLabelText("Шаблон карточки для выгрузки"), "template-1");
  await user.click(screen.getByRole("button", { name: "Сохранить шаблон выгрузки" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Список шаблонов обновлён. Повторите сохранение.",
  );
  expect(screen.getByLabelText("Название шаблона выгрузки")).toHaveValue("Список отдела");
  expect(api.createCardExportTemplate).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole("button", { name: "Сохранить шаблон выгрузки" }));
  await waitFor(() =>
    expect(api.createCardExportTemplate).toHaveBeenLastCalledWith(
      "token",
      "registry-1",
      expect.objectContaining({ code: "spisok_otdela_2" }),
    ),
  );
  expect(await screen.findByRole("status")).toHaveTextContent("Шаблон выгрузки сохранён");
});

test("personnel download requires organization and inclusive valid period and clicks a blob download", async () => {
  const personnel = {
    ...savedExport,
    export_kind: "personnel_changes",
    configuration_json: {
      position_field_id: "mapped-0",
      structural_unit_field_id: "mapped-1",
      appointment_date_field_id: "mapped-2",
      appointment_basis_field_id: "mapped-3",
    },
  };
  api.listCardExportTemplates.mockResolvedValue({ items: [personnel] });
  api.downloadCardExportTemplate.mockResolvedValue({
    blob: new Blob(["xlsx"]),
    filename: "registry-export.xlsx",
  });
  const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
  const revokeUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    expect(this.download).toBe("registry-export.xlsx");
    expect(this.href).toBe("blob:test");
  });
  const user = await openExports();
  await user.selectOptions(screen.getByLabelText("Сохранённый шаблон выгрузки"), "export-1");
  expect(screen.getByLabelText("Организация для выгрузки")).toHaveValue("");
  expect(screen.getByRole("button", { name: "Скачать XLSX" })).toBeDisabled();
  await user.selectOptions(screen.getByLabelText("Организация для выгрузки"), "organization-1");
  await user.type(screen.getByLabelText("Начало периода"), "2026-09-10");
  await user.type(screen.getByLabelText("Конец периода"), "2026-09-09");
  expect(screen.getByRole("button", { name: "Скачать XLSX" })).toBeDisabled();
  await user.clear(screen.getByLabelText("Начало периода"));
  await user.type(screen.getByLabelText("Начало периода"), "2026-09-09");
  await user.click(screen.getByRole("button", { name: "Скачать XLSX" }));
  await waitFor(() => expect(click).toHaveBeenCalledOnce());
  expect(api.downloadCardExportTemplate).toHaveBeenCalledWith("token", "export-1", {
    organization_id: "organization-1",
    period_from: "2026-09-09",
    period_to: "2026-09-09",
  });
  expect(createUrl).toHaveBeenCalledOnce();
  expect(revokeUrl).toHaveBeenCalledWith("blob:test");
  click.mockRestore();
  createUrl.mockRestore();
  revokeUrl.mockRestore();
});

test("edits a persisted template and archives it only after explicit confirmation", async () => {
  api.listCardExportTemplates.mockResolvedValue({ items: [savedExport] });
  api.updateCardExportTemplate.mockResolvedValue({ ...savedExport, name: "Обновлённый список" });
  api.archiveCardExportTemplate.mockResolvedValue({
    ...savedExport,
    archived_at: "2026-09-09T00:00:00Z",
  });
  const user = await openExports();
  await user.selectOptions(screen.getByLabelText("Сохранённый шаблон выгрузки"), "export-1");
  await user.clear(screen.getByLabelText("Название шаблона выгрузки"));
  await user.type(screen.getByLabelText("Название шаблона выгрузки"), "Обновлённый список");
  expect(screen.getByRole("button", { name: "Скачать XLSX" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Сохранить шаблон выгрузки" }));
  await waitFor(() =>
    expect(api.updateCardExportTemplate).toHaveBeenCalledWith(
      "token",
      "export-1",
      expect.objectContaining({ name: "Обновлённый список" }),
    ),
  );
  await user.click(screen.getByRole("button", { name: "Архивировать шаблон" }));
  expect(api.archiveCardExportTemplate).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Подтвердить архивирование" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Шаблон выгрузки архивирован");
  expect(screen.getByLabelText("Сохранённый шаблон выгрузки")).toHaveValue("");
});

test("preserves personnel mappings on backend validation error and prevents duplicate mappings", async () => {
  api.createCardExportTemplate.mockRejectedValueOnce(
    new api.ApiError("Дата назначения должна соответствовать полю типа «Дата»."),
  );
  const user = await openExports();
  await user.type(screen.getByLabelText("Название шаблона выгрузки"), "Изменения");
  await user.selectOptions(screen.getByLabelText("Вид выгрузки"), "personnel_changes");
  await user.selectOptions(screen.getByLabelText("Шаблон карточки для выгрузки"), "template-1");
  for (const [label, id] of [
    ["Поле должности", "mapped-0"],
    ["Поле подразделения", "mapped-1"],
    ["Поле даты назначения", "mapped-2"],
    ["Поле основания назначения", "mapped-3"],
  ]) {
    await user.selectOptions(screen.getByLabelText(label), id);
  }
  await user.click(screen.getByRole("button", { name: "Сохранить шаблон выгрузки" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Дата назначения должна соответствовать полю типа «Дата».",
  );
  expect(screen.getByLabelText("Поле должности")).toHaveValue("mapped-0");
  await user.selectOptions(screen.getByLabelText("Поле основания назначения"), "mapped-0");
  expect(screen.getByRole("button", { name: "Сохранить шаблон выгрузки" })).toBeDisabled();
});

test("shows safe load error and retries the template list without probing global admin APIs", async () => {
  api.listCardExportTemplates.mockRejectedValueOnce(new api.ApiError("Forbidden"));
  const user = await openExports();
  expect(await screen.findByRole("alert")).not.toHaveTextContent("Forbidden");
  await user.click(screen.getByRole("button", { name: "Повторить загрузку шаблонов" }));
  expect(await screen.findByText("Шаблоны выгрузки пока не созданы")).toBeInTheDocument();
});

test("retains selected template and download scope on period rejection and retries archive failure", async () => {
  api.listCardExportTemplates.mockResolvedValue({ items: [savedExport] });
  api.downloadCardExportTemplate.mockRejectedValueOnce(
    new api.ApiError("Укажите корректный период выгрузки: начало и окончание включительно."),
  );
  api.archiveCardExportTemplate.mockRejectedValueOnce(new api.ApiError("Internal service error."));
  const user = await openExports();
  await user.selectOptions(screen.getByLabelText("Сохранённый шаблон выгрузки"), "export-1");
  await user.selectOptions(screen.getByLabelText("Организация для выгрузки"), "organization-1");
  expect(screen.queryByLabelText("Начало периода")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Скачать XLSX" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Укажите корректный период выгрузки: начало и окончание включительно.",
  );
  expect(screen.getByLabelText("Организация для выгрузки")).toHaveValue("organization-1");
  await user.click(screen.getByRole("button", { name: "Архивировать шаблон" }));
  await user.click(screen.getByRole("button", { name: "Подтвердить архивирование" }));
  expect(await screen.findByRole("alert")).not.toHaveTextContent("Internal service error");
  expect(screen.getByLabelText("Сохранённый шаблон выгрузки")).toHaveValue("export-1");
  expect(screen.getByRole("button", { name: "Подтвердить архивирование" })).toBeEnabled();
});

test("blocks unavailable FIO and clears ordered fields when the card template changes", async () => {
  api.getTabularXlsxCardExchangeOptions.mockResolvedValue({
    ...exportOptions,
    templates: [
      ...exportOptions.templates,
      { id: "template-2", name: "Без имени", fio_field_id: null, fields: [] },
    ],
  });
  api.listCardExportTemplates.mockResolvedValue({ items: [savedExport] });
  renderPanel();
  const user = userEvent.setup();
  await user.click(await screen.findByRole("tab", { name: "Шаблоны выгрузки" }));
  await user.selectOptions(await screen.findByLabelText("Сохранённый шаблон выгрузки"), "export-1");
  await user.selectOptions(screen.getByLabelText("Шаблон карточки для выгрузки"), "template-2");
  expect(screen.getByRole("button", { name: "Сохранить шаблон выгрузки" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Убрать Должность" })).not.toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText("Шаблон карточки для выгрузки"), "template-1");
  expect(screen.getByRole("button", { name: "Сохранить шаблон выгрузки" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Убрать Должность" })).not.toBeInTheDocument();
});

test("selects the only template and all supported XLSX columns by default", async () => {
  renderPanel();

  expect(await screen.findByLabelText("Шаблон карточки")).toHaveValue("template-1");
  expect(screen.getByRole("button", { name: "Колонки карточки" })).toHaveTextContent(
    "Основные сведения: Фамилия",
  );
});

test("filters and changes XLSX columns through the searchable multiple-choice control", async () => {
  const user = userEvent.setup();
  renderPanel();

  await user.click(await screen.findByRole("button", { name: "Колонки карточки" }));
  await user.type(screen.getByRole("searchbox", { name: "Поиск варианта" }), "Фамилия");

  const fieldChoice = screen.getByLabelText("Основные сведения: Фамилия");
  expect(fieldChoice).toBeChecked();

  await user.click(fieldChoice);

  expect(fieldChoice).not.toBeChecked();
});

test("configures the wide XLSX format without technical controls", async () => {
  const user = userEvent.setup();
  renderPanel();

  expect(await screen.findByRole("heading", { name: "Табличный XLSX" })).toBeInTheDocument();
  await screen.findByLabelText("Шаблон карточки");
  expect(screen.queryByText("Скачать JSON")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Скачать список" })).toBeDisabled();

  await user.click(screen.getByRole("button", { name: "Организации" }));
  await user.click(screen.getByLabelText("Администрация (admin)"));

  expect(screen.getByRole("button", { name: "Скачать список" })).toBeEnabled();
  await user.click(screen.getByRole("tab", { name: "Импорт карточек" }));
  expect(screen.getByRole("button", { name: "Скачать шаблон импорта" })).toBeEnabled();
  expect(screen.getByText(/Вложение/)).toBeInTheDocument();
  expect(screen.getByText(/Навыки/)).toBeInTheDocument();
});

test("shows export and import in compact separate tabs", async () => {
  const user = userEvent.setup();
  renderPanel();

  expect(await screen.findByRole("button", { name: "Скачать список" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Импортировать" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("tab", { name: "Импорт карточек" }));

  expect(screen.queryByRole("button", { name: "Скачать список" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Скачать шаблон импорта" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Проверить импорт" })).toBeInTheDocument();
});

test("uses the organization picker and requires an import target for several organizations", async () => {
  const user = userEvent.setup();
  renderPanel();

  await user.click(await screen.findByRole("tab", { name: "Импорт карточек" }));
  await screen.findByLabelText("Шаблон карточки");
  await user.click(screen.getByRole("button", { name: "Организации" }));
  await user.click(screen.getByLabelText("Администрация (admin)"));
  await user.click(screen.getByLabelText("Управление (office)"));

  expect(screen.queryByLabelText("Скрывать колонку «Организация»")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Организация для импорта")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Скачать список" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Скачать шаблон импорта" })).toBeDisabled();

  await user.selectOptions(screen.getByLabelText("Организация для импорта"), "organization-2");

  expect(screen.getByRole("button", { name: "Скачать шаблон импорта" })).toBeEnabled();
});

test("renders a template-download error inside the import operation", async () => {
  const user = userEvent.setup();
  api.downloadTabularXlsxImportTemplate.mockRejectedValueOnce(
    new Error("Выберите хотя бы одну организацию для XLSX."),
  );
  renderPanel();

  await user.click(await screen.findByRole("tab", { name: "Импорт карточек" }));
  await screen.findByLabelText("Шаблон карточки");
  await user.click(screen.getByRole("button", { name: "Организации" }));
  await user.click(screen.getByLabelText("Администрация (admin)"));
  await user.click(screen.getByRole("button", { name: "Скачать шаблон импорта" }));

  const importSection = screen.getByRole("heading", { name: "Импорт карточек" }).closest("section");
  expect(importSection).not.toBeNull();
  expect(
    await within(importSection as HTMLElement).findByText(
      "Выберите хотя бы одну организацию для XLSX.",
    ),
  ).toBeInTheDocument();
});

test("previews the selected XLSX file before allowing import", async () => {
  const user = userEvent.setup();
  renderPanel();
  await screen.findByRole("heading", { name: "Табличный XLSX" });
  await user.click(screen.getByRole("tab", { name: "Импорт карточек" }));
  const file = new File(["xlsx"], "cards.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  await user.upload(screen.getByLabelText("Заполненный XLSX-файл"), file);
  await user.click(screen.getByRole("button", { name: "Проверить импорт" }));
  expect(await screen.findByText("Файл можно импортировать")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Импортировать" }));

  expect(await screen.findByText("Карточки импортированы")).toBeInTheDocument();
  expect(api.commitTabularXlsxImport).toHaveBeenCalledWith("token", "registry-1", file);
});

test("uses strict creation by default and sends the selected mode and experience date with the template", async () => {
  const user = userEvent.setup();
  api.downloadTabularXlsxImportTemplate.mockRejectedValueOnce(new Error("network"));
  renderPanel();

  await user.click(await screen.findByRole("tab", { name: uiText.tabularXlsxImportTitle }));
  await user.click(screen.getByRole("button", { name: uiText.tabularXlsxOrganizations }));
  await user.click(screen.getByLabelText(options.organizations[0].label));

  const importMode = screen.getByLabelText(
    "\u0420\u0435\u0436\u0438\u043c \u0441\u043e\u0437\u0434\u0430\u043d\u0438\u044f \u043a\u0430\u0440\u0442\u043e\u0447\u0435\u043a",
  );
  expect(importMode).toHaveValue("strict");
  await user.selectOptions(importMode, "enrich_global_references");
  expect(
    screen.getByText(
      "\u0421\u0432\u043e\u0431\u043e\u0434\u043d\u044b\u0435 \u0437\u043d\u0430\u0447\u0435\u043d\u0438\u044f \u0434\u043b\u044f \u0434\u043e\u043f\u0443\u0441\u0442\u0438\u043c\u044b\u0445 \u0433\u043b\u043e\u0431\u0430\u043b\u044c\u043d\u044b\u0445 \u0441\u043f\u0440\u0430\u0432\u043e\u0447\u043d\u0438\u043a\u043e\u0432 \u0431\u0443\u0434\u0443\u0442 \u0434\u043e\u0431\u0430\u0432\u043b\u0435\u043d\u044b \u043f\u0440\u0438 \u0438\u043c\u043f\u043e\u0440\u0442\u0435.",
    ),
  ).toBeInTheDocument();
  const experienceDate = screen.getByLabelText(
    "\u0414\u0430\u0442\u0430 \u0430\u043a\u0442\u0443\u0430\u043b\u044c\u043d\u043e\u0441\u0442\u0438 \u0441\u0442\u0430\u0436\u0430",
  );
  await user.clear(experienceDate);
  await user.type(experienceDate, "2026-07-17");
  await user.click(screen.getByRole("button", { name: uiText.downloadImportTemplate }));

  await waitFor(() => {
    expect(api.downloadTabularXlsxImportTemplate).toHaveBeenCalledWith(
      "token",
      "registry-1",
      expect.objectContaining({
        import_mode: "enrich_global_references",
        work_experience_as_of_date: "2026-07-17",
      }),
    );
  });
  expect(screen.getByText(/\u0412\u043b\u043e\u0436\u0435\u043d\u0438\u0435/)).toBeInTheDocument();
});

test("lists planned global reference values without internal identifiers and keeps invalid preview blocked", async () => {
  const user = userEvent.setup();
  api.previewTabularXlsxImport.mockResolvedValueOnce({
    format_version: "tabular_card_xlsx_v2",
    registry_id: "registry-1",
    summary: {
      total_rows: 2,
      valid_rows: 1,
      invalid_rows: 1,
      would_create_cards: 1,
      would_create_reference_items: 1,
    },
    new_reference_items: [
      {
        field_label: "\u0414\u043e\u043b\u0436\u043d\u043e\u0441\u0442\u044c",
        label: "\u0418\u043d\u0436\u0435\u043d\u0435\u0440",
        reference_list_id: "reference-list-uuid",
      },
    ],
    rows: [
      {
        row_number: 2,
        status: "valid",
        organization_label: options.organizations[0].label,
        errors: [],
      },
      {
        row_number: 3,
        status: "invalid",
        organization_label: null,
        errors: ["Не указана организация."],
      },
    ],
  });
  renderPanel();

  await user.click(await screen.findByRole("tab", { name: uiText.tabularXlsxImportTitle }));
  const file = new File(["xlsx"], "cards.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  await user.upload(screen.getByLabelText(uiText.importXlsxFile), file);
  await user.click(screen.getByRole("button", { name: uiText.previewTabularXlsxImport }));

  expect(
    await screen.findByText(
      "\u0411\u0443\u0434\u0435\u0442 \u0434\u043e\u0431\u0430\u0432\u043b\u0435\u043d\u043e \u044d\u043b\u0435\u043c\u0435\u043d\u0442\u043e\u0432 \u0441\u043f\u0440\u0430\u0432\u043e\u0447\u043d\u0438\u043a\u043e\u0432: 1",
    ),
  ).toBeInTheDocument();
  expect(
    screen.getByText(
      "\u0414\u043e\u043b\u0436\u043d\u043e\u0441\u0442\u044c: \u0418\u043d\u0436\u0435\u043d\u0435\u0440",
    ),
  ).toBeInTheDocument();
  expect(screen.queryByText("reference-list-uuid")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: uiText.commitTabularXlsxImport })).toBeDisabled();
});
