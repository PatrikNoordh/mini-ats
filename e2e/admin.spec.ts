import { E2E_ADMIN } from "../scripts/e2e-data.ts";
import { candidate, card, expect, job, signIn, submitSignIn, sv, test, text } from "./fixtures.ts";

test("an admin acts for customer A, switches to B and sees nothing of A's", async ({
  page,
  makeCustomer,
  tag,
}) => {
  const jobA = `Platschef ${tag}`;
  const nameA = `Hanna ${tag}`;
  const jobB = `Designer ${tag}`;
  const nameB = `Ivar ${tag}`;
  const a = await makeCustomer("KundA", {
    jobs: [
      job("a", jobA),
      job("a2", `Lagerchef ${tag}`),
      { ...job("a3", `Säljare ${tag}`), status: "closed" },
    ],
    candidates: [candidate(nameA, "a")],
  });
  const b = await makeCustomer("KundB", {
    jobs: [job("b", jobB)],
    candidates: [candidate(nameB, "b")],
  });
  await signIn(page, E2E_ADMIN.email);

  await expect(page.getByRole("heading", { name: sv.gate.title })).toBeVisible();
  // Each customer's open jobs, counted in one request across companies and jobs (ATS-61 AC9: a
  // broken embed shows "count unavailable" instead, which no other test would notice).
  const openJobs = (template: string, count: number) =>
    template.replace("{{count, number}}", String(count));
  await expect(page.getByRole("button", { name: new RegExp(a.company) })).toContainText(
    openJobs(sv.gate.openJobs_other, 2),
  );
  await expect(page.getByRole("button", { name: new RegExp(b.company) })).toContainText(
    openJobs(sv.gate.openJobs_one, 1),
  );
  await page.getByRole("button", { name: new RegExp(a.company) }).click();
  await expect(card(page, nameA)).toBeVisible();

  await page.getByRole("combobox", { name: sv.shell.customerLabel }).click();
  await page.getByRole("option", { name: b.company }).click();
  await expect(card(page, nameB)).toBeVisible();
  await expect(page.getByText(nameA)).toHaveCount(0);
  await expect(page.getByText(jobA)).toHaveCount(0);

  // The other pages show B's data too, with nothing of A's.
  await page.getByRole("link", { name: sv.nav.jobs }).click();
  await expect(page.getByRole("cell", { name: jobB })).toBeVisible();
  await expect(page.getByText(jobA)).toHaveCount(0);
  await page.getByRole("link", { name: sv.nav.candidates }).click();
  await expect(page.getByText(nameB).first()).toBeVisible();
  await expect(page.getByText(nameA)).toHaveCount(0);
});

test("an admin deletes an account, finds it in Deleted accounts and restores it", async ({
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
  const dialog = page.getByRole("dialog", { name: sv.accountDialog.titleEdit });
  await dialog.getByRole("button", { name: sv.common.delete }).click();
  await page
    .getByRole("alertdialog", { name: sv.accountDialog.deleteTitle })
    .getByRole("button", { name: sv.common.delete })
    .click();
  await expect(page.getByText(sv.accountDialog.deleted)).toBeVisible();

  // "Deleted accounts (n)": the count depends on other tests, so match the words before it.
  const [showDeleted = ""] = sv.accounts.showDeleted.split(" (");
  await page.getByRole("button", { name: new RegExp(`^${showDeleted}`) }).click();
  const deletedRow = page
    .getByRole("region", { name: sv.accounts.deletedTitle })
    .getByRole("row", { name: new RegExp(customer.company) });
  await expect(deletedRow).toBeVisible();

  // While the account is deleted, the customer cannot sign in. The customer's own browser context
  // is closed even when a step fails, so a failed run leaves no browser open.
  const customerContext = await browser.newContext();
  try {
    const customerPage = await customerContext.newPage();
    await submitSignIn(customerPage, customer.email);
    await expect(customerPage.getByRole("alert")).toHaveText(sv.errors.account_or_company_deleted);

    await deletedRow.getByRole("button", { name: sv.accounts.restore }).click();
    await expect(page.getByText(sv.accounts.restored)).toBeVisible();
    await expect(deletedRow).toHaveCount(0);

    await signIn(customerPage, customer.email);
    await expect(
      customerPage.getByRole("heading", { level: 1, name: sv.pipeline.title }),
    ).toBeVisible();
  } finally {
    await customerContext.close();
  }
});
