// Several users in one company (ATS-45). The Deno tests of the Edge Functions use fakes, so only
// the real stack shows that a second member reaches the company's data through the database, the
// storage policies and delete-candidate.
import type { Browser, BrowserContext, Page } from "@playwright/test";

import {
  candidate,
  card,
  column,
  cvExists,
  cvPathOf,
  expect,
  job,
  signIn,
  sv,
  test,
  text,
} from "./fixtures.ts";

/** A browser context of its own for another user, closed by the caller. */
async function signedIn(browser: Browser, email: string): Promise<[BrowserContext, Page]> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, email);
  return [context, page];
}

/** Adds a candidate linked to the job through the candidate dialog, as a user would. */
async function addCandidate(page: Page, name: string, email: string, jobTitle: string) {
  await page.getByRole("link", { name: sv.nav.candidates }).click();
  await page.getByRole("button", { name: sv.candidates.new }).click();
  const dialog = page.getByRole("dialog", { name: sv.candidateDialog.titleNew });
  await dialog.getByLabel(sv.candidateDialog.name, { exact: true }).fill(name);
  await dialog.getByLabel(sv.candidateDialog.email, { exact: true }).fill(email);
  await dialog.getByRole("checkbox", { name: new RegExp(jobTitle) }).check();
  await dialog.getByRole("button", { name: sv.common.save }).click();
  await expect(dialog).toBeHidden();
}

/** The smallest file the cvs bucket takes as a PDF, as fixtures.addCv writes it. */
const TINY_PDF = Buffer.from("%PDF-1.4\n%%EOF\n");

test("two users of one company share the board and see each other's changes, and another company sees none of it", async ({
  page,
  browser,
  makeCustomer,
  addMember,
  tag,
}) => {
  const jobTitle = `Montör ${tag}`;
  const byFirst = `Hanna ${tag}`;
  const secondJob = `Elektriker ${tag}`;
  const company = await makeCustomer("Kund", { jobs: [job("montor", jobTitle)] });
  const second = await addMember(company, "Kollega");
  const otherJob = `Bagare ${tag}`;
  const otherName = `Olle ${tag}`;
  const other = await makeCustomer("Annan", {
    jobs: [job("bagare", otherJob)],
    candidates: [candidate(otherName, "bagare")],
  });

  await signIn(page, company.email);
  await addCandidate(page, byFirst, `hanna-${tag}@e2e.test`, jobTitle);

  const [secondContext, secondPage] = await signedIn(browser, second.email);
  const [otherContext, otherPage] = await signedIn(browser, other.email);
  try {
    // The second user sees the card the first one made: the same board.
    await expect(card(column(secondPage, "new"), byFirst)).toBeVisible();

    // A job the second user makes is on the first user's jobs page.
    await secondPage.getByRole("link", { name: sv.nav.jobs }).click();
    await secondPage.getByRole("button", { name: sv.jobs.new }).click();
    const jobDialog = secondPage.getByRole("dialog", { name: sv.jobDialog.titleNew });
    await jobDialog.getByLabel(sv.jobDialog.jobTitle, { exact: true }).fill(secondJob);
    await jobDialog.getByLabel(sv.jobDialog.location, { exact: true }).fill("Växjö");
    await jobDialog.getByRole("button", { name: sv.common.save }).click();
    await expect(jobDialog).toBeHidden();

    await page.getByRole("link", { name: sv.nav.jobs }).click();
    await expect(page.getByRole("cell", { name: secondJob })).toBeVisible();
    await expect(page.getByRole("cell", { name: jobTitle })).toBeVisible();

    // A user of another company sees none of it, on any page. Each page waits for that
    // company's own row first, so "none" is checked on loaded data.
    await expect(card(otherPage, otherName)).toBeVisible();
    await expect(otherPage.getByText(byFirst)).toHaveCount(0);
    await otherPage.getByRole("link", { name: sv.nav.jobs }).click();
    await expect(otherPage.getByRole("cell", { name: otherJob })).toBeVisible();
    await expect(otherPage.getByText(jobTitle)).toHaveCount(0);
    await expect(otherPage.getByText(secondJob)).toHaveCount(0);
    await otherPage.getByRole("link", { name: sv.nav.candidates }).click();
    await expect(otherPage.getByText(otherName).first()).toBeVisible();
    await expect(otherPage.getByText(byFirst)).toHaveCount(0);
  } finally {
    await secondContext.close();
    await otherContext.close();
  }
});

test("a second user uploads and opens a CV and deletes a candidate the first user made", async ({
  page,
  browser,
  makeCustomer,
  addMember,
  tag,
}) => {
  const jobTitle = `Snickare ${tag}`;
  const name = `Ingrid ${tag}`;
  const company = await makeCustomer("Kund", { jobs: [job("snickare", jobTitle)] });
  const second = await addMember(company, "Kollega");

  await signIn(page, company.email);
  await addCandidate(page, name, `ingrid-${tag}@e2e.test`, jobTitle);

  const [secondContext, secondPage] = await signedIn(browser, second.email);
  try {
    // Upload through the storage policies, into the company's folder.
    await card(column(secondPage, "new"), name).click();
    const panel = secondPage.getByRole("dialog", { name });
    await panel
      .getByLabel(text(sv.candidateSheet.chooseCvFile, { name }), { exact: true })
      .setInputFiles({ name: "cv.pdf", mimeType: "application/pdf", buffer: TINY_PDF });
    await expect(secondPage.getByText(sv.candidateSheet.cvUploaded)).toBeVisible();

    // Open it: the link is a signed URL the storage policies let this user make.
    const open = panel.getByRole("link", { name: sv.candidateSheet.openCv });
    await expect(open).toBeVisible();
    const href = await open.getAttribute("href");
    if (!href) throw new Error("The CV link has no address");
    const file = await secondPage.request.get(href);
    expect(file.ok()).toBe(true);
    expect((await file.body()).subarray(0, 4).toString()).toBe("%PDF");
    // The file is in the company's folder, not the user's.
    const path = await cvPathOf(company.id, name);
    expect(path.startsWith(`${company.id}/`)).toBe(true);
    expect(await cvExists(path)).toBe(true);
    await secondPage.keyboard.press("Escape");

    // delete-candidate answers by company: the file and the candidate go.
    await secondPage.getByRole("link", { name: sv.nav.candidates }).click();
    await secondPage.getByRole("button", { name, exact: true }).click();
    const dialog = secondPage.getByRole("dialog", { name: sv.candidateDialog.titleEdit });
    await dialog.getByRole("button", { name: sv.common.delete }).click();
    const deleted = secondPage.waitForResponse((r) =>
      r.url().includes("/functions/v1/delete-candidate"),
    );
    await secondPage
      .getByRole("alertdialog", { name: sv.candidateDialog.deleteTitle })
      .getByRole("button", { name: sv.common.delete })
      .click();
    expect((await deleted).ok()).toBe(true);
    await expect(secondPage.getByText(sv.candidateDialog.deleted)).toBeVisible();
    await expect(secondPage.getByRole("button", { name, exact: true })).toHaveCount(0);
    expect(await cvExists(path)).toBe(false);

    // The first user sees the candidate gone.
    await page.reload();
    await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
  } finally {
    await secondContext.close();
  }
});
