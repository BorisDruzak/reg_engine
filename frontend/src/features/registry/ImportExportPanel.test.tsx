import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";

import { uiText } from "@/app/uiText";

import { ImportExportPanel } from "./ImportExportPanel";

const api = vi.hoisted(() => ({
  ApiError: class ApiError extends Error {},
  commitTabularXlsxImport: vi.fn(),
  downloadTabularXlsxCards: vi.fn(),
  downloadTabularXlsxImportTemplate: vi.fn(),
  getTabularXlsxCardExchangeOptions: vi.fn(),
  previewTabularXlsxImport: vi.fn(),
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
        display_name: "Карточка",
        errors: [],
      },
    ],
  });
  api.commitTabularXlsxImport.mockResolvedValue({
    format_version: "tabular_card_xlsx_v2",
    registry_id: "registry-1",
    summary: { created_cards: 1, field_values_written: 1 },
  });
  vi.clearAllMocks();
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
        display_name: "\u041a\u0430\u0440\u0442\u043e\u0447\u043a\u0430",
        errors: [],
      },
      {
        row_number: 3,
        status: "invalid",
        organization_label: options.organizations[0].label,
        display_name: "",
        errors: [
          "\u041d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d\u043e \u043d\u0430\u0437\u0432\u0430\u043d\u0438\u0435.",
        ],
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
