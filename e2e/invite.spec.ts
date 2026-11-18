import type { Browser, BrowserContext, Page } from "@playwright/test";

import { E2E_ADMIN, E2E_PASSWORD } from "../scripts/e2e-data.ts";
import {
  buttonLink,
  emailsTo,
  emailTo,
  expect,
  signIn,
  sv,
  test,
  text,
  type TestCustomer,
} from "./fixtures.ts";

// An admin invites an account by email, and the user chooses their own password (ATS-50).

/** A company's card on the accounts page. */
const companyCard = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

/** A browser context of its own for the invited user, closed by the caller. */
async function otherPage(browser: Browser): Promise<[BrowserContext, Page]> {
  const context = await browser.newContext();
  return [context, await context.newPage()];
}

/** Signs in as the admin and invites a new user to the customer's company from its card. */
async function invite(page: Page, customer: TestCustomer, name: string, email: string) {
  await signIn(page, E2E_ADMIN.email);
  await page.getByRole("link", { name: sv.nav.accounts }).click();
  await companyCard(page, customer.company)
    .getByRole("button", { name: text(sv.accounts.addUserLabel, { name: customer.company }) })
    .click();
  const dialog = page.getByRole("dialog", { name: sv.accountDialog.title });
  // Inviting is the default while email is on.
  await expect(dialog.getByRole("radio", { name: sv.accountDialog.accessInvite })).toBeChecked();
  await expect(dialog.getByLabel(sv.accountDialog.password, { exact: true })).toBeHidden();
  await dialog.getByLabel(sv.accountDialog.name, { exact: true }).fill(name);
  await dialog.getByLabel(sv.accountDialog.email, { exact: true }).fill(email);
  await dialog.getByRole("button", { name: sv.accountDialog.submitInvite }).click();
  await expect(page.getByText(text(sv.accountDialog.invited, { email }))).toBeVisible();
}

/** Opens the invite's link and chooses the end-to-end password there. */
async function accept(page: Page, link: string) {
  await page.goto(link);
  await page.getByLabel(sv.acceptInvite.password, { exact: true }).fill(E2E_PASSWORD);
  await page.getByLabel(sv.acceptInvite.confirmPassword, { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: sv.acceptInvite.submit }).click();
}

test("an invited user opens the link, chooses a password, lands on the board and can sign in again", async ({
  page,
  browser,
  makeCustomer,
  madeInApp,
  tag,
}) => {
  const customer = await makeCustomer("Kund");
  const email = `inbjuden-${tag}@e2e.test`;
  madeInApp.emails.push(email);
  await invite(page, customer, `Inbjuden ${tag}`, email);
  const link = buttonLink((await emailTo(email)).html);

  const [context, invited] = await otherPage(browser);
  try {
    // Opening the link, as an email scanner would, does not use it up.
    await invited.goto(link);
    await expect(
      invited.getByRole("heading", { level: 1, name: sv.acceptInvite.title }),
    ).toBeVisible();
    await accept(invited, link);
    await expect(invited).toHaveURL(/\/pipeline/);
    await expect(invited.getByText(customer.company)).toBeVisible();
  } finally {
    await context.close();
  }

  // The password works for a normal sign-in.
  const [later, again] = await otherPage(browser);
  try {
    await signIn(again, email);
  } finally {
    await later.close();
  }

  // The link works only once, also in a browser that never used it.
  const [fresh, reused] = await otherPage(browser);
  try {
    await accept(reused, link);
    await expect(reused.getByRole("alert")).toHaveText(sv.errors.invite_invalid);
  } finally {
    await fresh.close();
  }
});

test("Resend invite replaces the link, also after an edit, and an account that accepted gets no new one", async ({
  page,
  browser,
  makeCustomer,
  madeInApp,
  tag,
}) => {
  const customer = await makeCustomer("Kund");
  const name = `Inbjuden ${tag}`;
  const email = `inbjuden-${tag}@e2e.test`;
  madeInApp.emails.push(email);
  await invite(page, customer, name, email);
  const firstLink = buttonLink((await emailTo(email)).html);

  // Editing an invite not yet accepted keeps it open, so it can still be sent again.
  const renamed = `${name} Andersson`;
  await companyCard(page, customer.company)
    .getByRole("button", { name: text(sv.accounts.edit, { name }) })
    .click();
  const edit = page.getByRole("dialog", { name: sv.accountDialog.titleEdit });
  await edit.getByLabel(sv.accountDialog.name, { exact: true }).fill(renamed);
  await edit.getByRole("button", { name: sv.common.save }).click();
  await expect(edit).toBeHidden();

  const resend = async () => {
    await companyCard(page, customer.company)
      .getByRole("button", { name: text(sv.accounts.edit, { name: renamed }) })
      .click();
    const dialog = page.getByRole("dialog", { name: sv.accountDialog.titleEdit });
    await dialog.getByRole("button", { name: sv.accountDialog.resendInvite }).click();
    return dialog;
  };
  const dialog = await resend();
  await expect(page.getByText(text(sv.accountDialog.resent, { email }))).toBeVisible();
  await dialog.getByRole("button", { name: sv.common.cancel }).click();
  const [newest] = await emailsTo(email, 2);
  const secondLink = buttonLink(newest?.html ?? "");
  expect(secondLink).not.toBe(firstLink);

  const [context, invited] = await otherPage(browser);
  try {
    await accept(invited, firstLink);
    await expect(invited.getByRole("alert")).toHaveText(sv.errors.invite_invalid);
    await accept(invited, secondLink);
    await expect(invited).toHaveURL(/\/pipeline/);
  } finally {
    await context.close();
  }

  await resend();
  await expect(page.getByText(sv.errors.invite_accepted)).toBeVisible();
});
