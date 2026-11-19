import type { Locator, Page } from "@playwright/test";

import { E2E_ADMIN } from "../scripts/e2e-data.ts";
import { solidPng, type Rgb } from "../scripts/png.ts";
import { expect, serviceClient, signIn, sv, test } from "./fixtures.ts";

// A company's background image (ATS-55): uploaded on Settings → Appearance, shown behind the
// pages, and never under anything readable, whatever the image. The two hardest images, all black
// and all white, are made here at run time; no image file is in the repo.

const BLACK: Rgb = [0, 0, 0];
const WHITE: Rgb = [255, 255, 255];

/** The colour a token resolves to on the page, as the browser draws it. */
const tokenColour = (page: Page, token: string) =>
  page.evaluate((name) => {
    const probe = document.createElement("span");
    probe.style.backgroundColor = `var(${name})`;
    document.body.append(probe);
    const colour = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return colour;
  }, token);

const background = (locator: Locator) =>
  locator.evaluate((element) => getComputedStyle(element).backgroundColor);

/**
 * Every visible text and control in <main> with no solid background between it and the image,
 * so the list must be empty. Text only for screen readers does not count.
 */
const onTheImage = (page: Page) =>
  page.evaluate(() => {
    const main = document.querySelector("main");
    if (!main) return ["no <main>"];
    const opaque = (start: Element) => {
      for (let el: Element | null = start; el && el !== main; el = el.parentElement) {
        const colour = getComputedStyle(el).backgroundColor;
        const alpha = /rgba|\//.test(colour) ? Number(/([\d.]+)\)$/.exec(colour)?.[1] ?? 1) : 1;
        if (colour !== "transparent" && alpha >= 0.99) return true;
      }
      return false;
    };
    const shown = (rect: DOMRect) => rect.width > 1 && rect.height > 1;
    const found: string[] = [];
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const parent = node.parentElement;
      const text = node.textContent?.trim();
      if (!text || !parent || parent.closest(".sr-only")) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      if (shown(range.getBoundingClientRect()) && !opaque(parent)) found.push(text);
    }
    for (const control of main.querySelectorAll("input, textarea, button, [role=combobox]")) {
      if (shown(control.getBoundingClientRect()) && !opaque(control)) found.push(control.outerHTML);
    }
    return found;
  });

/** Waits until the image is shown, then checks that nothing readable sits on it. */
async function expectNothingOnTheImage(page: Page) {
  await expect(page.locator("main[data-background-image]")).toHaveCount(1);
  expect(await onTheImage(page)).toEqual([]);
}

/** Uploads an image of one colour as the background on Settings → Appearance and saves. */
async function setBackground(page: Page, colour: Rgb) {
  await page.getByRole("link", { name: sv.nav.settings }).click();
  await page.getByLabel(sv.appearance.background, { exact: true }).setInputFiles({
    name: "background.png",
    mimeType: "image/png",
    buffer: solidPng(64, 40, colour),
  });
  await expect(page.getByText(/background\.(webp|jpg)/)).toBeVisible();
  await page.getByRole("radio", { name: sv.appearance.dimLevels.light }).check({ force: true });
  await page.getByRole("button", { name: sv.common.save }).click();
  await expect(page.getByText(sv.appearance.saved)).toBeVisible();
  await expect(page.locator("main[data-background-image]")).toHaveCount(1);
}

async function filesOf(companyId: string): Promise<string[]> {
  const { data, error } = await serviceClient().storage.from("branding").list(companyId);
  if (error) throw error;
  return data.map((file) => file.name);
}

for (const [name, colour] of [
  ["black", BLACK],
  ["white", WHITE],
] as const) {
  test(`on an all-${name} background the header, the filters and the states keep a card surface`, async ({
    page,
    makeCustomer,
  }) => {
    const customer = await makeCustomer("Kund");
    await signIn(page, customer.email);
    await setBackground(page, colour);
    expect(await filesOf(customer.id)).toEqual(["background"]);
    const card = await tokenColour(page, "--card");

    await page.getByRole("link", { name: sv.nav.pipeline }).click();
    const surfaceOf = (locator: Locator) =>
      locator.locator("xpath=ancestor-or-self::*[contains(@class, '-on-image')][1]");
    const header = surfaceOf(page.getByRole("heading", { level: 1, name: sv.nav.pipeline }));
    const filters = surfaceOf(page.getByPlaceholder(sv.pipeline.search));
    const empty = surfaceOf(page.getByText(sv.pipeline.empty));
    for (const part of [header, filters, empty]) {
      await expect(part).toBeVisible();
      expect(await background(part)).toBe(card);
    }
    await expectNothingOnTheImage(page);

    // An error state keeps its surface too: the jobs request fails here on purpose.
    // The board has the jobs cached, so the page is loaded again for the request to be made.
    await page.route("**/rest/v1/jobs*", (route) => route.fulfill({ status: 500, body: "{}" }));
    await page.goto("/jobs");
    const error = page.getByRole("alert").filter({ hasText: sv.common.retry });
    // The query tries again a few times before it shows the error.
    await expect(error).toBeVisible({ timeout: 20_000 });
    expect(await background(error)).toBe(card);
    await page.unroute("**/rest/v1/jobs*");

    for (const link of [sv.nav.candidates, sv.nav.settings]) {
      await page.getByRole("link", { name: link }).click();
      await page.waitForLoadState("networkidle");
      await expectNothingOnTheImage(page);
    }
  });
}

test("an admin acting for a customer sees its background, another customer none, and a reset removes it", async ({
  page,
  browser,
  makeCustomer,
}) => {
  const themed = await makeCustomer("KundA");
  const plain = await makeCustomer("KundB");
  await signIn(page, themed.email);
  await setBackground(page, BLACK);

  const admin = await browser.newContext();
  try {
    const adminPage = await admin.newPage();
    await signIn(adminPage, E2E_ADMIN.email);
    // Acting for nobody, no company's image shows.
    await expect(adminPage.locator("main[data-background-image]")).toHaveCount(0);
    await adminPage.getByRole("button", { name: new RegExp(themed.company) }).click();
    await expect(adminPage.locator("main[data-background-image]")).toHaveCount(1);
    await expectNothingOnTheImage(adminPage);
    await adminPage.goto("/admin/accounts");
    await expect(adminPage.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNothingOnTheImage(adminPage);
  } finally {
    await admin.close();
  }

  const other = await browser.newContext();
  try {
    const otherPage = await other.newPage();
    await signIn(otherPage, plain.email);
    await expect(otherPage.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(otherPage.locator("main[data-background-image]")).toHaveCount(0);
  } finally {
    await other.close();
  }

  await page.getByRole("link", { name: sv.nav.settings }).click();
  await page.getByRole("button", { name: sv.appearance.reset }).click();
  await expect(page.getByText(sv.appearance.resetDone)).toBeVisible();
  await expect(page.locator("main[data-background-image]")).toHaveCount(0);
  expect(await filesOf(themed.id)).toEqual([]);
});
