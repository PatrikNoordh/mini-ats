import type { Locator, Page } from "@playwright/test";

import { E2E_ADMIN } from "../scripts/e2e-data.ts";
import { solidPng, type Rgb } from "../scripts/png.ts";
import { DEFAULT_SURFACE_OPACITY } from "../src/lib/constants.ts";
import { expect, serviceClient, signIn, sv, test } from "./fixtures.ts";

// A company's background image (ATS-55) with frosted chips over it (ATS-66): uploaded on
// Settings → Appearance, shown behind the pages, and every text on it readable, whatever the
// image and however see-through the company makes the chips. The two hardest images, all black
// and all white, are made here at run time; no image file is in the repo.

const BLACK: Rgb = [0, 0, 0];
const WHITE: Rgb = [255, 255, 255];

const background = (locator: Locator) =>
  locator.evaluate((element) => getComputedStyle(element).backgroundColor);

/**
 * Every visible text in <main> that the image shows through to and whose contrast with what is
 * behind it is under 4.5:1, so the list must be empty. What is behind it is worked out as the
 * browser draws it: the image, the scrim over it, and every background between the text and
 * <main>, each over the one below, mixed in sRGB. A solid image needs no blur. Text with a fully
 * solid layer behind it, such as a primary button, does not depend on the image and is left to
 * the rest of the app's checks. Text only for screen readers, and a disabled control, which WCAG
 * leaves out, do not count.
 */
const unreadable = (page: Page, image: Rgb) =>
  page.evaluate((imageRgb) => {
    type Rgba = [number, number, number, number];
    const toGamma = (c: number) =>
      c <= 0.0031308 ? c * 12.92 : 1.055 * Math.max(c, 0) ** (1 / 2.4) - 0.055;
    const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const clamp = (c: number) => Math.min(1, Math.max(0, c));
    /** OKLab to gamma-encoded sRGB, by Björn Ottosson's matrices. */
    const fromOklab = (l: number, a: number, b: number): [number, number, number] => {
      const lms = [
        (l + 0.3963377774 * a + 0.2158037573 * b) ** 3,
        (l - 0.1055613458 * a - 0.0638541728 * b) ** 3,
        (l - 0.0894841775 * a - 1.291485548 * b) ** 3,
      ] as const;
      return [
        4.0767416621 * lms[0] - 3.3077115913 * lms[1] + 0.2309699292 * lms[2],
        -1.2684380046 * lms[0] + 2.6097574011 * lms[1] - 0.3413193965 * lms[2],
        -0.0041960863 * lms[0] - 0.7034186147 * lms[1] + 1.707614701 * lms[2],
      ].map((c) => clamp(toGamma(c))) as [number, number, number];
    };
    /** A computed colour as gamma sRGB from 0 to 1 and its alpha, in the forms Chrome gives. */
    const parse = (value: string): Rgba => {
      const numbers = [...value.matchAll(/-?[\d.]+(e-?\d+)?/g)].map((m) => Number(m[0]));
      const alpha = value.includes("/") ? numbers.at(-1)! : 1;
      if (value === "transparent") return [0, 0, 0, 0];
      if (value.startsWith("rgb")) {
        const [r, g, b, a] = numbers;
        return [r! / 255, g! / 255, b! / 255, a ?? 1];
      }
      if (value.startsWith("color(srgb")) return [numbers[0]!, numbers[1]!, numbers[2]!, alpha];
      if (value.startsWith("oklch")) {
        const [l, c, h] = numbers;
        const radians = (h! * Math.PI) / 180;
        return [...fromOklab(l!, c! * Math.cos(radians), c! * Math.sin(radians)), alpha];
      }
      if (value.startsWith("oklab"))
        return [...fromOklab(numbers[0]!, numbers[1]!, numbers[2]!), alpha];
      throw new Error(`Unknown colour: ${value}`);
    };
    const over = (top: Rgba, below: [number, number, number]): [number, number, number] =>
      below.map((c, i) => top[i]! * top[3] + c * (1 - top[3])) as [number, number, number];
    const luminance = ([r, g, b]: [number, number, number]) =>
      0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
    const contrast = (a: [number, number, number], b: [number, number, number]) => {
      const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (light! + 0.05) / (dark! + 0.05);
    };

    const main = document.querySelector("main");
    const scrim = document.querySelector(".background-scrim");
    if (!main || !scrim) return ["no <main> with an image"];
    const base = over(
      parse(getComputedStyle(scrim).backgroundColor),
      imageRgb.map((c) => c / 255) as [number, number, number],
    );
    /** What is behind the element, or null when a solid layer hides the image from it. */
    const behind = (element: Element) => {
      const layers: Rgba[] = [];
      for (let el: Element | null = element; el && el !== main; el = el.parentElement) {
        layers.push(parse(getComputedStyle(el).backgroundColor));
      }
      if (layers.some((layer) => layer[3] >= 0.999)) return null;
      return layers.reverse().reduce((colour, layer) => over(layer, colour), base);
    };
    const shown = (rect: DOMRect) => rect.width > 1 && rect.height > 1;
    const found: string[] = [];
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const parent = node.parentElement;
      const text = node.textContent?.trim();
      if (!text || !parent || parent.closest(".sr-only, :disabled, [aria-disabled=true]")) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      if (!shown(range.getBoundingClientRect())) continue;
      const backdrop = behind(parent);
      if (!backdrop) continue;
      const ink = over(parse(getComputedStyle(parent).color), backdrop);
      const ratio = contrast(ink, backdrop);
      if (ratio < 4.5) found.push(`${ratio.toFixed(2)}:1 "${text.slice(0, 40)}"`);
    }
    return found;
  }, image);

/**
 * Waits until the image is shown, then checks that every text on it reaches 4.5:1. Buttons fade
 * their background in (transition-colors), so the check is tried again until the page settles.
 */
async function expectReadable(page: Page, image: Rgb) {
  await expect(page.locator("main[data-background-image]")).toHaveCount(1);
  await expect.poll(() => unreadable(page, image)).toEqual([]);
}

/**
 * Uploads an image of one colour as the background on Settings → Appearance, shows as much of it
 * as there is (Much), makes the chips as see-through as the image allows, at its floor, and saves.
 */
async function setBackground(page: Page, colour: Rgb) {
  await page.getByRole("link", { name: sv.nav.settings }).click();
  await page.getByLabel(sv.appearance.background, { exact: true }).setInputFiles({
    name: "background.png",
    mimeType: "image/png",
    buffer: solidPng(64, 40, colour),
  });
  await expect(page.getByText(/background\.(webp|jpg)/)).toBeVisible();
  await page.getByRole("radio", { name: sv.appearance.dimLevels.light }).check({ force: true });
  const slider = page.getByLabel(sv.appearance.surface, { exact: true });
  await slider.focus();
  await slider.press("End");
  await page.getByRole("button", { name: sv.common.save }).click();
  await expect(page.getByText(sv.appearance.saved)).toBeVisible();
  await expect(page.locator("main[data-background-image]")).toHaveCount(1);
}

async function filesOf(companyId: string): Promise<string[]> {
  const { data, error } = await serviceClient().storage.from("branding").list(companyId);
  if (error) throw error;
  return data.map((file) => file.name);
}

/** The saved theme's floor and setting, read past RLS. */
async function chipsOf(companyId: string) {
  const { data, error } = await serviceClient()
    .from("customer_branding")
    .select("background_floor, surface_opacity")
    .eq("customer_id", companyId)
    .single();
  if (error) throw error;
  return data;
}

// The floor each image should measure: about half over black, near clear over white.
for (const [name, colour, lowest, highest] of [
  ["black", BLACK, 0.4, 0.7],
  ["white", WHITE, 0, 0.1],
] as const) {
  test(`on an all-${name} background at its floor every text stays readable`, async ({
    page,
    makeCustomer,
  }) => {
    const customer = await makeCustomer("Kund");
    await signIn(page, customer.email);
    await setBackground(page, colour);
    expect(await filesOf(customer.id)).toEqual(["background"]);
    // Measured from the image, and the setting at the floor.
    // Measured from the image, and the slider's last step puts the setting on the floor.
    const chips = await chipsOf(customer.id);
    expect(chips.background_floor).toBeGreaterThanOrEqual(lowest);
    expect(chips.background_floor).toBeLessThanOrEqual(highest);
    // The chips as the app shows them: the setting, or the default, raised to the floor.
    const shown = Math.max(
      chips.surface_opacity ?? DEFAULT_SURFACE_OPACITY,
      chips.background_floor ?? 1,
    );
    expect(shown).toBe(chips.background_floor);

    await page.getByRole("link", { name: sv.nav.pipeline }).click();
    // The title sits in the white top bar; loose text below it hugs a frosted chip; the filters
    // and the empty state are solid by themselves.
    await expect(
      page.getByRole("banner").getByRole("heading", { level: 1, name: sv.nav.pipeline }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: sv.stageEditor.reset })).toHaveCSS(
      "backdrop-filter",
      /blur/,
    );
    const card = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.backgroundColor = "var(--card)";
      document.body.append(probe);
      const colour = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return colour;
    });
    const search = page.getByPlaceholder(sv.pipeline.search);
    const empty = page.getByText(sv.pipeline.empty).locator("..");
    for (const part of [search, empty]) {
      await expect(part).toBeVisible();
      expect(await background(part)).toBe(card);
    }
    await expectReadable(page, colour);

    // An error state keeps its surface too: the jobs request fails here on purpose.
    // The board has the jobs cached, so the page is loaded again for the request to be made.
    await page.route("**/rest/v1/jobs*", (route) => route.fulfill({ status: 500, body: "{}" }));
    await page.goto("/jobs");
    const error = page.getByRole("alert").filter({ hasText: sv.common.retry });
    // The query tries again a few times before it shows the error.
    await expect(error).toBeVisible({ timeout: 20_000 });
    expect(await background(error)).toBe(card);
    await expectReadable(page, colour);
    await page.unroute("**/rest/v1/jobs*");

    for (const link of [sv.nav.candidates, sv.nav.settings]) {
      await page.getByRole("link", { name: link }).click();
      await page.waitForLoadState("networkidle");
      await expectReadable(page, colour);
    }
  });
}

test("an admin acting for a customer sees its background, readable at its floor, another customer none, and a reset removes it", async ({
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
    await expectReadable(adminPage, BLACK);
    await adminPage.goto("/admin/accounts");
    await expect(adminPage.getByRole("heading", { level: 1 })).toBeVisible();
    await expectReadable(adminPage, BLACK);
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

test("a background from before the chip setting keeps solid chips until the settings page measures it", async ({
  page,
  makeCustomer,
}) => {
  // As ATS-55 left it: an image and its row, but no measured floor.
  const customer = await makeCustomer("Kund");
  const admin = serviceClient();
  const path = `${customer.id}/background`;
  const upload = await admin.storage
    .from("branding")
    .upload(path, solidPng(64, 40, BLACK), { contentType: "image/png", upsert: true });
  if (upload.error) throw upload.error;
  const row = await admin
    .from("customer_branding")
    .insert({ customer_id: customer.id, background_path: path, background_dim: "light" });
  if (row.error) throw row.error;

  await signIn(page, customer.email);
  await expect(page.locator("main[data-background-image]")).toHaveCount(1);
  await expect(page.locator("main")).toHaveCSS("--surface-opacity", "1");
  await expect(page.getByRole("button", { name: sv.stageEditor.reset })).toHaveCSS(
    "backdrop-filter",
    /blur/,
  );
  await expectReadable(page, BLACK);

  // The settings page measures the stored image; saving keeps its floor.
  await page.getByRole("link", { name: sv.nav.settings }).click();
  await expect(page.getByLabel(sv.appearance.surface, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: sv.common.save }).click();
  await expect(page.getByText(sv.appearance.saved)).toBeVisible();
  expect((await chipsOf(customer.id)).background_floor).toBeGreaterThan(0.4);
});

test("a floor saved under the old rule is measured again on the settings page, so the slider gets room", async ({
  page,
  makeCustomer,
}) => {
  // As ATS-66 first saved it: light grey text set the floor, so a dark image got 0.99.
  const customer = await makeCustomer("Kund");
  const admin = serviceClient();
  const path = `${customer.id}/background`;
  const upload = await admin.storage
    .from("branding")
    .upload(path, solidPng(64, 40, BLACK), { contentType: "image/png", upsert: true });
  if (upload.error) throw upload.error;
  const row = await admin.from("customer_branding").insert({
    customer_id: customer.id,
    background_path: path,
    background_floor: 0.99,
    surface_opacity: 0.99,
  });
  if (row.error) throw row.error;

  await signIn(page, customer.email);
  await page.getByRole("link", { name: sv.nav.settings }).click();
  const slider = page.getByLabel(sv.appearance.surface, { exact: true });
  await expect(slider).toHaveAttribute("max", /^(3\d|4\d|5\d)$/);
  await slider.focus();
  await slider.press("End");
  await page.getByRole("button", { name: sv.common.save }).click();
  await expect(page.getByText(sv.appearance.saved)).toBeVisible();
  const chips = await chipsOf(customer.id);
  expect(chips.background_floor).toBeLessThan(0.7);
  expect(chips.surface_opacity).toBe(chips.background_floor);
  await page.getByRole("link", { name: sv.nav.pipeline }).click();
  await expectReadable(page, BLACK);
});

test("on a wide screen the content is a centred column with an image, and full width without one", async ({
  page,
  makeCustomer,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const customer = await makeCustomer("Kund");
  await signIn(page, customer.email);
  const content = page.locator("main > .content-on-image");
  const gaps = () =>
    content.evaluate((element) => {
      const main = element.parentElement!.getBoundingClientRect();
      const box = element.getBoundingClientRect();
      return { left: box.left - main.left, right: main.right - box.right, width: box.width };
    });
  // Without an image: the main area's full width, less its padding, as before.
  const plain = await gaps();
  expect(plain.width).toBeGreaterThan(1440);

  await setBackground(page, WHITE);
  await page.getByRole("link", { name: sv.nav.pipeline }).click();
  await expect(page.locator("main[data-background-image]")).toHaveCount(1);
  const framed = await gaps();
  expect(framed.width).toBeLessThanOrEqual(1440);
  expect(Math.abs(framed.left - framed.right)).toBeLessThan(2);
  expect(framed.left).toBeGreaterThan(plain.left);
});

test("with an image the page's title moves into the top bar, except on Settings, and without one it stays in the page", async ({
  page,
  makeCustomer,
}) => {
  const customer = await makeCustomer("Kund");
  await signIn(page, customer.email);
  const bar = page.getByRole("banner");
  const main = page.getByRole("main");
  // Without an image: in the page, as before.
  await expect(main.getByRole("heading", { level: 1, name: sv.nav.pipeline })).toBeVisible();
  await expect(bar.getByRole("heading", { level: 1 })).toHaveCount(0);

  await setBackground(page, WHITE);
  for (const [link, title, action] of [
    [sv.nav.pipeline, sv.nav.pipeline, sv.pipeline.newCandidate],
    [sv.nav.jobs, sv.jobs.title, sv.jobs.new],
    [sv.nav.candidates, sv.candidates.title, sv.candidates.new],
  ] as const) {
    await page.getByRole("link", { name: link }).click();
    await expect(bar.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(bar.getByRole("button", { name: action })).toBeVisible();
    await expect(main.getByRole("heading", { level: 1 })).toHaveCount(0);
  }
  // Settings keeps its title in the page, on its solid panel's side.
  await page.getByRole("link", { name: sv.nav.settings }).click();
  await expect(main.getByRole("heading", { level: 1, name: sv.settings.title })).toBeVisible();
  await expect(bar.getByRole("heading", { level: 1 })).toHaveCount(0);
});
