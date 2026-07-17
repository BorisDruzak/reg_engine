import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";

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
