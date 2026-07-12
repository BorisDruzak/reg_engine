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
    format_version: "tabular_card_xlsx_v1",
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
    format_version: "tabular_card_xlsx_v1",
    registry_id: "registry-1",
    summary: { created_cards: 1, field_values_written: 1 },
  });
  vi.clearAllMocks();
});

test("configures the wide XLSX format without technical controls", async () => {
  const user = userEvent.setup();
  renderPanel();

  expect(await screen.findByRole("heading", { name: "Табличный XLSX" })).toBeInTheDocument();
  await screen.findByLabelText("Шаблон карточки");
  expect(screen.queryByText("Скачать JSON")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Скачать список" })).toBeDisabled();

  await user.selectOptions(screen.getByLabelText("Шаблон карточки"), "template-1");
  await user.click(screen.getByLabelText("Администрация (admin)"));
  await user.click(screen.getByLabelText("Основные сведения: Фамилия"));

  expect(screen.getByRole("button", { name: "Скачать список" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Скачать шаблон импорта" })).toBeEnabled();
  expect(screen.getByText(/Вложение/)).toBeInTheDocument();
});

test("separates export and import into distinct operations", async () => {
  renderPanel();

  const exportHeading = await screen.findByRole("heading", { name: "Экспорт карточек" });
  const importHeading = screen.getByRole("heading", { name: "Импорт карточек" });
  const exportSection = exportHeading.closest("section");
  const importSection = importHeading.closest("section");

  expect(exportSection).not.toBeNull();
  expect(importSection).not.toBeNull();
  expect(exportSection).toContainElement(screen.getByRole("button", { name: "Скачать список" }));
  expect(exportSection).not.toContainElement(screen.getByRole("button", { name: "Импортировать" }));
  expect(importSection).toContainElement(
    screen.getByRole("button", { name: "Скачать шаблон импорта" }),
  );
  expect(importSection).toContainElement(screen.getByRole("button", { name: "Проверить импорт" }));
});

test("hides organization by default and requires an import target for several organizations", async () => {
  const user = userEvent.setup();
  renderPanel();

  const templateSelect = await screen.findByLabelText("Шаблон карточки");
  await user.selectOptions(templateSelect, "template-1");
  await user.click(screen.getByLabelText("Администрация (admin)"));
  await user.click(screen.getByLabelText("Управление (office)"));
  await user.click(screen.getByLabelText("Основные сведения: Фамилия"));

  expect(screen.getByLabelText("Скрывать колонку «Организация»")).toBeChecked();
  expect(screen.getByLabelText("Организация для импорта")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Скачать список" })).toBeEnabled();
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

  await screen.findByRole("heading", { name: "Импорт карточек" });
  const templateSelect = await screen.findByLabelText("Шаблон карточки");
  await user.selectOptions(templateSelect, "template-1");
  await user.click(screen.getByLabelText("Администрация (admin)"));
  await user.click(screen.getByLabelText("Основные сведения: Фамилия"));
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
