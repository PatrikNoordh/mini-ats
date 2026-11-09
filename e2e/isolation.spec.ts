import { candidate, card, expect, job, signIn, sv, test, MEMBERS } from "./fixtures.ts";

for (const member of MEMBERS)
  test(`customer B never sees customer A's jobs, candidates or cards, as the ${member} member`, async ({
    page,
    makeCustomer,
    tag,
    memberOf,
  }) => {
    const jobA = `Revisor ${tag}`;
    const nameA = `Julia ${tag}`;
    const jobB = `Kock ${tag}`;
    const nameB = `Klas ${tag}`;
    await makeCustomer("KundA", { jobs: [job("a", jobA)], candidates: [candidate(nameA, "a")] });
    const b = await makeCustomer("KundB", {
      jobs: [job("b", jobB)],
      candidates: [candidate(nameB, "b")],
    });
    await signIn(page, (await memberOf(b, member)).email);

    // Each page waits for B's own row first, so "none of A's" is checked on loaded data.
    await expect(card(page, nameB)).toBeVisible();
    await expect(page.getByText(nameA)).toHaveCount(0);
    await expect(page.getByText(jobA)).toHaveCount(0);

    await page.getByRole("combobox", { name: sv.pipeline.filterByJob }).click();
    await expect(page.getByRole("option", { name: jobB })).toBeVisible();
    await expect(page.getByRole("option", { name: jobA })).toHaveCount(0);
    await page.keyboard.press("Escape");

    await page.getByRole("link", { name: sv.nav.jobs }).click();
    await expect(page.getByRole("cell", { name: jobB })).toBeVisible();
    await expect(page.getByText(jobA)).toHaveCount(0);

    await page.getByRole("link", { name: sv.nav.candidates }).click();
    await expect(page.getByText(nameB).first()).toBeVisible();
    await expect(page.getByText(nameA)).toHaveCount(0);
  });
