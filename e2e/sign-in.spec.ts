import {
  candidate,
  card,
  column,
  expect,
  job,
  MEMBERS,
  removeMembership,
  signIn,
  submitSignIn,
  sv,
  test,
} from "./fixtures.ts";

for (const member of MEMBERS)
  test(`a customer signs in and sees their board, as the ${member} member`, async ({
    page,
    makeCustomer,
    tag,
    memberOf,
  }) => {
    const name = `Astrid ${tag}`;
    const customer = await makeCustomer("Kund", {
      jobs: [job("lager", `Lagerchef ${tag}`)],
      candidates: [candidate(name, "lager")],
    });

    await signIn(page, (await memberOf(customer, member)).email);

    await expect(page.getByRole("heading", { level: 1, name: sv.pipeline.title })).toBeVisible();
    await expect(card(column(page, "new"), name)).toBeVisible();
  });

test("a user without a company is refused at sign-in and stays signed out", async ({
  page,
  makeCustomer,
}) => {
  const customer = await makeCustomer("Kund");
  await removeMembership(customer.userId);

  await submitSignIn(page, customer.email);
  await expect(page.getByRole("alert")).toHaveText(sv.errors.no_company);
  await page.reload();
  await expect(page).toHaveURL(/\/login/);
});
