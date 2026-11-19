import type { Locator, Page } from "@playwright/test";

import { E2E_ADMIN } from "../scripts/e2e-data.ts";
import { expect, serviceClient, signIn, sv, test, text } from "./fixtures.ts";

// Settings → Appearance (ATS-54): a customer, or an admin acting for one, chooses the colour and
// the logo, sees them before saving, saves in one click and resets in one.

const VIOLET = "rgb(109, 40, 217)";
/** The smallest PNG a browser shows: one transparent pixel. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

const background = (locator: Locator) =>
  locator.evaluate((element) => getComputedStyle(element).backgroundColor);

/** The colour --primary resolves to on <html>, which the shell's theme sets. */
const pagePrimary = (page: Page) =>
  page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = "var(--primary)";
    document.body.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  });

async function openAppearance(page: Page) {
  await page.getByRole("link", { name: sv.nav.settings }).click();
  await expect(page.getByRole("heading", { name: sv.appearance.title })).toBeVisible();
}

/** The files in the company's branding folder, read past RLS. */
async function brandingFiles(companyId: string): Promise<string[]> {
  const { data, error } = await serviceClient().storage.from("branding").list(companyId);
  if (error) throw error;
  return data.map((file) => file.name);
}

test("a customer picks a colour and a logo, sees them before saving, saves and resets", async ({
  page,
  makeCustomer,
}) => {
  const customer = await makeCustomer("Kund");
  await signIn(page, customer.email);
  await openAppearance(page);
  const miniAts = await pagePrimary(page);
  const preview = page.locator("section", {
    has: page.getByRole("heading", { name: sv.appearance.preview }),
  });

  // The preview shows the choice, the page keeps the saved theme until saving.
  await page.getByRole("radio", { name: sv.appearance.presets.violet }).check({ force: true });
  await expect.poll(() => background(preview.getByText(sv.jobs.new))).toBe(VIOLET);
  expect(await pagePrimary(page)).toBe(miniAts);

  await page.getByLabel(sv.appearance.logo, { exact: true }).setInputFiles({
    name: "logo.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  await expect(page.getByText(text(sv.appearance.logoChosen, { name: "logo.png" }))).toBeVisible();
  // The preview shows the chosen file, while the sidebar keeps the Mini-ATS mark until saving.
  await expect(page.getByAltText(customer.company)).toHaveCount(1);
  await expect(page.getByRole("img", { name: customer.company })).toHaveCount(0);

  await page.getByRole("button", { name: sv.common.save }).click();
  await expect(page.getByText(sv.appearance.saved)).toBeVisible();
  await expect.poll(() => pagePrimary(page)).toBe(VIOLET);
  // The sidebar shows the logo, named for the company, in place of the Mini-ATS mark.
  await expect(page.getByRole("img", { name: customer.company })).toBeVisible();
  expect(await brandingFiles(customer.id)).toEqual(["logo"]);

  // It stays after a reload, as the saved theme.
  await page.reload();
  await expect(page.getByRole("img", { name: customer.company })).toBeVisible();
  await expect.poll(() => pagePrimary(page)).toBe(VIOLET);

  await page.getByRole("button", { name: sv.appearance.reset }).click();
  await expect(page.getByText(sv.appearance.resetDone)).toBeVisible();
  await expect.poll(() => pagePrimary(page)).toBe(miniAts);
  await expect(page.getByRole("img", { name: customer.company })).toHaveCount(0);
  expect(await brandingFiles(customer.id)).toEqual([]);
  const { data } = await serviceClient()
    .from("customer_branding")
    .select("customer_id")
    .eq("customer_id", customer.id);
  expect(data).toEqual([]);
});

test("a colour that is hard to read and an SVG logo are refused before saving", async ({
  page,
  makeCustomer,
}) => {
  const customer = await makeCustomer("Kund");
  await signIn(page, customer.email);
  await openAppearance(page);
  await page.getByRole("radio", { name: sv.appearance.custom }).check({ force: true });
  const code = page.getByLabel(sv.appearance.customCode, { exact: true });
  const save = page.getByRole("button", { name: sv.common.save });
  // An empty code is no error yet, but cannot be saved.
  await expect(code).toHaveValue("");
  await expect(page.getByText(sv.validation.accent_format)).toHaveCount(0);
  await expect(save).toBeDisabled();

  await code.fill("#facc15");
  await expect(page.getByText(sv.validation.accent_background_contrast)).toBeVisible();
  await expect(save).toBeDisabled();
  await code.fill("blue");
  await expect(page.getByText(sv.validation.accent_format)).toBeVisible();
  await expect(save).toBeDisabled();
  await code.fill("#7C3AED");
  await expect(page.getByText(sv.validation.accent_format)).toHaveCount(0);
  await expect(save).toBeEnabled();

  await page.getByLabel(sv.appearance.logo, { exact: true }).setInputFiles({
    name: "logo.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"),
  });
  await expect(page.getByText(sv.validation.branding_image_type)).toBeVisible();

  await save.click();
  await expect(page.getByText(sv.appearance.saved)).toBeVisible();
  const { data } = await serviceClient()
    .from("customer_branding")
    .select("accent_colour, logo_path")
    .eq("customer_id", customer.id)
    .single();
  // Saved in lower case, as the database requires, and without the refused logo.
  expect(data).toEqual({ accent_colour: "#7c3aed", logo_path: null });
});

test("an admin acting for a customer saves its theme, and another customer keeps Mini-ATS", async ({
  page,
  browser,
  makeCustomer,
}) => {
  const a = await makeCustomer("KundA");
  const b = await makeCustomer("KundB");
  await signIn(page, E2E_ADMIN.email);
  await page.getByRole("button", { name: new RegExp(a.company) }).click();
  await openAppearance(page);
  await page.getByRole("radio", { name: sv.appearance.presets.violet }).check({ force: true });
  await page.getByRole("button", { name: sv.common.save }).click();
  await expect(page.getByText(sv.appearance.saved)).toBeVisible();
  await expect.poll(() => pagePrimary(page)).toBe(VIOLET);

  for (const [customer, expected] of [
    [a, VIOLET],
    [b, null],
  ] as const) {
    const context = await browser.newContext();
    try {
      const user = await context.newPage();
      await signIn(user, customer.email);
      const primary = await pagePrimary(user);
      if (expected) await expect.poll(() => pagePrimary(user)).toBe(expected);
      else expect(primary).not.toBe(VIOLET);
    } finally {
      await context.close();
    }
  }
});
