import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  freedEmail,
  planSwaps,
  runSwap,
  SwapBlockedError,
  swapLogins,
  type SwapCompany,
  type SwapDeps,
  type SwapProfile,
  type SwapUser,
} from "../../scripts/login-swap";
import { dumpProblem } from "../../scripts/swap-logins";

const C = "c0000000-0000-4000-8000-000000000001";
const NEW = "n0000000-0000-4000-8000-000000000001";
const company: SwapCompany = { id: C, name: "Exempelbygg AB", deleted: false };
const old: SwapUser = { id: C, email: "kund@exempelbygg.test", swapEmail: null };
const profile: SwapProfile = { id: C, fullName: "Erik Exempel", deleted: false };

/** A project in memory: the fake actions change it, and record what ran, in order. */
function fakeProject(options: { users?: SwapUser[]; blockers?: string[]; failAt?: string } = {}) {
  const users = (options.users ?? [old]).map((u) => ({ ...u }));
  const members: string[] = [];
  const ran: string[] = [];
  const step = (name: string) => {
    ran.push(name);
    if (options.failAt === name) throw new Error(`${name} failed`);
  };
  const deps: SwapDeps = {
    blockers: () => Promise.resolve(options.blockers ?? []),
    companies: () => Promise.resolve([company]),
    users: () => Promise.resolve(users.map((u) => ({ ...u }))),
    profiles: () => Promise.resolve([profile]),
    freeEmail: async (id, original) => {
      step("free");
      const user = users.find((u) => u.id === id)!;
      Object.assign(user, { email: freedEmail(id), swapEmail: original });
    },
    restoreEmail: async (id, original) => {
      step("restore");
      Object.assign(
        users.find((u) => u.id === id)!,
        { email: original, swapEmail: null },
      );
    },
    createUser: async ({ email }) => {
      step("create");
      users.push({ id: NEW, email, swapEmail: null });
      return NEW;
    },
    addMember: async (companyId, userId) => {
      step("member");
      members.push(`${companyId} ${userId}`);
    },
    deleteUser: async (id) => {
      step(`delete ${id === C ? "old" : "new"}`);
      users.splice(
        users.findIndex((u) => u.id === id),
        1,
      );
    },
  };
  return { deps, users, members, ran };
}

const swapAll = (deps: SwapDeps) =>
  swapLogins(deps, { apply: true, password: () => "temporary-password" });

describe("the login swap plan", () => {
  it("swaps a login whose id is its company's, and nothing else", () => {
    const other: SwapUser = { id: NEW, email: "ny@lumen.test", swapEmail: null };
    const plan = planSwaps([company], [old, other], [profile]);
    expect(plan.swaps).toMatchObject([
      { oldId: C, email: old.email, fullName: "Erik Exempel", step: "swap" },
    ]);
    expect(planSwaps([company], [other], [profile]).swaps).toEqual([]);
  });

  it("picks up a swap where it stopped", () => {
    const freed = { ...old, email: freedEmail(C), swapEmail: old.email };
    expect(planSwaps([company], [freed], [profile]).swaps[0]?.step).toBe("create");
    const fresh: SwapUser = { id: NEW, email: old.email, swapEmail: null };
    expect(planSwaps([company], [freed, fresh], [profile]).swaps[0]).toMatchObject({
      step: "finish",
      newId: NEW,
    });
  });

  it("leaves a deleted company or account alone, for the purge", () => {
    const deletedCompany = planSwaps([{ ...company, deleted: true }], [old], [profile]);
    expect(deletedCompany.skipped).toMatchObject([{ reason: "company_deleted" }]);
    const deletedAccount = planSwaps([company], [old], [{ ...profile, deleted: true }]);
    expect(deletedAccount.skipped).toMatchObject([{ reason: "account_deleted" }]);
  });

  it("keeps to the companies it is given", () => {
    expect(planSwaps([company], [old], [profile], new Set(["other"])).swaps).toEqual([]);
  });
});

describe("the login swap", () => {
  it("frees the email, creates the new login, adds it to the company, then deletes the old one", async () => {
    const project = fakeProject();
    const { results } = await swapAll(project.deps);
    expect(project.ran).toEqual(["free", "create", "member", "delete old"]);
    expect(project.members).toEqual([`${C} ${NEW}`]);
    expect(project.users).toEqual([{ id: NEW, email: old.email, swapEmail: null }]);
    expect(results).toMatchObject([{ newId: NEW, password: "temporary-password", error: null }]);
  });

  it("changes nothing in a dry run", async () => {
    const project = fakeProject();
    const { plan, results } = await swapLogins(project.deps, {
      apply: false,
      password: () => "x",
    });
    expect(plan.swaps).toHaveLength(1);
    expect([results, project.ran]).toEqual([[], []]);
  });

  it("refuses before anything changes while a foreign key could reach company data", async () => {
    const project = fakeProject({ blockers: ["jobs_owner_fkey"] });
    await expect(swapAll(project.deps)).rejects.toBeInstanceOf(SwapBlockedError);
    expect(project.ran).toEqual([]);
  });

  it("puts the old email back when the new login cannot be made", async () => {
    const project = fakeProject({ failAt: "create" });
    const { results } = await swapAll(project.deps);
    expect(project.ran).toEqual(["free", "create", "restore"]);
    expect(project.users).toEqual([old]);
    expect(results[0]?.error).toBe("create failed");
  });

  it("removes the new login and puts the old email back when the membership fails, before any delete", async () => {
    // As against a project without the company tables: the membership fails first.
    const project = fakeProject({ failAt: "member" });
    await swapAll(project.deps);
    expect(project.ran).toEqual(["free", "create", "member", "delete new", "restore"]);
    expect(project.users).toEqual([old]);
  });

  it("finishes a swap that stopped before the old login was deleted, and then has nothing to do", async () => {
    const project = fakeProject({ failAt: "delete old" });
    await swapAll(project.deps);
    expect(project.users).toHaveLength(2);

    const again = fakeProject({ users: project.users });
    await swapAll(again.deps);
    expect(again.ran).toEqual(["member", "delete old"]);
    expect(again.users).toEqual([{ id: NEW, email: old.email, swapEmail: null }]);

    const done = fakeProject({ users: again.users });
    expect((await swapAll(done.deps)).plan.swaps).toEqual([]);
  });

  it("creates the new login for a swap that stopped after the email was freed", async () => {
    const freed = { ...old, email: freedEmail(C), swapEmail: old.email };
    const project = fakeProject({ users: [freed] });
    const plan = planSwaps([company], [freed], [profile]);
    const done = await runSwap(project.deps, plan.swaps[0]!, "pw");
    expect(project.ran).toEqual(["create", "member", "delete old"]);
    expect(done).toEqual({ newId: NEW, password: "pw" });
  });
});

describe("the dump the swap needs", () => {
  const repo = mkdtempSync(join(tmpdir(), "repo-"));
  const outside = mkdtempSync(join(tmpdir(), "dump-"));

  it("is a file with content outside the repo", () => {
    const dump = join(outside, "data.sql");
    writeFileSync(dump, "insert into ...;");
    expect(dumpProblem(dump, repo)).toBeNull();
  });

  it("is refused when missing, empty or inside the repo", () => {
    const empty = join(outside, "empty.sql");
    writeFileSync(empty, "");
    const inside = join(repo, "data.sql");
    writeFileSync(inside, "insert into ...;");
    expect(dumpProblem(null, repo)).toMatch(/--dump/);
    expect(dumpProblem(join(outside, "missing.sql"), repo)).toMatch(/does not exist/);
    expect(dumpProblem(empty, repo)).toMatch(/empty/);
    expect(dumpProblem(inside, repo)).toMatch(/inside the repo/);
  });
});
