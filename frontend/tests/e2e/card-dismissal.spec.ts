import { expect, test } from "@playwright/test";

test("creates without title and dismisses a card through the compact dialog", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const org = {
    id: "organization-1",
    parent_id: null,
    code: "org",
    name: "Тестовая организация",
    type: "organization",
    is_active: true,
  };
  const registry = {
    id: "registry-1",
    code: "registry",
    name: "Тестовый реестр",
    is_default_for_owner_tree: true,
    lifecycle_status: "active",
    schema_version: 1,
    owner_organization_id: org.id,
  };
  const field = {
    id: "field-fio",
    block_id: "block-1",
    code: "fio",
    label: "ФИО",
    field_type: "text",
    position: 0,
    is_active: true,
    is_list_display: true,
    required_mode: "required",
    public_visible: true,
    public_editable: true,
  };
  const block = {
    id: "block-1",
    registry_id: registry.id,
    code: "main",
    title: "Основные сведения",
    position: 0,
    is_active: true,
    is_repeatable: false,
    public_visible: true,
    public_editable: true,
    layout_columns: 12,
  };
  const template = {
    id: "template-1",
    registry_id: registry.id,
    code: "main",
    name: "Основная карточка",
    position: 0,
    is_active: true,
    field_schema_json: { field_ids: [field.id] },
    default_values_json: [],
  };
  let cards = [
    {
      id: "card-1",
      registry_id: registry.id,
      card_template_id: template.id,
      card_template_name: template.name,
      organization_id: org.id,
      org_unit_id: null,
      display_value: "Иванов Иван Иванович",
      lifecycle_status: "active",
      public_view_enabled: true,
      public_edit_enabled: true,
      list_fields: [],
    },
  ];
  cards.push({ ...cards[0], id: "card-2", display_value: "Петров Пётр Петрович" });
  const layout = {
    version: "card_template_layout_v1",
    revision: "qa",
    card_template_id: template.id,
    registry_id: registry.id,
    structure: { blocks: [block], fields: [field] },
    form_layout: {
      columns: 12,
      sections: [
        {
          id: "section-1",
          block_id: block.id,
          row: 1,
          column: 1,
          row_span: 1,
          column_span: 12,
          items: [
            {
              id: "item-fio",
              kind: "field",
              field_id: field.id,
              row: 1,
              column: 1,
              row_span: 1,
              column_span: 12,
            },
          ],
        },
      ],
    },
    print_views: [],
    export_settings: { formats: [] },
    sync_status: { has_errors: false, errors: [], warnings: [], mapping: {} },
  };
  const currentUser = {
    id: "user-1",
    email: "operator@example.test",
    display_name: "Тестовый оператор",
    status: "active",
    is_superuser: false,
  };
  const dismissalPayloads: unknown[] = [];
  const editPayloads: unknown[] = [];
  const draftPayloads: unknown[] = [];
  const statuses: (string | null)[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    let data: unknown = { items: [] };
    if (path.endsWith("/auth/login"))
      data = {
        access_token: "qa-token",
        token_type: "bearer",
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        user: currentUser,
      };
    else if (path.endsWith("/auth/me")) data = currentUser;
    else if (path.endsWith("/organizations")) data = { items: [org] };
    else if (path.endsWith("/registries")) data = { items: [registry] };
    else if (path.endsWith("/schema"))
      data = { registry, blocks: [block], fields: [field], templates: [template] };
    else if (path.endsWith("/cards")) {
      const status = url.searchParams.get("lifecycle_status");
      statuses.push(status);
      data = { items: cards.filter((card) => !status || status === card.lifecycle_status) };
    } else if (path.endsWith("/presentation"))
      data = {
        card_id: path.split("/").at(-2),
        registry_id: registry.id,
        registry_name: registry.name,
        card_template_id: template.id,
        card_template_name: template.name,
        layout,
      };
    else if (path.endsWith("/public-access"))
      data = {
        card_id: path.split("/").at(-2),
        public_view_enabled: true,
        public_edit_enabled: true,
        fields: [],
      };
    else if (path.endsWith("/change-notification-subscription")) data = { enabled: false };
    else if (path.endsWith("/values") && request.method() === "PATCH") {
      editPayloads.push(request.postDataJSON());
      data = { items: [] };
    } else if (path.endsWith("/dismissal")) {
      dismissalPayloads.push(request.postDataJSON());
      cards = cards.map((card) =>
        card.id === "card-1" ? { ...card, lifecycle_status: "dismissed" } : card,
      );
      data = cards[0];
    } else if (path.endsWith("/creation-preview"))
      data = {
        organization_id: org.id,
        card_template_id: template.id,
        display_value: "Не заполнено",
        blocks: [
          {
            block_id: block.id,
            code: block.code,
            title: block.title,
            is_repeatable: false,
            fields: [
              {
                field_id: field.id,
                code: field.code,
                label: field.label,
                field_type: "text",
                required_mode: "required",
                options: [],
              },
            ],
          },
        ],
      };
    else if (path.endsWith("/cards/draft")) {
      draftPayloads.push(request.postDataJSON());
      const draft = {
        ...cards[0],
        id: "draft-1",
        display_value: "Не заполнено",
        lifecycle_status: "draft",
      };
      cards = [...cards, draft];
      data = draft;
    } else if (/\/cards\/[^/]+$/.test(path)) {
      const card = cards.find((item) => item.id === path.split("/").at(-1))!;
      const value = {
        field_id: field.id,
        code: "fio",
        field_type: "text",
        value: card.lifecycle_status === "draft" ? null : card.display_value,
      };
      data = {
        ...card,
        can_manage: true,
        fields: { fio: value },
        blocks: {
          main: {
            block_id: block.id,
            code: "main",
            instances: [{ block_instance_id: null, ordinal: 0, fields: { fio: value } }],
          },
        },
      };
    }
    await route.fulfill({ json: data });
  });
  await page.goto("/");
  await expect(page).toHaveTitle("Реестровая система");
  await page.getByLabel("Логин, электронная почта").fill("operator@example.test");
  await page.getByLabel("Пароль", { exact: true }).fill("qa-password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await page.getByRole("button", { name: "Карточки", exact: true }).click();
  await page.getByRole("tab", { name: "Создать карточку" }).click();
  await expect(page.getByLabel("Организация карточки")).toHaveValue("");
  await expect(page.getByLabel("Наименование карточки")).toHaveCount(0);
  await expect(page.getByLabel("Шаблон карточки")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Сохранить черновик" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Заполнить поле ФИО" })).toBeVisible();
  await page.getByLabel("Организация карточки").selectOption(org.id);
  await page.getByRole("button", { name: "Сохранить черновик" }).click();
  await expect(page.getByRole("tab", { name: "Не заполнено", exact: true })).toBeVisible();
  expect(draftPayloads).toEqual([
    { public_access: { public_view_enabled: true, public_edit_enabled: true, fields: [] } },
  ]);
  await page.getByRole("tab", { name: "Список карточек" }).click();
  await page.getByLabel("Статус карточек").selectOption("active");
  await page.getByRole("button", { name: /Иванов Иван Иванович/ }).dblclick();
  await expect(page.getByRole("button", { name: /Архивировать карточку/ })).toHaveCount(0);
  await page.getByTestId("filled-field-item-fio").click();
  await page.getByLabel("ФИО", { exact: true }).fill("Иванов Пётр Иванович");
  await expect(page.getByRole("button", { name: "Сохранить блок", exact: true })).toBeDisabled();
  await page.getByLabel("Основание изменения").fill("  Приказ об изменении  ");
  await page.getByLabel("Дата события (необязательно)").fill("2026-09-08");
  expect(editPayloads).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("basis-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Основание изменения").scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("basis-mobile.png") });
  await page.getByRole("button", { name: "Сохранить блок", exact: true }).click();
  await expect(page.getByLabel("Основание изменения")).toHaveCount(0);
  expect(editPayloads).toEqual([
    {
      values: [{ field_id: field.id, value: "Иванов Пётр Иванович", block_instance_id: null }],
      basis_text: "Приказ об изменении",
      occurred_on: "2026-09-08",
    },
  ]);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole("button", { name: "Уволить", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Увольнение" });
  await expect(dialog.getByRole("button", { name: "Уволить", exact: true })).toBeDisabled();
  await dialog.getByLabel("Дата увольнения").fill("2026-09-09");
  await dialog.getByLabel("Основание").fill("Приказ № 7");
  await page.screenshot({ path: testInfo.outputPath("dismissal-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog).toBeVisible();
  const bounds = await dialog.locator(".admin-mutation-dialog-surface").boundingBox();
  expect(bounds!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath("dismissal-mobile.png") });
  await dialog.getByRole("button", { name: "Уволить", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(dismissalPayloads).toEqual([{ occurred_on: "2026-09-09", basis_text: "Приказ № 7" }]);
  await expect(page.getByRole("tab", { name: "Список карточек" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("tab", { name: "Иванов Иван Иванович", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Петров Пётр Петрович/ })).toBeVisible();
  await expect(page.getByRole("status", { name: "Статус карточки" })).toHaveCount(0);
  await page.getByLabel("Статус карточек").selectOption("dismissed");
  expect((await page.getByLabel("Статус карточек").boundingBox())!.height).toBeGreaterThanOrEqual(
    36,
  );
  const row = page
    .locator(".selectable-list")
    .getByRole("button", { name: /Иванов Иван Иванович/ });
  await expect(row).toHaveClass(/is-dismissed/);
  await expect(row.locator("strong")).toHaveCSS("color", "rgb(153, 27, 27)");
  await expect(
    page.locator(".selectable-list").getByRole("button", { name: /Не заполнено/ }),
  ).toHaveCount(0);
  expect(statuses).toContain("dismissed");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: testInfo.outputPath("dismissed-list.png") });
  await row.dblclick();
  await expect(page.getByRole("status", { name: "Статус карточки" })).toHaveText("Уволен");
  expect(errors).toEqual([]);
});
