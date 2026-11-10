/// <reference types="node" />
// The login swap (ATS-58, docs/next-teams.md § Step 2). Each company migrated in ATS-44 kept its
// first user's id, so that login's id is the company's. The swap replaces the login with a new
// account, with a new id and the same email, as a member of the company, and then deletes the old
// login. Afterwards no user id equals a company id, so a rule that still compared customer_id
// with auth.uid() would fail for everyone at once.
//
// Each company is swapped on its own, in three steps, and a new run picks up where one stopped:
//   1. the old login's email is freed (kept in its app_metadata as swap_email), so the new
//      account can take it;
//   2. the new account is created with that email and added to the company. If that fails, the
//      new account is removed and the old email put back, so no one is left without a login;
//   3. the old login is deleted. It owns no data by then: its membership goes, the company and
//      everything in it stay (check 19 in supabase/tests/rls_test.sql).
// Before anything changes, login_swap_blockers() must return nothing: no customer table, and
// not companies, may reference a user (ATS-44). The membership is written before anything is
// deleted, so run against a project without companies, the swap fails before it deletes.
//
// Used by scripts/swap-logins.ts for the project, and by scripts/seed-demo.ts for the demo
// accounts. Both read the service role key from the developer's shell (CLAUDE.md, rule 1).
import type { SupabaseClient } from "@supabase/supabase-js";

/** An Auth user, with the email it had before its swap began, if it began. */
export interface SwapUser {
  id: string;
  email: string;
  /** The original email of an old login whose email was freed in step 1, else null. */
  swapEmail: string | null;
}

export interface SwapCompany {
  id: string;
  name: string;
  deleted: boolean;
}

export interface SwapProfile {
  id: string;
  fullName: string;
  deleted: boolean;
}

/** What the next step is: start, create the new account, or finish with the delete. */
export type SwapStep = "swap" | "create" | "finish";

export interface PlannedSwap {
  company: SwapCompany;
  oldId: string;
  email: string;
  fullName: string;
  step: SwapStep;
  /** The new account, when it already exists (step "finish"). */
  newId: string | null;
}

/** A company the swap leaves alone, and why. */
export interface SkippedSwap {
  company: SwapCompany;
  email: string;
  reason: "company_deleted" | "account_deleted";
}

export interface SwapPlan {
  swaps: PlannedSwap[];
  skipped: SkippedSwap[];
}

/** The email an old login holds while its swap is under way. Never a real address. */
export function freedEmail(userId: string): string {
  return `swapped-${userId}@login-swap.invalid`;
}

/**
 * The swaps still to do. A company needs one while a login has the company's id. A deleted
 * company or account is left alone unless its swap already began: the purge removes it.
 */
export function planSwaps(
  companies: SwapCompany[],
  users: SwapUser[],
  profiles: SwapProfile[],
  only?: ReadonlySet<string>,
): SwapPlan {
  const plan: SwapPlan = { swaps: [], skipped: [] };
  for (const company of companies) {
    if (only && !only.has(company.id)) continue;
    const old = users.find((u) => u.id === company.id);
    if (!old) continue;
    const email = old.swapEmail ?? old.email;
    const fresh = users.find((u) => u.id !== company.id && u.email === email);
    const step: SwapStep = fresh ? "finish" : old.swapEmail ? "create" : "swap";
    const profile = profiles.find((p) => p.id === old.id);
    if (step === "swap" && company.deleted) {
      plan.skipped.push({ company, email, reason: "company_deleted" });
    } else if (step === "swap" && (!profile || profile.deleted)) {
      plan.skipped.push({ company, email, reason: "account_deleted" });
    } else {
      plan.swaps.push({
        company,
        oldId: old.id,
        email,
        fullName: profile?.fullName ?? "",
        step,
        newId: fresh?.id ?? null,
      });
    }
  }
  return plan;
}

/** The Supabase actions, passed in so the steps can be tested without a project. */
export interface SwapDeps {
  /** The foreign keys that would let deleting a login reach company data. */
  blockers: () => Promise<string[]>;
  companies: () => Promise<SwapCompany[]>;
  users: () => Promise<SwapUser[]>;
  profiles: () => Promise<SwapProfile[]>;
  /** Step 1: the old login and its profile take freedEmail(); the original goes in swap_email. */
  freeEmail: (userId: string, original: string) => Promise<void>;
  /** Puts the original email back and clears swap_email. */
  restoreEmail: (userId: string, original: string) => Promise<void>;
  createUser: (account: {
    email: string;
    password: string;
    fullName: string;
    companyName: string;
  }) => Promise<string>;
  /** Adds the user to the company; a membership that exists is kept. */
  addMember: (companyId: string, userId: string) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
}

/** The swap refuses to run while a foreign key could let a login's delete reach company data. */
export class SwapBlockedError extends Error {
  readonly code = "swap_blocked";
  readonly blockers: string[];
  // A plain field, not a parameter property: Node runs these scripts by stripping the types only.
  constructor(blockers: string[]) {
    super(`swap_blocked: ${blockers.join(", ")}`);
    this.blockers = blockers;
  }
}

/** Runs an undo, and reports it if the undo fails too, after the error that caused it. */
async function undo(action: () => Promise<void>, what: string, log: (line: string) => void) {
  try {
    await action();
  } catch (error) {
    log(`  The undo failed too (${what}); run the swap again to finish: ${errorText(error)}`);
  }
}

export function errorText(error: unknown): string {
  return typeof error === "object" && error !== null && "message" in error
    ? String(error.message)
    : String(error);
}

/**
 * Runs the remaining steps of one swap. Returns the new account's id, and the temporary password
 * when it made the account.
 */
export async function runSwap(
  deps: SwapDeps,
  swap: PlannedSwap,
  password: string,
  log: (line: string) => void = () => {},
): Promise<{ newId: string; password: string | null }> {
  if (swap.step === "swap") await deps.freeEmail(swap.oldId, swap.email);

  let newId = swap.newId;
  const made = swap.step !== "finish";
  if (made) {
    try {
      newId = await deps.createUser({
        email: swap.email,
        password,
        fullName: swap.fullName,
        companyName: swap.company.name,
      });
    } catch (error) {
      await undo(() => deps.restoreEmail(swap.oldId, swap.email), "the old email", log);
      throw error;
    }
  }
  if (!newId) throw new Error("No new account to finish the swap with");

  // Written before anything is deleted: without the company tables this fails first.
  const userId = newId;
  try {
    await deps.addMember(swap.company.id, userId);
  } catch (error) {
    if (made) {
      await undo(() => deps.deleteUser(userId), "the new account", log);
      await undo(() => deps.restoreEmail(swap.oldId, swap.email), "the old email", log);
    }
    throw error;
  }
  await deps.deleteUser(swap.oldId);
  return { newId: userId, password: made ? password : null };
}

export interface SwapResult {
  company: SwapCompany;
  email: string;
  newId: string | null;
  password: string | null;
  error: string | null;
}

/**
 * Checks the safety rule, plans, and with `apply` runs every swap, each on its own: one that
 * fails is reported and the others still run. Without `apply` it only plans (the dry run).
 */
export async function swapLogins(
  deps: SwapDeps,
  options: {
    apply: boolean;
    /** A temporary password for a new account. */
    password: (swap: PlannedSwap) => string;
    /** Only these companies, for the demo seed and the tests. */
    only?: ReadonlySet<string>;
    log?: (line: string) => void;
  },
): Promise<{ plan: SwapPlan; results: SwapResult[] }> {
  const log = options.log ?? (() => {});
  const blockers = await deps.blockers();
  if (blockers.length > 0) throw new SwapBlockedError(blockers);

  const [companies, users, profiles] = await Promise.all([
    deps.companies(),
    deps.users(),
    deps.profiles(),
  ]);
  const plan = planSwaps(companies, users, profiles, options.only);
  if (!options.apply) return { plan, results: [] };

  const results: SwapResult[] = [];
  for (const swap of plan.swaps) {
    try {
      const done = await runSwap(deps, swap, options.password(swap), log);
      results.push({ company: swap.company, email: swap.email, ...done, error: null });
    } catch (error) {
      results.push({
        company: swap.company,
        email: swap.email,
        newId: null,
        password: null,
        error: errorText(error),
      });
    }
  }
  return { plan, results };
}

/** Auth's listUsers page size; the projects have far fewer users. */
const USERS_PER_PAGE = 1000;

/** The actions with the service role key, which only the developer's shell holds (rule 1). */
export function supabaseSwapDeps(admin: SupabaseClient): SwapDeps {
  return {
    blockers: async () => {
      const { data, error } = await admin.rpc("login_swap_blockers");
      if (error) throw error;
      const rows: unknown[] = Array.isArray(data) ? data : [];
      return rows.map((row) =>
        typeof row === "object" && row !== null && "constraint_name" in row
          ? String(row.constraint_name)
          : String(row),
      );
    },
    companies: async () => {
      const { data, error } = await admin.from("companies").select("id, name, deleted_at");
      if (error) throw error;
      return data.map((c) => ({
        id: String(c.id),
        name: String(c.name),
        deleted: c.deleted_at !== null,
      }));
    },
    users: async () => {
      const users: SwapUser[] = [];
      for (let page = 1; ; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: USERS_PER_PAGE });
        if (error) throw error;
        for (const user of data.users) {
          const swapEmail: unknown = user.app_metadata["swap_email"];
          users.push({
            id: user.id,
            email: user.email ?? "",
            swapEmail: typeof swapEmail === "string" ? swapEmail : null,
          });
        }
        if (data.users.length < USERS_PER_PAGE) return users;
      }
    },
    profiles: async () => {
      const { data, error } = await admin.from("profiles").select("id, full_name, deleted_at");
      if (error) throw error;
      return data.map((p) => ({
        id: String(p.id),
        fullName: p.full_name === null ? "" : String(p.full_name),
        deleted: p.deleted_at !== null,
      }));
    },
    freeEmail: async (userId, original) => {
      const auth = await admin.auth.admin.updateUserById(userId, {
        email: freedEmail(userId),
        email_confirm: true,
        // Auth merges app_metadata, so the role stays.
        app_metadata: { swap_email: original },
      });
      if (auth.error) throw auth.error;
      const profile = await admin
        .from("profiles")
        .update({ email: freedEmail(userId) })
        .eq("id", userId);
      if (profile.error) throw profile.error;
    },
    restoreEmail: async (userId, original) => {
      const auth = await admin.auth.admin.updateUserById(userId, {
        email: original,
        email_confirm: true,
        app_metadata: { swap_email: null },
      });
      if (auth.error) throw auth.error;
      const profile = await admin.from("profiles").update({ email: original }).eq("id", userId);
      if (profile.error) throw profile.error;
    },
    createUser: async ({ email, password, fullName, companyName }) => {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        // The same metadata as admin-create-user.
        user_metadata: { full_name: fullName, company_name: companyName },
        app_metadata: { role: "customer" },
      });
      if (error) throw error;
      return data.user.id;
    },
    addMember: async (companyId, userId) => {
      const { error } = await admin
        .from("company_members")
        .upsert(
          { company_id: companyId, user_id: userId },
          { onConflict: "company_id,user_id", ignoreDuplicates: true },
        );
      if (error) throw error;
    },
    deleteUser: async (userId) => {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw error;
    },
  };
}
