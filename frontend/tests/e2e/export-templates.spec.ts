import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("persists ordered export templates and downloads for an explicitly selected organization", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  const downloads: unknown[] = [];
  const writes: unknown[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const user = {
    id: "user-qa",
    email: "admin@example.test",
    display_name: "Тестовый администратор",
    status: "active",
    is_superuser: true,
  };
  const organization = {
    id: "org-qa",
    code: "qa",
    name: "Тестовая организация",
    is_active: true,
    parent_id: null,
    type: "organization",
  };
  const registry = {
    id: "registry-qa",
    code: "qa",
    name: "Тестовый реестр",
    lifecycle_status: "active",
    schema_version: 1,
    owner_organization_id: organization.id,
    is_default_for_owner_tree: true,
  };
  const options = {
    registry_id: registry.id,
    organizations: [{ ...organization, label: organization.name }],
    templates: [
      {
        id: "template-qa",
        name: "Основной шаблон",
        fio_field_id: "fio",
        fields: [
          "ФИО",
          "Должность",
          "Подразделение",
          "Дата назначения",
          "Основание назначения",
        ].map((label, index) => ({
          id: index === 0 ? "fio" : `field-${index}`,
          label,
          block_title: "Основные сведения",
          field_type: index === 3 ? "date" : "text",
          supported: true,
          unsupported_reason: null,
        })),
      },
    ],
  };
  let stored: Record<string, unknown> | null = null;
  const downloadBytes = "synthetic export response bytes";
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let data: unknown = { items: [] };
    if (path.endsWith("/auth/login"))
      data = {
        access_token: "qa-token",
        token_type: "bearer",
        expires_at: "2099-01-01T00:00:00Z",
        user,
      };
    else if (path.endsWith("/auth/me")) data = user;
    else if (path.endsWith("/organizations")) data = { items: [organization] };
    else if (path.endsWith("/registries")) data = { items: [registry] };
    else if (path.endsWith("/schema")) data = { registry, blocks: [], fields: [], templates: [] };
    else if (path.endsWith("/tabular-xlsx-card-exchange/options")) data = options;
    else if (path.endsWith("/card-export-templates") && request.method() === "GET")
      data = { items: stored ? [stored] : [] };
    else if (
      (path.endsWith("/card-export-templates") && request.method() === "POST") ||
      (path.endsWith("/card-export-templates/export-qa") && request.method() === "PATCH")
    ) {
      writes.push(request.postDataJSON());
      stored = {
        ...request.postDataJSON(),
        id: "export-qa",
        registry_id: registry.id,
        archived_at: null,
        created_at: "2026-09-09T00:00:00Z",
        updated_at: "2026-09-09T00:00:00Z",
      };
      data = stored;
    } else if (path.endsWith("/card-export-templates/export-qa/download")) {
      downloads.push(request.postDataJSON());
      await route.fulfill({
        body: downloadBytes,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers: {
          "X-Document-Filename": "registry-export.xlsx",
          "Content-Disposition": 'attachment; filename="registry-export.xlsx"',
        },
      });
      return;
    }
    await route.fulfill({ json: data });
  });
  await page.goto("/");
  await expect(page).toHaveTitle("Реестровая система");
  await page.getByLabel("Логин, электронная почта").fill(user.email);
  await page.getByLabel("Пароль", { exact: true }).fill("qa-password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await page.getByRole("button", { name: "Реестры", exact: true }).click();
  await page.getByRole("tab", { name: "Импорт и экспорт", exact: true }).click();
  await page.getByRole("tab", { name: "Шаблоны выгрузки", exact: true }).click();
  await page.getByLabel("Название шаблона выгрузки").fill("Список подразделения");
  await page.getByLabel("Шаблон карточки для выгрузки").selectOption("template-qa");
  await page.getByLabel("Добавить колонку").selectOption("field-1");
  await page.getByLabel("Добавить колонку").selectOption("field-2");
  await page.getByRole("button", { name: "Поднять Подразделение" }).click();
  await page.getByRole("button", { name: "Сохранить шаблон выгрузки" }).click();
  await expect(page.getByRole("status")).toHaveText("Шаблон выгрузки сохранён");
  expect(writes[0]).toMatchObject({
    configuration_json: { field_ids: ["fio", "field-2", "field-1"] },
  });
  await page.reload();
  await page.getByRole("button", { name: "Реестры", exact: true }).click();
  await page.getByRole("tab", { name: "Импорт и экспорт", exact: true }).click();
  await page.getByRole("tab", { name: "Шаблоны выгрузки", exact: true }).click();
  await page.getByLabel("Сохранённый шаблон выгрузки").selectOption("export-qa");
  await expect(page.getByLabel("Название шаблона выгрузки")).toHaveValue("Список подразделения");
  await expect(
    page.getByRole("list", { name: "Порядок колонок" }).getByRole("listitem").nth(1),
  ).toContainText("Подразделение");
  await expect(page.getByLabel("Организация для выгрузки")).toHaveValue("");
  await page.screenshot({ path: testInfo.outputPath("export-desktop.png"), fullPage: true });
  await page.getByLabel("Организация для выгрузки").selectOption("org-qa");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать XLSX" }).click();
  const file = await downloadPromise;
  expect(file.suggestedFilename()).toBe("registry-export.xlsx");
  expect(await readFile((await file.path())!, "utf8")).toBe(downloadBytes);
  expect(downloads).toEqual([{ organization_id: "org-qa" }]);
  await page.getByLabel("Вид выгрузки").selectOption("personnel_changes");
  for (const [label, id] of [
    ["Поле должности", "field-1"],
    ["Поле подразделения", "field-2"],
    ["Поле даты назначения", "field-3"],
    ["Поле основания назначения", "field-4"],
  ])
    await page.getByLabel(label).selectOption(id);
  await page.getByRole("button", { name: "Сохранить шаблон выгрузки" }).click();
  await expect(page.getByRole("status")).toHaveText("Шаблон выгрузки сохранён");
  await page.getByLabel("Организация для выгрузки").selectOption("org-qa");
  await page.getByLabel("Начало периода").fill("2026-09-09");
  await page.getByLabel("Конец периода").fill("2026-09-09");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Поле должности").scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("export-mobile.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const personnelDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать XLSX" }).click();
  await personnelDownload;
  expect(downloads[1]).toEqual({
    organization_id: "org-qa",
    period_from: "2026-09-09",
    period_to: "2026-09-09",
  });
  expect(errors).toEqual([]);
});
