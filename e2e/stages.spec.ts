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
