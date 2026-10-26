import { expect, test } from "@playwright/test";

test("sorts through list requests and preserves settings on desktop and mobile", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const requests: URL[] = [];
  let dateUnavailable = false;
  let readOnly = false;
  let unrelatedError = false;
  const org = {
    id: "org-1",
    name: "Тестовая организация",
    code: "org",
    parent_id: null,
    type: "organization",
    is_active: true,
  };
  const registry = {
    id: "reg-1",
    name: "Реестр",
    code: "reg",
    is_default_for_owner_tree: true,
    owner_organization_id: org.id,
    lifecycle_status: "active",
    schema_version: 1,
  };
  const user = {
    id: "user-1",
    email: "qa",
    display_name: "Проверяющий",
    status: "active",
    is_superuser: false,
    can_manage_access: false,
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
  };
  const fields = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      block_id: block.id,
      code: "fio",
      label: "ФИО",
      field_type: "text",
      is_active: true,
      is_list_display: true,
      required_mode: "required",
      position: 0,
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      block_id: block.id,
      code: "date",
      label: "Дата события",
      field_type: "date",
      is_active: true,
      is_list_display: true,
      required_mode: "not_required",
      position: 1,
    },
  ];
  const template = {
    id: "template-1",
    registry_id: registry.id,
    code: "main",
    name: "Основной",
    is_active: true,
    position: 0,
    field_schema_json: { field_ids: fields.map((field) => field.id) },
    default_values_json: [],
  };
  const cards = ["Борисов Борис", "Антонов Антон", "Яковлев Яков"].map((name, index) => ({
    id: `card-${index}`,
    display_value: name,
    registry_id: registry.id,
    organization_id: org.id,
    card_template_id: template.id,
    card_template_name: template.name,
    lifecycle_status: "active",
    public_view_enabled: true,
    public_edit_enabled: true,
    list_fields: [],
  }));
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
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
    else if (path.endsWith("/presentation"))
      data = {
        card_id: path.split("/").at(-2),
        layout: {
          structure: { fields, blocks: [block] },
          form_layout: { columns: 12, sections: [] },
          print_views: [],
        },
      };
    else if (path.endsWith("/cards")) {
      requests.push(url);
      if (unrelatedError || (dateUnavailable && url.searchParams.get("sort_by") === "field")) {
        await route.fulfill({ status: 400, json: { detail: "Поле сортировки недоступно" } });
        return;
      }
      let list = [...cards];
      if (url.searchParams.get("sort_by") === "display_value")
        list.sort((a, b) => a.display_value.localeCompare(b.display_value, "ru"));
      if (url.searchParams.get("sort_by") === "field") list = [cards[2], cards[0], cards[1]];
      if (url.searchParams.get("sort_direction") === "desc") list.reverse();
      data = { items: list };
    } else if (/\/cards\/[^/]+$/.test(path))
      data = {
        ...cards.find((card) => card.id === path.split("/").at(-1)),
        can_manage: !readOnly,
        blocks: {},
        fields: {},
      };
    await route.fulfill({ json: data });
  });
  await page.goto(process.env.REG_ENGINE_QA_BASE_URL || "/");
  await page.getByLabel("Логин, электронная почта").fill("qa");
  await page.getByLabel("Пароль", { exact: true }).fill("qa-password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await page.getByRole("button", { name: "Карточки", exact: true }).click();
  const sort = page.getByRole("combobox", { name: "Сортировка", exact: true });
  const direction = page.getByLabel("Направление сортировки");
  const titles = page.locator(".selectable-list strong");
  await expect(direction).toBeDisabled();
  await sort.selectOption("display_value");
  await expect(titles).toHaveText(["Антонов Антон", "Борисов Борис", "Яковлев Яков"]);
  await direction.selectOption("desc");
  await expect(titles).toHaveText(["Яковлев Яков", "Борисов Борис", "Антонов Антон"]);
  await sort.selectOption(fields[1].id);
  await expect(titles).toHaveText(["Антонов Антон", "Борисов Борис", "Яковлев Яков"]);
  expect(requests.at(-1)?.searchParams.get("sort_field_id")).toBe(fields[1].id);
  await page.getByLabel("Статус карточек").selectOption("active");
  await expect.poll(() => requests.at(-1)?.searchParams.get("lifecycle_status")).toBe("active");
  expect(requests.at(-1)?.searchParams.get("sort_field_id")).toBe(fields[1].id);
  await page.reload();
  await expect(sort).toHaveValue(fields[1].id);
  await expect(direction).toHaveValue("desc");
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(sort).toBeVisible();
    await expect(direction).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await page.screenshot({
      path: `C:/Temp/reg-engine-sorting-${viewport.width}.png`,
      fullPage: true,
    });
  }
  dateUnavailable = true;
  await page.reload();
  await expect(sort).toHaveValue("");
  await expect(direction).toBeDisabled();
  await expect(titles).toHaveText(cards.map((card) => card.display_value));
  expect(errors).toEqual([]);
  await expect(page.locator(".data-alert")).toHaveCount(0);
  readOnly = true;
  dateUnavailable = false;
  await page.reload();
  await expect(sort.getByRole("option", { name: "Дата события — Основные сведения" })).toHaveCount(
    1,
  );
  await sort.selectOption(fields[1].id);
  await expect.poll(() => requests.at(-1)?.searchParams.get("sort_field_id")).toBe(fields[1].id);
  unrelatedError = true;
  await page.reload();
  await expect(page.locator(".data-alert").first()).toBeVisible();
  await expect(sort).toHaveValue(fields[1].id);
  unrelatedError = false;
  await page.reload();
  await expect(sort).toHaveValue(fields[1].id);
  await expect(titles).toHaveCount(3);
  await expect(page.locator(".data-alert")).toHaveCount(0);
});
