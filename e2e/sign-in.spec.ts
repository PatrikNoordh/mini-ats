import { candidate, card, column, expect, job, sv, signIn, test } from "./fixtures.ts";

test("a customer signs in and sees their board", async ({ page, makeCustomer, tag }) => {
  const name = `Astrid ${tag}`;
  const customer = await makeCustomer("Kund", {
    jobs: [job("lager", `Lagerchef ${tag}`)],
    candidates: [candidate(name, "lager")],
  });

  await signIn(page, customer.email);

  await expect(page.getByRole("heading", { level: 1, name: sv.pipeline.title })).toBeVisible();
  await expect(card(column(page, "new"), name)).toBeVisible();
});
