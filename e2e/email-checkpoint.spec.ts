import type { Page } from "@playwright/test";

import { E2E_ADMIN, E2E_PASSWORD } from "../scripts/e2e-data.ts";
import { buttonLink, emailsTo, emailTo, expect, signIn, sv, test, text } from "./fixtures.ts";

// The epic 11 checkpoint on one account, from the first email to the second password (ATS-65):
// an admin invites a new customer, who accepts, works, signs out, forgets the password, resets it
// and signs in with the new one. invite.spec.ts and reset-password.spec.ts test each flow's edges.

const NEW_PASSWORD = `Ny-${E2E_PASSWORD}`;

/** A company's card on the accounts page. */
const companyCard = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

/** Signs out from the user menu, and waits for the sign-in page. */
async function signOut(page: Page) {
  await page.getByRole("button", { name: sv.shell.userMenu }).click();
  await page.getByRole("menuitem", { name: sv.shell.signOut }).click();
  await expect(page).toHaveURL(/\/login/);
}

/** Chooses a password on an accept-invite or reset page, with the page's own labels. */
async function choosePassword(
  page: Page,
  labels: { password: string; confirmPassword: string; submit: string },
  password: string,
) {
  await page.getByLabel(labels.password, { exact: true }).fill(password);
  await page.getByLabel(labels.confirmPassword, { exact: true }).fill(password);
  await page.getByRole("button", { name: labels.submit }).click();
}

/** Sends the sign-in form with the given password. */
async function signInWith(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(sv.login.email, { exact: true }).fill(email);
  await page.getByLabel(sv.login.password, { exact: true }).fill(password);
  await page.getByRole("button", { name: sv.login.submit }).click();
}

test("an invited customer accepts, signs out, resets the forgotten password and signs in with the new one", async ({
  page,
  browser,
  madeInApp,
  tag,
}) => {
  const company = `Inbjudet AB ${tag}`;
  const name = `Ny Kund ${tag}`;
  const email = `ny-kund-${tag}@e2e.test`;
  madeInApp.companies.push(company);
  madeInApp.emails.push(email);

  // The admin creates the company and invites its first user.
  await signIn(page, E2E_ADMIN.email);
  await page.getByRole("link", { name: sv.nav.accounts }).click();
  await page.getByRole("button", { name: sv.accounts.newCompany }).click();
  const companyDialog = page.getByRole("dialog", { name: sv.companyDialog.titleNew });
  await companyDialog.getByLabel(sv.companyDialog.name, { exact: true }).fill(company);
  await companyDialog.getByRole("button", { name: sv.companyDialog.submit }).click();
  await companyCard(page, company)
    .getByRole("button", { name: text(sv.accounts.addUserLabel, { name: company }) })
    .click();
  const dialog = page.getByRole("dialog", { name: sv.accountDialog.title });
  await expect(dialog.getByRole("radio", { name: sv.accountDialog.accessInvite })).toBeChecked();
  await dialog.getByLabel(sv.accountDialog.name, { exact: true }).fill(name);
  await dialog.getByLabel(sv.accountDialog.email, { exact: true }).fill(email);
  await dialog.getByRole("button", { name: sv.accountDialog.submitInvite }).click();
  await expect(page.getByText(text(sv.accountDialog.invited, { email }))).toBeVisible();
  const inviteLink = buttonLink((await emailTo(email)).html);

  // The user, in a browser of their own, accepts and lands on the empty board of their company.
  const context = await browser.newContext();
  try {
    const user = await context.newPage();
    await user.goto(inviteLink);
    await choosePassword(user, sv.acceptInvite, E2E_PASSWORD);
    await expect(user).toHaveURL(/\/pipeline/);
    await expect(user.getByText(company)).toBeVisible();
    await signOut(user);

    // The password is forgotten: a reset link comes by email, as the second email to the address.
    await user.getByRole("link", { name: sv.login.forgotPassword }).click();
    await expect(
      user.getByRole("heading", { level: 1, name: sv.forgotPassword.title }),
    ).toBeVisible();
    await user.getByLabel(sv.forgotPassword.email, { exact: true }).fill(email);
    await user.getByRole("button", { name: sv.forgotPassword.submit }).click();
    await expect(user.getByRole("status")).toHaveText(text(sv.forgotPassword.sent, { email }));
    const [reset] = await emailsTo(email, 2);
    const resetLink = buttonLink(reset?.html ?? "");
    expect(resetLink).not.toBe(inviteLink);

    await user.goto(resetLink);
    await choosePassword(user, sv.resetPassword, NEW_PASSWORD);
    await expect(user).toHaveURL(/\/pipeline/);
    await expect(user.getByText(company)).toBeVisible();
    await signOut(user);

    // Only the new password works now.
    await signInWith(user, email, E2E_PASSWORD);
    await expect(user.getByRole("alert")).toHaveText(sv.errors.invalid_credentials);
    await signInWith(user, email, NEW_PASSWORD);
    await expect(user).toHaveURL(/\/pipeline/);
    await expect(user.getByText(company)).toBeVisible();
  } finally {
    await context.close();
  }
});
