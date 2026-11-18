import type { Browser, BrowserContext, Page } from "@playwright/test";

import { E2E_ADMIN, E2E_PASSWORD } from "../scripts/e2e-data.ts";
import { buttonLink, emailsTo, emailTo, expect, signIn, sv, test, text } from "./fixtures.ts";

// A user who forgot their password asks for a link and chooses a new one (ATS-51).

const NEW_PASSWORD = `Ny-${E2E_PASSWORD}`;

/** A browser context of its own, closed by the caller. */
async function otherPage(browser: Browser): Promise<[BrowserContext, Page]> {
  const context = await browser.newContext();
  return [context, await context.newPage()];
}

/** Asks for a reset link from the sign-in page, and waits for the page's answer. */
async function askForLink(page: Page, email: string) {
  await page.goto("/login");
  await page.getByRole("link", { name: sv.login.forgotPassword }).click();
  // The sign-in page's field has the same label, so wait for the new page first.
  await expect(
    page.getByRole("heading", { level: 1, name: sv.forgotPassword.title }),
  ).toBeVisible();
  await page.getByLabel(sv.forgotPassword.email, { exact: true }).fill(email);
  await page.getByRole("button", { name: sv.forgotPassword.submit }).click();
  await expect(page.getByRole("status")).toHaveText(text(sv.forgotPassword.sent, { email }));
}

/** Opens the reset link and chooses the new password there. */
async function chooseNewPassword(page: Page, link: string) {
  await page.goto(link);
  await page.getByLabel(sv.resetPassword.password, { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel(sv.resetPassword.confirmPassword, { exact: true }).fill(NEW_PASSWORD);
  await page.getByRole("button", { name: sv.resetPassword.submit }).click();
}

/** Sends the sign-in form with the given password. */
async function signInWith(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(sv.login.email, { exact: true }).fill(email);
  await page.getByLabel(sv.login.password, { exact: true }).fill(password);
  await page.getByRole("button", { name: sv.login.submit }).click();
}

test("a customer who forgot the password gets a link, chooses a new one and signs in with it", async ({
  page,
  browser,
  makeCustomer,
}) => {
  const customer = await makeCustomer("Kund");
  await askForLink(page, customer.email);
  const link = buttonLink((await emailTo(customer.email)).html);

  const [context, user] = await otherPage(browser);
  try {
    // Opening the link, as an email scanner would, does not use it up.
    await user.goto(link);
    await expect(
      user.getByRole("heading", { level: 1, name: sv.resetPassword.title }),
    ).toBeVisible();
    await chooseNewPassword(user, link);
    await expect(user).toHaveURL(/\/pipeline/);
    await expect(user.getByText(customer.company)).toBeVisible();
  } finally {
    await context.close();
  }

  const [later, again] = await otherPage(browser);
  try {
    // The old password no longer works, the new one does.
    await signInWith(again, customer.email, E2E_PASSWORD);
    await expect(again.getByRole("alert")).toHaveText(sv.errors.invalid_credentials);
    await signInWith(again, customer.email, NEW_PASSWORD);
    await expect(again).toHaveURL(/\/pipeline/);
  } finally {
    await later.close();
  }

  // The link works once.
  const [reuse, stranger] = await otherPage(browser);
  try {
    await chooseNewPassword(stranger, link);
    await expect(stranger.getByRole("alert")).toHaveText(sv.errors.reset_link_invalid);
  } finally {
    await reuse.close();
  }
});

test("the answer is the same for an unknown address and for a repeated request", async ({
  page,
  makeCustomer,
  tag,
}) => {
  const unknown = `ingen-${tag}@e2e.test`;
  await askForLink(page, unknown);

  // Auth refuses a second request for an account soon after the first, which it can only do for
  // an address with an account; the page still says the same.
  const customer = await makeCustomer("Kund");
  await askForLink(page, customer.email);
  await askForLink(page, customer.email);
  await emailTo(customer.email);

  // Nothing is sent to an address without an account.
  await expect(emailsTo(unknown)).rejects.toThrow();
});

test("a deleted account gets the same answer, but its link is refused", async ({
  page,
  browser,
  makeCustomer,
}) => {
  const customer = await makeCustomer("Kund");
  await signIn(page, E2E_ADMIN.email);
  await page.getByRole("link", { name: sv.nav.accounts }).click();
  await page
    .getByRole("button", { name: text(sv.accounts.edit, { name: customer.fullName }) })
    .click();
  await page
    .getByRole("dialog", { name: sv.accountDialog.titleEdit })
    .getByRole("button", { name: sv.common.delete })
    .click();
  await page
    .getByRole("alertdialog", { name: sv.accountDialog.deleteTitle })
    .getByRole("button", { name: sv.common.delete })
    .click();
  await expect(page.getByText(sv.accountDialog.deleted)).toBeVisible();

  const [context, user] = await otherPage(browser);
  try {
    await askForLink(user, customer.email);
    const link = buttonLink((await emailTo(customer.email)).html);
    await chooseNewPassword(user, link);
    await expect(user.getByRole("alert")).toHaveText(sv.errors.account_or_company_deleted);
    await expect(user).toHaveURL(/\/reset-password/);
  } finally {
    await context.close();
  }
});
