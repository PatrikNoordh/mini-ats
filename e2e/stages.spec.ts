import { candidate, card, expect, job, signIn, sv, test, text } from "./fixtures.ts";

test("a customer renames a column, adds one before Anställd, and resets to the defaults", async ({
  page,
  makeCustomer,
  tag,
}) => {
  const name = `Dana ${tag}`;
  const customer = await makeCustomer("Kund", {
    jobs: [job("ekonom", `Ekonom ${tag}`)],
    candidates: [candidate(name, "ekonom")],
  });
  await signIn(page, customer.email);
  // Each column is named by the heading its aria-labelledby points at.
  const headings = page.getByRole("group").locator("span[id]");

  // Rename Ny. The card stays in the column under its new name.
  await page
    .getByRole("button", { name: text(sv.stageEditor.menu, { stage: sv.stages.new }) })
    .click();
  await page.getByRole("menuitem", { name: sv.stageEditor.rename }).click();
  const rename = page.getByRole("dialog", { name: sv.stageEditor.renameTitle });
  await rename.getByLabel(sv.stageEditor.name, { exact: true }).fill("Inkommen");
  await rename.getByRole("button", { name: sv.common.save }).click();
  await expect(rename).toBeHidden();
  const inkommen = page.getByRole("group", { name: "Inkommen", exact: true });
  await expect(card(inkommen, name)).toBeVisible();

  // Add a column: it lands just before Anställd.
  await page.getByRole("button", { name: sv.stageEditor.add }).click();
  const add = page.getByRole("dialog", { name: sv.stageEditor.addTitle });
  await add.getByLabel(sv.stageEditor.name, { exact: true }).fill("Referenser");
  await add.getByRole("button", { name: sv.common.save }).click();
  await expect(add).toBeHidden();
  await expect(headings).toHaveText([
    "Inkommen",
    sv.stages.screening,
    sv.stages.interview,
    sv.stages.offer,
    "Referenser",
    sv.stages.hired,
    sv.stages.rejected,
  ]);

  // Reset: the six defaults are back and the card is still in New.
  await page.getByRole("button", { name: sv.stageEditor.reset }).click();
  await page
    .getByRole("alertdialog", { name: sv.stageEditor.resetTitle })
    .getByRole("button", { name: sv.stageEditor.resetConfirm })
    .click();
  await expect(page.getByText(sv.stageEditor.resetDone)).toBeVisible();
  await expect(headings).toHaveText([
    sv.stages.new,
    sv.stages.screening,
    sv.stages.interview,
    sv.stages.offer,
    sv.stages.hired,
    sv.stages.rejected,
  ]);
  await expect(
    card(page.getByRole("group", { name: sv.stages.new, exact: true }), name),
  ).toBeVisible();
});

test("a customer reorders the columns by keyboard and by mouse, and the order survives a reload", async ({
  page,
  makeCustomer,
}) => {
  const customer = await makeCustomer("Kund");
  await signIn(page, customer.email);
  const headings = page.getByRole("group").locator("span[id]");
  const handle = (stage: string) =>
    page.getByRole("button", { name: text(sv.pipeline.columnHandle, { stage }) });
  const heard = (template: string, stage: string, position: number) =>
    page.getByText(text(template, { stage, position: String(position), count: "6" }));
  const saved = () =>
    page.waitForResponse((r) => r.url().includes("/rpc/reorder_stages") && r.ok());

  // By keyboard: Intervju one step left, past Screening.
  let save = saved();
  await handle(sv.stages.interview).focus();
  await page.keyboard.press("Space");
  await expect(heard(sv.pipeline.announceColumn.over, sv.stages.interview, 3)).toBeAttached();
  // The board measures its columns just after the pick-up; press again until the column moved.
  const atTwo = heard(sv.pipeline.announceColumn.over, sv.stages.interview, 2);
  await expect(async () => {
    if ((await atTwo.count()) === 0) await page.keyboard.press("ArrowLeft");
    await expect(atTwo).toBeAttached({ timeout: 500 });
  }).toPass();
  await page.keyboard.press("Space");
  await expect(heard(sv.pipeline.announceColumn.dropped, sv.stages.interview, 2)).toBeAttached();
  await save;
  await expect(headings).toHaveText([
    sv.stages.new,
    sv.stages.interview,
    sv.stages.screening,
    sv.stages.offer,
    sv.stages.hired,
    sv.stages.rejected,
  ]);

  // By mouse: Erbjudande dragged onto Ny.
  save = saved();
  const from = await handle(sv.stages.offer).boundingBox();
  const to = await handle(sv.stages.new).boundingBox();
  if (!from || !to) throw new Error("The columns are not on screen");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 4, to.y + to.height / 2, { steps: 20 });
  await page.mouse.up();
  await save;
  const order = [
    sv.stages.offer,
    sv.stages.new,
    sv.stages.interview,
    sv.stages.screening,
    sv.stages.hired,
    sv.stages.rejected,
  ];
  await expect(headings).toHaveText(order);

  await page.reload();
  await expect(headings).toHaveText(order);
});

test("at 390 px the board scrolls on its own and a column still moves by keyboard", async ({
  page,
  makeCustomer,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const customer = await makeCustomer("Kund");
  await signIn(page, customer.email);
  const headings = page.getByRole("group").locator("span[id]");
  await expect(headings).toHaveCount(6);

  // Only the board scrolls sideways, never the page.
  const pageOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(pageOverflow).toBeLessThanOrEqual(0);

  const saved = page.waitForResponse((r) => r.url().includes("/rpc/reorder_stages") && r.ok());
  const handle = page.getByRole("button", {
    name: text(sv.pipeline.columnHandle, { stage: sv.stages.screening }),
  });
  await handle.focus();
  await page.keyboard.press("Space");
  const atOne = page.getByText(
    text(sv.pipeline.announceColumn.over, {
      stage: sv.stages.screening,
      position: "1",
      count: "6",
    }),
  );
  await expect(async () => {
    if ((await atOne.count()) === 0) await page.keyboard.press("ArrowLeft");
    await expect(atOne).toBeAttached({ timeout: 500 });
  }).toPass();
  await page.keyboard.press("Space");
  await saved;
  await expect(headings.first()).toHaveText(sv.stages.screening);
});
