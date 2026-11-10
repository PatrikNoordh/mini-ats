// The members page (ATS-46): an admin manages companies and who is in them, and deletes, restores
// and deletes for good a company with everything in it.
import type { Browser, BrowserContext, Page } from "@playwright/test";

import { E2E_ADMIN, E2E_PASSWORD } from "../scripts/e2e-data.ts";
import {
  addCv,
  candidate,
  card,
  cvExists,
  expect,
  job,
  jobCount,
  signIn,
  submitSignIn,
  sv,
  test,
  text,
} from "./fixtures.ts";

async function openAccounts(page: Page) {
  await signIn(page, E2E_ADMIN.email);
  await page.getByRole("link", { name: sv.nav.accounts }).click();
}

/** A company's card on the accounts page. */
const companyCard = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

/** A browser context of its own for another user, closed by the caller. */
async function otherPage(browser: Browser): Promise<[BrowserContext, Page]> {
  const context = await browser.newContext();
  return [context, await context.newPage()];
}

/** Chooses a company in the open account dialog and saves. */
async function chooseCompany(page: Page, option: string) {
  const dialog = page.getByRole("dialog", { name: sv.accountDialog.titleEdit });
  await dialog.getByLabel(sv.accountDialog.company, { exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
  await dialog.getByRole("button", { name: sv.common.save }).click();
  await expect(dialog).toBeHidden();
}

/** Deletes the company from its card, after the confirm. */
async function deleteCompany(page: Page, name: string) {
  await companyCard(page, name)
    .getByRole("button", { name: text(sv.accounts.deleteCompanyLabel, { name }) })
    .click();
  await page
    .getByRole("alertdialog", { name: sv.accounts.companyDeleteTitle })
    .getByRole("button", { name: sv.common.delete })
    .click();
  await expect(page.getByText(sv.accounts.companyDeleted)).toBeVisible();
  await expect(companyCard(page, name)).toHaveCount(0);
}

/** The row of a deleted company, with the list shown. */
async function deletedRow(page: Page, name: string) {
  // "Borttagna företag (n)": the count depends on other tests, so match the words before it.
  const [label = ""] = sv.accounts.showDeletedCompanies.split(" (");
  await page.getByRole("button", { name: new RegExp(`^${label}`) }).click();
  return page
    .getByRole("region", { name: sv.accounts.deletedCompaniesTitle })
    .getByRole("row", { name: new RegExp(name) });
}

test("an admin creates a company, adds a user to it, moves the user and removes them", async ({
  page,
  browser,
  makeCustomer,
  madeInApp,
  tag,
}) => {
  const other = await makeCustomer("Annan");
  const companyName = `Nytt AB ${tag}`;
  const userName = `Ny Användare ${tag}`;
  const email = `ny-${tag}@e2e.test`;
  madeInApp.companies.push(companyName);
  madeInApp.emails.push(email);
  const editUser = text(sv.accounts.edit, { name: userName });
  await openAccounts(page);

  await page.getByRole("button", { name: sv.accounts.newCompany }).click();
  const companyDialog = page.getByRole("dialog", { name: sv.companyDialog.titleNew });
  await companyDialog.getByLabel(sv.companyDialog.name, { exact: true }).fill(companyName);
  await companyDialog.getByRole("button", { name: sv.companyDialog.submit }).click();
  const created = companyCard(page, companyName);
  await expect(created.getByText(sv.accounts.noUsers)).toBeVisible();

  // Added from the company's card, the account joins that company.
  await created
    .getByRole("button", { name: text(sv.accounts.addUserLabel, { name: companyName }) })
    .click();
  const dialog = page.getByRole("dialog", { name: sv.accountDialog.title });
  await dialog.getByLabel(sv.accountDialog.name, { exact: true }).fill(userName);
  await dialog.getByLabel(sv.accountDialog.email, { exact: true }).fill(email);
  await dialog.getByLabel(sv.accountDialog.password, { exact: true }).fill(E2E_PASSWORD);
  await dialog.getByRole("button", { name: sv.accountDialog.submit }).click();
  await expect(dialog).toBeHidden();
  await expect(created.getByRole("button", { name: editUser })).toBeVisible();

  // The new user signs in to the company's own board.
  const [userContext, userPage] = await otherPage(browser);
  try {
    await signIn(userPage, email);
    await expect(userPage.getByText(companyName)).toBeVisible();
  } finally {
    await userContext.close();
  }

  // Moved to another company, the first is left with no users and keeps its card.
  await created.getByRole("button", { name: editUser }).click();
  await chooseCompany(page, other.company);
  const moved = companyCard(page, other.company);
  await expect(moved.getByRole("button", { name: editUser })).toBeVisible();
  await expect(created.getByText(sv.accounts.noUsers)).toBeVisible();

  // Removed from every company, the user is listed apart, ready to be placed.
  await moved.getByRole("button", { name: editUser }).click();
  await chooseCompany(page, sv.accountDialog.noCompany);
  await expect(
    page
      .getByRole("region", { name: sv.accounts.withoutCompanyTitle })
      .getByRole("button", { name: editUser }),
  ).toBeVisible();
  await expect(moved.getByRole("button", { name: editUser })).toHaveCount(0);
});

test("an admin deletes a company, its users cannot sign in, and a restore brings it all back", async ({
  page,
  browser,
  makeCustomer,
  tag,
}) => {
  const name = `Olof ${tag}`;
  const company = await makeCustomer("Kund", {
    jobs: [job("j", `Jobb ${tag}`)],
    candidates: [candidate(name, "j")],
  });
  await openAccounts(page);
  await deleteCompany(page, company.company);

  const [userContext, userPage] = await otherPage(browser);
  try {
    await submitSignIn(userPage, company.email);
    await expect(userPage.getByRole("alert")).toHaveText(sv.errors.account_deleted);

    const row = await deletedRow(page, company.company);
    await row.getByRole("button", { name: sv.accounts.restore }).click();
    await expect(page.getByText(sv.accounts.companyRestored)).toBeVisible();
    await expect(companyCard(page, company.company)).toBeVisible();

    await signIn(userPage, company.email);
    await expect(card(userPage, name)).toBeVisible();
  } finally {
    await userContext.close();
  }
});

test("an admin deletes a company for good: its data, its CVs and its users' logins go", async ({
  page,
  browser,
  makeCustomer,
  tag,
}) => {
  const name = `Petra ${tag}`;
  const company = await makeCustomer("Kund", {
    jobs: [job("j", `Jobb ${tag}`)],
    candidates: [candidate(name, "j")],
  });
  const path = await addCv(company.id, name);
  await openAccounts(page);
  await deleteCompany(page, company.company);
  expect(await jobCount(company.id)).toBe(1);

  const row = await deletedRow(page, company.company);
  await row.getByRole("button", { name: sv.accounts.deleteNow }).click();
  const confirm = page.getByRole("alertdialog", { name: sv.accounts.companyDeleteNowTitle });
  const button = confirm.getByRole("button", { name: sv.accounts.deleteNow });
  await expect(button).toBeDisabled();
  await confirm
    .getByLabel(text(sv.accounts.deleteNowType, { text: company.company }), { exact: true })
    .fill(company.company);
  await button.click();
  await expect(page.getByText(sv.accounts.companyDeletedNow)).toBeVisible();
  await expect(row).toHaveCount(0);

  expect(await jobCount(company.id)).toBe(0);
  expect(await cvExists(path)).toBe(false);
  const [userContext, userPage] = await otherPage(browser);
  try {
    await submitSignIn(userPage, company.email);
    await expect(userPage.getByRole("alert")).toHaveText(sv.errors.invalid_credentials);
  } finally {
    await userContext.close();
  }
});
