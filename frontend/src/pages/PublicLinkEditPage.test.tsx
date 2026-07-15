import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { StrictMode, type ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type {
  PublicLinkAttachmentListRead,
  PublicLinkPreviewRead,
  PublicLinkSafeStatusRead,
} from "@/api/types";

import { PublicLinkEditPage } from "./PublicLinkEditPage";

const globalStyles = readFileSync("src/styles/globals.css", "utf8");
const rawToken = "public-review-token";

let status: PublicLinkSafeStatusRead;
let preview: PublicLinkPreviewRead & { form_layout: PublicFormLayout };
let attachments: PublicLinkAttachmentListRead;
let fetchCalls: { method: string; path: string; body: unknown }[];
let editResponseMode: "success" | "deferred" | "error";
let deferredEditResponses: Array<(response: Response) => void>;
let statusResponseMode: "success" | "deferred" | "error";
let deferredStatusResponses: Array<(response: Response) => void>;
let lifecycleDenialPath: string | null;
let clipboardWrite: ReturnType<typeof vi.fn>;

beforeEach(() => {
  status = safeStatus("active");
  preview = publicPreview();
  attachments = {
    items: [],
    max_attachment_uploads: 2,
    attachment_upload_count: 0,
    can_upload_attachments: true,
  };
  fetchCalls = [];
  editResponseMode = "success";
  deferredEditResponses = [];
  statusResponseMode = "success";
  deferredStatusResponses = [];
  lifecycleDenialPath = null;
  clipboardWrite = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: clipboardWrite },
  });
  vi.stubGlobal("fetch", vi.fn(handleFetch));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PublicLinkEditPage", () => {
  test("uses the shared card workspace width so the public canvas stays within it", () => {
    expect(globalStyles).toContain(".public-main {\n  width: min(72rem, 100%);");
  });

  test("copies the current public URL from the page title", async () => {
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Копировать ссылку" }));

    expect(clipboardWrite).toHaveBeenCalledWith(window.location.href);
    expect(await screen.findByText("Ссылка скопирована")).toHaveAttribute("role", "status");
  });

  test("shows public completion navigation and updates it after a confirmed field save", async () => {
    editResponseMode = "deferred";
    preview.blocks[0].instances[0].fields[0] = {
      ...preview.blocks[0].instances[0].fields[0],
      required_mode: "required",
      description: "Укажите публичный статус",
      value: "",
    };
    renderPage();

    expect(
      await screen.findByRole("navigation", { name: "Содержание карточки" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Основные сведения: нужно заполнить 1 из 4" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("public-field-item-status")).toHaveClass("is-required-missing");
    expect(
      screen
        .getByTestId("public-field-item-status")
        .querySelector(".card-layout-presentation-description"),
    ).toHaveTextContent("Укажите публичный статус");

    fireEvent.change(screen.getByRole("textbox", { name: "Публичный статус" }), {
      target: { value: "Подтверждено" },
    });
    await waitFor(() => expect(editCalls()).toHaveLength(1));
    expect(
      screen.getByRole("button", { name: "Основные сведения: нужно заполнить 1 из 4" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("public-field-item-status")).toHaveClass("is-required-missing");

    resolveNextEdit("Подтверждено");

    expect(
      await screen.findByRole("button", { name: "Основные сведения: заполнено 4 из 4" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("public-field-item-status")).toHaveClass("is-filled");

    expect(screen.queryByRole("heading", { name: "Вложения" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Отправить на проверку/i }),
    ).not.toBeInTheDocument();
  });

  test("refreshes the public lifecycle status after the final required field is saved", async () => {
    editResponseMode = "deferred";
    preview.blocks[0].instances[0].fields[0] = {
      ...preview.blocks[0].instances[0].fields[0],
      required_mode: "required",
      value: "",
    };
    renderPage();

    expect(await screen.findByRole("status", { name: "Статус карточки" })).toHaveTextContent(
      "Черновик",
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Публичный статус" }), {
      target: { value: "Подтверждено" },
    });
    await waitFor(() => expect(editCalls()).toHaveLength(1));

    preview = { ...preview, lifecycle_status: "active" };
    resolveNextEdit("Подтверждено");

    await waitFor(() => expect(previewCalls()).toHaveLength(2));
    expect(await screen.findByRole("status", { name: "Статус карточки" })).toHaveTextContent(
      "Активна",
    );
    expect(screen.getByRole("textbox", { name: "Публичный статус" })).toHaveValue("Подтверждено");
  });

  test("renders active public fields without the attachments panel", async () => {
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Публичное заполнение карточки" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Публичное редактирование карточки" }),
    ).toBeInTheDocument();

    expect(screen.getByTestId("public-block-section-main")).toHaveStyle({
      gridColumn: "4 / span 6",
      gridRow: "2 / span 2",
    });
    expect(screen.getByTestId("public-field-item-status")).toHaveStyle({
      gridColumn: "1 / span 6",
      gridRow: "1 / span 1",
    });

    expect(screen.getByRole("textbox", { name: "Публичный статус" })).toHaveValue("drafted");
    expect(screen.getByRole("checkbox", { name: "Подтверждено" })).not.toBeChecked();
    expect(screen.getByRole("combobox", { name: "Категория" })).toHaveTextContent("Активная");
    expect(screen.queryByRole("textbox", { name: "Файл из карточки" })).not.toBeInTheDocument();

    expect(screen.queryByRole("heading", { name: "Вложения" })).not.toBeInTheDocument();
  });

  test("saves a public work-experience field from one inline control", async () => {
    preview.form_layout.sections[0].items.push(
      layoutItem("item-experience", "field-experience", 3, 1, 1, 6),
    );
    preview.blocks[0].instances[0].fields.push(
      previewField("field-experience", "experience", "Стаж работы", "work_experience", {
        days: 0,
        months: 0,
        years: 0,
        display: "0 дней 0 месяцев 0 лет",
      }),
    );

    renderPage();

    const experienceControl = await screen.findByRole("group", { name: "Стаж работы" });
    expect(
      within(experienceControl).getByRole("textbox", { name: "Стаж работы, дни" }),
    ).toHaveValue("0");
    setWorkExperiencePart(experienceControl, "days", "16");
    setWorkExperiencePart(experienceControl, "months", "3");
    setWorkExperiencePart(experienceControl, "years", "9");

    await waitFor(() => expect(editCalls()).toHaveLength(1));
    const lastRequest = editCalls().at(-1);
    expect(lastRequest?.body).toMatchObject({
      field_id: "field-experience",
      block_instance_id: "instance-main",
    });
    expect((lastRequest?.body as { value: unknown }).value).toEqual({
      days: 16,
      months: 3,
      years: 9,
    });
  });

  test("keeps the public card surface limited to safe fields and read-only metadata", async () => {
    preview.form_layout.sections[0].items.push(
      layoutItem("item-readonly", "field-readonly", 3, 1, 1, 6),
    );
    preview.blocks[0].instances[0].fields.push(
      previewField(
        "field-readonly",
        "readonly_note",
        "Только для просмотра",
        "text",
        "Значение, которое нельзя изменить",
        { public_editable: false },
      ),
    );

    renderPage();

    expect(
      await screen.findByRole("navigation", { name: "Содержание карточки" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("public-field-item-readonly")).toHaveTextContent(
      "Значение, которое нельзя изменить",
    );
    expect(screen.queryByRole("textbox", { name: "Только для просмотра" })).not.toBeInTheDocument();
    expect(screen.getByText("Публичный доступ").closest("details")).not.toHaveAttribute("open");
    expect(screen.queryByText("Архивировать карточку")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Организация карточки")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Шаблон карточки")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Вложения" })).not.toBeInTheDocument();
    expect(fetchCalls.some((call) => call.path === "/api/v1/public-links/attachments")).toBe(false);
  });

  test("renders a read-only public card base with status and no metadata actions", async () => {
    renderPage();

    const baseBlock = await screen.findByLabelText("Базовый блок");
    expect(within(baseBlock).getByText("Организация")).toBeInTheDocument();
    expect(within(baseBlock).getByText("Шаблон")).toBeInTheDocument();
    expect(within(baseBlock).getByText("Карточка")).toBeInTheDocument();
    expect(within(baseBlock).getByText("Администрация публичной карточки")).toBeInTheDocument();
    expect(within(baseBlock).getByText("Шаблон публичной карточки")).toBeInTheDocument();
    expect(within(baseBlock).getByText("Публичная карточка")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Статус карточки" })).toHaveTextContent("Черновик");
    expect(screen.getByText("Публичный доступ").closest("details")).not.toHaveAttribute("open");
    expect(screen.queryByRole("combobox", { name: "Организация" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Шаблон" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Создать публичную ссылку" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Публичный просмотр карточки")).not.toBeInTheDocument();
  });

  test("keeps the base and lifecycle status visible when no public fields are available", async () => {
    preview = {
      ...preview,
      blocks: [],
      form_layout: { ...preview.form_layout, sections: [] },
    };
    renderPage();

    const baseBlock = await screen.findByLabelText("Базовый блок");
    expect(within(baseBlock).getByText("Администрация публичной карточки")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Статус карточки" })).toHaveTextContent("Черновик");
    expect(
      screen.getByText("В этой публичной ссылке нет редактируемых полей."),
    ).toBeInTheDocument();
  });

  test("does not block public completion for a required server-read-only field", async () => {
    preview.form_layout.sections[0].items.push(
      layoutItem("item-readonly-required", "field-readonly-required", 3, 1, 1, 6),
    );
    preview.blocks[0].instances[0].fields.push(
      previewField(
        "field-readonly-required",
        "readonly_required",
        "Сведения администратора",
        "text",
        "",
        { public_editable: false, required_mode: "required" },
      ),
    );

    renderPage();

    expect(
      await screen.findByRole("button", {
        name: "Основные сведения: заполнено 4 из 5",
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("public-field-item-readonly-required")).toHaveClass("is-empty");
    expect(screen.getByTestId("public-field-item-readonly-required")).not.toHaveClass(
      "is-required-missing",
    );
  });

  test("renders public fields as one inline label and control row", async () => {
    renderPage();

    const fieldNode = await screen.findByTestId("public-field-item-status");

    expect(within(fieldNode).getAllByText("Публичный статус", { exact: true })).toHaveLength(1);
    expect(within(fieldNode).getByRole("textbox", { name: "Публичный статус" })).toHaveValue(
      "drafted",
    );
    expect(within(fieldNode).queryByText(/Текущее значение/)).not.toBeInTheDocument();
    expect(within(fieldNode).queryByText(/экземпляр 1/i)).not.toBeInTheDocument();
  });

  test("uses only previewed organization units and disables an archived selected value", async () => {
    preview.form_layout.sections[0].items.push(
      layoutItem("item-org-unit", "field-org-unit", 3, 1, 1, 6),
    );
    preview.blocks[0].instances[0].fields.push(
      previewField(
        "field-org-unit",
        "org_unit",
        "Подразделение организации",
        "org_unit_ref",
        "archived-local",
        {
          options: [
            { id: "management-local", code: "", label: "Управление образования", archived: false },
            { id: "archived-local", code: "", label: "Отдел кадров", archived: true },
          ],
        },
      ),
    );

    renderPage();

    const control = await screen.findByRole("group", { name: "Подразделение организации" });
    fireEvent.click(within(control).getByRole("combobox", { name: "Подразделение организации" }));
    expect(
      within(control).getByRole("option", { name: "Отдел кадров / Архивировано" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(within(control).getByRole("option", { name: "Управление образования" })).toBeEnabled();
    expect(
      within(control).getByRole("option", { name: "Отдел кадров / Архивировано" }),
    ).toBeDisabled();
    expect(
      within(control).queryByRole("button", { name: /другое подразделение/i }),
    ).not.toBeInTheDocument();
  });

  test.each(["explicit block allowlist", "legacy link"])(
    "renders static instructions from a %s preview without an editor",
    async (source) => {
      preview.form_layout.sections[0].items.push(
        layoutItem("item-instruction", "field-instruction", 3, 1, 1, 12),
      );
      preview.blocks[0].instances[0].fields.push(
        previewField(
          "field-instruction",
          "instruction",
          `Инструкция ${source}`,
          "static_text",
          null,
          { options_config_json: { static_text: "Заполните только доступные поля" } },
        ),
      );

      renderPage();

      expect(await screen.findByText("Заполните только доступные поля")).toBeInTheDocument();
      expect(screen.getByText(`Инструкция ${source}`)).toBeInTheDocument();
      expect(
        screen.queryByRole("textbox", { name: `Инструкция ${source}` }),
      ).not.toBeInTheDocument();
    },
  );

  test("shows the public field hint inside the filling control", async () => {
    preview.blocks[0].instances[0].fields[0].description = "Введите публичный статус";

    renderPage();

    expect(await screen.findByRole("textbox", { name: "Публичный статус" })).toHaveAttribute(
      "placeholder",
      "Введите публичный статус",
    );
  });

  test("serializes field autosaves without replacing the focused local draft", async () => {
    editResponseMode = "deferred";
    renderPage();
    const statusInput = await screen.findByRole("textbox", { name: "Публичный статус" });
    statusInput.focus();

    fireEvent.change(statusInput, { target: { value: "first" } });
    expect(await screen.findByText("Сохранение…")).toBeInTheDocument();
    await waitFor(() => expect(editCalls()).toHaveLength(1));

    fireEvent.change(statusInput, { target: { value: "latest" } });
    expect(statusInput).toHaveValue("latest");
    expect(editCalls()).toHaveLength(1);

    resolveNextEdit("first canonical");
    await waitFor(() => expect(editCalls()).toHaveLength(2));
    expect(statusInput).toHaveValue("latest");
    expect(screen.getByText("Сохранение…")).toBeInTheDocument();
    expect(screen.queryByText("Все изменения сохранены")).not.toBeInTheDocument();

    resolveNextEdit("latest canonical");
    expect(await screen.findByText("Все изменения сохранены")).toBeInTheDocument();
    expect(statusInput).toHaveFocus();
    expect(statusInput).toHaveValue("latest");
    expect(editCalls().map((call) => (call.body as { value: unknown }).value)).toEqual([
      "first",
      "latest",
    ]);
  });

  test("debounces a public date field and flushes it on blur", async () => {
    preview.form_layout.sections[0].items.push(
      layoutItem("item-public-date", "field-public-date", 3, 1, 1, 6),
    );
    preview.blocks[0].instances[0].fields.push(
      previewField("field-public-date", "public_date", "Публичная дата", "date", "2000-01-01"),
    );
    renderPage();

    const input = await screen.findByLabelText("Публичная дата");
    vi.useFakeTimers();
    try {
      fireEvent.change(input, { target: { value: "2001-02-03" } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(599);
      });
      expect(editCalls()).toHaveLength(0);

      fireEvent.blur(input);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(editCalls()).toHaveLength(1);
      expect(editCalls()[0].body).toMatchObject({
        field_id: "field-public-date",
        value: "2001-02-03",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  test("keeps a rejected local value visible and shows the server error", async () => {
    editResponseMode = "error";
    renderPage();
    const statusInput = await screen.findByRole("textbox", { name: "Публичный статус" });

    fireEvent.change(statusInput, { target: { value: "rejected locally" } });

    expect(await screen.findByText("Запрос не выполнен")).toBeInTheDocument();
    expect(statusInput).toHaveValue("rejected locally");
    expect(screen.queryByText("Все изменения сохранены")).not.toBeInTheDocument();
  });

  test("reports save errors and recovery under React StrictMode", async () => {
    editResponseMode = "error";
    renderPage(undefined, true);
    const statusInput = await screen.findByRole("textbox", { name: "Публичный статус" });

    fireEvent.change(statusInput, { target: { value: "strict rejected" } });
    expect(await screen.findByText("Запрос не выполнен")).toBeInTheDocument();

    editResponseMode = "success";
    fireEvent.change(statusInput, { target: { value: "strict recovered" } });
    expect(await screen.findByText("Все изменения сохранены")).toBeInTheDocument();
    expect(statusInput).toHaveValue("strict recovered");
  });

  test("renders and saves every explicit repeatable block instance in the same layout", async () => {
    const block = preview.blocks[0];
    block.is_repeatable = true;
    block.instances = [
      { ...block.instances[0], block_instance_id: "instance-main-1", ordinal: 0 },
      {
        ...block.instances[0],
        block_instance_id: "instance-main-2",
        ordinal: 1,
        fields: block.instances[0].fields.map((field) => ({
          ...field,
          value: field.field_id === "field-status" ? "second instance" : field.value,
        })),
      },
    ];

    renderPage();
    const statusInputs = await screen.findAllByRole("textbox", { name: "Публичный статус" });

    expect(statusInputs).toHaveLength(2);
    expect(statusInputs[0]).toHaveValue("drafted");
    expect(statusInputs[1]).toHaveValue("second instance");
    fireEvent.change(statusInputs[1], { target: { value: "updated second" } });
    await waitFor(() => expect(editCalls()).toHaveLength(1));
    expect(editCalls()[0].body).toMatchObject({
      block_instance_id: "instance-main-2",
      value: "updated second",
    });
  });

  test("shows a legacy review comment while leaving the card editable", async () => {
    status = safeStatus("changes_requested", {
      review_comment: "Уточните публичный статус",
      reviewed_at: "2026-07-10T10:30:00Z",
    });

    renderPage();

    expect(await screen.findByText("Уточните публичный статус")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Публичный статус" })).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: /Отправить на проверку/i }),
    ).not.toBeInTheDocument();
  });

  test.each([
    ["submitted", "Карточка отправлена на проверку"],
    ["approved", "Заполнение завершено"],
    ["disabled", "Доступ к карточке закрыт"],
    ["expired", "Срок действия ссылки истёк"],
  ] as const)(
    "never renders cached card or attachment data when status is %s",
    async (nextStatus, receiptTitle) => {
      status = safeStatus(nextStatus, {
        submitted_at: nextStatus === "submitted" ? "2026-07-10T10:00:00Z" : null,
        reviewed_at: nextStatus === "approved" ? "2026-07-10T11:00:00Z" : null,
      });
      const cachedPreview = {
        ...publicPreview(),
        display_name: "PRIVATE CACHED CARD",
      };
      const queryClient = renderPage((client) => {
        client.setQueryData(["public-link-preview", rawToken], cachedPreview);
        client.setQueryData(["public-link-attachments", rawToken], {
          ...attachments,
          items: [{ id: "private-attachment", title: "PRIVATE CACHED ATTACHMENT" }],
        });
      });

      expect(await screen.findByRole("heading", { name: receiptTitle })).toBeInTheDocument();
      expect(screen.queryByText("PRIVATE CACHED CARD")).not.toBeInTheDocument();
      expect(screen.queryByText("PRIVATE CACHED ATTACHMENT")).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Вложения" })).not.toBeInTheDocument();
      expect(fetchCalls.some((call) => call.path === "/api/v1/public-links/preview")).toBe(false);
      expect(fetchCalls.some((call) => call.path === "/api/v1/public-links/attachments")).toBe(
        false,
      );
      expect(queryClient.getQueryData(["public-link-status", rawToken])).toMatchObject({
        status: nextStatus,
      });
    },
  );

  test("does not render cached active card data while the authoritative status is revalidated", async () => {
    statusResponseMode = "deferred";
    const queryClient = renderPage((client) => {
      client.setQueryData(["public-link-status", rawToken], safeStatus("active"));
      client.setQueryData(["public-link-preview", rawToken], {
        ...publicPreview(),
        display_name: "PRIVATE STALE ACTIVE CARD",
      });
      client.setQueryData(["public-link-attachments", rawToken], {
        ...attachments,
        items: [
          {
            id: "private-stale-attachment",
            card_id: "private-card",
            title: "PRIVATE STALE ATTACHMENT",
            description: null,
            position: 0,
            original_filename: "private.txt",
            content_type: "text/plain",
            content_length_bytes: 7,
            scanner_status: "deferred",
            created_at: "2026-07-10T10:00:00Z",
            archived_at: null,
          },
        ],
      });
    });

    expect(screen.queryByText("PRIVATE STALE ACTIVE CARD")).not.toBeInTheDocument();
    expect(screen.queryByText("PRIVATE STALE ATTACHMENT")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Публичный статус" })).not.toBeInTheDocument();

    status = safeStatus("approved", { reviewed_at: "2026-07-10T11:00:00Z" });
    resolveNextStatus();

    expect(
      await screen.findByRole("heading", { name: "Заполнение завершено" }),
    ).toBeInTheDocument();
    expect(queryClient.getQueryData(["public-link-preview", rawToken])).toBeUndefined();
    expect(queryClient.getQueryData(["public-link-attachments", rawToken])).toBeUndefined();
  });

  test("always revalidates a fresh cached active status when the public page is revisited", async () => {
    status = safeStatus("approved", { reviewed_at: "2026-07-10T11:00:00Z" });
    renderPage((client) => {
      client.setQueryDefaults(["public-link-status"], {
        staleTime: Infinity,
        refetchOnMount: false,
      });
      client.setQueryData(["public-link-status", rawToken], safeStatus("active"));
    });

    expect(
      await screen.findByRole("heading", { name: "Заполнение завершено" }),
    ).toBeInTheDocument();
    expect(statusCalls()).toHaveLength(1);
    expect(fetchCalls.some((call) => call.path === "/api/v1/public-links/preview")).toBe(false);
    expect(fetchCalls.some((call) => call.path === "/api/v1/public-links/attachments")).toBe(false);
  });

  test("never trusts cached active data after status revalidation fails", async () => {
    statusResponseMode = "error";
    preview = { ...publicPreview(), display_name: "PRIVATE NETWORK PREVIEW" };
    const queryClient = renderPage((client) => {
      client.setQueryData(["public-link-status", rawToken], safeStatus("active"));
      client.setQueryData(["public-link-preview", rawToken], {
        ...publicPreview(),
        display_name: "PRIVATE FAILED CACHE",
      });
      client.setQueryData(["public-link-attachments", rawToken], {
        ...attachments,
        items: [{ ...publicAttachment(), title: "PRIVATE FAILED ATTACHMENT" }],
      });
    });

    expect(await screen.findByText("Запрос не выполнен")).toBeInTheDocument();
    expect(screen.queryByText("PRIVATE FAILED CACHE")).not.toBeInTheDocument();
    expect(screen.queryByText("PRIVATE NETWORK PREVIEW")).not.toBeInTheDocument();
    expect(screen.queryByText("PRIVATE FAILED ATTACHMENT")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Публичный статус" })).not.toBeInTheDocument();
    expect(fetchCalls.some((call) => call.path === "/api/v1/public-links/preview")).toBe(false);
    expect(fetchCalls.some((call) => call.path === "/api/v1/public-links/attachments")).toBe(false);
    expect(queryClient.getQueryData(["public-link-preview", rawToken])).toBeUndefined();
    expect(queryClient.getQueryData(["public-link-attachments", rawToken])).toBeUndefined();
  });

  test.each([["field", "/api/v1/public-links/edit"]] as const)(
    "refreshes status and purges card caches when %s action is denied by the lifecycle",
    async (action, denialPath) => {
      lifecycleDenialPath = denialPath;
      const queryClient = renderPage();
      const statusInput = await screen.findByRole("textbox", { name: "Публичный статус" });
      await waitFor(() => {
        expect(queryClient.getQueryData(["public-link-preview", rawToken])).toBeDefined();
      });

      fireEvent.change(statusInput, { target: { value: "denied edit" } });

      expect(
        await screen.findByRole("heading", { name: "Доступ к карточке закрыт" }),
      ).toBeInTheDocument();
      expect(statusCalls()).toHaveLength(2);
      expect(queryClient.getQueryData(["public-link-preview", rawToken])).toBeUndefined();
      expect(queryClient.getQueryData(["public-link-attachments", rawToken])).toBeUndefined();
    },
  );
});

function renderPage(setup?: (queryClient: QueryClient) => void, strict = false) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  setup?.(queryClient);
  const page: ReactNode = (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/public/edit/${rawToken}`]}>
        <Routes>
          <Route path="/public/edit/:rawToken" element={<PublicLinkEditPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  render(strict ? <StrictMode>{page}</StrictMode> : page);
  return queryClient;
}

async function handleFetch(input: RequestInfo | URL, init?: RequestInit) {
  const path = String(input);
  const method = init?.method ?? "GET";
  const body =
    init?.body && !(init.body instanceof FormData) ? JSON.parse(String(init.body)) : null;
  fetchCalls.push({ method, path, body });
  if (path === "/api/v1/public-links/status") {
    if (statusResponseMode === "deferred") {
      return new Promise<Response>((resolve) => deferredStatusResponses.push(resolve));
    }
    if (statusResponseMode === "error") {
      return jsonResponse({ detail: "Status unavailable" }, 503);
    }
    return jsonResponse(status);
  }
  if (path === "/api/v1/public-links/preview") return jsonResponse(preview);
  if (path === "/api/v1/public-links/attachments") return jsonResponse(attachments);
  if (path === lifecycleDenialPath) {
    status = safeStatus("disabled");
    return jsonResponse({ detail: "Public link is no longer editable" }, 409);
  }
  if (path === "/api/v1/public-links/attachments/upload")
    return jsonResponse(publicAttachment(), 201);
  if (path === "/api/v1/public-links/edit") {
    if (editResponseMode === "deferred") {
      return new Promise<Response>((resolve) => deferredEditResponses.push(resolve));
    }
    if (editResponseMode === "error") {
      return jsonResponse({ detail: "Значение не удалось сохранить" }, 400);
    }
    return jsonResponse({ value: (body as { value?: unknown })?.value });
  }
  if (path === "/api/v1/public-links/submit") {
    status = safeStatus("submitted", {
      submitted_at: "2026-07-10T10:00:00Z",
      completed_public_fields: 3,
      total_public_fields: 3,
    });
    return jsonResponse(status);
  }
  throw new Error(`Unexpected request: ${method} ${path}`);
}

function editCalls() {
  return fetchCalls.filter((call) => call.path === "/api/v1/public-links/edit");
}

function statusCalls() {
  return fetchCalls.filter((call) => call.path === "/api/v1/public-links/status");
}

function previewCalls() {
  return fetchCalls.filter((call) => call.path === "/api/v1/public-links/preview");
}

function resolveNextEdit(value: unknown) {
  const resolve = deferredEditResponses.shift();
  if (!resolve) throw new Error("No deferred edit request");
  resolve(jsonResponse({ value }));
}

function resolveNextStatus() {
  const resolve = deferredStatusResponses.shift();
  if (!resolve) throw new Error("No deferred status request");
  resolve(jsonResponse(status));
}

function safeStatus(
  nextStatus: PublicLinkSafeStatusRead["status"],
  overrides: Partial<PublicLinkSafeStatusRead> = {},
): PublicLinkSafeStatusRead {
  return {
    status: nextStatus,
    can_edit: nextStatus === "active" || nextStatus === "changes_requested",
    submitted_at: null,
    reviewed_at: null,
    review_comment: null,
    completed_public_fields: null,
    total_public_fields: null,
    ...overrides,
  };
}

function publicAttachment() {
  return {
    id: "uploaded-attachment",
    card_id: "card-public",
    title: "pending.txt",
    description: null,
    position: 0,
    original_filename: "pending.txt",
    content_type: "text/plain",
    content_length_bytes: 7,
    scanner_status: "deferred",
    created_at: "2026-07-10T10:00:00Z",
    archived_at: null,
  };
}

function publicPreview(): PublicLinkPreviewRead & { form_layout: PublicFormLayout } {
  return {
    card_id: "card-public",
    display_name: "Публичная карточка",
    organization_name: "Администрация публичной карточки",
    card_template_name: "Шаблон публичной карточки",
    lifecycle_status: "draft",
    expires_at: "2099-07-17T10:00:00Z",
    can_edit: true,
    form_layout: {
      columns: 12,
      sections: [
        {
          id: "section-main",
          block_id: "block-main",
          row: 2,
          column: 4,
          row_span: 2,
          column_span: 6,
          items: [
            layoutItem("item-status", "field-status", 1, 1, 1, 6),
            layoutItem("item-approved", "field-approved", 1, 7, 1, 6),
            layoutItem("item-category", "field-category", 2, 1, 1, 6),
            layoutItem("item-file", "field-file", 2, 7, 1, 6),
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
        layout_columns: 12,
        display_config_json: null,
        instances: [
          {
            block_instance_id: "instance-main",
            ordinal: 0,
            fields: [
              previewField("field-status", "status", "Публичный статус", "text", "drafted"),
              previewField("field-approved", "approved", "Подтверждено", "bool", false),
              previewField("field-category", "category", "Категория", "select", "option-active", {
                options: [{ id: "option-active", code: "active", label: "Активная" }],
              }),
              previewField("field-file", "file", "Файл из карточки", "file_ref", {
                attachment_id: "attachment-private-shape",
              }),
            ],
          },
        ],
      },
    ],
  } as PublicLinkPreviewRead & { form_layout: PublicFormLayout };
}

function previewField(
  field_id: string,
  code: string,
  label: string,
  field_type: string,
  value: unknown,
  overrides: Record<string, unknown> = {},
) {
  return {
    field_id,
    code,
    label,
    description: null,
    field_type,
    required_mode: "not_required",
    value,
    options_source_type: null,
    options_source_id: null,
    options_config_json: null,
    display_config_json: null,
    public_editable: true,
    options: [],
    ...overrides,
  };
}

function layoutItem(
  id: string,
  field_id: string,
  row: number,
  column: number,
  row_span: number,
  column_span: number,
) {
  return { id, kind: "field", field_id, row, column, row_span, column_span, text: null };
}

function jsonResponse(body: unknown, statusCode = 200) {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { "Content-Type": "application/json" },
  });
}

function setWorkExperiencePart(
  control: HTMLElement,
  part: "days" | "months" | "years",
  value: string,
) {
  const input = control.querySelector<HTMLInputElement>(
    `input[data-work-experience-part="${part}"]`,
  );
  if (!input) {
    throw new Error(`Missing ${part} work-experience fragment`);
  }
  fireEvent.change(input, { target: { value } });
}

type PublicFormLayout = {
  columns: number;
  sections: Array<{
    id: string;
    block_id: string;
    row: number;
    column: number;
    row_span: number;
    column_span: number;
    items: Array<{
      id: string;
      kind: string;
      field_id: string;
      row: number;
      column: number;
      row_span: number;
      column_span: number;
      text: null;
    }>;
  }>;
};
