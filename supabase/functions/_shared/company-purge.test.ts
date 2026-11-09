import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.13";

import { purgeCompany, type CompanyPurgeDeps } from "./company-purge.ts";

const COMPANY = "00000000-0000-4000-8000-0000000000c1";

/** Fake actions that record what ran, in order, and fail where told to. */
function fake(members: string[], failAt?: string) {
  const ran: string[] = [];
  const step = (name: string) => {
    ran.push(name);
    return name === failAt ? Promise.reject(new Error(`${name} failed`)) : Promise.resolve();
  };
  const deps: CompanyPurgeDeps = {
    removeCvFolder: (id) => step(`folder ${id}`).then(() => 2),
    listMembers: () => Promise.resolve(members),
    deleteUser: (id) => step(`user ${id}`),
    deleteCompany: (id) => step(`company ${id}`),
  };
  return { deps, ran };
}

Deno.test("removes the CV folder, then every member's login, then the company", async () => {
  const { deps, ran } = fake(["u1", "u2"]);
  await purgeCompany(deps, COMPANY);
  assertEquals(ran, [`folder ${COMPANY}`, "user u1", "user u2", `company ${COMPANY}`]);
});

Deno.test("a company without members loses only its folder and its data", async () => {
  const { deps, ran } = fake([]);
  await purgeCompany(deps, COMPANY);
  assertEquals(ran, [`folder ${COMPANY}`, `company ${COMPANY}`]);
});

Deno.test("keeps the logins and the data when the folder cannot be removed", async () => {
  const { deps, ran } = fake(["u1"], `folder ${COMPANY}`);
  await assertRejects(() => purgeCompany(deps, COMPANY));
  assertEquals(ran, [`folder ${COMPANY}`]);
});

Deno.test(
  "keeps the company's data when a login cannot be deleted, so a new run finishes",
  async () => {
    const { deps, ran } = fake(["u1", "u2"], "user u1");
    await assertRejects(() => purgeCompany(deps, COMPANY));
    assertEquals(ran, [`folder ${COMPANY}`, "user u1"]);
  },
);
