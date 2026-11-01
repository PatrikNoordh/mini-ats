import { expect, test } from "@playwright/test";

import { E2E_CUSTOMER_A, E2E_PASSWORD } from "../scripts/e2e-data.ts";
import sv from "../src/locales/sv.json" with { type: "json" };

test("a customer signs in and sees their board", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(sv.login.email, { exact: true }).fill(E2E_CUSTOMER_A.account.email);
  await page.getByLabel(sv.login.password, { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: sv.login.submit }).click();

  await expect(page).toHaveURL(/\/pipeline$/);
  await expect(page.getByRole("heading", { level: 1, name: sv.pipeline.title })).toBeVisible();
  for (const candidate of E2E_CUSTOMER_A.candidates) {
    await expect(page.getByText(candidate.full_name).first()).toBeVisible();
  }
});
