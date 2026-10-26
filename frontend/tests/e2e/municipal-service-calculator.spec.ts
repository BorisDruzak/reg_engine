import { expect, test } from "@playwright/test";

test("keeps manual input, dated manual recalculation and period calculator independent", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const org = {
    id: "org-1",
    name: "Тестовая организация",
    code: "org",
    parent_id: null,
    type: "organization",
    is_active: true,
  };
  const registry = {
    id: "registry-1",
    name: "Реестр",
    code: "reg",
    is_default_for_owner_tree: true,
    owner_organization_id: org.id,
    lifecycle_status: "active",
    schema_version: 1,
  };
  const block = {
    id: "block-1",
    registry_id: registry.id,
    code: "main",
    title: "Сведения",
    position: 0,
    is_active: true,
    is_repeatable: false,
    public_visible: true,
    public_editable: true,
  };
  const fields = [
    {
      id: "field-fio",
      block_id: block.id,
      code: "fio",
      label: "ФИО",
      field_type: "text",
      position: 0,
      is_active: true,
      required_mode: "required",
      is_list_display: true,
    },
    {
      id: "field-start",
      block_id: block.id,
      code: "start",
      label: "Дата поступления",
      field_type: "date",
      position: 1,
      is_active: true,
      required_mode: "not_required",
    },
    {
      id: "field-exp",
      block_id: block.id,
      code: "experience",
      label: "Стаж муниципальной службы",
      field_type: "work_experience",
      position: 2,
      is_active: true,
      required_mode: "not_required",
      options_config_json: {
        municipal_service_calculator: true,
        municipal_service_start_date_field_id: "field-start",
      },
    },
  ];
  const template = {
    id: "template-1",
    registry_id: registry.id,
    code: "main",
    name: "Основной",
    position: 0,
    is_active: true,
    field_schema_json: { field_ids: fields.map((f) => f.id) },
    default_values_json: [],
  };
  const layout = {
    version: "card_template_layout_v1",
    revision: "qa",
    card_template_id: template.id,
    registry_id: registry.id,
    structure: { blocks: [block], fields },
    form_layout: {
      columns: 12,
      sections: [
        {
          id: "section",
          block_id: block.id,
          row: 1,
          column: 1,
          row_span: 3,
          column_span: 12,
          items: fields.map((f, index) => ({
            id: `item-${f.code}`,
            kind: "field",
            field_id: f.id,
            row: index + 1,
            column: 1,
            row_span: 1,
            column_span: 12,
          })),
        },
      ],
    },
    print_views: [],
    export_settings: { formats: [] },
    sync_status: { has_errors: false, errors: [], warnings: [], mapping: {} },
  };
  const user = {
    id: "user-1",
    email: "qa",
    display_name: "Тестовый оператор",
    status: "active",
    is_superuser: true,
    can_manage_access: true,
  };
  const card = {
    id: "card-1",
    registry_id: registry.id,
    organization_id: org.id,
    card_template_id: template.id,
    card_template_name: template.name,
    display_value: "Тестовая карточка",
    lifecycle_status: "active",
    activated_at: "2026-01-01T00:00:00Z",
    public_view_enabled: true,
    public_edit_enabled: true,
    creator_display_name: user.display_name,
    list_fields: [],
  };
  let calculation: Record<string, unknown> | null = null;
  let manualInput: { years: number; months: number; days: number } | null = null;
  let manualDate: string | null = null;
  let manualValue = { days: 0, months: 0, years: 1, display: "0 дней 0 месяцев 1 год" };
  let revision = 1;
  const savedManual: Record<string, unknown>[] = [];
  const savedCalculations: Record<string, unknown>[] = [];
  const summary = () =>
    calculation
      ? { days: 0, months: 0, years: 3, display: "0 дней 0 месяцев 3 года", mode: "calculated" }
      : manualValue;
  const result = () => ({
    value: summary(),
    as_of_date: "2026-10-26",
    server_date: "2026-10-26",
    forecast: false,
    included_count: 2,
    excluded_count: 0,
    review_count: 0,
    overlaps: [],
    warnings: [],
    can_save: true,
  });
  const source = () => ({
    calculation,
    result: calculation ? result() : null,
    manual_value: calculation ? null : manualValue,
    manual_input: manualInput,
    manual_as_of_date: manualDate,
    source_date: "2026-01-01",
    server_date: "2026-10-26",
    can_manage: true,
    revision: `revision-${revision}`,
  });
  await page.route("**/favicon.ico", (route) => route.fulfill({ status: 204 }));
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    let data: unknown = { items: [] };
    if (path.endsWith("/auth/login"))
      data = {
        access_token: "qa-token",
        token_type: "bearer",
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        user,
      };
    else if (path.endsWith("/auth/me")) data = user;
    else if (path.endsWith("/organizations")) data = { items: [org] };
    else if (path.endsWith("/registries")) data = { items: [registry] };
    else if (path.endsWith("/schema"))
      data = { registry, blocks: [block], fields, templates: [template] };
    else if (path.endsWith("/cards")) data = { items: [card] };
    else if (path.endsWith("/presentation")) data = { card_id: card.id, layout };
    else if (path.endsWith("/public-access"))
      data = { card_id: card.id, fields: [], public_view_enabled: true, public_edit_enabled: true };
    else if (path.endsWith("/municipal-service-experience/manual-preview"))
      data = {
        value: { days: 25, months: 9, years: 1, display: "25 дней 9 месяцев 1 год" },
        server_date: "2026-10-26",
        as_of_date: "2026-01-01",
      };
    else if (path.endsWith("/municipal-service-experience/manual")) {
      const payload = route.request().postDataJSON();
      savedManual.push(payload);
      manualInput = { days: payload.days, months: payload.months, years: payload.years };
      manualDate = payload.as_of_date;
      manualValue = { days: 25, months: 9, years: 1, display: "25 дней 9 месяцев 1 год" };
      calculation = null;
      revision++;
      data = source();
    } else if (path.endsWith("/municipal-service-experience/preview")) {
      data = {
        ...result(),
        value: { days: 0, months: 0, years: 3, display: "0 дней 0 месяцев 3 года" },
      };
    } else if (path.endsWith("/municipal-service-experience")) {
      if (method === "PUT") {
        const payload = route.request().postDataJSON();
        savedCalculations.push(payload);
        calculation = payload.calculation;
        revision++;
      }
      data = source();
    } else if (/\/cards\/[^/]+$/.test(path)) {
      const values = {
        fio: { field_id: fields[0].id, code: "fio", field_type: "text", value: card.display_value },
        start: { field_id: fields[1].id, code: "start", field_type: "date", value: "2026-01-01" },
        experience: {
          field_id: fields[2].id,
          code: "experience",
          field_type: "work_experience",
          value: summary(),
        },
      };
      data = {
        ...card,
        can_manage: true,
        fields: values,
        blocks: {
          main: {
            block_id: block.id,
            code: "main",
            instances: [{ block_instance_id: null, ordinal: 0, fields: values }],
          },
        },
      };
    }
    await route.fulfill({ json: data });
  });
  await page.goto(process.env.REG_ENGINE_QA_BASE_URL || "/");
  await page.getByLabel("Логин, электронная почта").fill("qa");
  await page.getByLabel("Пароль", { exact: true }).fill("qa-password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await page.getByRole("button", { name: "Карточки", exact: true }).click();
  await page.getByRole("button", { name: /Тестовая карточка/ }).dblclick();
  const calculatorButton = page.getByRole("button", {
    name: "Калькулятор: Стаж муниципальной службы",
  });
  await expect(calculatorButton).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Стаж на текущую дату", exact: true }),
  ).toBeVisible();
  await page.getByTestId("filled-field-item-experience").click();
  await expect(
    page.getByRole("textbox", { name: "Стаж муниципальной службы, дни", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Отмена", exact: true }).click();
  await page.getByRole("button", { name: "Стаж на текущую дату", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Пересчёт стажа на текущую дату" });
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 1072, height: 884 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expect
      .poll(() =>
        dialog.locator(".admin-mutation-dialog-surface").evaluate((surface) => {
          const bounds = surface.getBoundingClientRect();
          return (
            surface.scrollWidth <= surface.clientWidth &&
            Array.from(surface.querySelectorAll("input, textarea, button")).every(
              (control) => control.getBoundingClientRect().right <= bounds.right,
            )
          );
        }),
      )
      .toBe(true);
    await expect(dialog.getByRole("button", { name: "Закрыть", exact: true })).toBeInViewport();
    if (viewport.width !== 1072)
      await page.screenshot({
        path: `C:/Temp/reg-engine-manual-${viewport.width === 390 ? "mobile" : "desktop"}.png`,
      });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await dialog
    .getByRole("checkbox", { name: "Подтверждаю, что указанный стаж был на выбранную дату" })
    .check();
  await dialog
    .getByRole("textbox", { name: "Основание изменения", exact: true })
    .fill("Проверка исходного стажа");
  await dialog.getByRole("button", { name: "Применить пересчёт" }).click();
  await expect(dialog).toHaveCount(0);
  expect(savedManual).toHaveLength(1);
  expect(savedManual[0]).toMatchObject({
    days: 0,
    months: 0,
    years: 1,
    as_of_date: "2026-01-01",
    confirm_manual: false,
  });
  expect(calculation).toBeNull();
  await page.reload();
  await page.getByRole("button", { name: "Стаж на текущую дату", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Пересчёт стажа на текущую дату" });
  await expect(
    dialog.getByRole("textbox", { name: "Исходный стаж, годы", exact: true }),
  ).toHaveValue("1");
  await expect(
    dialog.getByRole("textbox", { name: "Исходный стаж, месяцы", exact: true }),
  ).toHaveValue("0");
  await dialog.getByRole("button", { name: "Закрыть", exact: true }).click();
  await calculatorButton.click();
  dialog = page.getByRole("dialog", { name: "Расчёт стажа муниципальной службы" });
  await expect(dialog.getByText("Периоды ещё не добавлены")).toBeVisible();
  for (const index of [1, 2]) {
    await dialog.getByRole("button", { name: "Добавить период", exact: true }).click();
    await dialog
      .getByRole("textbox", { name: `Начало периода ${index}`, exact: true })
      .fill(`01.01.${2023 + index}`);
    await dialog
      .getByRole("textbox", { name: `Окончание периода ${index}`, exact: true })
      .fill(`31.12.${2023 + index}`);
    await dialog
      .getByRole("textbox", { name: `Основание периода ${index}`, exact: true })
      .fill("Подтверждающий документ");
    await dialog
      .getByRole("checkbox", { name: `Подтверждён, период ${index}`, exact: true })
      .check();
    if (index === 2)
      await dialog
        .getByRole("combobox", { name: `Категория периода ${index}`, exact: true })
        .selectOption("military_conscription");
  }
  await dialog
    .getByRole("textbox", { name: "Основание изменения", exact: true })
    .fill("Расчёт по документам");
  await expect(dialog.getByText("0 дней 0 месяцев 3 года", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 800 });
  await dialog
    .getByRole("button", { name: "Сохранить расчёт", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(dialog.getByRole("button", { name: "Закрыть", exact: true })).toBeInViewport();
  await page.screenshot({ path: "C:/Temp/reg-engine-calculator-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".admin-mutation-dialog-surface").evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect(dialog.getByRole("button", { name: "Закрыть", exact: true })).toBeInViewport();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await page.screenshot({ path: "C:/Temp/reg-engine-calculator-mobile.png" });
  await dialog.getByRole("button", { name: "Сохранить расчёт", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(savedCalculations).toHaveLength(1);
  expect((savedCalculations[0].calculation as { periods: unknown[] }).periods).toHaveLength(2);
  await page.reload();
  await calculatorButton.click();
  dialog = page.getByRole("dialog", { name: "Расчёт стажа муниципальной службы" });
  await expect(dialog.getByRole("textbox", { name: "Начало периода 1", exact: true })).toHaveValue(
    "01.01.2024",
  );
  await expect(
    dialog.getByRole("combobox", { name: "Категория периода 2", exact: true }),
  ).toHaveValue("military_conscription");
  await dialog.getByRole("button", { name: "Закрыть", exact: true }).click();
  await expect(page.getByRole("button", { name: "Стаж на текущую дату", exact: true })).toHaveCount(
    0,
  );
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  expect(errors).toEqual([]);
});
