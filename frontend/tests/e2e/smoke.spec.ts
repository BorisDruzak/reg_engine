import { expect, test } from "@playwright/test";

test("renders the Registry Engine landing shell", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Registry Engine" })).toBeVisible();
  await expect(page.getByText(/schema-driven registry platform foundation/i)).toBeVisible();
});
