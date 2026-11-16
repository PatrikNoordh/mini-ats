// The history (ATS-48). The RLS checks prove who may read which events; these show that a move on
// the board is in the candidate's history right after, named for a teammate and as "Admin" for an
// admin, and that the admin reads what one account did.
import type { Browser, BrowserContext, Page } from "@playwright/test";

import { E2E_ADMIN } from "../scripts/e2e-data.ts";
import { candidate, card, column, expect, job, signIn, sv, test, text } from "./fixtures.ts";

/** A browser context of its own for another user, closed by the caller. */
async function signedIn(browser: Browser, email: string): Promise<[BrowserContext, Page]> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, email);
  return [context, page];
}

/** Drags a card from New to Interview by mouse and waits until the move is saved. */
async function moveToInterview(page: Page, name: string) {
  await expect(card(column(page, "new"), name)).toBeVisible();
  const from = await card(page, name).boundingBox();
  const to = await column(page, "interview").boundingBox();
  if (!from || !to) throw new Error("The card or the column is not on screen");
  const saved = page.waitForResponse((r) => r.url().includes("/rpc/move_application") && r.ok());
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 15 });
  await page.mouse.up();
  await saved;
  await expect(card(column(page, "interview"), name)).toBeVisible();
}

/** Opens the candidate's panel on its history tab and returns the history's lines. */
async function openHistory(page: Page, name: string) {
  await card(page, name).click();
  const panel = page.getByRole("dialog", { name });
  await panel.getByRole("tab", { name: sv.candidateSheet.tabHistory }).click();
  return panel.getByRole("listitem");
}

const by = (actor: string) => text(sv.history.by, { actor });

test("a move on the board is in the candidate's history at once, named for a teammate", async ({
  page,
  browser,
  makeCustomer,
  addMember,
  tag,
}) => {
  const name = `Linnea ${tag}`;
  const jobTitle = `Snickare ${tag}`;
  const company = await makeCustomer("Kund", {
    jobs: [job("snickare", jobTitle)],
    candidates: [candidate(name, "snickare")],
  });
  const second = await addMember(company, "Kollega");
  const moved = text(sv.history.card.move, {
    candidate: name,
    from: sv.stages.new,
    to: sv.stages.interview,
    job: jobTitle,
  });

  await signIn(page, company.email);
  await moveToInterview(page, name);
  const lines = await openHistory(page, name);
  await expect(lines.first()).toContainText(moved);
  await expect(lines.first()).toContainText(by(company.fullName));
  // The seed linked the candidate with the service role, so no user made it.
  await expect(
    lines.filter({ hasText: text(sv.history.card.insert, { candidate: name, job: jobTitle }) }),
  ).toContainText(by(sv.history.system));

  const [secondContext, secondPage] = await signedIn(browser, second.email);
  try {
    const seen = await openHistory(secondPage, name);
    await expect(seen.first()).toContainText(moved);
    await expect(seen.first()).toContainText(by(company.fullName));
  } finally {
    await secondContext.close();
  }
});

test("a customer sees an admin's move as Admin, and the admin sees what an account did", async ({
  page,
  browser,
  makeCustomer,
  tag,
}) => {
  const name = `Malte ${tag}`;
  const jobTitle = `Murare ${tag}`;
  const company = await makeCustomer("Kund", {
    jobs: [job("murare", jobTitle)],
    candidates: [candidate(name, "murare")],
  });
  const moved = text(sv.history.card.move, {
    candidate: name,
    from: sv.stages.new,
    to: sv.stages.interview,
    job: jobTitle,
  });

  await signIn(page, E2E_ADMIN.email);
  await page.getByRole("button", { name: new RegExp(company.company) }).click();
  await moveToInterview(page, name);

  const [customerContext, customerPage] = await signedIn(browser, company.email);
  try {
    const lines = await openHistory(customerPage, name);
    await expect(lines.first()).toContainText(moved);
    await expect(lines.first()).toContainText(by(sv.roles.admin));
  } finally {
    await customerContext.close();
  }

  // The admin's own account, from the accounts page: its move, with the company it was in.
  await page.goto("/admin/accounts");
  const admins = page.getByRole("region", { name: sv.accounts.adminsTitle });
  await admins
    .getByRole("button", { name: text(sv.accounts.edit, { name: E2E_ADMIN.full_name }) })
    .click();
  await page.getByRole("link", { name: sv.accounts.showHistory }).click();
  await expect(
    page.getByRole("heading", {
      name: text(sv.history.accountTitle, { name: E2E_ADMIN.full_name }),
    }),
  ).toBeVisible();
  const line = page.getByRole("listitem").filter({ hasText: moved });
  await expect(line).toBeVisible();
  await expect(line).toContainText(company.company);
});
