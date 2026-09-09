import { expect, test } from "@playwright/test";

test("public demoted card saves only with a basis and resets after cancellation", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const writes: unknown[] = [];
  let value = "Первое значение";
  await page.route("**/api/v1/public-links/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown;
    if (path.endsWith("/status"))
      data = {
        status: "active",
        can_edit: true,
        submitted_at: null,
        reviewed_at: null,
        review_comment: null,
        completed_public_fields: null,
        total_public_fields: null,
      };
    else if (path.endsWith("/edit")) {
      const body = route.request().postDataJSON();
      writes.push(body);
      value = body.value;
      data = { value };
    } else
      data = {
        card_id: "card-qa",
        display_value: "Тестовая карточка",
        organization_name: "Тестовая организация",
        card_template_name: "Основная карточка",
        lifecycle_status: "draft",
        activated_at: "2026-09-01T00:00:00Z",
        can_edit: true,
        expires_at: null,
        form_layout: {
          columns: 12,
          sections: [
            {
              id: "section-1",
              block_id: "block-1",
              row: 1,
              column: 1,
              row_span: 1,
              column_span: 12,
              items: [
                {
                  id: "item-1",
                  field_id: "field-1",
                  kind: "field",
                  row: 1,
                  column: 1,
                  row_span: 1,
                  column_span: 12,
                },
              ],
            },
          ],
        },
        blocks: [
          {
            block_id: "block-1",
            code: "main",
            title: "Основные сведения",
            is_repeatable: false,
            instances: [
              {
                block_instance_id: null,
                ordinal: 0,
                fields: [
                  {
                    field_id: "field-1",
                    code: "note",
                    label: "Примечание",
                    description: null,
                    field_type: "text",
                    required_mode: "not_required",
                    value,
                    options_source_type: null,
                    options_source_id: null,
                    options: [],
                    public_editable: true,
                  },
                ],
              },
            ],
          },
        ],
      };
    await route.fulfill({ json: data });
  });
  await page.goto("/public/edit/qa-token");
  await expect(page).toHaveTitle("Реестровая система");
  await expect(page.getByRole("heading", { name: "Тестовая карточка" })).toBeVisible();
  await page.getByLabel("ФИО", { exact: true }).fill("Иванов Иван");
  await page.getByLabel("Примечание", { exact: true }).fill("Новое значение");
  await page.getByLabel("Примечание", { exact: true }).blur();
  await expect(page.getByRole("button", { name: "Сохранить изменение" })).toBeDisabled();
  await page.getByLabel("Основание изменения").fill("  Приказ 47  ");
  expect(writes).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("public-basis-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Основание изменения").scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("public-basis-mobile.png") });
  await page.getByRole("button", { name: "Сохранить изменение" }).click();
  await expect(page.getByLabel("Основание изменения")).toHaveCount(0);
  expect(writes).toEqual([
    {
      raw_token: "qa-token",
      actor_name: "Иванов Иван",
      field_id: "field-1",
      value: "Новое значение",
      block_instance_id: null,
      basis_text: "Приказ 47",
    },
  ]);
  await page.getByLabel("Примечание", { exact: true }).fill("Отменённое значение");
  await page.getByRole("button", { name: "Отмена" }).click();
  await expect(page.getByLabel("Примечание", { exact: true })).toHaveValue("Новое значение");
  expect(writes).toHaveLength(1);
  expect(errors).toEqual([]);
});
