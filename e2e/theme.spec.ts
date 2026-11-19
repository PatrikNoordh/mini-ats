import type { Locator, Page } from "@playwright/test";

import { E2E_ADMIN } from "../scripts/e2e-data.ts";
import { expect, serviceClient, signIn, sv, test, type TestCustomer } from "./fixtures.ts";

// A customer's accent colour in the real app (ATS-53): on the shell and in dialogs, which render
// outside it, never on the acting banner or the sign-in page, and never for a company without one.

const ACCENT = "#b91c1c";
const ACCENT_RGB = "rgb(185, 28, 28)";

/** Gives the company a theme, as the settings page will (ATS-54). The company's delete removes it. */
async function brand(customer: TestCustomer, accent: string) {
  const { error } = await serviceClient()
    .from("customer_branding")
    .insert({ customer_id: customer.id, accent_colour: accent });
  if (error) throw error;
}

/** The background colour an element is drawn with. */
const background = (locator: Locator) =>
  locator.evaluate((element) => getComputedStyle(element).backgroundColor);

/** The colour --primary resolves to on the element, as the browser draws it. */
const primaryOn = (locator: Locator) =>
  locator.evaluate((element) => {
    const probe = document.createElement("span");
    probe.style.color = "var(--primary)";
    element.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  });

/** The Mini-ATS accent, as the sign-in page draws its submit button. */
async function miniAtsAccent(page: Page): Promise<string> {
  await page.goto("/login");
  return background(page.getByRole("button", { name: sv.login.submit }));
}

test("a customer's accent colours the shell and its dialogs, and the sign-in page keeps Mini-ATS", async ({
  page,
  makeCustomer,
}) => {
  const miniAts = await miniAtsAccent(page);
  expect(miniAts).not.toBe(ACCENT_RGB);
  const customer = await makeCustomer("Kund");
  await brand(customer, ACCENT);

  await signIn(page, customer.email);
  await page.getByRole("link", { name: sv.nav.jobs }).click();
  const newJob = page.getByRole("button", { name: sv.jobs.new });
  await expect.poll(() => background(newJob)).toBe(ACCENT_RGB);
  // A dialog renders outside the shell, and still has the customer's accent.
  await newJob.click();
  const dialog = page.getByRole("dialog");
  await expect.poll(() => primaryOn(dialog)).toBe(ACCENT_RGB);

  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: sv.shell.userMenu }).click();
  await page.getByRole("menuitem", { name: sv.shell.signOut }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect
    .poll(() => background(page.getByRole("button", { name: sv.login.submit })))
    .toBe(miniAts);
});

/** WCAG contrast between two colours the browser gives as rgb(r, g, b). */
function contrast(one: string, other: string): number {
  const luminance = (colour: string) => {
    const [r, g, b] = (colour.match(/\d+/g) ?? []).slice(0, 3).map((value) => {
      const channel = Number(value) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const [light, dark] = [luminance(one), luminance(other)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

test("a light accent is darkened where it is text, so links and the active item stay readable", async ({
  page,
  makeCustomer,
}) => {
  // Red 500 takes dark text on its buttons, but is too light to be text on white.
  const customer = await makeCustomer("Kund");
  await brand(customer, "#ef4444");
  await signIn(page, customer.email);
  await page.getByRole("link", { name: sv.nav.jobs }).click();
  const newJob = page.getByRole("button", { name: sv.jobs.new });
  await expect.poll(() => background(newJob)).toBe("rgb(239, 68, 68)");

  const active = page.getByRole("link", { name: sv.nav.jobs });
  const [text, behind] = await active.evaluate((element) => [
    getComputedStyle(element).color,
    getComputedStyle(element).backgroundColor,
  ]);
  expect(text).not.toBe("rgb(239, 68, 68)");
  expect(contrast(text!, behind!)).toBeGreaterThanOrEqual(4.5);
});

test("a customer without a theme sees the Mini-ATS accent", async ({ page, makeCustomer }) => {
  const miniAts = await miniAtsAccent(page);
  const customer = await makeCustomer("Kund");
  await signIn(page, customer.email);
  await page.getByRole("link", { name: sv.nav.jobs }).click();
  await expect(page.getByRole("button", { name: sv.jobs.new })).toBeVisible();
  expect(await background(page.getByRole("button", { name: sv.jobs.new }))).toBe(miniAts);
});

test("an admin acting for a customer sees its accent, and the acting banner keeps Mini-ATS", async ({
  page,
  makeCustomer,
}) => {
  const miniAts = await miniAtsAccent(page);
  const branded = await makeCustomer("Kund");
  await brand(branded, ACCENT);
  await signIn(page, E2E_ADMIN.email);
  // Acting for nobody, the admin's pages have the Mini-ATS accent.
  await page.getByRole("link", { name: sv.nav.accounts }).click();
  await expect(page.getByRole("button", { name: sv.accounts.newCompany })).toBeVisible();
  await expect.poll(() => primaryOn(page.locator("main"))).toBe(miniAts);

  await page.getByRole("link", { name: sv.nav.pipeline }).click();
  await page.getByRole("button", { name: new RegExp(branded.company) }).click();
  await page.getByRole("link", { name: sv.nav.jobs }).click();
  await expect
    .poll(() => background(page.getByRole("button", { name: sv.jobs.new })))
    .toBe(ACCENT_RGB);
  const banner = page.getByRole("button", { name: sv.shell.leaveCustomer }).locator("..");
  expect(await primaryOn(banner)).toBe(miniAts);

  // Leaving the customer takes its theme away again.
  await page.getByRole("button", { name: sv.shell.leaveCustomer }).click();
  await page.getByRole("link", { name: sv.nav.accounts }).click();
  await expect(page.getByRole("button", { name: sv.accounts.newCompany })).toBeVisible();
  await expect.poll(() => primaryOn(page.locator("main"))).toBe(miniAts);
});
