import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.13";

import { moveToCompany, restoreAccount, type LoginDeps } from "./logins.ts";

const USER = "00000000-0000-4000-8000-0000000000c1";
const COMPANY = "00000000-0000-4000-8000-00000000c0c0";

/**
 * Fake actions that record what ran, in order. inDeletedCompany answers from the list given, one
 * answer per call, so a company deleted between two checks can be shown.
 */
function fake(
  options: {
    deletedCompany?: boolean[];
    membership?: "company_deleted" | "fails";
  } = {},
) {
  const ran: string[] = [];
  const answers = [...(options.deletedCompany ?? [])];
  const deps: LoginDeps = {
    setBanned: (userId, banned) => (
      ran.push(`${banned ? "ban" : "unban"} ${userId}`),
      Promise.resolve()
    ),
    inDeletedCompany: () => Promise.resolve(answers.shift() ?? false),
    writeMembership: (userId, companyId) => {
      ran.push(`member ${userId} ${companyId}`);
      if (options.membership === "fails") return Promise.reject(new Error("db down"));
      return Promise.resolve(options.membership ?? null);
    },
    unmarkDeleted: (userId) => (ran.push(`unmark ${userId}`), Promise.resolve()),
  };
  return { deps, ran };
}

Deno.test(
  "a move lifts the ban before the membership, so a company delete's ban stays",
  async () => {
    const { deps, ran } = fake();
    assertEquals(await moveToCompany(deps, USER, COMPANY), null);
    assertEquals(ran, [`unban ${USER}`, `member ${USER} ${COMPANY}`]);
  },
);

Deno.test("leaving a company removes the membership, then lifts the ban", async () => {
  const { deps, ran } = fake();
  assertEquals(await moveToCompany(deps, USER, null), null);
  assertEquals(ran, [`member ${USER} null`, `unban ${USER}`]);
});

Deno.test(
  "a move refused by a deleted company bans again a member of a deleted company",
  async () => {
    const stillDeleted = fake({ membership: "company_deleted", deletedCompany: [true] });
    assertEquals(await moveToCompany(stillDeleted.deps, USER, COMPANY), "company_deleted");
    assertEquals(stillDeleted.ran, [`unban ${USER}`, `member ${USER} ${COMPANY}`, `ban ${USER}`]);

    const active = fake({ membership: "company_deleted", deletedCompany: [false] });
    assertEquals(await moveToCompany(active.deps, USER, COMPANY), "company_deleted");
    assertEquals(active.ran, [`unban ${USER}`, `member ${USER} ${COMPANY}`]);
  },
);

Deno.test("a failed move bans again a member of a deleted company, and throws", async () => {
  const { deps, ran } = fake({ membership: "fails", deletedCompany: [true] });
  await assertRejects(() => moveToCompany(deps, USER, COMPANY));
  assertEquals(ran, [`unban ${USER}`, `member ${USER} ${COMPANY}`, `ban ${USER}`]);
});

Deno.test("a restore lifts the ban, then unmarks the account", async () => {
  const { deps, ran } = fake({ deletedCompany: [false, false] });
  await restoreAccount(deps, USER);
  assertEquals(ran, [`unban ${USER}`, `unmark ${USER}`]);
});

Deno.test("a restore keeps a member of a deleted company banned", async () => {
  const { deps, ran } = fake({ deletedCompany: [true, true] });
  await restoreAccount(deps, USER);
  assertEquals(ran, [`unmark ${USER}`, `ban ${USER}`]);
});

Deno.test(
  "a restore bans the login when the company was deleted after the first check",
  async () => {
    const { deps, ran } = fake({ deletedCompany: [false, true] });
    await restoreAccount(deps, USER);
    assertEquals(ran, [`unban ${USER}`, `unmark ${USER}`, `ban ${USER}`]);
  },
);
