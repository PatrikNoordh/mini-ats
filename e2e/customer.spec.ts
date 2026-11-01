import type { Page } from "@playwright/test";

import { candidate, card, column, expect, job, sv, signIn, test, text } from "./fixtures.ts";

/** Waits for the card move to be saved, so a reload reads it from the database. */
function moveSaved(page: Page) {
  return page.waitForResponse((r) => r.url().includes("/rpc/move_application") && r.ok());
}

test("a customer creates a job and a candidate linked to it, and sees the card in New", async ({
  page,
  makeCustomer,
  tag,
}) => {
  const jobTitle = `Snickare ${tag}`;
  const name = `Bea ${tag}`;
  const customer = await makeCustomer("Kund");
  await signIn(page, customer.email);

  await page.getByRole("link", { name: sv.nav.jobs }).click();
  await page.getByRole("button", { name: sv.jobs.new }).click();
  const jobDialog = page.getByRole("dialog", { name: sv.jobDialog.titleNew });
  await jobDialog.getByLabel(sv.jobDialog.jobTitle, { exact: true }).fill(jobTitle);
  await jobDialog.getByLabel(sv.jobDialog.location, { exact: true }).fill("Borås");
  await jobDialog.getByRole("button", { name: sv.common.save }).click();
  await expect(jobDialog).toBeHidden();
  await expect(page.getByRole("cell", { name: jobTitle })).toBeVisible();

  await page.getByRole("link", { name: sv.nav.candidates }).click();
  await page.getByRole("button", { name: sv.candidates.new }).click();
  const candidateDialog = page.getByRole("dialog", { name: sv.candidateDialog.titleNew });
  await candidateDialog.getByLabel(sv.candidateDialog.name, { exact: true }).fill(name);
  await candidateDialog
    .getByLabel(sv.candidateDialog.email, { exact: true })
    .fill(`bea-${tag}@e2e.test`);
  await candidateDialog.getByRole("checkbox", { name: new RegExp(jobTitle) }).check();
  await candidateDialog.getByRole("button", { name: sv.common.save }).click();
  await expect(candidateDialog).toBeHidden();

  await page.getByRole("link", { name: sv.nav.pipeline }).click();
  await expect(card(column(page, "new"), name)).toBeVisible();
});

test("a customer moves cards by mouse and by keyboard, and the moves survive a reload", async ({
  page,
  makeCustomer,
  tag,
}) => {
  const byMouse = `Carl ${tag}`;
  const byKeyboard = `Dana ${tag}`;
  const customer = await makeCustomer("Kund", {
    jobs: [job("dev", `Utvecklare ${tag}`)],
    candidates: [candidate(byMouse, "dev"), candidate(byKeyboard, "dev")],
  });
  await signIn(page, customer.email);
  await expect(card(column(page, "new"), byMouse)).toBeVisible();

  // By mouse: from New to Interview, in small steps so the drag starts like a real one.
  const from = await card(page, byMouse).boundingBox();
  const to = await column(page, "interview").boundingBox();
  if (!from || !to) throw new Error("The card or the column is not on screen");
  let saved = moveSaved(page);
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 15 });
  await page.mouse.up();
  await saved;
  await expect(card(column(page, "interview"), byMouse)).toBeVisible();

  // By keyboard: space picks the card up, the right arrow moves it one column, space drops it.
  // Each step waits for what a screen reader hears, so a key is never pressed before the board
  // knows which column the card is over.
  const heard = (template: string, stage: string) =>
    page.getByText(text(template, { name: byKeyboard, stage }));
  saved = moveSaved(page);
  await card(page, byKeyboard).focus();
  await page.keyboard.press("Space");
  // "Picked up" is replaced at once by where the card is held.
  await expect(heard(sv.pipeline.announce.over, sv.stages.new)).toBeAttached();
  // The board measures its columns just after the pick-up, and an arrow pressed before that does
  // nothing. A person never presses that fast; the test presses again until the card has moved.
  const overScreening = heard(sv.pipeline.announce.over, sv.stages.screening);
  await expect(async () => {
    if ((await overScreening.count()) === 0) await page.keyboard.press("ArrowRight");
    await expect(overScreening).toBeAttached({ timeout: 500 });
  }).toPass();
  await page.keyboard.press("Space");
  await expect(heard(sv.pipeline.announce.dropped, sv.stages.screening)).toBeAttached();
  await saved;
  await expect(card(column(page, "screening"), byKeyboard)).toBeVisible();

  await page.reload();
  await expect(card(column(page, "interview"), byMouse)).toBeVisible();
  await expect(card(column(page, "screening"), byKeyboard)).toBeVisible();
});

test("the job and name filters are kept in the URL and survive a reload", async ({
  page,
  makeCustomer,
  tag,
}) => {
  const wantedJob = `Ekonom ${tag}`;
  const wanted = `Eva ${tag}`;
  const sameJobOtherName = `Filip ${tag}`;
  const otherJob = `Gustav ${tag}`;
  const customer = await makeCustomer("Kund", {
    jobs: [job("ekonom", wantedJob), job("saljare", `Säljare ${tag}`)],
    candidates: [
      candidate(wanted, "ekonom"),
      candidate(sameJobOtherName, "ekonom"),
      candidate(otherJob, "saljare"),
    ],
  });
  await signIn(page, customer.email);
  await expect(card(page, otherJob)).toBeVisible();

  // A card that should be gone is looked for by its text, not its role: while the job list closes,
  // Radix hides the rest of the page from the accessibility tree, and a role query finds nothing.
  await page.getByRole("combobox", { name: sv.pipeline.filterByJob }).click();
  await page.getByRole("option", { name: wantedJob }).click();
  await expect(page).toHaveURL(/[?&]job=/);
  await expect(page.getByText(otherJob)).toHaveCount(0);
  await expect(card(page, sameJobOtherName)).toBeVisible();

  await page.getByLabel(sv.pipeline.search, { exact: true }).fill("Eva");
  await expect(page).toHaveURL(/[?&]q=Eva/);
  await expect(page.getByText(sameJobOtherName)).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("combobox", { name: sv.pipeline.filterByJob })).toHaveText(wantedJob);
  await expect(page.getByLabel(sv.pipeline.search, { exact: true })).toHaveValue("Eva");
  await expect(card(page, wanted)).toBeVisible();
  await expect(page.getByText(sameJobOtherName)).toHaveCount(0);
  await expect(page.getByText(otherJob)).toHaveCount(0);
});
