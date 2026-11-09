import { addCv, candidate, cvExists, expect, job, sv, signIn, test, MEMBERS } from "./fixtures.ts";

for (const member of MEMBERS)
  test(`a customer deletes a candidate, and their CV file goes with them, as the ${member} member`, async ({
    page,
    makeCustomer,
    tag,
    memberOf,
  }) => {
    const name = `Cora ${tag}`;
    const customer = await makeCustomer("Kund", {
      jobs: [job("ekonom", `Ekonom ${tag}`)],
      candidates: [candidate(name, "ekonom")],
    });
    const path = await addCv(customer.id, name);
    expect(await cvExists(path)).toBe(true);
    await signIn(page, (await memberOf(customer, member)).email);

    await page.getByRole("link", { name: sv.nav.candidates }).click();
    await page.getByRole("button", { name, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: sv.candidateDialog.titleEdit });
    await dialog.getByRole("button", { name: sv.common.delete }).click();
    // One call to the delete-candidate Edge Function removes the file and the candidate (ATS-56).
    const deleted = page.waitForResponse((r) => r.url().includes("/functions/v1/delete-candidate"));
    await page
      .getByRole("alertdialog", { name: sv.candidateDialog.deleteTitle })
      .getByRole("button", { name: sv.common.delete })
      .click();
    expect((await deleted).ok()).toBe(true);
    await expect(page.getByText(sv.candidateDialog.deleted)).toBeVisible();

    await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
    expect(await cvExists(path)).toBe(false);
  });
